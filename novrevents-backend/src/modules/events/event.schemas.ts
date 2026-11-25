import { z } from 'zod'
import {
  emailField,
  hexColor,
  isoDateTime,
  optionalHttpUrl,
  optionalText,
  paginationQuery,
  requiredText,
  timezoneField,
} from '../../lib/http.js'
import { CATEGORY_GROUPS } from './categories.js'

export const EVENT_TYPES = [
  'CONFERENCE',
  'WORKSHOP',
  'CTF',
  'MEETUP',
  'WEBINAR',
  'TRAINING',
  'HACKATHON',
  'SUMMIT',
  'PANEL',
  'OTHER',
] as const
export const EVENT_MODES = ['IN_PERSON', 'VIRTUAL', 'HYBRID'] as const
export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const
export const EVENT_VISIBILITIES = ['PUBLIC', 'UNLISTED', 'PRIVATE'] as const

export const eventTypeSchema = z.enum(EVENT_TYPES)
export const eventModeSchema = z.enum(EVENT_MODES)
export const eventStatusSchema = z.enum(EVENT_STATUSES)
export const eventVisibilitySchema = z.enum(EVENT_VISIBILITIES)

// ─── Input ───────────────────────────────────────────────────────────────────

const optionalEmail = z
  .union([emailField, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? value : null))

const eventFields = {
  title: requiredText(3, 140),
  summary: optionalText(240),
  description: z.string().trim().max(20_000),
  categoryId: z.uuid().nullable(),
  eventType: eventTypeSchema,
  mode: eventModeSchema,
  /** ISO-8601 instants with an offset. Stored in UTC. */
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  /** IANA timezone the event is presented in, e.g. "Africa/Lagos". */
  timezone: timezoneField,
  venueName: optionalText(160),
  address: optionalText(300),
  city: optionalText(100),
  region: optionalText(100),
  country: optionalText(100),
  /** Join link for virtual/hybrid events. Shown only to confirmed attendees and the event team. */
  onlineUrl: optionalHttpUrl,
  accentColor: hexColor.nullable(),
  organizerName: requiredText(2, 120),
  /** Public contact address. Returned on public pages only when organizerEmailPublic is true. */
  organizerEmail: optionalEmail,
  /** Designates organizerEmail as public contact information. Off by default. */
  organizerEmailPublic: z.boolean(),
  organizerWebsite: optionalHttpUrl,
  capacity: z.number().int().min(1).max(1_000_000).nullable(),
  registrationDeadline: isoDateTime.nullable(),
  isPaid: z.boolean(),
  /** Free-text price information for paid events. NOVR Events does not process payments. */
  priceInfo: optionalText(200),
  visibility: eventVisibilitySchema,
  /** Optional organisation workspace that publishes the event. */
  organizationId: z.uuid().nullable(),
}

export const createEventBody = z
  .object(eventFields)
  .partial()
  .required({ title: true, startsAt: true, endsAt: true, timezone: true })

export const updateEventBody = z.object(eventFields).partial()

export const cancelEventBody = z.object({
  reason: optionalText(1000),
  /** Email confirmed and pending attendees about the cancellation. */
  notifyAttendees: z.boolean().default(true),
})

export const myEventsQuery = paginationQuery.extend({
  status: eventStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
  organizationId: z.uuid().optional(),
})

export const discoveryQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional().describe('Category slug.'),
  scope: z
    .enum(CATEGORY_GROUPS)
    .optional()
    .describe('Discovery mode. "cybersecurity" lists only events in a cybersecurity category.'),
  type: eventTypeSchema.optional(),
  mode: eventModeSchema.optional().describe('Event format.'),
  price: z.enum(['free', 'paid']).optional(),
  location: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe('Matches city, region, country or venue.'),
  organizer: z.string().trim().toLowerCase().max(40).optional().describe('Organiser username.'),
  organization: z.string().trim().toLowerCase().max(80).optional().describe('Organisation slug.'),
  registration: z
    .enum(['open'])
    .optional()
    .describe('Only events that can be registered for right now.'),
  timeframe: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  from: z.iso.date().optional().describe('Only events that end on or after this date (UTC).'),
  to: z.iso.date().optional().describe('Only events that start on or before this date (UTC).'),
  sort: z.enum(['soonest', 'latest', 'newest', 'popular']).default('soonest'),
})

export const reportEventBody = z.object({
  reason: z.enum(['SPAM', 'SCAM', 'MISLEADING', 'INAPPROPRIATE', 'MALICIOUS', 'OTHER']),
  details: optionalText(1000),
  /** Optional contact address for anonymous reporters. */
  email: optionalEmail,
})

export const eventViewBody = z.object({ referrer: z.string().max(500).optional() })

// ─── Output ──────────────────────────────────────────────────────────────────

export const categorySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    group: z.enum(CATEGORY_GROUPS).describe('Discovery group the category belongs to.'),
  })
  .meta({ id: 'EventCategory' })

const organizerSchema = z.object({
  name: z.string(),
  /** Username of the event owner when their profile is public. */
  username: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  organization: z
    .object({ slug: z.string(), name: z.string(), logoUrl: z.string().nullable() })
    .nullable(),
})

export const REGISTRATION_REASONS = [
  'OPEN',
  'NOT_PUBLISHED',
  'NO_FORM',
  'EVENT_CANCELLED',
  'EVENT_ENDED',
  'DEADLINE_PASSED',
  'FORM_CLOSED',
  'FULL',
] as const

export const registrationStateSchema = z
  .object({
    open: z.boolean(),
    reason: z.enum(REGISTRATION_REASONS),
    /** Remaining places, or null when the event is not capacity-limited. */
    spotsLeft: z.number().int().nullable(),
    /** True when the organiser reviews registrations before confirming them. */
    requiresApproval: z.boolean(),
    formSlug: z.string().nullable(),
  })
  .meta({ id: 'RegistrationState' })

const eventCardFields = {
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  eventType: eventTypeSchema,
  mode: eventModeSchema,
  /** Status with time taken into account (a published event that has started is ONGOING). */
  status: eventStatusSchema,
  startsAt: z.date(),
  endsAt: z.date(),
  timezone: z.string(),
  venueName: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  isPaid: z.boolean(),
  priceInfo: z.string().nullable(),
  category: categorySchema.pick({ slug: true, name: true }).nullable(),
  organizer: organizerSchema,
  registration: registrationStateSchema,
}

export const eventSummarySchema = z.object(eventCardFields).meta({ id: 'EventSummary' })

export const speakerSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    title: z.string().nullable(),
    organization: z.string().nullable(),
    bio: z.string().nullable(),
    photoUrl: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .meta({ id: 'Speaker' })

export const agendaSessionSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    startsAt: z.date(),
    endsAt: z.date(),
    location: z.string().nullable(),
    track: z.string().nullable(),
    speakerIds: z.array(z.uuid()),
  })
  .meta({ id: 'AgendaSession' })

export const ticketTypeSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    capacity: z.number().int().nullable(),
    registeredCount: z.number().int(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  })
  .meta({ id: 'TicketType' })

export const publicTicketTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  available: z.boolean(),
})

export const eventDetailSchema = z
  .object({
    ...eventCardFields,
    description: z.string(),
    address: z.string().nullable(),
    visibility: eventVisibilitySchema,
    organizerEmail: z.string().nullable(),
    organizerWebsite: z.string().nullable(),
    registrationDeadline: z.date().nullable(),
    capacity: z.number().int().nullable(),
    cancellationReason: z.string().nullable(),
    speakers: z.array(speakerSchema),
    sessions: z.array(agendaSessionSchema),
    ticketTypes: z.array(publicTicketTypeSchema),
    viewer: z.object({
      isSaved: z.boolean(),
      /** The viewer's own registration for this event, if any. */
      registrationStatus: z.enum(['PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED']).nullable(),
      canManage: z.boolean(),
      /** Join link; present only for confirmed attendees and the event team. */
      onlineUrl: z.string().nullable(),
    }),
  })
  .meta({ id: 'EventDetail' })

export const eventManageSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    description: z.string(),
    categoryId: z.uuid().nullable(),
    eventType: eventTypeSchema,
    mode: eventModeSchema,
    startsAt: z.date(),
    endsAt: z.date(),
    timezone: z.string(),
    venueName: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    country: z.string().nullable(),
    onlineUrl: z.string().nullable(),
    bannerUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    accentColor: z.string().nullable(),
    organizerName: z.string(),
    organizerEmail: z.string().nullable(),
    organizerEmailPublic: z.boolean(),
    organizerWebsite: z.string().nullable(),
    capacity: z.number().int().nullable(),
    registeredCount: z.number().int(),
    registrationDeadline: z.date().nullable(),
    isPaid: z.boolean(),
    priceInfo: z.string().nullable(),
    /** Stored status. `effectiveStatus` also accounts for the current time. */
    status: eventStatusSchema,
    effectiveStatus: eventStatusSchema,
    visibility: eventVisibilitySchema,
    moderationStatus: z.enum(['CLEAR', 'FLAGGED', 'REMOVED']),
    moderationNote: z.string().nullable(),
    organizationId: z.uuid().nullable(),
    organization: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }).nullable(),
    registrationFormId: z.uuid().nullable(),
    registration: registrationStateSchema,
    /** Share link for PRIVATE events. Null for check-in staff. */
    privateLink: z.string().nullable(),
    publicUrl: z.string(),
    publishedAt: z.date().nullable(),
    cancelledAt: z.date().nullable(),
    cancellationReason: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    /** The caller's role on this event. */
    role: z.enum(['OWNER', 'ORG_ADMIN', 'MANAGER', 'STAFF']),
    counts: z.object({
      confirmed: z.number().int(),
      pending: z.number().int(),
      checkedIn: z.number().int(),
      forms: z.number().int(),
    }),
  })
  .meta({ id: 'EventManage' })

export const eventListItemSchema = eventManageSchema
  .pick({
    id: true,
    slug: true,
    title: true,
    eventType: true,
    mode: true,
    startsAt: true,
    endsAt: true,
    timezone: true,
    city: true,
    country: true,
    bannerUrl: true,
    status: true,
    effectiveStatus: true,
    visibility: true,
    moderationStatus: true,
    capacity: true,
    registeredCount: true,
    role: true,
    organization: true,
    updatedAt: true,
  })
  .meta({ id: 'EventListItem' })
