import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { prisma } from '../../lib/db.js'
import { isUniqueViolation } from '../../lib/db.js'
import { conflict, notFound } from '../../lib/errors.js'
import {
  idParams,
  OK,
  okSchema,
  optionalText,
  pageOf,
  paginated,
  paginationQuery,
  requiredText,
  responses,
  secured,
} from '../../lib/http.js'
import { slugify } from '../../lib/slug.js'
import { requireAdmin } from '../../middleware/auth.js'
import * as service from './admin.service.js'
import { getSettings, settingsSchema, updateSettings } from './settings.service.js'

const adminUserSchema = z
  .object({
    id: z.uuid(),
    email: z.string(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    role: z.enum(['USER', 'ADMIN']),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    emailVerified: z.boolean(),
    suspendedAt: z.date().nullable(),
    suspendedReason: z.string().nullable(),
    lastLoginAt: z.date().nullable(),
    createdAt: z.date(),
    eventCount: z.number().int(),
    registrationCount: z.number().int(),
  })
  .meta({ id: 'AdminUser' })

const adminEventSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    organizerName: z.string(),
    owner: z.object({ id: z.uuid(), email: z.string(), username: z.string() }),
    status: z.string(),
    visibility: z.string(),
    moderationStatus: z.enum(['CLEAR', 'FLAGGED', 'REMOVED']),
    moderationNote: z.string().nullable(),
    startsAt: z.date(),
    openReports: z.number().int(),
    registrations: z.number().int(),
    createdAt: z.date(),
  })
  .meta({ id: 'AdminEvent' })

const reportSchema = z
  .object({
    id: z.uuid(),
    event: z.object({
      id: z.uuid(),
      slug: z.string(),
      title: z.string(),
      moderationStatus: z.string(),
    }),
    reason: z.string(),
    details: z.string().nullable(),
    reporterEmail: z.string().nullable(),
    isAnonymous: z.boolean(),
    status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
    resolutionNote: z.string().nullable(),
    resolvedAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'EventReport' })

const adminOrgSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    memberCount: z.number().int(),
    eventCount: z.number().int(),
    createdAt: z.date(),
  })
  .meta({ id: 'AdminOrganization' })

const auditSchema = z
  .object({
    id: z.uuid(),
    action: z.string(),
    actorId: z.uuid().nullable(),
    actorRole: z.string(),
    actorEmail: z.string().nullable(),
    actorUsername: z.string().nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    eventId: z.uuid().nullable(),
    organizationId: z.uuid().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    ipAddress: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'AuditLogEntry' })

const statsSchema = z
  .object({
    users: z.number().int(),
    newUsersLast30Days: z.number().int(),
    suspendedUsers: z.number().int(),
    events: z.number().int(),
    liveEvents: z.number().int(),
    flaggedEvents: z.number().int(),
    openReports: z.number().int(),
    organizations: z.number().int(),
    confirmedRegistrations: z.number().int(),
    formResponses: z.number().int(),
    checkIns: z.number().int(),
    failedEmailsLast30Days: z.number().int(),
    signupsPerDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
  })
  .meta({ id: 'PlatformStats' })

const categoryAdminSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  eventCount: z.number().int(),
})

const q = z.string().trim().max(100).optional()

/** Everything here requires `role = ADMIN`; the check runs before any handler. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', async (request) => {
    requireAdmin(request)
  })

  app.get(
    '/admin/stats',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Platform statistics',
        ...secured,
        response: responses({ 200: statsSchema }),
      },
    },
    async () => service.platformStats(),
  )

  // ─── Users ─────────────────────────────────────────────────────────────────

  app.get(
    '/admin/users',
    {
      schema: {
        tags: ['Admin'],
        summary: 'List users',
        ...secured,
        querystring: paginationQuery.extend({
          q,
          status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
          role: z.enum(['USER', 'ADMIN']).optional(),
        }),
        response: responses({ 200: paginated(adminUserSchema) }),
      },
    },
    async (request) => {
      const result = await service.listUsers(request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.post(
    '/admin/users/:id/status',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Suspend or reinstate a user',
        description: 'Suspension signs the user out everywhere and hides their public events.',
        ...secured,
        params: idParams,
        body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: optionalText(500) }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAdmin(request)
      await service.setUserStatus(
        auth.userId,
        request.params.id,
        request.body.status,
        request.body.reason,
      )
      await audit(request, {
        action: request.body.status === 'SUSPENDED' ? 'admin.user.suspend' : 'admin.user.reinstate',
        targetType: 'user',
        targetId: request.params.id,
        metadata: { reason: request.body.reason },
      })
      return OK
    },
  )

  app.post(
    '/admin/users/:id/role',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Grant or remove administrator access',
        ...secured,
        params: idParams,
        body: z.object({ role: z.enum(['USER', 'ADMIN']) }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAdmin(request)
      await service.setUserRole(auth.userId, request.params.id, request.body.role)
      await audit(request, {
        action: 'admin.user.role',
        targetType: 'user',
        targetId: request.params.id,
        metadata: { role: request.body.role },
      })
      return OK
    },
  )

  // ─── Events and reports ────────────────────────────────────────────────────

  app.get(
    '/admin/events',
    {
      schema: {
        tags: ['Admin'],
        summary: 'List events for moderation',
        ...secured,
        querystring: paginationQuery.extend({
          q,
          moderation: z.enum(['CLEAR', 'FLAGGED', 'REMOVED']).optional(),
          status: z
            .enum(['DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED', 'ARCHIVED'])
            .optional(),
        }),
        response: responses({ 200: paginated(adminEventSchema) }),
      },
    },
    async (request) => {
      const result = await service.listEvents(request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.post(
    '/admin/events/:id/moderation',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Set the moderation status of an event',
        description:
          'REMOVED hides the event everywhere and resolves its open reports; CLEAR dismisses them.',
        ...secured,
        params: idParams,
        body: z.object({
          status: z.enum(['CLEAR', 'FLAGGED', 'REMOVED']),
          note: optionalText(1000),
        }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.moderateEvent(request.params.id, request.body.status, request.body.note)
      await audit(request, {
        action: `admin.event.${request.body.status.toLowerCase()}`,
        targetType: 'event',
        targetId: request.params.id,
        eventId: request.params.id,
        metadata: { note: request.body.note },
      })
      return OK
    },
  )

  app.get(
    '/admin/reports',
    {
      schema: {
        tags: ['Admin'],
        summary: 'List abuse reports',
        ...secured,
        querystring: paginationQuery.extend({
          status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).optional(),
        }),
        response: responses({ 200: paginated(reportSchema) }),
      },
    },
    async (request) => {
      const result = await service.listReports(request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.post(
    '/admin/reports/:id/resolve',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Resolve or dismiss a report',
        ...secured,
        params: idParams,
        body: z.object({ status: z.enum(['RESOLVED', 'DISMISSED']), note: optionalText(1000) }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAdmin(request)
      const eventId = await service.resolveReport(
        auth.userId,
        request.params.id,
        request.body.status,
        request.body.note,
      )
      await audit(request, {
        action: `admin.report.${request.body.status.toLowerCase()}`,
        targetType: 'report',
        targetId: request.params.id,
        eventId,
      })
      return OK
    },
  )

  // ─── Organizations ─────────────────────────────────────────────────────────

  app.get(
    '/admin/organizations',
    {
      schema: {
        tags: ['Admin'],
        summary: 'List organizations',
        ...secured,
        querystring: paginationQuery.extend({
          q,
          status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
        }),
        response: responses({ 200: paginated(adminOrgSchema) }),
      },
    },
    async (request) => {
      const result = await service.listOrganizations(request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.post(
    '/admin/organizations/:id/status',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Suspend or reinstate an organization',
        description: 'A suspended organization’s events are hidden from public listings.',
        ...secured,
        params: idParams,
        body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.setOrganizationStatus(request.params.id, request.body.status)
      await audit(request, {
        action: `admin.organization.${request.body.status.toLowerCase()}`,
        targetType: 'organization',
        targetId: request.params.id,
        organizationId: request.params.id,
      })
      return OK
    },
  )

  // ─── Audit log ─────────────────────────────────────────────────────────────

  app.get(
    '/admin/audit-logs',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Audit log',
        ...secured,
        querystring: paginationQuery.extend({
          action: z
            .string()
            .trim()
            .max(80)
            .optional()
            .describe('Prefix match, e.g. "admin." or "event.publish".'),
          actorId: z.uuid().optional(),
          targetId: z.string().max(80).optional(),
          eventId: z.uuid().optional(),
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
        }),
        response: responses({ 200: paginated(auditSchema) }),
      },
    },
    async (request) => {
      const result = await service.listAuditLogs(request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  // ─── System configuration ──────────────────────────────────────────────────

  app.get(
    '/admin/settings',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Platform configuration',
        ...secured,
        response: responses({ 200: settingsSchema }),
      },
    },
    async () => getSettings(),
  )

  app.patch(
    '/admin/settings',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Update platform configuration',
        ...secured,
        body: settingsSchema.partial(),
        response: responses({ 200: settingsSchema }),
      },
    },
    async (request) => {
      const auth = requireAdmin(request)
      const before = await getSettings()
      const after = await updateSettings(request.body, auth.userId)
      await audit(request, {
        action: 'admin.settings.update',
        targetType: 'settings',
        metadata: Object.fromEntries(
          Object.keys(request.body).map((key) => [
            key,
            { from: before[key as keyof typeof before], to: after[key as keyof typeof after] },
          ]),
        ),
      })
      return after
    },
  )

  app.get(
    '/admin/categories',
    {
      schema: {
        tags: ['Admin'],
        summary: 'List event categories',
        ...secured,
        response: responses({ 200: z.object({ items: z.array(categoryAdminSchema) }) }),
      },
    },
    async () => ({
      items: (await service.listAllCategories()).map((category) => ({
        ...category,
        eventCount: category._count.events,
      })),
    }),
  )

  app.post(
    '/admin/categories',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Add an event category',
        ...secured,
        body: z.object({
          name: requiredText(2, 80),
          description: optionalText(300),
          sortOrder: z.number().int().min(0).max(10_000).default(500),
        }),
        response: responses({ 201: categoryAdminSchema }),
      },
    },
    async (request, reply) => {
      try {
        const category = await prisma.eventCategory.create({
          data: { ...request.body, slug: slugify(request.body.name) },
        })
        await audit(request, {
          action: 'admin.category.create',
          targetType: 'category',
          targetId: category.id,
        })
        return reply.status(201).send({ ...category, eventCount: 0 })
      } catch (error) {
        if (isUniqueViolation(error)) throw conflict('A category with this name already exists.')
        throw error
      }
    },
  )

  app.patch(
    '/admin/categories/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Update or deactivate a category',
        ...secured,
        params: idParams,
        body: z
          .object({
            name: requiredText(2, 80),
            description: optionalText(300),
            sortOrder: z.number().int().min(0).max(10_000),
            isActive: z.boolean(),
          })
          .partial(),
        response: responses({ 200: categoryAdminSchema }),
      },
    },
    async (request) => {
      const existing = await prisma.eventCategory.findUnique({ where: { id: request.params.id } })
      if (!existing) throw notFound('Category')
      const category = await prisma.eventCategory.update({
        where: { id: request.params.id },
        data: request.body,
        include: { _count: { select: { events: true } } },
      })
      await audit(request, {
        action: 'admin.category.update',
        targetType: 'category',
        targetId: category.id,
        metadata: request.body,
      })
      return { ...category, eventCount: category._count.events }
    },
  )
}
