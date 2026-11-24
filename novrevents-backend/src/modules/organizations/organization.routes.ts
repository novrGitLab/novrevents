import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { idParams, OK, okSchema, responses, secured } from '../../lib/http.js'
import { MAX_IMAGE_BYTES, readSingleUpload } from '../../lib/uploads.js'
import { requireAuth } from '../../middleware/auth.js'
import {
  addMemberBody,
  createOrganizationBody,
  memberParams,
  memberSchema,
  organizationSchema,
  publicOrganizationSchema,
  slugParams,
  updateMemberBody,
  updateOrganizationBody,
} from './organization.schemas.js'
import * as service from './organization.service.js'

export const organizationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/organizations',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Create an organization workspace',
        description:
          'Optional. Individuals can organise events without one. The creator becomes the owner.',
        ...secured,
        body: createOrganizationBody,
        response: responses({ 201: organizationSchema }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const org = await service.createOrganization(auth.userId, request.body)
      await audit(request, {
        action: 'organization.create',
        targetType: 'organization',
        targetId: org.id,
        organizationId: org.id,
      })
      return reply.status(201).send(org)
    },
  )

  app.get(
    '/organizations',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'List the organizations you belong to',
        ...secured,
        response: responses({ 200: z.object({ items: z.array(organizationSchema) }) }),
      },
    },
    async (request) => ({ items: await service.listMyOrganizations(requireAuth(request).userId) }),
  )

  app.get(
    '/organizations/:id',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Get an organization you belong to',
        ...secured,
        params: idParams,
        response: responses({ 200: organizationSchema }),
      },
    },
    async (request) => service.getOrganization(requireAuth(request).userId, request.params.id),
  )

  app.patch(
    '/organizations/:id',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Update an organization (owner or admin)',
        ...secured,
        params: idParams,
        body: updateOrganizationBody,
        response: responses({ 200: organizationSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const org = await service.updateOrganization(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'organization.update',
        targetType: 'organization',
        targetId: org.id,
        organizationId: org.id,
      })
      return org
    },
  )

  app.post(
    '/organizations/:id/logo',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Upload an organization logo (owner or admin)',
        ...secured,
        consumes: ['multipart/form-data'],
        params: idParams,
        response: responses({ 200: organizationSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const upload = await readSingleUpload(request, MAX_IMAGE_BYTES)
      return service.setOrganizationLogo(auth.userId, request.params.id, upload.buffer)
    },
  )

  app.delete(
    '/organizations/:id',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Delete an empty organization (owner)',
        ...secured,
        params: idParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await service.deleteOrganization(auth.userId, request.params.id)
      await audit(request, {
        action: 'organization.delete',
        targetType: 'organization',
        targetId: request.params.id,
      })
      return OK
    },
  )

  app.get(
    '/organizations/:id/members',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'List organization members',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(memberSchema) }) }),
      },
    },
    async (request) => ({
      items: await service.listMembers(requireAuth(request).userId, request.params.id),
    }),
  )

  app.post(
    '/organizations/:id/members',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Add a member by username (owner or admin)',
        ...secured,
        params: idParams,
        body: addMemberBody,
        response: responses({ 201: z.object({ items: z.array(memberSchema) }) }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const userId = await service.addMember(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'organization.member_add',
        targetType: 'user',
        targetId: userId,
        organizationId: request.params.id,
        metadata: { role: request.body.role },
      })
      return reply
        .status(201)
        .send({ items: await service.listMembers(auth.userId, request.params.id) })
    },
  )

  app.patch(
    '/organizations/:id/members/:userId',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Change a member role',
        ...secured,
        params: memberParams,
        body: updateMemberBody,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await service.updateMemberRole(
        auth.userId,
        request.params.id,
        request.params.userId,
        request.body.role,
      )
      await audit(request, {
        action: 'organization.member_role',
        targetType: 'user',
        targetId: request.params.userId,
        organizationId: request.params.id,
        metadata: { role: request.body.role },
      })
      return OK
    },
  )

  app.delete(
    '/organizations/:id/members/:userId',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Remove a member, or leave the organization',
        ...secured,
        params: memberParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await service.removeMember(auth.userId, request.params.id, request.params.userId)
      await audit(request, {
        action: 'organization.member_remove',
        targetType: 'user',
        targetId: request.params.userId,
        organizationId: request.params.id,
      })
      return OK
    },
  )

  app.get(
    '/public/organizations/:slug',
    {
      schema: {
        tags: ['Organizations'],
        summary: 'Public organizer page',
        params: slugParams,
        response: responses({ 200: publicOrganizationSchema }),
      },
    },
    async (request) =>
      service.getPublicOrganization(request.params.slug, request.auth?.userId ?? null),
  )
}
