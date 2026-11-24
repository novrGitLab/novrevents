import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { pageOf, paginated, paginationQuery, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import * as service from './organization-follow.service.js'

const orgSlugParams = z.object({ slug: z.string().trim().toLowerCase().min(1).max(80) })

const followStateSchema = z.object({ following: z.boolean(), followerCount: z.number().int() })

const followedOrganizationSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    publicEventCount: z.number().int(),
  })
  .meta({ id: 'FollowedOrganization' })

export const organizationFollowRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/public/organizations/:slug/follow',
    {
      schema: {
        tags: ['Follows'],
        summary: 'Follow a public organisation',
        description: 'Idempotent. Suspended or unknown organisations return 404.',
        ...secured,
        params: orgSlugParams,
        response: responses({ 200: followStateSchema }),
      },
    },
    async (request) => service.followOrganization(requireAuth(request).userId, request.params.slug),
  )

  app.delete(
    '/public/organizations/:slug/follow',
    {
      schema: {
        tags: ['Follows'],
        summary: 'Stop following an organisation',
        description: 'Idempotent. Works even after the organisation is suspended.',
        ...secured,
        params: orgSlugParams,
        response: responses({ 200: followStateSchema }),
      },
    },
    async (request) =>
      service.unfollowOrganization(requireAuth(request).userId, request.params.slug),
  )

  app.get(
    '/me/followed-organizations',
    {
      schema: {
        tags: ['Follows'],
        summary: 'Organisations the signed-in person follows',
        ...secured,
        querystring: paginationQuery,
        response: responses({ 200: paginated(followedOrganizationSchema) }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.listFollowedOrganizations(
        requireAuth(request).userId,
        page,
        pageSize,
      )
      return pageOf(result.items, result.total, page, pageSize)
    },
  )
}
