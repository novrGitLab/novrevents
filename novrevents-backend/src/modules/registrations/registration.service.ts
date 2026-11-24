import { LOCKING_TX, prisma, type Prisma, type Tx } from '../../lib/db.js'
import { AppError, conflict, notFound } from '../../lib/errors.js'
import type {
  CancelledBy,
  Event,
  Registration,
  Ticket,
  TicketType,
} from '../../generated/prisma/client.js'
import { queueEmail } from '../communications/outbox.js'
import {
  registrationCancelledContent,
  registrationConfirmedContent,
  registrationDeclinedContent,
  registrationPendingContent,
} from '../communications/templates.js'
import { eventEmailInfo } from '../events/event.dto.js'
import { notify } from '../notifications/notifications.service.js'
import { manageUrlFor, newTicketCode } from '../tickets/ticket-credential.js'
// Importing the PDF module registers the ticket attachment used by confirmation emails.
import '../tickets/ticket-pdf.js'

export const eventFull = () =>
  new AppError(409, 'EVENT_FULL', 'This event has reached its capacity.')
export const ticketTypeFull = () =>
  new AppError(
    409,
    'TICKET_TYPE_FULL',
    'This ticket type is no longer available. Choose another one.',
  )

// ─── Locks ───────────────────────────────────────────────────────────────────
// Every change to the number of seats held takes the event row lock first, then the ticket type
// lock, always in that order. Concurrent registrations therefore queue instead of overselling.

export async function lockEvent(tx: Tx, eventId: string): Promise<Event> {
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId}::uuid FOR UPDATE`
  return tx.event.findUniqueOrThrow({ where: { id: eventId } })
}

export async function lockTicketType(tx: Tx, ticketTypeId: string): Promise<TicketType> {
  await tx.$queryRaw`SELECT id FROM ticket_types WHERE id = ${ticketTypeId}::uuid FOR UPDATE`
  return tx.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })
}

/** Picks the ticket type for a new registration: the requested one, or the first with room. */
export async function chooseTicketType(
  tx: Tx,
  eventId: string,
  requestedId: string | undefined,
): Promise<TicketType> {
  if (requestedId) {
    const requested = await tx.ticketType.findFirst({
      where: { id: requestedId, eventId, isActive: true },
    })
    if (!requested)
      throw new AppError(400, 'INVALID_TICKET_TYPE', 'Choose one of the available ticket types.')
    return requested
  }
  const types = await tx.ticketType.findMany({
    where: { eventId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const available = types.find(
    (type) => type.capacity === null || type.registeredCount < type.capacity,
  )
  if (!available) throw eventFull()
  return available
}

async function issueTicket(
  tx: Tx,
  registration: Pick<Registration, 'id' | 'eventId' | 'ticketTypeId'>,
): Promise<Ticket> {
  return tx.ticket.create({
    data: {
      registrationId: registration.id,
      eventId: registration.eventId,
      ticketTypeId: registration.ticketTypeId,
      code: newTicketCode(),
    },
  })
}

async function queueConfirmation(
  tx: Tx,
  event: Event,
  registration: Registration,
  ticket: Ticket,
  ticketTypeName: string,
): Promise<void> {
  await queueEmail(tx, {
    type: 'REGISTRATION_CONFIRMATION',
    to: { email: registration.attendeeEmail, name: registration.attendeeName },
    userId: registration.userId,
    eventId: event.id,
    registrationId: registration.id,
    attachments: [{ kind: 'ticket', id: ticket.id }],
    content: () =>
      registrationConfirmedContent({
        event: eventEmailInfo(event),
        attendeeName: registration.attendeeName,
        ticketCode: ticket.code,
        ticketTypeName,
        manageUrl: manageUrlFor(registration),
        onlineUrl: event.onlineUrl,
      }),
  })
  if (registration.userId) {
    await notify(tx, {
      userId: registration.userId,
      type: 'REGISTRATION_CONFIRMED',
      title: `You are registered for ${event.title}`,
      linkPath: '/dashboard/tickets',
    })
  }
}

// ─── Creation ────────────────────────────────────────────────────────────────

export interface NewRegistration {
  event: Event
  ticketType: TicketType
  submissionId: string
  userId: string | null
  attendeeName: string
  attendeeEmail: string
  /** False when the organiser reviews registrations: the seat is held but no ticket is issued. */
  confirmed: boolean
}

/**
 * Creates the registration for a qualifying form submission.
 * The caller must already hold the event and ticket type locks and have checked capacity.
 */
export async function createRegistration(
  tx: Tx,
  input: NewRegistration,
): Promise<{ registration: Registration; ticket: Ticket | null }> {
  const registration = await tx.registration.create({
    data: {
      eventId: input.event.id,
      ticketTypeId: input.ticketType.id,
      submissionId: input.submissionId,
      userId: input.userId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      status: input.confirmed ? 'CONFIRMED' : 'PENDING',
    },
  })
  await tx.event.update({
    where: { id: input.event.id },
    data: { registeredCount: { increment: 1 } },
  })
  await tx.ticketType.update({
    where: { id: input.ticketType.id },
    data: { registeredCount: { increment: 1 } },
  })

  if (!input.confirmed) {
    await queueEmail(tx, {
      type: 'REGISTRATION_PENDING',
      to: { email: registration.attendeeEmail, name: registration.attendeeName },
      userId: registration.userId,
      eventId: input.event.id,
      registrationId: registration.id,
      content: () =>
        registrationPendingContent({
          event: eventEmailInfo(input.event),
          attendeeName: registration.attendeeName,
          manageUrl: manageUrlFor(registration),
        }),
    })
    return { registration, ticket: null }
  }

  const ticket = await issueTicket(tx, registration)
  await queueConfirmation(tx, input.event, registration, ticket, input.ticketType.name)
  return { registration, ticket }
}

// ─── Organiser decisions ─────────────────────────────────────────────────────

async function loadForChange(tx: Tx, registrationId: string) {
  const current = await tx.registration.findUnique({
    where: { id: registrationId },
    select: { eventId: true },
  })
  if (!current) throw notFound('Registration')
  // Lock order: event, then ticket type (see above).
  const event = await lockEvent(tx, current.eventId)
  const registration = await tx.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { ticket: { include: { checkIn: true } }, ticketType: true },
  })
  await lockTicketType(tx, registration.ticketTypeId)
  return { event, registration }
}

async function releaseSeat(
  tx: Tx,
  registration: Pick<Registration, 'eventId' | 'ticketTypeId'>,
): Promise<void> {
  await tx.event.update({
    where: { id: registration.eventId },
    data: { registeredCount: { decrement: 1 } },
  })
  await tx.ticketType.update({
    where: { id: registration.ticketTypeId },
    data: { registeredCount: { decrement: 1 } },
  })
}

/** Approves a pending registration: it becomes confirmed and the ticket is issued and emailed. */
export async function approveRegistration(
  registrationId: string,
  decidedById: string,
): Promise<Registration> {
  return prisma.$transaction(async (tx) => {
    const { event, registration } = await loadForChange(tx, registrationId)
    if (registration.status !== 'PENDING')
      throw conflict('Only pending registrations can be approved.', 'INVALID_STATUS')
    if (event.status === 'CANCELLED')
      throw conflict('This event has been cancelled.', 'EVENT_CANCELLED')

    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { status: 'CONFIRMED' },
    })
    if (registration.submissionId) {
      await tx.formSubmission.update({
        where: { id: registration.submissionId },
        data: { decision: 'ACCEPTED', decidedAt: new Date(), decidedById },
      })
    }
    const ticket = await issueTicket(tx, updated)
    await queueConfirmation(tx, event, updated, ticket, registration.ticketType.name)
    return updated
  }, LOCKING_TX)
}

/** Declines a pending registration and frees the seat it was holding. No ticket is ever issued. */
export async function declineRegistration(
  registrationId: string,
  decidedById: string,
): Promise<Registration> {
  return prisma.$transaction(async (tx) => {
    const { event, registration } = await loadForChange(tx, registrationId)
    if (registration.status !== 'PENDING')
      throw conflict('Only pending registrations can be declined.', 'INVALID_STATUS')

    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { status: 'DECLINED' },
    })
    await releaseSeat(tx, registration)
    if (registration.submissionId) {
      await tx.formSubmission.update({
        where: { id: registration.submissionId },
        data: { decision: 'DECLINED', decidedAt: new Date(), decidedById },
      })
    }
    await queueEmail(tx, {
      type: 'REGISTRATION_DECLINED',
      to: { email: registration.attendeeEmail, name: registration.attendeeName },
      userId: registration.userId,
      eventId: event.id,
      registrationId,
      content: () =>
        registrationDeclinedContent({
          event: eventEmailInfo(event),
          attendeeName: registration.attendeeName,
        }),
    })
    return updated
  }, LOCKING_TX)
}

// ─── Cancellation ────────────────────────────────────────────────────────────

/**
 * Cancels a pending or confirmed registration: voids the ticket, frees the seat, and lets the same
 * person register again later (the duplicate lock on their submission is released).
 */
export async function cancelRegistration(
  registrationId: string,
  cancelledBy: CancelledBy,
  reason: string | null = null,
): Promise<Registration> {
  return prisma.$transaction(async (tx) => {
    const { event, registration } = await loadForChange(tx, registrationId)
    if (registration.status !== 'PENDING' && registration.status !== 'CONFIRMED') {
      throw conflict('This registration is not active.', 'INVALID_STATUS')
    }
    if (registration.ticket?.checkIn) {
      throw conflict('This attendee has already checked in.', 'ALREADY_CHECKED_IN')
    }
    if (cancelledBy === 'ATTENDEE' && event.endsAt <= new Date()) {
      throw conflict('This event has already ended.', 'EVENT_ENDED')
    }

    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy,
        cancellationReason: reason,
      },
    })
    await releaseSeat(tx, registration)
    if (registration.ticket) {
      await tx.ticket.update({
        where: { id: registration.ticket.id },
        data: { status: 'VOID', voidedAt: new Date() },
      })
    }
    if (registration.submissionId) {
      await tx.formSubmission.update({
        where: { id: registration.submissionId },
        data: { duplicateHash: null },
      })
    }
    await queueEmail(tx, {
      type: 'REGISTRATION_CANCELLED',
      to: { email: registration.attendeeEmail, name: registration.attendeeName },
      userId: registration.userId,
      eventId: event.id,
      registrationId,
      content: () =>
        registrationCancelledContent({
          event: eventEmailInfo(event),
          attendeeName: registration.attendeeName,
          byOrganizer: cancelledBy !== 'ATTENDEE',
          reason,
        }),
    })
    return updated
  }, LOCKING_TX)
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export const registrationInclude = {
  ticketType: { select: { id: true, name: true } },
  ticket: {
    select: {
      id: true,
      code: true,
      status: true,
      issuedAt: true,
      checkIn: { select: { checkedInAt: true, method: true } },
    },
  },
} satisfies Prisma.RegistrationInclude

export type RegistrationWithTicket = Prisma.RegistrationGetPayload<{
  include: typeof registrationInclude
}>

export function toRegistration(registration: RegistrationWithTicket) {
  return {
    id: registration.id,
    eventId: registration.eventId,
    attendeeName: registration.attendeeName,
    attendeeEmail: registration.attendeeEmail,
    status: registration.status,
    ticketType: registration.ticketType,
    ticket: registration.ticket
      ? {
          id: registration.ticket.id,
          code: registration.ticket.code,
          status: registration.ticket.status,
          issuedAt: registration.ticket.issuedAt,
        }
      : null,
    checkedInAt: registration.ticket?.checkIn?.checkedInAt ?? null,
    submissionId: registration.submissionId,
    isGuest: registration.userId === null,
    cancelledAt: registration.cancelledAt,
    cancelledBy: registration.cancelledBy,
    cancellationReason: registration.cancellationReason,
    createdAt: registration.createdAt,
  }
}
