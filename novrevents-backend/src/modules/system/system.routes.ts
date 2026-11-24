import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { prisma } from '../../lib/db.js'
import { notFound } from '../../lib/errors.js'
import { responses } from '../../lib/http.js'
import { contentTypeForKey, storage } from '../../lib/storage/index.js'

const healthSchema = z.object({ status: z.literal('ok'), time: z.date() })

export const systemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness check',
        description: 'Returns 200 while the process is running. Does not touch the database.',
        response: responses({ 200: healthSchema }),
      },
    },
    async () => ({ status: 'ok' as const, time: new Date() }),
  )

  app.get(
    '/ready',
    {
      schema: {
        tags: ['System'],
        summary: 'Readiness check',
        description: 'Returns 200 only when the database answers a query.',
        response: responses({ 200: healthSchema }),
      },
    },
    async () => {
      await prisma.$queryRaw`SELECT 1`
      return { status: 'ok' as const, time: new Date() }
    },
  )

  app.get(
    '/files/public/*',
    {
      schema: {
        tags: ['System'],
        summary: 'Public uploaded asset',
        description:
          'Serves banners, logos, avatars and speaker photos. Private form uploads are never served here.',
        params: z.object({ '*': z.string().max(400) }),
      },
    },
    async (request, reply) => {
      const key = `public/${request.params['*']}`
      // Keys are server-generated; anything that does not look like one is simply not found.
      if (!/^public\/[a-z]+\/[A-Za-z0-9_-]+\.webp$/.test(key)) throw notFound('File')
      const file = await storage.get(key)
      if (!file) throw notFound('File')
      void reply
        .header('content-type', contentTypeForKey(key))
        .header('cache-control', 'public, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
      if (file.size !== null) void reply.header('content-length', file.size)
      return reply.send(file.stream)
    },
  )
}
