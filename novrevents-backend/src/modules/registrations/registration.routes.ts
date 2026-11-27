import type { FastifyReply } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { prisma } from '../../lib/db.js'
import { conflict, notFound } from '../../lib/errors.js'
import {
  idParams,
  OK,
  okSchema,
  optionalText,
  pageOf,
  paginated,
  paginationQuery,
  requiredText,
  responses,
  secured,
} from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import { ticketTypeSchema } from '../events/event.schemas.js'
import { renderTicketPdf } from '../tickets/ticket-pdf.js'
import { ticketQrImage } from '../tickets/ticket-credential.js'
import * as attendees from './attendee.service.js'
import * as service from './registration.service.js'

const registrationSchema = z
  .object({
    id: z.uuid(),
    eventId: z.uuid(),
    attendeeName: z.string(),
    attendeeEmail: z.string(),
    status: z.enum(['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED']),
    ticketType: z.object({ id: z.uuid(), name: z.string() }),
    ticket: z
      .object({
        id: z.uuid(),
        code: z.string(),
        status: z.enum(['VALID', 'VOID']),
        issuedAt: z.date(),
      })
      .nullable(),
    checkedInAt: z.date().nullable(),
    submissionId: z.uuid().nullable(),
    isGuest: z.boolean(),
    cancelledAt: z.date().nullable(),
    cancelledBy: z.enum(['ATTENDEE', 'ORGANIZER', 'SYSTEM']).nullable(),
    cancellationReason: z.string().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'Registration' })

const myRegistrationSchema = registrationSchema
  .extend({
    event: z.object({
      id: z.uuid(),
      slug: z.string(),
      title: z.string(),
      startsAt: z.date(),
      endsAt: z.date(),
      timezone: z.string(),
      whenText: z.string(),
      whereText: z.string(),
      mode: z.enum(['IN_PERSON', 'VIRTUAL', 'HYBRID']),
      status: z.string(),
      organizerName: z.string(),
      organizerEmail: z.string().nullable(),
      bannerUrl: z.string().nullable(),
      accentColor: z.string().nullable(),
      onlineUrl: z.string().nullable(),
    }),
    amountKobo:z.number().int().nullable(),
    paymentDueAt:z.date().nullable(),
    canCancel: z.boolean(),
    certificateCode: z.string().nullable(),
    manageUrl: z.string(),
  })
  .meta({ id: 'MyRegistration' })

const attendeeQuery = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED']).optional(),
  q: z.string().trim().max(100).optional(),
  checkedIn: z.enum(['yes', 'no']).optional(),
  ticketTypeId: z.uuid().optional(),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
})

const registrationParams = z.object({ id: z.uuid(), registrationId: z.uuid() })
const ticketTypeParams = z.object({ id: z.uuid(), ticketTypeId: z.uuid() })
const tokenParams = z.object({ token: z.string().min(40).max(120) })
const ticketTypeBody = z.object({
  priceKobo:z.number().int().min(0).max(2000000000).default(0),
  name: requiredText(1, 80),
  description: optionalText(300),
  capacity: z.number().int().min(1).max(1_000_000).nullable().default(null),
})

async function sendTicket(
  reply: FastifyReply,
  registrationId: string,
  format: 'pdf' | 'png' | 'svg',
) {
  const ticket = await prisma.ticket.findUnique({ where: { registrationId } })
  if (!ticket) throw notFound('Ticket')
  if (ticket.status !== 'VALID') throw conflict('This ticket is no longer valid.', 'TICKET_VOID')
  void reply
    .header('cache-control', 'private, no-store')
    .header('x-content-type-options', 'nosniff')
  if (format === 'pdf') {
    const pdf = await renderTicketPdf(ticket.id)
    if (!pdf) throw notFound('Ticket')
    return reply
      .header('content-type', 'application/pdf')
      .header('content-disposition', `attachment; filename="${pdf.filename}"`)
      .send(pdf.content)
  }
  const image = await ticketQrImage(ticket.code, format)
  return reply.header('content-type', format === 'svg' ? 'image/svg+xml' : 'image/png').send(image)
}

const ticketFormat = z.object({ format: z.enum(['pdf', 'png', 'svg']).default('pdf') })

export const registrationRoutes: FastifyPluginAsyncZod = async (app) => {
  // ─── Organiser: attendees ──────────────────────────────────────────────────

  app.get(
    '/events/:id/registrations',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Attendee list',
        description:
          'Search by name, email or ticket code. Available to the whole event team, including check-in staff.',
        ...secured,
        params: idParams,
        querystring: paginationQuery.extend(attendeeQuery.shape),
        response: responses({ 200: paginated(registrationSchema) }),
      },
    },
    async (request) => {
      const result = await attendees.listAttendees(
        requireAuth(request).userId,
        request.params.id,
        request.query,
      )
      return pageOf(result.items, result.total, request.query.page, request.query.pageSize)
    },
  )

  app.get(
    '/events/:id/registrations/export',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Export attendees and attendance as CSV',
        ...secured,
        params: idParams,
        querystring: attendeeQuery,
      },
    },
    async (request, reply) => {
      const auth = requireAuth(request)
      const result = await attendees.exportAttendeesCsv(
        auth.userId,
        request.params.id,
        request.query,
      )
      await audit(request, {
        action: 'registration.export',
        targetType: 'event',
        targetId: request.params.id,
        eventId: request.params.id,
        metadata: { rows: result.count },
      })
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${result.filename}"`)
        .header('cache-control', 'no-store')
        .send(result.csv)
    },
  )

  app.get(
    '/events/:id/registrations/:registrationId',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Get one registration',
        ...secured,
        params: registrationParams,
        response: responses({ 200: registrationSchema }),
      },
    },
    async (request) =>
      attendees.getAttendee(
        requireAuth(request).userId,
        request.params.id,
        request.params.registrationId,
      ),
  )

  for (const action of ['approve', 'decline'] as const) {
    app.post(
      `/events/:id/registrations/:registrationId/${action}`,
      {
        schema: {
          tags: ['Registrations'],
          summary:
            action === 'approve'
              ? 'Approve a pending registration (issues the ticket)'
              : 'Decline a pending registration',
          ...secured,
          params: registrationParams,
          response: responses({ 200: registrationSchema }),
        },
      },
      async (request) => {
        const auth = requireAuth(request)
        await attendees.requireRegistrationOfEvent(
          auth.userId,
          request.params.id,
          request.params.registrationId,
        )
        if (action === 'approve')
          await service.approveRegistration(request.params.registrationId, auth.userId)
        else await service.declineRegistration(request.params.registrationId, auth.userId)
        await audit(request, {
          action: `registration.${action}`,
          targetType: 'registration',
          targetId: request.params.registrationId,
          eventId: request.params.id,
        })
        return attendees.getAttendee(auth.userId, request.params.id, request.params.registrationId)
      },
    )
  }

  app.post(
    '/events/:id/registrations/:registrationId/cancel',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Cancel a registration as the organiser',
        description: 'Voids the ticket, frees the place and emails the attendee.',
        ...secured,
        params: registrationParams,
        body: z.object({ reason: optionalText(500) }),
        response: responses({ 200: registrationSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await attendees.requireRegistrationOfEvent(
        auth.userId,
        request.params.id,
        request.params.registrationId,
      )
      await service.cancelRegistration(
        request.params.registrationId,
        'ORGANIZER',
        request.body.reason,
      )
      await audit(request, {
        action: 'registration.cancel',
        targetType: 'registration',
        targetId: request.params.registrationId,
        eventId: request.params.id,
      })
      return attendees.getAttendee(auth.userId, request.params.id, request.params.registrationId)
    },
  )

  // ─── Organiser: ticket types ───────────────────────────────────────────────

  app.get(
    '/events/:id/ticket-types',
    {
      schema: {
        tags: ['Tickets'],
        summary: 'List ticket types',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(ticketTypeSchema) }) }),
      },
    },
    async (request) => ({
      items: await attendees.listTicketTypes(requireAuth(request).userId, request.params.id),
    }),
  )

  app.post(
    '/events/:id/ticket-types',
    {
      schema: {
        tags: ['Tickets'],
        summary: 'Add a ticket type',
        ...secured,
        params: idParams,
        body: ticketTypeBody,
        response: responses({ 201: ticketTypeSchema }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await attendees.createTicketType(
            requireAuth(request).userId,
            request.params.id,
            request.body,
          ),
        ),
  )

  app.patch(
    '/events/:id/ticket-types/:ticketTypeId',
    {
      schema: {
        tags: ['Tickets'],
        summary: 'Update a ticket type',
        ...secured,
        params: ticketTypeParams,
        body: ticketTypeBody.partial().extend({
          isActive: z.boolean().optional(),
          sortOrder: z.number().int().min(0).max(1000).optional(),
        }),
        response: responses({ 200: ticketTypeSchema }),
      },
    },
    async (request) =>
      attendees.updateTicketType(
        requireAuth(request).userId,
        request.params.id,
        request.params.ticketTypeId,
        request.body,
      ),
  )

  app.delete(
    '/events/:id/ticket-types/:ticketTypeId',
    {
      schema: {
        tags: ['Tickets'],
        summary: 'Delete an unused ticket type',
        ...secured,
        params: ticketTypeParams,
        response: responses({ 200: okSchema }),
      },
    },
    async (request) => {
      await attendees.deleteTicketType(
        requireAuth(request).userId,
        request.params.id,
        request.params.ticketTypeId,
      )
      return OK
    },
  )

  // ─── Signed-in attendee ────────────────────────────────────────────────────

  app.get(
    '/me/registrations',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Your registrations and tickets',
        ...secured,
        querystring: paginationQuery.extend({
          scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
        }),
        response: responses({ 200: paginated(myRegistrationSchema) }),
      },
    },
    async (request) => {
      const { scope, page, pageSize } = request.query
      const result = await attendees.listMyRegistrations(
        requireAuth(request).userId,
        scope,
        page,
        pageSize,
      )
      return pageOf(result.items, result.total, page, pageSize)
    },
  )

  app.get(
    '/me/registrations/:id',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'One of your registrations',
        ...secured,
        params: idParams,
        response: responses({ 200: myRegistrationSchema }),
      },
    },
    async (request) => attendees.getMyRegistration(requireAuth(request).userId, request.params.id),
  )

  app.post(
    '/me/registrations/:id/cancel',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Cancel your registration',
        ...secured,
        params: idParams,
        response: responses({ 200: myRegistrationSchema }),
      },
    },
    async (request) => {
      const auth = requireAuth(request)
      await attendees.getMyRegistration(auth.userId, request.params.id)
      await service.cancelRegistration(request.params.id, 'ATTENDEE')
      await audit(request, {
        action: 'registration.self_cancel',
        targetType: 'registration',
        targetId: request.params.id,
      })
      return attendees.getMyRegistration(auth.userId, request.params.id)
    },
  )

  app.get(
    '/me/registrations/:id/ticket',
    {
      schema: {
        tags: ['Tickets'],
        summary: 'Download your ticket (PDF) or its QR code',
        ...secured,
        params: idParams,
        querystring: ticketFormat,
      },
    },
    async (request, reply) => {
      await attendees.getMyRegistration(requireAuth(request).userId, request.params.id)
      return sendTicket(reply, request.params.id, request.query.format)
    },
  )

  // ─── Guest attendee (private link from the confirmation email) ─────────────

  app.get(
    '/public/registrations/:token',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'View a registration through its private link',
        description:
          'For guests without an account. The link is emailed to the attendee and acts as their credential.',
        params: tokenParams,
        response: responses({ 200: myRegistrationSchema }),
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request) => attendees.getRegistrationByToken(request.params.token),
  )

  app.post(
    '/public/registrations/:token/cancel',
    {
      schema: {
        tags: ['Registrations'],
        summary: 'Cancel a registration through its private link',
        params: tokenParams,
        response: responses({ 200: myRegistrationSchema }),
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request) => {
      const id = await attendees.registrationIdForToken(request.params.token)
      await service.cancelRegistration(id, 'ATTENDEE')
      await audit(request, {
        action: 'registration.self_cancel',
        targetType: 'registration',
        targetId: id,
      })
      return attendees.getRegistrationByToken(request.params.token)
    },
  )

  app.get(
    '/public/registrations/:token/ticket',
    {
      schema: {
        tags: ['Tickets'],
        summary: 'Download a ticket through its private link',
        params: tokenParams,
        querystring: ticketFormat,
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request, reply) =>
      sendTicket(
        reply,
        await attendees.registrationIdForToken(request.params.token),
        request.query.format,
      ),
  )
}
