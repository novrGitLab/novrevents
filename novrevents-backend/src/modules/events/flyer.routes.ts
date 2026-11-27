import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import QRCode from 'qrcode'
import { z } from 'zod'
import { appUrl } from '../../config/env.js'
import { prisma } from '../../lib/db.js'
import { notFound, badRequest } from '../../lib/errors.js'
import { idParams, requiredText, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireEventAccess } from './event-access.js'
import { getEventPage } from './discovery.service.js'

const design = z.object({
  style: z.enum(['marquee', 'programme', 'invitation', 'afterhours', 'studio']),
  photograph:z.enum(['none','opening','culture','workshop','cyber','wedding','anniversary','community']).default('none'),
  headline: requiredText(1, 110),
  note: z.string().trim().max(160),
  shared: z.boolean(),
})
const poster = design.extend({
  qr: z.string(),
  destination: z.url(),
  date: z.string(),
  place: z.string(),
})
type Design = z.infer<typeof design>
type EventInfo = {
  title: string
  slug: string
  startsAt: Date
  timezone: string
  venueName: string | null
  city: string | null
  mode: string
}
async function present(event: EventInfo, saved: Design) {
  const destination = appUrl + '/events/' + encodeURIComponent(event.slug) + '#registration'
  const date = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: event.timezone,
  }).format(event.startsAt)
  return {
    ...saved,
    destination,
    date: date + ' · ' + event.timezone,
    place:
      [event.venueName, event.city].filter(Boolean).join(', ') ||
      (event.mode === 'VIRTUAL' ? 'Online' : ''),
    qr: await QRCode.toDataURL(destination, { width: 200, margin: 4 }),
  }
}
export const flyerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events/:id/flyer',
    {
      schema: {
        tags: ['Events'],
        ...secured,
        params: idParams,
        response: responses({ 200: poster }),
      },
    },
    async (request) => {
      const { event } = await requireEventAccess(
        requireAuth(request).userId,
        request.params.id,
        'manage',
      )
      const saved = design.safeParse(event.flyer)
      return present(
        event,
        saved.success
          ? saved.data
          : { style: 'marquee', photograph:'none', headline: event.title.slice(0, 110), note: '', shared: false },
      )
    },
  )
  app.put(
    '/events/:id/flyer',
    {
      schema: {
        tags: ['Events'],
        ...secured,
        params: idParams,
        body: design.strict(),
        response: responses({ 200: poster }),
      },
    },
    async (request) => {
      const { event } = await requireEventAccess(
        requireAuth(request).userId,
        request.params.id,
        'manage',
      )
      if (
        request.body.shared &&
        (event.visibility !== 'PUBLIC' || !['PUBLISHED', 'ONGOING'].includes(event.status))
      )
        throw badRequest('Publish the event publicly before sharing a flyer.')
      await prisma.event.update({ where: { id: event.id }, data: { flyer: request.body } })
      return present(event, request.body)
    },
  )
  app.get(
    '/public/events/:slug/flyer',
    {
      schema: {
        tags: ['Discovery'],
        params: z.object({ slug: z.string().min(1).max(200) }),
        response: responses({ 200: poster }),
      },
    },
    async (request) => {
      const listing = await getEventPage(request.params.slug, null, undefined)
      if (listing.visibility !== 'PUBLIC' || !['PUBLISHED', 'ONGOING'].includes(listing.status))
        throw notFound('Flyer')
      const event = await prisma.event.findUniqueOrThrow({ where: { id: listing.id } })
      const saved = design.safeParse(event.flyer)
      if (
        !saved.success ||
        !saved.data.shared ||
        event.moderationStatus === 'REMOVED' ||
        event.visibility !== 'PUBLIC' ||
        !['PUBLISHED', 'ONGOING'].includes(event.status)
      )
        throw notFound('Flyer')
      return present(event, saved.data)
    },
  )
}
