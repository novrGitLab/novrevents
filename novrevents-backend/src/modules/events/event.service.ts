import type { z } from 'zod'
import { appUrl } from '../../config/env.js'
import { randomToken } from '../../lib/crypto.js'
import { isUniqueViolation, prisma, type Prisma, type Tx } from '../../lib/db.js'
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  unprocessable,
  type ErrorDetail,
} from '../../lib/errors.js'
import { slugWithSuffix } from '../../lib/slug.js'
import { deleteStoredFiles, publicFileUrl } from '../../lib/storage/index.js'
import { storeImage } from '../../lib/uploads.js'
import type { Event } from '../../generated/prisma/client.js'
import { getSettings } from '../admin/settings.service.js'
import { notifyFollowers } from '../notifications/notifications.service.js'
import { requireOrgRole } from '../organizations/org-access.js'
import { requireEventAccess, type EventRole } from './event-access.js'
import {
  effectiveStatus,
  eventCardInclude,
  eventUrl,
  registrationState,
  type EventWithCard,
} from './event.dto.js'
import type { createEventBody, updateEventBody } from './event.schemas.js'

type CreateInput = z.infer<typeof createEventBody>
type UpdateInput = z.infer<typeof updateEventBody>

/**
 * Hooks let later modules (communications, registrations) react to lifecycle changes inside the
 * same transaction without this module importing them.
 */
type LifecycleHook = (tx: Tx, event: Event) => Promise<void>
const hooks: Record<'published' | 'rescheduled' | 'unpublished' | 'cancelled', LifecycleHook[]> = {
  published: [],
  rescheduled: [],
  unpublished: [],
  cancelled: [],
}

export function onEventLifecycle(stage: keyof typeof hooks, hook: LifecycleHook): void {
  hooks[stage].push(hook)
}

async function runHooks(stage: keyof typeof hooks, tx: Tx, event: Event): Promise<void> {
  for (const hook of hooks[stage]) await hook(tx, event)
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export async function toManagedEvent(event: EventWithCard, role: EventRole) {
  const [byStatus, checkedIn, forms] = await Promise.all([
    prisma.registration.groupBy({
      by: ['status'],
      where: { eventId: event.id },
      _count: { _all: true },
    }),
    prisma.checkIn.count({ where: { eventId: event.id } }),
    prisma.form.count({ where: { eventId: event.id } }),
  ])
  const countOf = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0
  return {
    ...event,
    bannerUrl: publicFileUrl(event.bannerKey),
    logoUrl: publicFileUrl(event.logoKey),
    effectiveStatus: effectiveStatus(event),
    organization: event.organization
      ? { id: event.organization.id, slug: event.organization.slug, name: event.organization.name }
      : null,
    registration: registrationState(event),
    // Check-in staff do not need the private share link.
    privateLink: role === 'STAFF' ? null : `${eventUrl(event.slug)}?key=${event.accessKey}`,
    publicUrl: eventUrl(event.slug),
    role,
    counts: { confirmed: countOf('CONFIRMED'), pending: countOf('PENDING'), checkedIn, forms },
  }
}

async function loadCard(eventId: string): Promise<EventWithCard> {
  return prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: eventCardInclude })
}

// ─── Validation ──────────────────────────────────────────────────────────────

function assertChronology(startsAt: Date, endsAt: Date, registrationDeadline: Date | null): void {
  const details: ErrorDetail[] = []
  if (endsAt <= startsAt)
    details.push({ path: 'body.endsAt', message: 'The end must be after the start.' })
  if (registrationDeadline && registrationDeadline > endsAt) {
    details.push({
      path: 'body.registrationDeadline',
      message: 'The registration deadline must be before the event ends.',
    })
  }
  if (details.length > 0)
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details)
}

async function assertCategory(categoryId: string | null | undefined): Promise<void> {
  if (!categoryId) return
  const category = await prisma.eventCategory.findUnique({
    where: { id: categoryId },
    select: { isActive: true },
  })
  if (!category?.isActive) throw badRequest('Choose a valid category.', 'INVALID_CATEGORY')
}

async function assertCanUseOrganization(userId: string, organizationId: string): Promise<void> {
  await requireOrgRole(userId, organizationId, 'MEMBER')
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { status: true },
  })
  if (org.status !== 'ACTIVE')
    throw forbidden('This organization is suspended.', 'ORGANIZATION_SUSPENDED')
}

// ─── Create / update ─────────────────────────────────────────────────────────

export async function createEvent(userId: string, input: CreateInput) {
  assertChronology(input.startsAt, input.endsAt, input.registrationDeadline ?? null)
  await assertCategory(input.categoryId)
  if (input.organizationId) await assertCanUseOrganization(userId, input.organizationId)

  const [profile, organization] = await Promise.all([
    prisma.profile.findUniqueOrThrow({ where: { userId }, select: { displayName: true } }),
    input.organizationId
      ? prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { name: true },
        })
      : null,
  ])

  const data: Prisma.EventUncheckedCreateInput = {
    slug: '',
    ownerId: userId,
    organizationId: input.organizationId ?? null,
    title: input.title,
    summary: input.summary ?? null,
    description: input.description ?? '',
    categoryId: input.categoryId ?? null,
    eventType: input.eventType ?? 'CONFERENCE',
    mode: input.mode ?? 'IN_PERSON',
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    venueName: input.venueName ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    country: input.country ?? null,
    onlineUrl: input.onlineUrl ?? null,
    accentColor: input.accentColor ?? null,
    organizerName: input.organizerName ?? organization?.name ?? profile.displayName,
    organizerEmail: input.organizerEmail ?? null,
    organizerEmailPublic: input.organizerEmailPublic ?? false,
    organizerWebsite: input.organizerWebsite ?? null,
    capacity: input.capacity ?? null,
    registrationDeadline: input.registrationDeadline ?? null,
    isPaid: input.isPaid ?? false,
    priceInfo: input.priceInfo ?? null,
    visibility: input.visibility ?? 'PUBLIC',
    accessKey: randomToken(18),
    ticketTypes: { create: { name: 'General Admission', sortOrder: 0 } },
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const event = await prisma.event.create({
        data: { ...data, slug: slugWithSuffix(input.title) },
        include: eventCardInclude,
      })
      return toManagedEvent(event, 'OWNER')
    } catch (error) {
      if (!isUniqueViolation(error, 'slug')) throw error
    }
  }
  throw conflict('Could not generate a unique address for this event. Try again.')
}

export async function updateEvent(userId: string, eventId: string, patch: UpdateInput) {
  const { event, role } = await requireEventAccess(userId, eventId, 'manage')
  if (event.status === 'ARCHIVED' || event.status === 'CANCELLED') {
    throw conflict('Archived and cancelled events cannot be edited.', 'EVENT_READ_ONLY')
  }

  const startsAt = patch.startsAt ?? event.startsAt
  const endsAt = patch.endsAt ?? event.endsAt
  const deadline =
    patch.registrationDeadline === undefined
      ? event.registrationDeadline
      : patch.registrationDeadline
  assertChronology(startsAt, endsAt, deadline)
  if (patch.categoryId !== undefined) await assertCategory(patch.categoryId)

  const capacity = patch.capacity === undefined ? event.capacity : patch.capacity
  if (capacity !== null && capacity < event.registeredCount) {
    throw badRequest(
      `Capacity cannot be lower than the ${event.registeredCount} places already taken.`,
      'CAPACITY_BELOW_REGISTERED',
    )
  }

  if (patch.organizationId !== undefined && patch.organizationId !== event.organizationId) {
    // Moving an event between workspaces changes who controls it.
    if (role !== 'OWNER' && role !== 'ORG_ADMIN')
      throw forbidden('Only the event owner can move it to another workspace.')
    if (patch.organizationId) await assertCanUseOrganization(userId, patch.organizationId)
  }

  const rescheduled =
    startsAt.getTime() !== event.startsAt.getTime() || endsAt.getTime() !== event.endsAt.getTime()

  await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: patch })
    if (rescheduled && (updated.status === 'PUBLISHED' || updated.status === 'ONGOING')) {
      await runHooks('rescheduled', tx, updated)
    }
  })
  return toManagedEvent(await loadCard(eventId), role)
}

export async function setEventImage(
  userId: string,
  eventId: string,
  kind: 'banner' | 'logo',
  image: Buffer,
) {
  const { event, role } = await requireEventAccess(userId, eventId, 'manage')
  const key = await storeImage(kind === 'banner' ? 'banners' : 'logos', image)
  await prisma.event.update({
    where: { id: eventId },
    data: kind === 'banner' ? { bannerKey: key } : { logoKey: key },
  })
  await deleteStoredFiles([kind === 'banner' ? event.bannerKey : event.logoKey])
  return toManagedEvent(await loadCard(eventId), role)
}

export async function removeEventImage(userId: string, eventId: string, kind: 'banner' | 'logo') {
  const { event, role } = await requireEventAccess(userId, eventId, 'manage')
  await prisma.event.update({
    where: { id: eventId },
    data: kind === 'banner' ? { bannerKey: null } : { logoKey: null },
  })
  await deleteStoredFiles([kind === 'banner' ? event.bannerKey : event.logoKey])
  return toManagedEvent(await loadCard(eventId), role)
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

function publishProblems(event: Event, now: Date): ErrorDetail[] {
  const problems: ErrorDetail[] = []
  if (event.description.trim().length < 20) {
    problems.push({ path: 'description', message: 'Add a description of at least 20 characters.' })
  }
  if (!event.categoryId) problems.push({ path: 'categoryId', message: 'Choose a category.' })
  if (event.mode !== 'VIRTUAL') {
    if (!event.city)
      problems.push({ path: 'city', message: 'Add the city for an in-person or hybrid event.' })
    if (!event.venueName && !event.address) {
      problems.push({ path: 'venueName', message: 'Add a venue name or address.' })
    }
  }
  if (event.endsAt <= now)
    problems.push({
      path: 'endsAt',
      message: 'The event has already ended. Update the dates first.',
    })
  if (event.isPaid && !event.priceInfo) {
    problems.push({ path: 'priceInfo', message: 'Add price information for a paid event.' })
  }
  return problems
}

/**
 * Publishing is where an event becomes visible to the public, so the abuse safeguards live here:
 * a verified email (enforced by the route), a complete listing, an active workspace, a daily cap
 * per account, and no republishing of events removed by moderators.
 */
export async function publishEvent(userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(userId, eventId, 'manage')
  if (event.status !== 'DRAFT')
    throw conflict('Only draft events can be published.', 'INVALID_STATUS')
  if (event.moderationStatus === 'REMOVED') {
    throw forbidden(
      'This event was removed by a moderator and cannot be published.',
      'EVENT_REMOVED',
    )
  }

  const now = new Date()
  const problems = publishProblems(event, now)
  if (problems.length > 0) {
    throw unprocessable(
      'Complete the event details before publishing.',
      'EVENT_INCOMPLETE',
      problems,
    )
  }
  if (event.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: event.organizationId },
      select: { status: true },
    })
    if (org?.status !== 'ACTIVE')
      throw forbidden('This organization is suspended.', 'ORGANIZATION_SUSPENDED')
  }

  const settings = await getSettings()
  const publishedToday = await prisma.event.count({
    where: {
      ownerId: event.ownerId,
      publishedAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
  })
  if (publishedToday >= settings.maxEventsPublishedPerDay) {
    throw new AppError(
      429,
      'PUBLISH_LIMIT',
      'You have reached the daily limit for publishing events. Try again tomorrow.',
    )
  }

  const firstPublication = event.publishedAt === null
  await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: 'PUBLISHED', publishedAt: now },
    })
    // Followers hear about public events once, the first time they go live.
    if (firstPublication && updated.visibility === 'PUBLIC') {
      await notifyFollowers(tx, updated.ownerId, {
        type: 'FOLLOWED_USER_EVENT',
        title: `${updated.organizerName} published a new event`,
        body: updated.title,
        linkPath: `/events/${updated.slug}`,
      })
    }
    await runHooks('published', tx, updated)
  })
  return toManagedEvent(await loadCard(eventId), role)
}

/** Back to draft. Not allowed once anyone has registered — cancel the event instead. */
export async function unpublishEvent(userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(userId, eventId, 'manage')
  if (event.status !== 'PUBLISHED')
    throw conflict(
      'Only published events that have not started can be unpublished.',
      'INVALID_STATUS',
    )
  const registrations = await prisma.registration.count({ where: { eventId } })
  if (registrations > 0) {
    throw conflict(
      'People have registered for this event. Cancel it instead so they are notified.',
      'HAS_REGISTRATIONS',
    )
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } })
    await runHooks('unpublished', tx, updated)
  })
  return toManagedEvent(await loadCard(eventId), role)
}

export async function cancelEvent(
  userId: string,
  eventId: string,
  input: { reason: string | null; notifyAttendees: boolean },
) {
  const { event, role } = await requireEventAccess(userId, eventId, 'admin')
  if (event.status !== 'PUBLISHED' && event.status !== 'ONGOING') {
    throw conflict('Only published or ongoing events can be cancelled.', 'INVALID_STATUS')
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: input.reason },
    })
    // Tickets for a cancelled event can no longer be used at the door.
    await tx.ticket.updateMany({
      where: { eventId, status: 'VALID' },
      data: { status: 'VOID', voidedAt: new Date() },
    })
    if (input.notifyAttendees) await runHooks('cancelled', tx, updated)
    else await runHooks('unpublished', tx, updated)
  })
  return toManagedEvent(await loadCard(eventId), role)
}

export async function archiveEvent(userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(userId, eventId, 'admin')
  const status = effectiveStatus(event)
  if (status === 'PUBLISHED' || status === 'ONGOING') {
    throw conflict(
      'Cancel the event or wait until it has ended before archiving it.',
      'INVALID_STATUS',
    )
  }
  if (status === 'ARCHIVED') throw conflict('This event is already archived.', 'INVALID_STATUS')
  await prisma.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } })
  return toManagedEvent(await loadCard(eventId), role)
}

/** Restores the status the event had before it was archived, derived from its history. */
export async function unarchiveEvent(userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(userId, eventId, 'admin')
  if (event.status !== 'ARCHIVED') throw conflict('This event is not archived.', 'INVALID_STATUS')
  const status = event.cancelledAt ? 'CANCELLED' : event.publishedAt ? 'COMPLETED' : 'DRAFT'
  await prisma.event.update({ where: { id: eventId }, data: { status } })
  return toManagedEvent(await loadCard(eventId), role)
}

/** Copies the listing, ticket types, speakers and agenda into a new draft owned by the caller. */
export async function duplicateEvent(userId: string, eventId: string) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  const [ticketTypes, speakers, sessions] = await Promise.all([
    prisma.ticketType.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } }),
    prisma.eventSpeaker.findMany({ where: { eventId }, orderBy: { sortOrder: 'asc' } }),
    prisma.eventSession.findMany({
      where: { eventId },
      include: { speakers: true },
      orderBy: { startsAt: 'asc' },
    }),
  ])
  const title = `${event.title} (copy)`.slice(0, 140)

  const copyId = await prisma.$transaction(async (tx) => {
    const copy = await tx.event.create({
      data: {
        slug: slugWithSuffix(title),
        ownerId: userId,
        organizationId: event.organizationId,
        title,
        summary: event.summary,
        description: event.description,
        categoryId: event.categoryId,
        eventType: event.eventType,
        mode: event.mode,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
        venueName: event.venueName,
        address: event.address,
        city: event.city,
        region: event.region,
        country: event.country,
        onlineUrl: event.onlineUrl,
        // Images are not copied: each event owns its files, so deleting one never breaks another.
        accentColor: event.accentColor,
        organizerName: event.organizerName,
        organizerEmail: event.organizerEmail,
        organizerEmailPublic: event.organizerEmailPublic,
        organizerWebsite: event.organizerWebsite,
        capacity: event.capacity,
        registrationDeadline: event.registrationDeadline,
        isPaid: event.isPaid,
        priceInfo: event.priceInfo,
        visibility: event.visibility,
        accessKey: randomToken(18),
        ticketTypes: {
          create: (ticketTypes.length > 0
            ? ticketTypes
            : [
                {
                  name: 'General Admission',
                  description: null,
                  capacity: null,
                  sortOrder: 0,
                  isActive: true,
                },
              ]
          ).map((type) => ({
            name: type.name,
            description: type.description,
            capacity: type.capacity,
            sortOrder: type.sortOrder,
            isActive: type.isActive,
          })),
        },
      },
      select: { id: true },
    })
    const speakerIds = new Map<string, string>()
    for (const speaker of speakers) {
      const created = await tx.eventSpeaker.create({
        data: {
          eventId: copy.id,
          name: speaker.name,
          title: speaker.title,
          organization: speaker.organization,
          bio: speaker.bio,
          sortOrder: speaker.sortOrder,
        },
        select: { id: true },
      })
      speakerIds.set(speaker.id, created.id)
    }
    for (const session of sessions) {
      await tx.eventSession.create({
        data: {
          eventId: copy.id,
          title: session.title,
          description: session.description,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          location: session.location,
          track: session.track,
          speakers: {
            create: session.speakers.flatMap((link) => {
              const speakerId = speakerIds.get(link.speakerId)
              return speakerId ? [{ speakerId }] : []
            }),
          },
        },
      })
    }
    return copy.id
  })
  return toManagedEvent(await loadCard(copyId), 'OWNER')
}

/** Only drafts with no registrations can be deleted; everything else is archived instead. */
export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  const { event } = await requireEventAccess(userId, eventId, 'admin')
  if (event.status !== 'DRAFT')
    throw conflict(
      'Only draft events can be deleted. Archive this event instead.',
      'INVALID_STATUS',
    )
  const registrations = await prisma.registration.count({ where: { eventId } })
  if (registrations > 0)
    throw conflict('This event has registrations and cannot be deleted.', 'HAS_REGISTRATIONS')
  const speakers = await prisma.eventSpeaker.findMany({
    where: { eventId },
    select: { photoKey: true },
  })
  await prisma.event.delete({ where: { id: eventId } })
  await deleteStoredFiles([
    event.bannerKey,
    event.logoKey,
    ...speakers.map((speaker) => speaker.photoKey),
  ])
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function getManagedEvent(userId: string, eventId: string) {
  const { role } = await requireEventAccess(userId, eventId, 'checkin')
  return toManagedEvent(await loadCard(eventId), role)
}

export async function listMyEvents(
  userId: string,
  query: {
    page: number
    pageSize: number
    status?: Event['status']
    q?: string
    organizationId?: string
  },
) {
  const where: Prisma.EventWhereInput = {
    AND: [
      {
        OR: [
          { ownerId: userId },
          { team: { some: { userId } } },
          { organization: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
        ],
      },
      // Archived events are hidden unless asked for explicitly.
      query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } },
      query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {},
      query.organizationId ? { organizationId: query.organizationId } : {},
    ],
  }
  const [events, total, adminOrgs, teams] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: [{ startsAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { organization: { select: { id: true, slug: true, name: true } } },
    }),
    prisma.event.count({ where }),
    prisma.organizationMember.findMany({
      where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { organizationId: true },
    }),
    prisma.eventTeamMember.findMany({ where: { userId }, select: { eventId: true, role: true } }),
  ])
  const adminOrgIds = new Set(adminOrgs.map((membership) => membership.organizationId))
  const teamRoles = new Map(teams.map((member) => [member.eventId, member.role]))

  const items = events.map((event) => {
    const role: EventRole =
      event.ownerId === userId
        ? 'OWNER'
        : event.organizationId && adminOrgIds.has(event.organizationId)
          ? 'ORG_ADMIN'
          : (teamRoles.get(event.id) ?? 'STAFF')
    return {
      ...event,
      bannerUrl: publicFileUrl(event.bannerKey),
      effectiveStatus: effectiveStatus(event),
      role,
    }
  })
  return { items, total }
}

export const privateLinkFor = (event: { slug: string; accessKey: string }) =>
  `${appUrl}/events/${event.slug}?key=${event.accessKey}`
