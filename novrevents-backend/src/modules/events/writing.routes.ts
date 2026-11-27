import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { AppError } from '../../lib/errors.js'
import { responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'

const available = () => Boolean(env.NHAAI_BASE_URL && env.NHAAI_MODEL && env.NHAAI_API_KEY)
export const writingRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/event-tools/writing',
    {
      schema: {
        tags: ['Events'],
        ...secured,
        response: responses({ 200: z.object({ available: z.boolean() }) }),
      },
    },
    async (req) => {
      return { available: requireAuth(req).emailVerified && available() }
    },
  )
  app.post(
    '/event-tools/writing',
    {
      schema: {
        tags: ['Events'],
        ...secured,
        body: z.object({ notes: z.string().trim().min(30).max(1800) }).strict(),
        response: responses({ 200: z.object({ description: z.string() }) }),
      },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req) => {
      const user = requireAuth(req)
      if (!user.emailVerified || !available())
        throw new AppError(403, 'WRITING_UNAVAILABLE', 'Drafting is unavailable for this account.')
      const url = new URL(env.NHAAI_BASE_URL!.replace(/\/$/, '') + '/chat/completions')
      const reply = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env.NHAAI_API_KEY,
        },
        body: JSON.stringify({
          model: env.NHAAI_MODEL,
          temperature: 0.35,
          max_tokens: 350,
          messages: [
            {
              role: 'system',
              content:
                'Write plain English event listing copy in two short paragraphs from supplied organizer notes. Only use facts in those notes. Do not add a date, price, venue, speaker or promise. Omit greetings, markdown, sales claims and first person. Return only the proposed listing description.',
            },
            { role: 'user', content: req.body.notes },
          ],
        }),
      })
      if (!reply.ok)
        throw new AppError(503, 'WRITING_UNAVAILABLE', 'A draft could not be prepared.')
      const data = z
        .object({
          choices: z
            .array(
              z.object({ message: z.object({ content: z.string().trim().min(10).max(3500) }) }),
            )
            .min(1),
        })
        .parse(await reply.json())
      return { description: data.choices[0]!.message.content }
    },
  )
}
