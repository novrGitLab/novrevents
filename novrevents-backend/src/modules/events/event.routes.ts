import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { idParams, OK, okSchema, pageOf, paginated, responses, secured } from '../../lib/http.js'
import { MAX_IMAGE_BYTES, readSingleUpload } from '../../lib/uploads.js'
import { requireAuth, requireVerified } from '../../middleware/auth.js'
import { getSettings } from '../admin/settings.service.js'
import {
  cancelEventBody,
  createEventBody,
  eventListItemSchema,
  eventManageSchema,
  myEventsQuery,
  updateEventBody,
} from './event.schemas.js'
import * as service from './event.service.js'

const imageParams = z.object({ id: z.uuid(), kind: z.enum(['banner', 'logo']) })

export const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events',
    {
      schema: {
        tags: ['Events'],
        summary: 'List events you organise or help run',
        description:
          'Includes events you own, events whose team you are on, and events of organizations you administer.',
        ...secured,
        querystring: myEventsQuery,
        response: responses({ 200: paginated(eventListItemSchema) }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const result = await service.listMyEvents(auth.userId, request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.post(
    '/events',
    {
      schema: {
        tags: ['Events'],
        summary: 'Create a draft event',
        description:
          'Any signed-in user can create an event. A default "General Admission" ticket type is added.',
        ...secured,
        body: createEventBody,
        response: responses({ 201: eventManageSchema }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const event = await service.createEvent(auth.userId, request.body)
      await audit(request, {
        action: 'event.create',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
      })
      return reply.status(201).send(event)
    },
  )

  app.get(
    '/events/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Get an event for management',
        ...secured,
        params: idParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => service.getManagedEvent(requireAuth(request).userId, request.params.id),
  )

  app.patch(
    '/events/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Update an event',
        description:
          'Covers details, schedule, location, capacity, visibility and branding (accent colour).',
        ...secured,
        params: idParams,
        body: updateEventBody,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const event = await service.updateEvent(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'event.update',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
        metadata: { fields: Object.keys(request.body) },
      })
      return event
    },
  )

  app.post(
    '/events/:id/images/:kind',
    {
      schema: {
        tags: ['Events'],
        summary: 'Upload the event banner or logo',
        description: 'multipart/form-data with one JPEG, PNG or WebP image up to 5 MB.',
        ...secured,
        consumes: ['multipart/form-data'],
        params: imageParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const upload = await readSingleUpload(request, MAX_IMAGE_BYTES)
      return service.setEventImage(
        auth.userId,
        request.params.id,
        request.params.kind,
        upload.buffer,
      )
    },
  )

  app.delete(
    '/events/:id/images/:kind',
    {
      schema: {
        tags: ['Events'],
        summary: 'Remove the event banner or logo',
        ...secured,
        params: imageParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) =>
      service.removeEventImage(requireAuth(request).userId, request.params.id, request.params.kind),
  )

  app.post(
    '/events/:id/publish',
    {
      schema: {
        tags: ['Events'],
        summary: 'Publish a draft event',
        description:
          'Requires a verified email address and a complete listing. Returns 422 `EVENT_INCOMPLETE` with ' +
          'the missing details. Followers of the organiser are notified the first time a public event goes live.',
        ...secured,
        params: idParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const settings = await getSettings()
      const auth = settings.requireVerifiedEmailToPublish
        ? requireVerified(request)
        : requireAuth(request)
      const event = await service.publishEvent(auth.userId, request.params.id)
      await audit(request, {
        action: 'event.publish',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
      })
      return event
    },
  )

  app.post(
    '/events/:id/unpublish',
    {
      schema: {
        tags: ['Events'],
        summary: 'Return a published event to draft',
        description: 'Only possible while nobody has registered.',
        ...secured,
        params: idParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const event = await service.unpublishEvent(auth.userId, request.params.id)
      await audit(request, {
        action: 'event.unpublish',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
      })
      return event
    },
  )

  app.post(
    '/events/:id/cancel',
    {
      schema: {
        tags: ['Events'],
        summary: 'Cancel an event (owner or organization admin)',
        description:
          'Voids all tickets and, unless disabled, emails attendees a cancellation notice.',
        ...secured,
        params: idParams,
        body: cancelEventBody,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const event = await service.cancelEvent(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'event.cancel',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
        metadata: { notifyAttendees: request.body.notifyAttendees },
      })
      return event
    },
  )

  app.post(
    '/events/:id/archive',
    {
      schema: {
        tags: ['Events'],
        summary: 'Archive a draft, completed or cancelled event',
        ...secured,
        params: idParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const event = await service.archiveEvent(auth.userId, request.params.id)
      await audit(request, {
        action: 'event.archive',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
      })
      return event
    },
  )

  app.post(
    '/events/:id/unarchive',
    {
      schema: {
        tags: ['Events'],
        summary: 'Restore an archived event',
        ...secured,
        params: idParams,
        response: responses({ 200: eventManageSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const event = await service.unarchiveEvent(auth.userId, request.params.id)
      await audit(request, {
        action: 'event.unarchive',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
      })
      return event
    },
  )

  app.post(
    '/events/:id/duplicate',
    {
      schema: {
        tags: ['Events'],
        summary: 'Duplicate an event into a new draft',
        description:
          'Copies the listing, ticket types, speakers and agenda. Registrations and images are not copied.',
        ...secured,
        params: idParams,
        response: responses({ 201: eventManageSchema }),
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const event = await service.duplicateEvent(auth.userId, request.params.id)
      await audit(request, {
        action: 'event.duplicate',
        targetType: 'event',
        targetId: event.id,
        eventId: event.id,
        metadata: { sourceEventId: request.params.id },
      })
      return reply.status(201).send(event)
    },
  )

  app.delete(
    '/events/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Delete a draft event that has no registrations',
        ...secured,
        params: idParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await service.deleteEvent(auth.userId, request.params.id)
      await audit(request, {
        action: 'event.delete',
        targetType: 'event',
        targetId: request.params.id,
      })
      return OK
    },
  )
}
