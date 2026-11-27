import { env } from '../../config/env.js'
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
  const amount = input.ticketType.priceKobo
  const payout =
    amount > 0
      ? await tx.user.findUnique({
          where: { id: input.event.ownerId },
          select: { payoutSubaccount: true, payoutTestSubaccount: true },
        })
      : null
  const account =
    env.PAYSTACK_MODE === 'test' ? payout?.payoutTestSubaccount : payout?.payoutSubaccount
  if (amount > 0 && env.PAYSTACK_MODE === 'test' && input.event.visibility === 'PUBLIC')
    throw conflict('Online ticket sales are not open for this event.', 'CHECKOUT_UNAVAILABLE')
  if (amount > 0 && (!env.PAYSTACK_SECRET_KEY || (env.PAYSTACK_MODE === 'live' && !account)))
    throw conflict('Online checkout is unavailable for this ticket.', 'CHECKOUT_UNAVAILABLE')
  const registration = await tx.registration.create({
    data: {
      eventId: input.event.id,
      ticketTypeId: input.ticketType.id,
      submissionId: input.submissionId,
      userId: input.userId,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      amountKobo: amount || null,
      checkoutSubaccount: account ?? null,
      paymentMode: env.PAYSTACK_MODE,
      paymentDueAt: amount && input.confirmed ? checkoutDeadline(input.event.endsAt) : null,
      status: input.confirmed && !amount ? 'CONFIRMED' : 'PENDING',
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

  if (amount && input.confirmed) {
    await paymentInvitation(tx, input.event, registration)
    return { registration, ticket: null }
  }
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

    if (registration.amountKobo && !registration.paidReference) {
      if (registration.paymentDueAt)
        throw conflict('The attendee is awaiting payment.', 'PAYMENT_DUE')
      const held = await tx.registration.update({
        where: { id: registrationId },
        data: { paymentDueAt: checkoutDeadline(event.endsAt) },
      })
      if (held.submissionId)
        await tx.formSubmission.update({
          where: { id: held.submissionId },
          data: { decision: 'ACCEPTED', decidedAt: new Date(), decidedById },
        })
      await paymentInvitation(tx, event, held)
      return held
    }
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

function checkoutDeadline(endsAt: Date) {
  return new Date(Math.min(endsAt.getTime(), Date.now() + 30 * 60000))
}

async function paymentInvitation(tx: Tx, event: Event, registration: Registration) {
  await queueEmail(tx, {
    type: 'REGISTRATION_PENDING',
    to: { email: registration.attendeeEmail, name: registration.attendeeName },
    userId: registration.userId,
    eventId: event.id,
    registrationId: registration.id,
    content: () => ({
      subject: 'Complete payment for ' + event.title,
      heading:
        registration.paymentMode === 'test' ? 'Test checkout is ready' : 'Your ticket is on hold',
      accent: event.accentColor,
      blocks: [
        {
          kind: 'text',
          text:
            (registration.paymentMode === 'test'
              ? 'Use Paystack test details to simulate '
              : 'Pay ') +
            new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
              registration.amountKobo! / 100,
            ) +
            ' before ' +
            registration.paymentDueAt!.toISOString() +
            (registration.paymentMode === 'test'
              ? '. A test payment does not admit a guest.'
              : ' to confirm your place.'),
        },
        {
          kind: 'button',
          label: registration.paymentMode === 'test' ? 'Open test checkout' : 'Pay for ticket',
          url: manageUrlFor(registration),
        },
      ],
    }),
  })
}

export async function recordCharge(
  reference: string,
  received: {
    reference: string
    amount: number
    currency: string
    domain: string
    status: string
    customer: { email: string }
    paid_at: string | null
  },
) {
  if (received.reference !== reference || received.status !== 'success') return
  const attempt = await prisma.paymentAttempt.findUnique({ where: { reference } })
  if (!attempt) return
  await prisma.$transaction(async (tx) => {
    const { event, registration } = await loadForChange(tx, attempt.registrationId)
    if (registration.paidReference === reference) return
    const current = await tx.paymentAttempt.findUniqueOrThrow({ where: { reference } })
    if (current.outcome === 'TEST_PAID') return
    const paidAt = received.paid_at ? new Date(received.paid_at).getTime() : NaN
    const eligible =
      registration.status === 'PENDING' &&
      !registration.paidReference &&
      event.status !== 'CANCELLED' &&
      event.moderationStatus !== 'REMOVED' &&
      registration.amountKobo === received.amount &&
      received.currency === 'NGN' &&
      received.domain === registration.paymentMode &&
      received.customer.email.toLowerCase() === registration.attendeeEmail.toLowerCase() &&
      registration.paymentDueAt &&
      Number.isFinite(paidAt) &&
      paidAt <= registration.paymentDueAt.getTime()
    if (eligible && registration.paymentMode === 'test') {
      await tx.paymentAttempt.update({ where: { reference }, data: { outcome: 'TEST_PAID' } })
      await tx.registration.update({
        where: { id: registration.id },
        data: {
          status: 'CANCELLED',
          cancelledBy: 'SYSTEM',
          cancelledAt: new Date(),
          cancellationReason: 'Test checkout completed. No payment was collected or ticket issued.',
        },
      })
      await releaseSeat(tx, registration)
      if (registration.submissionId)
        await tx.formSubmission.update({
          where: { id: registration.submissionId },
          data: { duplicateHash: null },
        })
      return
    }
    await tx.paymentAttempt.update({
      where: { reference },
      data: { outcome: eligible ? 'PAID' : 'RECONCILE' },
    })
    if (!eligible) return
    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: { status: 'CONFIRMED', paidReference: reference },
    })
    const ticket = await issueTicket(tx, updated)
    await queueConfirmation(tx, event, updated, ticket, registration.ticketType.name)
  }, LOCKING_TX)
}

export async function expireCheckouts(now: Date) {
  const holds = await prisma.registration.findMany({
    where: { status: 'PENDING', paymentDueAt: { lt: now }, paidReference: null },
    select: { id: true },
    take: 200,
    orderBy: { paymentDueAt: 'asc' },
  })
  for (const hold of holds)
    await prisma.$transaction(async (tx) => {
      const { registration } = await loadForChange(tx, hold.id)
      if (
        registration.status !== 'PENDING' ||
        !registration.paymentDueAt ||
        registration.paymentDueAt >= now ||
        registration.paidReference
      )
        return
      await tx.registration.update({
        where: { id: hold.id },
        data: {
          status: 'CANCELLED',
          cancelledBy: 'SYSTEM',
          cancelledAt: now,
          cancellationReason: 'The payment window expired.',
        },
      })
      await releaseSeat(tx, registration)
      if (registration.submissionId)
        await tx.formSubmission.update({
          where: { id: registration.submissionId },
          data: { duplicateHash: null },
        })
    }, LOCKING_TX)
}
