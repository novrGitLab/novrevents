import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import {
  OK,
  okSchema,
  pageOf,
  paginated,
  paginationQuery,
  responses,
  secured,
} from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import { usernameParams } from '../profiles/profile.schemas.js'
import * as service from './discovery.service.js'
import {
  categorySchema,
  discoveryQuery,
  eventDetailSchema,
  eventSummarySchema,
  eventViewBody,
  reportEventBody,
} from './event.schemas.js'

const slugParams = z.object({ slug: z.string().trim().min(1).max(120) })
const keyQuery = z.object({
  key: z.string().max(100).optional().describe('Share key, required for PRIVATE events.'),
})

export const discoveryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/public/events',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Search the public event directory',
        description:
          'Lists public, published events. Filter by date, location, category, format (mode), price, ' +
          'organiser, registration availability and event type; sort and paginate.',
        querystring: discoveryQuery,
        response: responses({ 200: paginated(eventSummarySchema) }),
      },
    },
    async (request) => {
      const result = await service.searchEvents(request.query)
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.get(
    '/public/categories',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'List event categories',
        response: responses({ 200: z.object({ items: z.array(categorySchema) }) }),
      },
    },
    async () => ({ items: await service.listCategories() }),
  )

  app.get(
    '/public/events/:slug',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Event page',
        description:
          'Unlisted events are reachable by link. Private events need the `key` from the share link, unless ' +
          'the viewer is registered or on the event team. The join link is only included for confirmed attendees.',
        params: slugParams,
        querystring: keyQuery,
        response: responses({ 200: eventDetailSchema }),
      },
    },
    async (request) =>
      service.getEventPage(request.params.slug, request.auth?.userId ?? null, request.query.key),
  )

  app.get(
    '/public/events/:slug/calendar.ics',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Calendar file (.ics) for an event',
        description:
          'Times are UTC, so every calendar shows the right moment. Same visibility rules as the event page; ' +
          'the join link and organiser email are never included.',
        params: slugParams,
        querystring: keyQuery,
      },
    },
    async (request, reply) => {
      const file = await service.eventCalendarFile(
        request.params.slug,
        request.auth?.userId ?? null,
        request.query.key,
      )
      return reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', `attachment; filename="${file.filename}"`)
        .header('cache-control', 'no-store')
        .send(file.body)
    },
  )

  app.post(
    '/public/events/:slug/view',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Record an event page view',
        description: 'Anonymous beacon. No cookies; the visitor key is a daily-rotating hash.',
        params: slugParams,
        querystring: keyQuery,
        body: eventViewBody,
        response: responses({ 200: z.object({ counted: z.boolean() }) }),
      },
      config: { rateLimit: limits.beacon },
    },
    async (request) => ({
      counted: await service.recordEventView(request.params.slug, {
        userId: request.auth?.userId ?? null,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
        referrer: request.body.referrer,
        key: request.query.key,
      }),
    }),
  )

  app.post(
    '/public/events/:slug/report',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Report an event for abuse',
        description:
          'Available to everyone. One report per account (or network address) per event.',
        params: slugParams,
        querystring: keyQuery,
        body: reportEventBody,
        response: responses({ 201: okSchema }),
      },
      config: { rateLimit: limits.report },
    },
    async (request, reply) => {
      await service.reportEvent(
        request.params.slug,
        { userId: request.auth?.userId ?? null, ip: request.ip, key: request.query.key },
        request.body,
      )
      return reply.status(201).send(OK)
    },
  )

  app.put(
    '/public/events/:slug/save',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Save an event',
        ...secured,
        params: slugParams,
        querystring: keyQuery,
        response: responses({ 200: z.object({ saved: z.boolean() }) }),
      },
    },
    async (request) => {
      await service.saveEvent(requireAuth(request).userId, request.params.slug, request.query.key)
      return { saved: true }
    },
  )

  app.delete(
    '/public/events/:slug/save',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Remove an event from your saved list',
        ...secured,
        params: slugParams,
        response: responses({ 200: z.object({ saved: z.boolean() }) }),
      },
    },
    async (request) => {
      await service.unsaveEvent(requireAuth(request).userId, request.params.slug)
      return { saved: false }
    },
  )

  app.get(
    '/me/saved-events',
    {
      schema: {
        tags: ['Discovery'],
        summary: 'Your saved events',
        ...secured,
        querystring: paginationQuery,
        response: responses({ 200: paginated(eventSummarySchema) }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.listSavedEvents(requireAuth(request).userId, page, pageSize)
      return pageOf(result.items, result.total, page, pageSize)
    },
  )

  app.get(
    '/me/feed',
    {
      schema: {
        tags: ['Follows'],
        summary: 'Events published by people you follow',
        ...secured,
        querystring: paginationQuery,
        response: responses({ 200: paginated(eventSummarySchema) }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.followedEventsFeed(requireAuth(request).userId, page, pageSize)
      return pageOf(result.items, result.total, page, pageSize)
    },
  )

  app.get(
    '/profiles/:username/events',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Public events organised by a user',
        params: usernameParams,
        querystring: paginationQuery,
        response: responses({ 200: paginated(eventSummarySchema) }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.listEventsByProfile(
        request.params.username,
        request.auth?.userId ?? null,
        page,
        pageSize,
      )
      return pageOf(result.items, result.total, page, pageSize)
    },
  )

  app.get(
    '/profiles/:username/registered-events',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Events a user is registered for (followers only, opt-in)',
        description:
          'Private by default. Returns `visible: false` with no items unless the profile owner enabled ' +
          'sharing and the viewer follows them. Only confirmed registrations for public events are ever listed.',
        params: usernameParams,
        querystring: paginationQuery,
        response: responses({
          200: paginated(eventSummarySchema).extend({ visible: z.boolean() }),
        }),
      },
    },
    async (request) => {
      const { page, pageSize } = request.query
      const result = await service.listSharedRegistrations(
        request.params.username,
        request.auth?.userId ?? null,
        page,
        pageSize,
      )
      return { ...pageOf(result.items, result.total, page, pageSize), visible: result.visible }
    },
  )
}
