import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { idParams, OK, okSchema, responses, secured } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import * as service from './attendance.service.js'

const outcomeSchema = z
  .object({
    result: z.enum(['ACCEPTED', 'DUPLICATE', 'INVALID', 'WRONG_EVENT', 'VOID']),
    message: z.string(),
    attendee: z
      .object({
        registrationId: z.uuid(),
        name: z.string(),
        ticketType: z.string(),
        ticketCode: z.string(),
      })
      .nullable(),
    checkedInAt: z.date().nullable(),
    /** For duplicates: how the earlier check-in was made. */
    previousMethod: z.enum(['QR', 'MANUAL']).nullable(),
  })
  .meta({ id: 'ScanOutcome' })

const summarySchema = z
  .object({
    expected: z.number().int(),
    checkedIn: z.number().int(),
    remaining: z.number().int(),
    attendanceRate: z.number().nullable(),
    noShows: z.number().int().nullable(),
    noShowRate: z.number().nullable(),
    eventEnded: z.boolean(),
    byTicketType: z.array(
      z.object({ name: z.string(), expected: z.number().int(), checkedIn: z.number().int() }),
    ),
    perHour: z.array(z.object({ hour: z.date(), count: z.number().int() })),
    scans: z.record(z.string(), z.number().int()),
    recent: z.array(
      z.object({
        registrationId: z.uuid(),
        name: z.string(),
        ticketType: z.string(),
        method: z.enum(['QR', 'MANUAL']),
        checkedInAt: z.date(),
      }),
    ),
  })
  .meta({ id: 'AttendanceSummary' })

export const attendanceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/events/:id/check-in/scan',
    {
      schema: {
        tags: ['Attendance'],
        summary: 'Check in a scanned ticket QR code',
        description:
          'Always returns 200 with a `result`; scanners should display the outcome rather than treat ' +
          'DUPLICATE or INVALID as request errors. The QR signature is verified server-side.',
        ...secured,
        params: idParams,
        body: z.object({ payload: z.string().min(1).max(500) }),
        response: responses({ 200: outcomeSchema }),
      },
      config: { rateLimit: limits.scan },
    },
    async (request) =>
      service.scanTicket(requireAuth(request).userId, request.params.id, request.body.payload),
  )

  app.post(
    '/events/:id/check-in/manual',
    {
      schema: {
        tags: ['Attendance'],
        summary: 'Check an attendee in manually',
        description:
          'By registration id (after a lookup) or by typing the ticket code printed under the QR code.',
        ...secured,
        params: idParams,
        body: z
          .object({
            registrationId: z.uuid().optional(),
            ticketCode: z.string().max(40).optional(),
          })
          .refine(
            (value) => value.registrationId || value.ticketCode,
            'Provide a registration or a ticket code.',
          ),
        response: responses({ 200: outcomeSchema }),
      },
      config: { rateLimit: limits.scan },
    },
    async (request) =>
      service.manualCheckIn(requireAuth(request).userId, request.params.id, request.body),
  )

  app.delete(
    '/events/:id/check-in/:registrationId',
    {
      schema: {
        tags: ['Attendance'],
        summary: 'Undo a check-in (managers only)',
        ...secured,
        params: z.object({ id: z.uuid(), registrationId: z.uuid() }),
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await service.undoCheckIn(
        requireAuth(request).userId,
        request.params.id,
        request.params.registrationId,
      )
      await audit(request, {
        action: 'attendance.undo',
        targetType: 'registration',
        targetId: request.params.registrationId,
        eventId: request.params.id,
      })
      return OK
    },
  )

  app.get(
    '/events/:id/check-in/lookup',
    {
      schema: {
        tags: ['Attendance'],
        summary: 'Find an attendee by name, email or ticket code',
        ...secured,
        params: idParams,
        querystring: z.object({ q: z.string().trim().min(2).max(100) }),
        response: responses({
          200: z.object({
            items: z.array(
              z.object({
                registrationId: z.uuid(),
                name: z.string(),
                email: z.string(),
                status: z.string(),
                ticketType: z.string(),
                ticketCode: z.string().nullable(),
                ticketStatus: z.string().nullable(),
                checkedInAt: z.date().nullable(),
              }),
            ),
          }),
        }),
      },
    },
    async (request) => ({
      items: await service.lookupAttendees(
        requireAuth(request).userId,
        request.params.id,
        request.query.q,
      ),
    }),
  )

  app.get(
    '/events/:id/attendance',
    {
      schema: {
        tags: ['Attendance'],
        summary: 'Attendance dashboard figures',
        ...secured,
        params: idParams,
        response: responses({ 200: summarySchema }),
      },
    },
    async (request) => service.attendanceSummary(requireAuth(request).userId, request.params.id),
  )
}
