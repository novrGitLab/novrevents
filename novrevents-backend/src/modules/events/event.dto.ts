import { appUrl } from '../../config/env.js'
import { formatEventRange } from '../../lib/datetime.js'
import type { Prisma } from '../../lib/db.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import type { EventStatus } from '../../generated/prisma/client.js'
import type { EventEmailInfo } from '../communications/templates.js'
import type { REGISTRATION_REASONS } from './event.schemas.js'

/** Relations needed to render an event card or page. */
export const eventCardInclude = {
  category: { select: { slug: true, name: true } },
  owner: {
    select: {
      status: true,
      profile: {
        select: { username: true, visibility: true, avatarKey: true, publicFields: true },
      },
    },
  },
  organization: { select: { id: true, slug: true, name: true, status: true, logoKey: true } },
  registrationForm: {
    select: {
      slug: true,
      status: true,
      closesAt: true,
      responseLimit: true,
      qualifyingCount: true,
      autoAccept: true,
    },
  },
} satisfies Prisma.EventInclude

export type EventWithCard = Prisma.EventGetPayload<{ include: typeof eventCardInclude }>

type RegistrationReason = (typeof REGISTRATION_REASONS)[number]

/**
 * The stored status only changes when a background job runs. This derives the status that is true
 * right now, so pages are correct even between job runs.
 */
export function effectiveStatus(
  event: { status: EventStatus; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): EventStatus {
  if (event.status === 'PUBLISHED' || event.status === 'ONGOING') {
    if (event.endsAt <= now) return 'COMPLETED'
    if (event.startsAt <= now) return 'ONGOING'
    return 'PUBLISHED'
  }
  return event.status
}

export interface RegistrationState {
  open: boolean
  reason: RegistrationReason
  spotsLeft: number | null
  requiresApproval: boolean
  formSlug: string | null
}

/** Whether a visitor can register right now, and if not, the single reason why. */
export function registrationState(
  event: Pick<
    EventWithCard,
    | 'status'
    | 'startsAt'
    | 'endsAt'
    | 'capacity'
    | 'registeredCount'
    | 'registrationDeadline'
    | 'registrationForm'
  >,
  now: Date = new Date(),
): RegistrationState {
  const form = event.registrationForm
  const status = effectiveStatus(event, now)
  const remaining: number[] = []
  if (event.capacity !== null) remaining.push(event.capacity - event.registeredCount)
  if (form && form.responseLimit !== null) remaining.push(form.responseLimit - form.qualifyingCount)
  const spotsLeft = remaining.length > 0 ? Math.max(0, Math.min(...remaining)) : null

  const closed = (reason: RegistrationReason): RegistrationState => ({
    open: false,
    reason,
    spotsLeft,
    requiresApproval: form ? !form.autoAccept : false,
    formSlug: form?.status === 'PUBLISHED' ? form.slug : null,
  })

  if (status === 'CANCELLED') return closed('EVENT_CANCELLED')
  if (status === 'COMPLETED' || status === 'ARCHIVED') return closed('EVENT_ENDED')
  if (status === 'DRAFT') return closed('NOT_PUBLISHED')
  if (!form || form.status !== 'PUBLISHED') return closed('NO_FORM')
  if (event.registrationDeadline && event.registrationDeadline <= now)
    return closed('DEADLINE_PASSED')
  if (form.closesAt && form.closesAt <= now) return closed('FORM_CLOSED')
  if (spotsLeft !== null && spotsLeft <= 0) return closed('FULL')
  return {
    open: true,
    reason: 'OPEN',
    spotsLeft,
    requiresApproval: !form.autoAccept,
    formSlug: form.slug,
  }
}

function organizerOf(event: EventWithCard) {
  const profile = event.owner.profile
  const profileVisible = profile?.visibility === 'PUBLIC' && event.owner.status === 'ACTIVE'
  return {
    name: event.organizerName,
    username: profileVisible ? (profile?.username ?? null) : null,
    avatarUrl:
      profileVisible && profile?.publicFields.includes('avatar')
        ? publicFileUrl(profile.avatarKey)
        : null,
    organization:
      event.organization && event.organization.status === 'ACTIVE'
        ? {
            slug: event.organization.slug,
            name: event.organization.name,
            logoUrl: publicFileUrl(event.organization.logoKey),
          }
        : null,
  }
}

export function toEventSummary(event: EventWithCard, now: Date = new Date()) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    eventType: event.eventType,
    mode: event.mode,
    status: effectiveStatus(event, now),
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    venueName: event.venueName,
    city: event.city,
    region: event.region,
    country: event.country,
    bannerUrl: publicFileUrl(event.bannerKey),
    logoUrl: publicFileUrl(event.logoKey),
    accentColor: event.accentColor,
    isPaid: event.isPaid,
    priceInfo: event.priceInfo,
    category: event.category,
    organizer: organizerOf(event),
    registration: registrationState(event, now),
  }
}

// ─── Text helpers shared with email, tickets and certificates ────────────────

type LocationFields = {
  mode: string
  venueName: string | null
  address: string | null
  city: string | null
  region: string | null
  country: string | null
}

export function eventLocationText(event: LocationFields): string {
  const place = [event.venueName, event.address, event.city, event.region, event.country]
    .filter((part): part is string => Boolean(part))
    .join(', ')
  if (event.mode === 'VIRTUAL') return 'Online'
  if (event.mode === 'HYBRID') return place ? `${place} and online` : 'In person and online'
  return place || 'Location to be announced'
}

export const eventUrl = (slug: string) => `${appUrl}/events/${slug}`

export function eventEmailInfo(
  event: LocationFields & {
    slug: string
    title: string
    startsAt: Date
    endsAt: Date
    timezone: string
    organizerName: string
    accentColor: string | null
  },
): EventEmailInfo {
  return {
    title: event.title,
    whenText: formatEventRange(event.startsAt, event.endsAt, event.timezone),
    whereText: eventLocationText(event),
    url: eventUrl(event.slug),
    organizerName: event.organizerName,
    accentColor: event.accentColor,
  }
}
