import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  idParams,
  OK,
  okSchema,
  pageOf,
  paginated,
  paginationQuery,
  responses,
  secured,
} from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import * as service from './notifications.service.js'

const notificationSchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    title: z.string(),
    body: z.string().nullable(),
    linkPath: z.string().nullable(),
    readAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'Notification' })

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/notifications',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'List notifications for the signed-in user',
        ...secured,
        querystring: paginationQuery.extend({
          unreadOnly: z.enum(['true', 'false']).default('false'),
        }),
        response: responses({
          200: paginated(notificationSchema).extend({ unreadCount: z.number().int() }),
        }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      const { page, pageSize, unreadOnly } = request.query
      const result = await service.listNotifications(
        auth.userId,
        page,
        pageSize,
        unreadOnly === 'true',
      )
      return {
        ...pageOf(result.items, result.total, page, pageSize),
        unreadCount: result.unreadCount,
      }
    },
  )

  app.post(
    '/notifications/:id/read',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark one notification as read',
        ...secured,
        params: idParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.markRead(requireAuth(request).userId, request.params.id)
      return OK
    },
  )

  app.post(
    '/notifications/read-all',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Mark every notification as read',
        ...secured,
        response: responses({ 200: z.object({ updated: z.number().int() }) }),
      },
    },
    async (request) => ({ updated: await service.markAllRead(requireAuth(request).userId) }),
  )
}
