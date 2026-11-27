import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../../lib/db.js'
import { audit } from '../../lib/audit.js'
import {
  emailField,
  idParams,
  pageOf,
  paginated,
  paginationQuery,
  requiredText,
  responses,
  secured,
  skipTake,
} from '../../lib/http.js'
import { requireAdmin } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import { notFound } from '../../lib/errors.js'

const status = z.enum(['NEW', 'CONTACTED', 'CLOSED'])
const brief = z
  .object({
    name: requiredText(2, 100),
    email: emailField,
    occasion: requiredText(2, 100),
    location: requiredText(2, 160),
    date: z.iso.date().optional(),
    guests: z.number().int().min(1).max(100000).optional(),
    details: requiredText(10, 2000),
  })
  .strict()
const entry = brief.omit({ date: true, guests: true }).extend({
  id: z.uuid(),
  email: z.email(),
  date: z.string().nullable(),
  guests: z.number().int().nullable(),
  status,
  createdAt: z.date(),
})

export const planningRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/public/planning-requests',
    {
      config: { rateLimit: limits.report },
      schema: {
        tags: ['Planning'],
        body: brief,
        response: responses({ 201: z.object({ id: z.uuid() }) }),
      },
    },
    async (request, reply) => {
      const receipt = await prisma.planningRequest.create({
        data: request.body,
        select: { id: true },
      })
      return reply.status(201).send(receipt)
    },
  )
  app.get(
    '/admin/planning-requests',
    {
      preHandler: async (request) => {
        requireAdmin(request)
      },
      schema: {
        tags: ['Admin'],
        ...secured,
        querystring: paginationQuery.extend({ status: status.optional() }),
        response: responses({ 200: paginated(entry) }),
      },
    },
    async (request) => {
      const { page, pageSize, status } = request.query
      const where = { status }
      const [items, total] = await prisma.$transaction([
        prisma.planningRequest.findMany({
          where,
          ...skipTake(page, pageSize),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        prisma.planningRequest.count({ where }),
      ])
      return pageOf(items, total, page, pageSize)
    },
  )
  app.patch(
    '/admin/planning-requests/:id',
    {
      preHandler: async (request) => {
        requireAdmin(request)
      },
      schema: {
        tags: ['Admin'],
        ...secured,
        params: idParams,
        body: z.object({ status }).strict(),
        response: responses({ 200: z.object({ ok: z.boolean() }) }),
      },
    },
    async (request) => {
      const { count } = await prisma.planningRequest.updateMany({
        where: { id: request.params.id },
        data: request.body,
      })
      if (!count) throw notFound('Planning request')
      await audit(request, {
        action: 'admin.planning.update',
        targetType: 'planning_request',
        targetId: request.params.id,
        metadata: { status: request.body.status },
      })
      return { ok: true }
    },
  )
}
