import { isUniqueViolation, prisma } from '../../lib/db.js'
import { badRequest, notFound } from '../../lib/errors.js'
import type { CheckInMethod, ScanResult } from '../../generated/prisma/client.js'
import { requireEventAccess } from '../events/event-access.js'
import { normaliseTicketCode, verifyTicketQr } from '../tickets/ticket-credential.js'

/**
 * Check-in results the scanner shows:
 *  ACCEPTED     admitted now
 *  DUPLICATE    the ticket was already used — shows when and how
 *  INVALID      not a NOVR ticket, forged, or no such ticket
 *  WRONG_EVENT  a genuine ticket for a different event
 *  VOID         the registration was cancelled or the event was cancelled
 * Every attempt is logged, so organisers can review the door activity.
 */
export interface ScanOutcome {
  result: ScanResult
  message: string
  attendee: {
    registrationId: string
    name: string
    ticketType: string
    ticketCode: string
  } | null
  checkedInAt: Date | null
  previousMethod: CheckInMethod | null
}

async function logScan(
  eventId: string,
  ticketId: string | null,
  userId: string,
  method: CheckInMethod,
  result: ScanResult,
) {
  await prisma.scanLog.create({ data: { eventId, ticketId, scannedById: userId, method, result } })
}

async function checkInTicket(
  userId: string,
  eventId: string,
  code: string | null,
  method: CheckInMethod,
): Promise<ScanOutcome> {
  const invalid = async (message: string): Promise<ScanOutcome> => {
    await logScan(eventId, null, userId, method, 'INVALID')
    return { result: 'INVALID', message, attendee: null, checkedInAt: null, previousMethod: null }
  }
  if (!code) return invalid('This is not a valid NOVR Events ticket.')

  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: { registration: true, ticketType: true, checkIn: true },
  })
  if (!ticket) return invalid('No ticket with this code exists.')

  const attendee = {
    registrationId: ticket.registrationId,
    name: ticket.registration.attendeeName,
    ticketType: ticket.ticketType.name,
    ticketCode: ticket.code,
  }
  if (ticket.eventId !== eventId) {
    // Genuine ticket, wrong door. The attendee's details for the other event are not disclosed.
    await logScan(eventId, null, userId, method, 'WRONG_EVENT')
    return {
      result: 'WRONG_EVENT',
      message: 'This ticket is for a different event.',
      attendee: null,
      checkedInAt: null,
      previousMethod: null,
    }
  }
  if (ticket.checkIn) {
    await logScan(eventId, ticket.id, userId, method, 'DUPLICATE')
    return {
      result: 'DUPLICATE',
      message: 'This ticket has already been used.',
      attendee,
      checkedInAt: ticket.checkIn.checkedInAt,
      previousMethod: ticket.checkIn.method,
    }
  }
  if (ticket.status !== 'VALID' || ticket.registration.status !== 'CONFIRMED') {
    await logScan(eventId, ticket.id, userId, method, 'VOID')
    return {
      result: 'VOID',
      message: 'This ticket is no longer valid.',
      attendee,
      checkedInAt: null,
      previousMethod: null,
    }
  }

  try {
    // The unique constraint on check_ins.ticket_id makes this safe when two devices scan at once.
    const checkIn = await prisma.checkIn.create({
      data: { ticketId: ticket.id, eventId, method, checkedInById: userId },
    })
    await logScan(eventId, ticket.id, userId, method, 'ACCEPTED')
    return {
      result: 'ACCEPTED',
      message: 'Checked in.',
      attendee,
      checkedInAt: checkIn.checkedInAt,
      previousMethod: null,
    }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const existing = await prisma.checkIn.findUniqueOrThrow({ where: { ticketId: ticket.id } })
    await logScan(eventId, ticket.id, userId, method, 'DUPLICATE')
    return {
      result: 'DUPLICATE',
      message: 'This ticket has already been used.',
      attendee,
      checkedInAt: existing.checkedInAt,
      previousMethod: existing.method,
    }
  }
}

async function assertCheckInOpen(eventId: string, userId: string) {
  const { event } = await requireEventAccess(userId, eventId, 'checkin')
  if (event.status === 'DRAFT' || event.status === 'ARCHIVED') {
    throw badRequest('Check-in is only available for published events.', 'EVENT_NOT_LIVE')
  }
  return event
}

/** Validates a scanned QR payload. The signature is checked before the database is consulted. */
export async function scanTicket(
  userId: string,
  eventId: string,
  payload: string,
): Promise<ScanOutcome> {
  await assertCheckInOpen(eventId, userId)
  return checkInTicket(userId, eventId, verifyTicketQr(payload), 'QR')
}

/** Manual check-in by registration (after looking the attendee up) or by a typed ticket code. */
export async function manualCheckIn(
  userId: string,
  eventId: string,
  input: { registrationId?: string; ticketCode?: string },
): Promise<ScanOutcome> {
  await assertCheckInOpen(eventId, userId)
  if (input.registrationId) {
    const registration = await prisma.registration.findFirst({
      where: { id: input.registrationId, eventId },
      include: { ticket: true },
    })
    if (!registration) throw notFound('Registration')
    if (!registration.ticket) {
      return {
        result: 'VOID',
        message: 'This registration has no ticket (it is pending, declined or cancelled).',
        attendee: null,
        checkedInAt: null,
        previousMethod: null,
      }
    }
    return checkInTicket(userId, eventId, registration.ticket.code, 'MANUAL')
  }
  return checkInTicket(
    userId,
    eventId,
    input.ticketCode ? normaliseTicketCode(input.ticketCode) : null,
    'MANUAL',
  )
}

/** Undo a check-in made by mistake. Reserved for managers. */
export async function undoCheckIn(
  userId: string,
  eventId: string,
  registrationId: string,
): Promise<void> {
  await requireEventAccess(userId, eventId, 'manage')
  const ticket = await prisma.ticket.findFirst({ where: { registrationId, eventId } })
  if (!ticket) throw notFound('Ticket')
  const result = await prisma.checkIn.deleteMany({ where: { ticketId: ticket.id } })
  if (result.count === 0) throw notFound('Check-in')
}

/** Attendee lookup at the door: name, email or ticket code. */
export async function lookupAttendees(userId: string, eventId: string, q: string) {
  await requireEventAccess(userId, eventId, 'checkin')
  const contains = { contains: q, mode: 'insensitive' as const }
  const code = normaliseTicketCode(q)
  const rows = await prisma.registration.findMany({
    where: {
      eventId,
      OR: [
        { attendeeName: contains },
        { attendeeEmail: contains },
        { ticket: { code: code ?? contains } },
      ],
    },
    take: 20,
    orderBy: { attendeeName: 'asc' },
    include: { ticketType: true, ticket: { include: { checkIn: true } } },
  })
  return rows.map((row) => ({
    registrationId: row.id,
    name: row.attendeeName,
    email: row.attendeeEmail,
    status: row.status,
    ticketType: row.ticketType.name,
    ticketCode: row.ticket?.code ?? null,
    ticketStatus: row.ticket?.status ?? null,
    checkedInAt: row.ticket?.checkIn?.checkedInAt ?? null,
  }))
}

/**
 * Attendance figures:
 *  expected      confirmed registrations
 *  checkedIn     confirmed registrations with a check-in
 *  attendanceRate = checkedIn / expected
 *  noShows       expected − checkedIn, reported only once the event has ended
 */
export async function attendanceSummary(userId: string, eventId: string) {
  const { event } = await requireEventAccess(userId, eventId, 'checkin')
  const [expected, checkedIn, byType, perHour, scans, recent] = await Promise.all([
    prisma.registration.count({ where: { eventId, status: 'CONFIRMED' } }),
    prisma.checkIn.count({ where: { eventId, ticket: { registration: { status: 'CONFIRMED' } } } }),
    prisma.$queryRaw<Array<{ name: string; expected: bigint; checked_in: bigint }>>`
      SELECT tt.name,
             count(r.id) AS expected,
             count(c.id) AS checked_in
        FROM ticket_types tt
        LEFT JOIN registrations r ON r.ticket_type_id = tt.id AND r.status = 'CONFIRMED'
        LEFT JOIN tickets t ON t.registration_id = r.id
        LEFT JOIN check_ins c ON c.ticket_id = t.id
       WHERE tt.event_id = ${eventId}::uuid
       GROUP BY tt.id, tt.name, tt.sort_order
       ORDER BY tt.sort_order`,
    prisma.$queryRaw<Array<{ hour: Date; count: bigint }>>`
      SELECT date_trunc('hour', checked_in_at) AS hour, count(*) AS count
        FROM check_ins WHERE event_id = ${eventId}::uuid
       GROUP BY 1 ORDER BY 1`,
    prisma.scanLog.groupBy({ by: ['result'], where: { eventId }, _count: { _all: true } }),
    prisma.checkIn.findMany({
      where: { eventId },
      orderBy: { checkedInAt: 'desc' },
      take: 10,
      include: {
        ticket: {
          include: {
            registration: { select: { id: true, attendeeName: true } },
            ticketType: { select: { name: true } },
          },
        },
      },
    }),
  ])
  const ended = event.endsAt <= new Date()
  return {
    expected,
    checkedIn,
    remaining: Math.max(0, expected - checkedIn),
    attendanceRate: expected > 0 ? checkedIn / expected : null,
    noShows: ended ? Math.max(0, expected - checkedIn) : null,
    noShowRate: ended && expected > 0 ? (expected - checkedIn) / expected : null,
    eventEnded: ended,
    byTicketType: byType.map((row) => ({
      name: row.name,
      expected: Number(row.expected),
      checkedIn: Number(row.checked_in),
    })),
    perHour: perHour.map((row) => ({ hour: row.hour, count: Number(row.count) })),
    scans: Object.fromEntries(scans.map((row) => [row.result, row._count._all])) as Partial<
      Record<ScanResult, number>
    >,
    recent: recent.map((row) => ({
      registrationId: row.ticket.registration.id,
      name: row.ticket.registration.attendeeName,
      ticketType: row.ticket.ticketType.name,
      method: row.method,
      checkedInAt: row.checkedInAt,
    })),
  }
}
