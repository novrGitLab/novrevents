import { toCsv } from '../../lib/csv.js'
import { formatEventRange } from '../../lib/datetime.js'
import { LOCKING_TX, prisma, type Prisma } from '../../lib/db.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import type { RegistrationStatus } from '../../generated/prisma/client.js'
import { requireEventAccess } from '../events/event-access.js'
import { eventLocationText } from '../events/event.dto.js'
import { registrationIdFromToken, manageUrlFor } from '../tickets/ticket-credential.js'
import { lockEvent, registrationInclude, toRegistration } from './registration.service.js'

// ─── Organiser views ─────────────────────────────────────────────────────────

export interface AttendeeQuery {
  page: number
  pageSize: number
  status?: RegistrationStatus
  q?: string
  checkedIn?: 'yes' | 'no'
  ticketTypeId?: string
  sort: 'newest' | 'oldest' | 'name'
}

function attendeeWhere(
  eventId: string,
  query: Omit<AttendeeQuery, 'page' | 'pageSize' | 'sort'>,
): Prisma.RegistrationWhereInput {
  const filters: Prisma.RegistrationWhereInput[] = [{ eventId }]
  if (query.status) filters.push({ status: query.status })
  if (query.ticketTypeId) filters.push({ ticketTypeId: query.ticketTypeId })
  if (query.checkedIn === 'yes') filters.push({ ticket: { checkIn: { isNot: null } } })
  if (query.checkedIn === 'no')
    filters.push({ OR: [{ ticket: null }, { ticket: { checkIn: null } }] })
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' as const }
    filters.push({
      OR: [{ attendeeName: contains }, { attendeeEmail: contains }, { ticket: { code: contains } }],
    })
  }
  return { AND: filters }
}

const ATTENDEE_ORDER: Record<AttendeeQuery['sort'], Prisma.RegistrationOrderByWithRelationInput[]> =
  {
    newest: [{ createdAt: 'desc' }],
    oldest: [{ createdAt: 'asc' }],
    name: [{ attendeeName: 'asc' }],
  }

/** Attendee list. Check-in staff can see it too, because they need it to look people up at the door. */
export async function listAttendees(userId: string, eventId: string, query: AttendeeQuery) {
  await requireEventAccess(userId, eventId, 'checkin')
  const where = attendeeWhere(eventId, query)
  const [rows, total] = await Promise.all([
    prisma.registration.findMany({
      where,
      orderBy: ATTENDEE_ORDER[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: registrationInclude,
    }),
    prisma.registration.count({ where }),
  ])
  return { items: rows.map(toRegistration), total }
}

export async function exportAttendeesCsv(
  userId: string,
  eventId: string,
  query: Omit<AttendeeQuery, 'page' | 'pageSize'>,
) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  const rows = await prisma.registration.findMany({
    where: attendeeWhere(eventId, query),
    orderBy: ATTENDEE_ORDER[query.sort],
    take: 50_000,
    include: { ...registrationInclude, ticket: { include: { checkIn: true } } },
  })
  const csv = toCsv(
    [
      'Registration ID',
      'Name',
      'Email',
      'Status',
      'Ticket type',
      'Ticket code',
      'Registered at (UTC)',
      'Checked in at (UTC)',
      'Check-in method',
      'Guest',
    ],
    rows.map((row) => [
      row.id,
      row.attendeeName,
      row.attendeeEmail,
      row.status,
      row.ticketType.name,
      row.ticket?.code ?? '',
      row.createdAt,
      row.ticket?.checkIn?.checkedInAt ?? '',
      row.ticket?.checkIn?.method ?? '',
      row.userId === null ? 'yes' : 'no',
    ]),
  )
  return { csv, filename: `${event.slug}-attendees.csv`, count: rows.length }
}

/** Finds the registration and checks that it belongs to the event the caller manages. */
export async function requireRegistrationOfEvent(
  userId: string,
  eventId: string,
  registrationId: string,
  capability: 'manage' | 'admin' = 'manage',
) {
  await requireEventAccess(userId, eventId, capability)
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, eventId },
    select: { id: true },
  })
  if (!registration) throw notFound('Registration')
  return registration
}

export async function getAttendee(userId: string, eventId: string, registrationId: string) {
  await requireEventAccess(userId, eventId, 'checkin')
  const row = await prisma.registration.findFirst({
    where: { id: registrationId, eventId },
    include: registrationInclude,
  })
  if (!row) throw notFound('Registration')
  return toRegistration(row)
}

// ─── Ticket types ────────────────────────────────────────────────────────────

export async function listTicketTypes(userId: string, eventId: string) {
  await requireEventAccess(userId, eventId, 'checkin')
  return prisma.ticketType.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createTicketType(
  userId: string,
  eventId: string,
  input: { name: string; description: string | null; capacity: number | null; priceKobo?:number },
) {
  await requireEventAccess(userId, eventId, 'manage')
  const last = await prisma.ticketType.aggregate({ where: { eventId }, _max: { sortOrder: true } })
  return prisma.ticketType.create({
    data: {
      eventId,
      priceKobo: input.priceKobo ?? 0,
      name: input.name,
      description: input.description,
      capacity: input.capacity,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  })
}

export async function updateTicketType(
  userId: string,
  eventId: string,
  ticketTypeId: string,
  patch: {
    name?: string
    description?: string | null
    capacity?: number | null
    isActive?: boolean
    priceKobo?: number
    sortOrder?: number
  },
) {
  await requireEventAccess(userId, eventId, 'manage')
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId)
    await tx.$queryRaw`SELECT id FROM ticket_types WHERE id = ${ticketTypeId}::uuid FOR UPDATE`
    const type = await tx.ticketType.findFirst({ where: { id: ticketTypeId, eventId } })
    if (!type) throw notFound('Ticket type')
    if (patch.capacity != null && patch.capacity < type.registeredCount) {
      throw badRequest(
        `Capacity cannot be lower than the ${type.registeredCount} places already taken.`,
        'CAPACITY_BELOW_REGISTERED',
      )
    }
    if (patch.isActive === false) {
      const active = await tx.ticketType.count({
        where: { eventId, isActive: true, id: { not: ticketTypeId } },
      })
      if (active === 0)
        throw conflict('An event needs at least one active ticket type.', 'LAST_TICKET_TYPE')
    }
    return tx.ticketType.update({ where: { id: ticketTypeId }, data: patch })
  }, LOCKING_TX)
}

export async function deleteTicketType(
  userId: string,
  eventId: string,
  ticketTypeId: string,
): Promise<void> {
  await requireEventAccess(userId, eventId, 'manage')
  const type = await prisma.ticketType.findFirst({
    where: { id: ticketTypeId, eventId },
    include: { _count: { select: { registrations: true } } },
  })
  if (!type) throw notFound('Ticket type')
  if (type._count.registrations > 0)
    throw conflict(
      'This ticket type has registrations. Deactivate it instead.',
      'HAS_REGISTRATIONS',
    )
  const remaining = await prisma.ticketType.count({ where: { eventId, id: { not: ticketTypeId } } })
  if (remaining === 0)
    throw conflict('An event needs at least one ticket type.', 'LAST_TICKET_TYPE')
  await prisma.ticketType.delete({ where: { id: ticketTypeId } })
}

// ─── Attendee self-service ───────────────────────────────────────────────────

const selfServiceInclude = {
  ...registrationInclude,
  event: {
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      mode: true,
      venueName: true,
      address: true,
      city: true,
      region: true,
      country: true,
      onlineUrl: true,
      organizerName: true,
      organizerEmail: true,
      organizerEmailPublic: true,
      status: true,
      bannerKey: true,
      accentColor: true,
    },
  },
  certificate: { select: { verificationCode: true, revokedAt: true } },
} satisfies Prisma.RegistrationInclude

type SelfServiceRow = Prisma.RegistrationGetPayload<{ include: typeof selfServiceInclude }>

function toSelfService(row: SelfServiceRow) {
  const event = row.event
  const confirmed = row.status === 'CONFIRMED'
  return {
    ...toRegistration(row),
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      whenText: formatEventRange(event.startsAt, event.endsAt, event.timezone),
      whereText: eventLocationText(event),
      mode: event.mode,
      status: event.status,
      organizerName: event.organizerName,
      // Shown to attendees only when the organiser designated it public contact information.
      organizerEmail: event.organizerEmailPublic ? event.organizerEmail : null,
      bannerUrl: publicFileUrl(event.bannerKey),
      accentColor: event.accentColor,
      // The join link only reaches attendees whose registration is confirmed.
      onlineUrl: confirmed ? event.onlineUrl : null,
    },
    canCancel:
      (row.status === 'PENDING' || confirmed) &&
      !row.ticket?.checkIn &&
      event.endsAt > new Date() &&
      event.status !== 'CANCELLED',
    certificateCode:
      row.certificate && !row.certificate.revokedAt ? row.certificate.verificationCode : null,
    testPayment: !!row.amountKobo && row.paymentMode === 'test', amountKobo:row.amountKobo, paymentDueAt:row.paymentDueAt,
    manageUrl: manageUrlFor(row),
  }
}

export async function listMyRegistrations(
  userId: string,
  scope: 'upcoming' | 'past' | 'all',
  page: number,
  pageSize: number,
) {
  const now = new Date()
  const where: Prisma.RegistrationWhereInput = {
    userId,
    ...(scope === 'upcoming'
      ? { event: { endsAt: { gt: now } } }
      : scope === 'past'
        ? { event: { endsAt: { lte: now } } }
        : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.registration.findMany({
      where,
      orderBy: { event: { startsAt: scope === 'past' ? 'desc' : 'asc' } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: selfServiceInclude,
    }),
    prisma.registration.count({ where }),
  ])
  return { items: rows.map(toSelfService), total }
}

export async function getMyRegistration(userId: string, registrationId: string) {
  const row = await prisma.registration.findFirst({
    where: { id: registrationId, userId },
    include: selfServiceInclude,
  })
  if (!row) throw notFound('Registration')
  return toSelfService(row)
}

export async function registrationIdForToken(token: string): Promise<string> {
  const id = await registrationIdFromToken(token)
  if (!id) throw notFound('Registration')
  return id
}

export async function getRegistrationByToken(token: string) {
  const id = await registrationIdForToken(token)
  return toSelfService(
    await prisma.registration.findUniqueOrThrow({ where: { id }, include: selfServiceInclude }),
  )
}
