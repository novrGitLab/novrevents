import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  idParams,
  isoDateTime,
  OK,
  okSchema,
  optionalText,
  requiredText,
  responses,
  secured,
} from '../../lib/http.js'
import { MAX_IMAGE_BYTES, readSingleUpload } from '../../lib/uploads.js'
import { requireAuth } from '../../middleware/auth.js'
import { agendaSessionSchema, speakerSchema } from '../events/event.schemas.js'
import * as service from './schedule.service.js'

const speakerBody = z.object({
  name: requiredText(2, 120),
  title: optionalText(120),
  organization: optionalText(120),
  bio: optionalText(2000),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

const sessionBody = z.object({
  title: requiredText(2, 160),
  description: optionalText(4000),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  location: optionalText(120),
  track: optionalText(80),
  speakerIds: z.array(z.uuid()).max(30).optional(),
})

const speakerParams = z.object({ id: z.uuid(), speakerId: z.uuid() })
const sessionParams = z.object({ id: z.uuid(), sessionId: z.uuid() })

export const scheduleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events/:id/speakers',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'List speakers',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(speakerSchema) }) }),
      },
    },
    async (request) => ({
      items: await service.listSpeakers(requireAuth(request).userId, request.params.id),
    }),
  )

  app.post(
    '/events/:id/speakers',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Add a speaker',
        ...secured,
        params: idParams,
        body: speakerBody,
        response: responses({ 201: speakerSchema }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createSpeaker(requireAuth(request).userId, request.params.id, request.body),
        ),
  )

  app.patch(
    '/events/:id/speakers/:speakerId',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Update a speaker',
        ...secured,
        params: speakerParams,
        body: speakerBody.partial(),
        response: responses({ 200: speakerSchema }),
      },
    },
    async (request) =>
      service.updateSpeaker(
        requireAuth(request).userId,
        request.params.id,
        request.params.speakerId,
        request.body,
      ),
  )

  app.post(
    '/events/:id/speakers/:speakerId/photo',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Upload a speaker photo',
        ...secured,
        consumes: ['multipart/form-data'],
        params: speakerParams,
        response: responses({ 200: speakerSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const upload = await readSingleUpload(request, MAX_IMAGE_BYTES)
      return service.setSpeakerPhoto(
        auth.userId,
        request.params.id,
        request.params.speakerId,
        upload.buffer,
      )
    },
  )

  app.delete(
    '/events/:id/speakers/:speakerId',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Remove a speaker',
        ...secured,
        params: speakerParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.deleteSpeaker(
        requireAuth(request).userId,
        request.params.id,
        request.params.speakerId,
      )
      return OK
    },
  )

  app.get(
    '/events/:id/sessions',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'List agenda sessions',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(agendaSessionSchema) }) }),
      },
    },
    async (request) => ({
      items: await service.listSessions(requireAuth(request).userId, request.params.id),
    }),
  )

  app.post(
    '/events/:id/sessions',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Add an agenda session',
        description: 'Session times must fall within the event’s start and end.',
        ...secured,
        params: idParams,
        body: sessionBody,
        response: responses({ 201: agendaSessionSchema }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await service.createSession(requireAuth(request).userId, request.params.id, request.body),
        ),
  )

  app.patch(
    '/events/:id/sessions/:sessionId',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Update an agenda session',
        ...secured,
        params: sessionParams,
        body: sessionBody.partial(),
        response: responses({ 200: agendaSessionSchema }),
      },
    },
    async (request) =>
      service.updateSession(
        requireAuth(request).userId,
        request.params.id,
        request.params.sessionId,
        request.body,
      ),
  )

  app.delete(
    '/events/:id/sessions/:sessionId',
    {
      schema: {
        tags: ['Schedule'],
        summary: 'Remove an agenda session',
        ...secured,
        params: sessionParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.deleteSession(
        requireAuth(request).userId,
        request.params.id,
        request.params.sessionId,
      )
      return OK
    },
  )
}
