import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { idParams, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import * as service from './analytics.service.js'

const nullableRate = z
  .number()
  .nullable()
  .describe('A ratio between 0 and 1, or null when the denominator is zero.')

const analyticsSchema = z
  .object({
    range: z.object({ from: z.date(), to: z.date() }),
    traffic: z.object({
      pageViews: z.number().int(),
      uniqueVisitors: z.number().int(),
      referrers: z.array(z.object({ host: z.string(), views: z.number().int() })),
    }),
    funnel: z.object({
      registrationStarts: z.number().int(),
      registrationCompletions: z.number().int(),
      conversionRate: nullableRate,
      formCompletionRate: nullableRate,
    }),
    registrations: z.object({
      confirmed: z.number().int(),
      pending: z.number().int(),
      declined: z.number().int(),
      cancelled: z.number().int(),
    }),
    responses: z.object({
      received: z.number().int(),
      qualifying: z.number().int(),
      excluded: z.number().int(),
    }),
    tickets: z.object({ issued: z.number().int() }),
    attendance: z.object({
      expected: z.number().int(),
      checkedIn: z.number().int(),
      attendanceRate: nullableRate,
      noShows: z.number().int().nullable(),
      noShowRate: nullableRate,
    }),
    communications: z.object({
      sent: z.number().int(),
      delivered: z.number().int(),
      opened: z.number().int(),
      bounced: z.number().int(),
      failed: z.number().int(),
      suppressed: z.number().int(),
      deliveryRate: nullableRate,
      openRate: nullableRate,
    }),
    daily: z.array(
      z.object({ date: z.string(), views: z.number().int(), registrations: z.number().int() }),
    ),
    definitions: z.record(z.string(), z.string()),
  })
  .meta({ id: 'EventAnalytics' })

const overviewSchema = z
  .object({
    events: z.record(z.string(), z.number().int()),
    confirmedRegistrations: z.number().int(),
    pendingRegistrations: z.number().int(),
    checkIns: z.number().int(),
    forms: z.number().int(),
    upcoming: z.array(
      z.object({
        id: z.uuid(),
        slug: z.string(),
        title: z.string(),
        startsAt: z.date(),
        endsAt: z.date(),
        timezone: z.string(),
        registeredCount: z.number().int(),
        capacity: z.number().int().nullable(),
      }),
    ),
  })
  .meta({ id: 'OrganizerOverview' })

export const analyticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events/:id/analytics',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Event analytics',
        description:
          'Each figure is computed from stored records. `definitions` explains how each metric is calculated.',
        ...secured,
        params: idParams,
        querystring: z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
        response: responses({ 200: analyticsSchema }),
      },
    },
    async (request) =>
      service.eventAnalytics(requireAuth(request).userId, request.params.id, request.query),
  )

  app.get(
    '/me/organizer-overview',
    {
      schema: {
        tags: ['Analytics'],
        summary: 'Organiser dashboard overview',
        ...secured,
        response: responses({ 200: overviewSchema }),
      },
    },
    async (request) => service.organizerOverview(requireAuth(request).userId),
  )
}
