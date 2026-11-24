import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { pageOf, paginated, paginationQuery, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { profileCardSchema, usernameParams } from '../profiles/profile.schemas.js'
import * as service from './follow.service.js'

const followStateSchema = z.object({ following: z.boolean(), followerCount: z.number().int() })

export const followRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/profiles/:username/follow',
    {
      schema: {
        tags: ['Follows'],
        summary: 'Follow a user',
        description: 'Idempotent. Only public profiles can be followed.',
        ...secured,
        params: usernameParams,
        response: responses({ 200: followStateSchema }),
      },
    },
    async (request) => service.follow(requireAuth(request).userId, request.params.username),
  )

  app.delete(
    '/profiles/:username/follow',
    {
      schema: {
        tags: ['Follows'],
        summary: 'Unfollow a user',
        ...secured,
        params: usernameParams,
        response: responses({ 200: followStateSchema }),
      },
    },
    async (request) => service.unfollow(requireAuth(request).userId, request.params.username),
  )

  app.get(
    '/profiles/:username/followers',
    {
      schema: {
        tags: ['Follows'],
        summary: 'List the followers of a public profile',
        params: usernameParams,
        querystring: paginationQuery,
        response: responses({ 200: paginated(profileCardSchema) }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.listFollowers(
        request.params.username,
        request.auth?.userId ?? null,
        page,
        pageSize,
      )
      return pageOf(result.items, result.total, page, pageSize)
    },
  )

  app.get(
    '/profiles/:username/following',
    {
      schema: {
        tags: ['Follows'],
        summary: 'List who a public profile follows',
        params: usernameParams,
        querystring: paginationQuery,
        response: responses({ 200: paginated(profileCardSchema) }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.listFollowing(
        request.params.username,
        request.auth?.userId ?? null,
        page,
        pageSize,
      )
      return pageOf(result.items, result.total, page, pageSize)
    },
  )
}
