import { presentGuestInformation } from './guest-information.js'
import type { z } from 'zod'
import { appUrl } from '../../config/env.js'
import { audit } from '../../lib/audit.js'
import { clientKey, safeEqual } from '../../lib/crypto.js'
import { buildCalendar } from '../../lib/ics.js'
import { isUniqueViolation, prisma, type Prisma } from '../../lib/db.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import { getSettings } from '../admin/settings.service.js'
import { findVisibleProfile } from '../profiles/profile.service.js'
import { categoryGroup, CYBERSECURITY_CATEGORY_SLUGS } from './categories.js'
import { resolveEventRole, roleCan } from './event-access.js'
import { effectiveStatus, eventCardInclude, toEventSummary } from './event.dto.js'
import type { discoveryQuery } from './event.schemas.js'

type DiscoveryQuery = z.infer<typeof discoveryQuery>

/**
 * The conditions every publicly listed event must meet. Anything shown in the directory, on a
 * profile, on an organiser page or in a feed goes through this filter.
 */
export function publiclyListed(): Prisma.EventWhereInput {
  return {
    visibility: 'PUBLIC',
    moderationStatus: { not: 'REMOVED' },
    status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
    owner: { status: 'ACTIVE' },
    OR: [{ organizationId: null }, { organization: { status: 'ACTIVE' } }],
  }
}

const SORT: Record<DiscoveryQuery['sort'], Prisma.EventOrderByWithRelationInput[]> = {
  soonest: [{ startsAt: 'asc' }, { id: 'asc' }],
  latest: [{ startsAt: 'desc' }, { id: 'asc' }],
  newest: [{ publishedAt: 'desc' }, { id: 'asc' }],
  popular: [{ registeredCount: 'desc' }, { startsAt: 'asc' }, { id: 'asc' }],
}

function contains(value: string) {
  return { contains: value, mode: 'insensitive' as const }
}

export function buildDiscoveryWhere(query: DiscoveryQuery, now: Date): Prisma.EventWhereInput {
  const filters: Prisma.EventWhereInput[] = [publiclyListed()]

  if (query.timeframe === 'upcoming') filters.push({ endsAt: { gt: now } })
  if (query.timeframe === 'past') filters.push({ endsAt: { lte: now } })
  if (query.from) filters.push({ endsAt: { gte: new Date(`${query.from}T00:00:00.000Z`) } })
  if (query.to) filters.push({ startsAt: { lte: new Date(`${query.to}T23:59:59.999Z`) } })

  if (query.q) {
    filters.push({
      OR: [
        { title: contains(query.q) },
        { summary: contains(query.q) },
        { organizerName: contains(query.q) },
        { city: contains(query.q) },
        { venueName: contains(query.q) },
      ],
    })
  }
  if (query.location) {
    filters.push({
      OR: [
        { city: contains(query.location) },
        { region: contains(query.location) },
        { country: contains(query.location) },
        { venueName: contains(query.location) },
      ],
    })
  }
  if (query.category) filters.push({ category: { slug: query.category } })
  // Part of the same WHERE as everything else, so totals and pages reflect the mode.
  if (query.scope === 'cybersecurity') {
    filters.push({ category: { slug: { in: [...CYBERSECURITY_CATEGORY_SLUGS] } } })
  } else if (query.scope === 'general') {
    filters.push({
      OR: [
        { categoryId: null },
        { category: { slug: { notIn: [...CYBERSECURITY_CATEGORY_SLUGS] } } },
      ],
    })
  }
  if (query.type) filters.push({ eventType: query.type })
  if (query.mode) filters.push({ mode: query.mode })
  if (query.price) {
    const paid: Prisma.EventWhereInput = {
      OR: [{ isPaid: true }, { ticketTypes: { some: { isActive: true, priceKobo: { gt: 0 } } } }],
    }
    filters.push(query.price === 'paid' ? paid : { NOT: paid })
  }
  if (query.organizer) {
    filters.push({ owner: { profile: { username: query.organizer, visibility: 'PUBLIC' } } })
  }
  if (query.organization) filters.push({ organization: { slug: query.organization } })

  if (query.registration === 'open') {
    filters.push(
      { endsAt: { gt: now } },
      { OR: [{ registrationDeadline: null }, { registrationDeadline: { gt: now } }] },
      { OR: [{ capacity: null }, { registeredCount: { lt: prisma.event.fields.capacity } }] },
      {
        registrationForm: {
          status: 'PUBLISHED',
          AND: [
            { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
            {
              OR: [
                { responseLimit: null },
                { qualifyingCount: { lt: prisma.form.fields.responseLimit } },
              ],
            },
          ],
        },
      },
    )
  }
  return { AND: filters }
}

export async function searchEvents(query: DiscoveryQuery) {
  const now = new Date()
  const where = buildDiscoveryWhere(query, now)
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: SORT[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: eventCardInclude,
    }),
    prisma.event.count({ where }),
  ])
  return { items: events.map((event) => toEventSummary(event, now)), total }
}

export async function listCategories() {
  const categories = await prisma.eventCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, description: true },
  })
  return categories.map((category) => ({ ...category, group: categoryGroup(category.slug) }))
}

// ─── Event page ──────────────────────────────────────────────────────────────

/**
 * Loads an event for its public page and decides whether this viewer may see it:
 *  - the event team always can (this is also how drafts are previewed)
 *  - removed, draft and archived events are hidden from everyone else
 *  - PRIVATE events need the share key, or an existing registration
 */
export async function findViewableEvent(
  slug: string,
  viewerId: string | null,
  key: string | undefined,
) {
  const event = await prisma.event.findUnique({ where: { slug }, include: eventCardInclude })
  if (!event) throw notFound('Event')

  const role = viewerId ? await resolveEventRole(viewerId, event) : null
  const registration = viewerId
    ? await prisma.registration.findFirst({
        where: { eventId: event.id, userId: viewerId },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      })
    : null

  if (!role) {
    const hidden =
      event.status === 'DRAFT' ||
      event.status === 'ARCHIVED' ||
      event.moderationStatus === 'REMOVED' ||
      event.owner.status !== 'ACTIVE' ||
      (event.organization !== null && event.organization.status !== 'ACTIVE')
    if (hidden) throw notFound('Event')
    if (event.visibility === 'PRIVATE') {
      const hasKey = typeof key === 'string' && safeEqual(key, event.accessKey)
      if (!hasKey && !registration) throw notFound('Event')
    }
  }
  return { event, role, registration }
}

export async function getEventPage(slug: string, viewerId: string | null, key: string | undefined) {
  const now = new Date()
  const { event, role, registration } = await findViewableEvent(slug, viewerId, key)
  const [speakers, sessions, ticketTypes, saved] = await Promise.all([
    prisma.eventSpeaker.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.eventSession.findMany({
      where: { eventId: event.id },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      include: { speakers: { select: { speakerId: true } } },
    }),
    prisma.ticketType.findMany({
      where: { eventId: event.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    viewerId
      ? prisma.savedEvent
          .count({ where: { userId: viewerId, eventId: event.id } })
          .then((count) => count > 0)
      : Promise.resolve(false),
  ])

  // The join link is disclosed only to confirmed attendees and the event team.
  const seesOnlineUrl = role !== null || registration?.status === 'CONFIRMED'

  return {
    ...toEventSummary(event, now),
    guestInfo: presentGuestInformation(event.guestInfo, event.mode),
    description: event.description,
    address: event.address,
    visibility: event.visibility,
    // Organiser email is shown publicly only when it was designated as public contact information.
    organizerEmail: event.organizerEmailPublic ? event.organizerEmail : null,
    organizerWebsite: event.organizerWebsite,
    registrationDeadline: event.registrationDeadline,
    capacity: event.capacity,
    cancellationReason: event.status === 'CANCELLED' ? event.cancellationReason : null,
    speakers: speakers.map((speaker) => ({
      ...speaker,
      photoUrl: publicFileUrl(speaker.photoKey),
    })),
    sessions: sessions.map((session) => ({
      ...session,
      speakerIds: session.speakers.map((link) => link.speakerId),
    })),
    ticketTypes: ticketTypes.map((type) => ({
      priceKobo: type.priceKobo,
      id: type.id,
      name: type.name,
      description: type.description,
      available: type.capacity === null || type.registeredCount < type.capacity,
    })),
    viewer: {
      isSaved: saved,
      registrationStatus: registration?.status ?? null,
      canManage: roleCan(role, 'manage'),
      onlineUrl: seesOnlineUrl ? event.onlineUrl : null,
    },
  }
}

const VIEW_DEDUPE_MS = 30 * 60 * 1000

/**
 * Counts one page view. The visitor key is a salted hash of IP + user agent that rotates daily, so
 * visitors cannot be tracked across days or identified. Repeat views within 30 minutes and views
 * by the event's own team are not counted.
 */
/**
 * Calendar file for an event. Visibility is the same as the event page: a hidden event, or a private event
 * without its key, gives not found. Only public fields are included (see lib/ics.ts).
 */
export async function eventCalendarFile(
  slug: string,
  viewerId: string | null,
  key: string | undefined,
) {
  const { event } = await findViewableEvent(slug, viewerId, key)
  const location =
    event.mode === 'VIRTUAL'
      ? 'Online'
      : [event.venueName, event.address, event.city, event.country].filter(Boolean).join(', ') ||
        'Location to be announced'
  const description = [
    event.summary,
    `Times are shown in ${event.timezone}.`,
    event.description.trim(),
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
  const body = buildCalendar({
    uid: `${event.id}@novr-events`,
    stamp: new Date(),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    summary: event.title,
    description,
    location,
    url: `${appUrl}/events/${event.slug}`,
    cancelled: event.status === 'CANCELLED',
  })
  return { filename: `${event.slug.replace(/[^a-z0-9-]/gi, '')}.ics`, body }
}

export async function recordEventView(
  slug: string,
  viewer: { userId: string | null; ip: string; userAgent: string; referrer?: string; key?: string },
): Promise<boolean> {
  const now = new Date()
  const { event, role } = await findViewableEvent(slug, viewer.userId, viewer.key)
  const status = effectiveStatus(event, now)
  if (role || status === 'DRAFT' || status === 'ARCHIVED') return false

  const visitorKey = clientKey(`${viewer.ip}|${viewer.userAgent}`, now.toISOString().slice(0, 10))
  const recent = await prisma.analyticsEvent.count({
    where: {
      eventId: event.id,
      type: 'EVENT_VIEW',
      visitorKey,
      occurredAt: { gt: new Date(now.getTime() - VIEW_DEDUPE_MS) },
    },
  })
  if (recent > 0) return false

  let referrerHost: string | null = null
  if (viewer.referrer) {
    try {
      referrerHost = new URL(viewer.referrer).hostname.slice(0, 120) || null
    } catch {
      referrerHost = null
    }
  }
  await prisma.analyticsEvent.create({
    data: { type: 'EVENT_VIEW', eventId: event.id, visitorKey, referrerHost },
  })
  return true
}

// ─── Abuse reports ───────────────────────────────────────────────────────────

export async function reportEvent(
  slug: string,
  reporter: { userId: string | null; ip: string; key?: string },
  input: {
    reason: 'SPAM' | 'SCAM' | 'MISLEADING' | 'INAPPROPRIATE' | 'MALICIOUS' | 'OTHER'
    details: string | null
    email: string | null
  },
): Promise<void> {
  const { event, role } = await findViewableEvent(slug, reporter.userId, reporter.key)
  if (role)
    throw badRequest('You cannot report an event you help organise.', 'CANNOT_REPORT_OWN_EVENT')

  // One report per account (or per network address for anonymous visitors) per event.
  const reporterKey = reporter.userId ? `user:${reporter.userId}` : `ip:${clientKey(reporter.ip)}`
  try {
    await prisma.eventReport.create({
      data: {
        eventId: event.id,
        reporterId: reporter.userId,
        reporterEmail: input.email,
        reporterKey,
        reason: input.reason,
        details: input.details,
      },
    })
  } catch (error) {
    if (isUniqueViolation(error))
      throw conflict('You have already reported this event.', 'ALREADY_REPORTED')
    throw error
  }

  // Enough independent reports put the event in the moderators' review queue.
  const settings = await getSettings()
  const open = await prisma.eventReport.count({ where: { eventId: event.id, status: 'OPEN' } })
  if (open >= settings.reportFlagThreshold && event.moderationStatus === 'CLEAR') {
    await prisma.event.update({ where: { id: event.id }, data: { moderationStatus: 'FLAGGED' } })
    await audit(null, {
      action: 'event.auto_flagged',
      targetType: 'event',
      targetId: event.id,
      eventId: event.id,
      metadata: { openReports: open, threshold: settings.reportFlagThreshold },
    })
  }
}

// ─── Saved events ────────────────────────────────────────────────────────────

export async function saveEvent(
  userId: string,
  slug: string,
  key: string | undefined,
): Promise<void> {
  const { event } = await findViewableEvent(slug, userId, key)
  await prisma.savedEvent.upsert({
    where: { userId_eventId: { userId, eventId: event.id } },
    create: { userId, eventId: event.id },
    update: {},
  })
}

export async function unsaveEvent(userId: string, slug: string): Promise<void> {
  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true } })
  if (event) await prisma.savedEvent.deleteMany({ where: { userId, eventId: event.id } })
}

export async function listSavedEvents(userId: string, page: number, pageSize: number) {
  const now = new Date()
  // A saved event that was later hidden (removed, unpublished) simply drops out of the list.
  const where: Prisma.SavedEventWhereInput = {
    userId,
    event: {
      moderationStatus: { not: 'REMOVED' },
      status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED'] },
      owner: { status: 'ACTIVE' },
    },
  }
  const [rows, total] = await Promise.all([
    prisma.savedEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { event: { include: eventCardInclude } },
    }),
    prisma.savedEvent.count({ where }),
  ])
  return { items: rows.map((row) => toEventSummary(row.event, now)), total }
}

// ─── Profile and feed listings ───────────────────────────────────────────────

/** Public events organised by a user, newest first. */
export async function listEventsByProfile(
  username: string,
  viewerId: string | null,
  page: number,
  pageSize: number,
) {
  const now = new Date()
  const { profile } = await findVisibleProfile(username, viewerId)
  const where: Prisma.EventWhereInput = { AND: [publiclyListed(), { ownerId: profile.userId }] }
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ startsAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: eventCardInclude,
    }),
    prisma.event.count({ where }),
  ])
  return { items: events.map((event) => toEventSummary(event, now)), total }
}

/**
 * Events a user is registered for, as shown on their profile.
 *
 * Privacy rules (all must hold, otherwise nothing is returned and `visible` is false):
 *  - the profile owner switched "share registrations" on (it is off by default)
 *  - the viewer is the owner or follows the owner
 * And even then only CONFIRMED registrations for publicly listed events are included, so private
 * or unlisted events, pending or declined registrations, and other form submissions (speaker,
 * volunteer or sponsorship applications) are never exposed.
 */
export async function listSharedRegistrations(
  username: string,
  viewerId: string | null,
  page: number,
  pageSize: number,
) {
  const now = new Date()
  const { profile, isSelf } = await findVisibleProfile(username, viewerId)
  const follows =
    viewerId && !isSelf
      ? (await prisma.follow.count({
          where: { followerId: viewerId, followingId: profile.userId },
        })) > 0
      : false
  const visible = isSelf ? profile.shareRegistrations : profile.shareRegistrations && follows
  if (!visible) return { visible: false, items: [], total: 0 }

  const where: Prisma.EventWhereInput = {
    AND: [
      publiclyListed(),
      { registrations: { some: { userId: profile.userId, status: 'CONFIRMED' } } },
    ],
  }
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ startsAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: eventCardInclude,
    }),
    prisma.event.count({ where }),
  ])
  return { visible: true, items: events.map((event) => toEventSummary(event, now)), total }
}

/** Public events published by the people the user follows, most recently published first. */
export async function followedEventsFeed(userId: string, page: number, pageSize: number) {
  const now = new Date()
  // Events by people the viewer follows, and events published by organisations the viewer follows. The
  // public-listing filter applies to both, so private, unlisted, draft, cancelled and removed events never appear.
  const where: Prisma.EventWhereInput = {
    AND: [
      publiclyListed(),
      {
        OR: [
          { owner: { followers: { some: { followerId: userId } } } },
          { organization: { followers: { some: { followerId: userId } } } },
        ],
      },
    ],
  }
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: eventCardInclude,
    }),
    prisma.event.count({ where }),
  ])
  return { items: events.map((event) => toEventSummary(event, now)), total }
}
