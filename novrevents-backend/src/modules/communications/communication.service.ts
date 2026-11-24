import { appUrl } from '../../config/env.js'
import { addMinutes } from '../../lib/datetime.js'
import { prisma, type Prisma, type Tx } from '../../lib/db.js'
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js'
import type {
  CampaignAudience,
  CampaignType,
  Event,
  MessageType,
} from '../../generated/prisma/client.js'
import { cancelJob, defineJob, enqueueJob } from '../../jobs/queue.js'
import { getSettings } from '../admin/settings.service.js'
import { requireEventAccess } from '../events/event-access.js'
import { eventEmailInfo } from '../events/event.dto.js'
import { onEventLifecycle } from '../events/event.service.js'
import { manageUrlFor } from '../tickets/ticket-credential.js'
import { emailFromUnsubscribeToken, queueEmail } from './outbox.js'
import {
  campaignContent,
  eventCancelledContent,
  eventReminderContent,
  invitationContent,
} from './templates.js'

/** Default automatic reminder: 24 hours before the event starts. */
export const DEFAULT_REMINDER_OFFSET_MINUTES = 24 * 60

const MESSAGE_TYPE: Record<CampaignType, MessageType> = {
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  UPDATE: 'EVENT_UPDATE',
  REMINDER: 'EVENT_REMINDER',
  CANCELLATION: 'EVENT_CANCELLATION',
  SPEAKER_INVITATION: 'SPEAKER_INVITATION',
  VOLUNTEER_INVITATION: 'VOLUNTEER_INVITATION',
}

const isInvitation = (type: CampaignType) =>
  type === 'SPEAKER_INVITATION' || type === 'VOLUNTEER_INVITATION'
const campaignJobKey = (campaignId: string) => `campaign:${campaignId}`

// ─── Audience ────────────────────────────────────────────────────────────────

interface Recipient {
  email: string
  name: string | null
  registration: { id: string; accessVersion: number } | null
  userId: string | null
}

async function resolveAudience(
  db: Prisma.TransactionClient | typeof prisma,
  eventId: string,
  audience: CampaignAudience,
  custom: string[],
): Promise<Recipient[]> {
  if (audience === 'CUSTOM') {
    return [...new Set(custom.map((email) => email.toLowerCase()))].map((email) => ({
      email,
      name: null,
      registration: null,
      userId: null,
    }))
  }
  const where: Prisma.RegistrationWhereInput = { eventId, status: 'CONFIRMED' }
  if (audience === 'CHECKED_IN') where.ticket = { checkIn: { isNot: null } }
  if (audience === 'NOT_CHECKED_IN') where.OR = [{ ticket: null }, { ticket: { checkIn: null } }]
  const registrations = await db.registration.findMany({
    where,
    select: {
      id: true,
      accessVersion: true,
      attendeeEmail: true,
      attendeeName: true,
      userId: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  // One message per address even if someone registered more than once.
  const seen = new Set<string>()
  return registrations.flatMap((registration) => {
    if (seen.has(registration.attendeeEmail)) return []
    seen.add(registration.attendeeEmail)
    return [
      {
        email: registration.attendeeEmail,
        name: registration.attendeeName,
        registration: { id: registration.id, accessVersion: registration.accessVersion },
        userId: registration.userId,
      },
    ]
  })
}

// ─── Campaign delivery ───────────────────────────────────────────────────────

/** Expands a campaign into one outbox message per recipient. Idempotent: a SENT campaign is skipped. */
export async function dispatchCampaign(campaignId: string): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM message_campaigns WHERE id = ${campaignId}::uuid FOR UPDATE`
      const campaign = await tx.messageCampaign.findUnique({
        where: { id: campaignId },
        include: { event: true, form: true },
      })
      if (!campaign || (campaign.status !== 'SCHEDULED' && campaign.status !== 'SENDING')) return 0
      const event = campaign.event
      // Reminders and announcements are pointless once an event is cancelled.
      if (event.status === 'CANCELLED' && campaign.type !== 'CANCELLATION') {
        await tx.messageCampaign.update({
          where: { id: campaignId },
          data: { status: 'CANCELLED' },
        })
        return 0
      }

      const recipients = await resolveAudience(
        tx,
        campaign.eventId,
        campaign.audience,
        campaign.customRecipients,
      )
      const info = eventEmailInfo(event)
      for (const recipient of recipients) {
        await queueEmail(tx, {
          type: MESSAGE_TYPE[campaign.type],
          to: { email: recipient.email, name: recipient.name },
          userId: recipient.userId,
          eventId: event.id,
          registrationId: recipient.registration?.id ?? null,
          campaignId: campaign.id,
          content: () => {
            const manageUrl = recipient.registration ? manageUrlFor(recipient.registration) : null
            if (campaign.type === 'REMINDER') {
              return eventReminderContent({
                event: info,
                attendeeName: recipient.name ?? '',
                manageUrl: manageUrl ?? info.url,
                onlineUrl: event.onlineUrl,
                note: campaign.isAutomatic ? null : campaign.body,
              })
            }
            if (isInvitation(campaign.type) && campaign.form) {
              return invitationContent({
                event: info,
                subject: campaign.subject,
                body: campaign.body,
                formTitle: campaign.form.title,
                formUrl: `${appUrl}/f/${campaign.form.slug}`,
                role: campaign.type === 'SPEAKER_INVITATION' ? 'speaker' : 'volunteer',
              })
            }
            return campaignContent({
              event: info,
              subject: campaign.subject,
              body: campaign.body,
              attendeeName: recipient.name,
              manageUrl,
            })
          },
        })
      }
      await tx.messageCampaign.update({
        where: { id: campaignId },
        data: { status: 'SENT', sentAt: new Date(), recipientCount: recipients.length },
      })
      return recipients.length
    },
    { maxWait: 15_000, timeout: 120_000 },
  )
}

defineJob('campaign.dispatch', async (payload) => {
  await dispatchCampaign(String(payload.campaignId))
})

// ─── Automatic reminders and lifecycle notices ───────────────────────────────

async function scheduleAutomaticReminder(tx: Tx, event: Event): Promise<void> {
  const existing = await tx.messageCampaign.findFirst({
    where: { eventId: event.id, isAutomatic: true, type: 'REMINDER' },
  })
  const offset = existing?.offsetMinutes ?? DEFAULT_REMINDER_OFFSET_MINUTES
  const sendAt = addMinutes(event.startsAt, -offset)
  if (existing && existing.status !== 'SCHEDULED' && existing.status !== 'DRAFT') return
  if (sendAt <= new Date()) {
    // Too late for a reminder: the event starts sooner than the offset.
    if (existing) {
      await tx.messageCampaign.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } })
      await cancelJob(tx, campaignJobKey(existing.id))
    }
    return
  }
  const campaign = existing
    ? await tx.messageCampaign.update({
        where: { id: existing.id },
        data: { status: 'SCHEDULED', scheduledAt: sendAt },
      })
    : await tx.messageCampaign.create({
        data: {
          eventId: event.id,
          type: 'REMINDER',
          status: 'SCHEDULED',
          subject: `Reminder: ${event.title}`,
          body: '',
          audience: 'CONFIRMED',
          isAutomatic: true,
          offsetMinutes: offset,
          scheduledAt: sendAt,
        },
      })
  await cancelJob(tx, campaignJobKey(campaign.id))
  await enqueueJob(
    tx,
    'campaign.dispatch',
    { campaignId: campaign.id },
    { runAt: sendAt, dedupeKey: campaignJobKey(campaign.id) },
  )
}

async function cancelScheduledCampaigns(tx: Tx, event: Event): Promise<void> {
  const scheduled = await tx.messageCampaign.findMany({
    where: { eventId: event.id, status: 'SCHEDULED' },
    select: { id: true },
  })
  for (const campaign of scheduled) await cancelJob(tx, campaignJobKey(campaign.id))
  await tx.messageCampaign.updateMany({
    where: { eventId: event.id, status: 'SCHEDULED' },
    data: { status: 'CANCELLED' },
  })
}

onEventLifecycle('published', scheduleAutomaticReminder)
onEventLifecycle('rescheduled', scheduleAutomaticReminder)
onEventLifecycle('unpublished', cancelScheduledCampaigns)
onEventLifecycle('cancelled', async (tx, event) => {
  await cancelScheduledCampaigns(tx, event)
  // Everyone holding a place — confirmed or awaiting review — is told. This is a service notice,
  // so it is sent regardless of marketing preferences.
  const registrations = await tx.registration.findMany({
    where: { eventId: event.id, status: { in: ['CONFIRMED', 'PENDING'] } },
    select: { id: true, attendeeEmail: true, attendeeName: true, userId: true },
  })
  const info = eventEmailInfo(event)
  const campaign = await tx.messageCampaign.create({
    data: {
      eventId: event.id,
      type: 'CANCELLATION',
      status: 'SENT',
      subject: `Cancelled: ${event.title}`,
      body: event.cancellationReason ?? '',
      audience: 'CONFIRMED',
      sentAt: new Date(),
      recipientCount: registrations.length,
    },
  })
  for (const registration of registrations) {
    await queueEmail(tx, {
      type: 'EVENT_CANCELLATION',
      to: { email: registration.attendeeEmail, name: registration.attendeeName },
      userId: registration.userId,
      eventId: event.id,
      registrationId: registration.id,
      campaignId: campaign.id,
      content: () =>
        eventCancelledContent({
          event: info,
          attendeeName: registration.attendeeName,
          reason: event.cancellationReason,
        }),
    })
    if (registration.userId) {
      await tx.notification.create({
        data: {
          userId: registration.userId,
          type: 'EVENT_CANCELLED',
          title: `${event.title} has been cancelled`,
          linkPath: `/events/${event.slug}`,
        },
      })
    }
  }
})

// ─── Organiser API ───────────────────────────────────────────────────────────

export interface CampaignInput {
  type: Exclude<CampaignType, 'CANCELLATION'>
  subject: string
  body: string
  audience: CampaignAudience
  customRecipients: string[]
  formId: string | null
  /** Null sends immediately. */
  scheduledAt: Date | null
}

async function validateCampaign(event: Event, input: CampaignInput): Promise<void> {
  if (event.status === 'DRAFT' || event.status === 'CANCELLED' || event.status === 'ARCHIVED') {
    throw conflict('Messages can only be sent for published events.', 'EVENT_NOT_LIVE')
  }
  if (isInvitation(input.type)) {
    // Invitations go to people who are not attendees yet, and always lead to an application form.
    if (input.audience !== 'CUSTOM' || input.customRecipients.length === 0) {
      throw badRequest('List the email addresses to invite.', 'RECIPIENTS_REQUIRED')
    }
    if (!input.formId)
      throw badRequest('Choose the application form the invitation links to.', 'FORM_REQUIRED')
    const form = await prisma.form.findFirst({ where: { id: input.formId, eventId: event.id } })
    if (!form) throw badRequest('The application form must belong to this event.', 'INVALID_FORM')
    const expected = input.type === 'SPEAKER_INVITATION' ? 'SPEAKER' : 'VOLUNTEER'
    if (form.purpose !== expected)
      throw badRequest(`Choose a ${expected.toLowerCase()} application form.`, 'INVALID_FORM')
    if (form.status !== 'PUBLISHED')
      throw badRequest(
        'Publish the application form before sending invitations.',
        'FORM_NOT_PUBLISHED',
      )

    // Abuse safeguard: invitations are capped per event per day.
    const settings = await getSettings()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const sent = await prisma.message.count({
      where: {
        eventId: event.id,
        type: { in: ['SPEAKER_INVITATION', 'VOLUNTEER_INVITATION'] },
        createdAt: { gt: since },
      },
    })
    if (sent + input.customRecipients.length > settings.maxInvitationsPerEventPerDay) {
      throw new AppError(
        429,
        'INVITATION_LIMIT',
        `Invitations are limited to ${settings.maxInvitationsPerEventPerDay} per event per day.`,
      )
    }
  } else if (input.audience === 'CUSTOM') {
    // Announcements only go to people who registered — never to arbitrary lists.
    throw badRequest('Announcements can only be sent to registered attendees.', 'INVALID_AUDIENCE')
  }
  if (input.scheduledAt && input.scheduledAt <= new Date()) {
    throw badRequest('Choose a time in the future, or send now.', 'INVALID_SCHEDULE')
  }
}

export async function createCampaign(userId: string, eventId: string, input: CampaignInput) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  await validateCampaign(event, input)
  const campaignId = await prisma.$transaction(async (tx) => {
    const campaign = await tx.messageCampaign.create({
      data: {
        eventId,
        type: input.type,
        status: 'SCHEDULED',
        subject: input.subject,
        body: input.body,
        audience: input.audience,
        customRecipients: input.audience === 'CUSTOM' ? [...new Set(input.customRecipients)] : [],
        formId: input.formId,
        scheduledAt: input.scheduledAt ?? new Date(),
        createdById: userId,
      },
    })
    await enqueueJob(
      tx,
      'campaign.dispatch',
      { campaignId: campaign.id },
      {
        runAt: input.scheduledAt ?? new Date(),
        dedupeKey: campaignJobKey(campaign.id),
      },
    )
    return campaign.id
  })
  // Immediate sends are expanded right away so the organiser sees the recipient count.
  if (!input.scheduledAt) await dispatchCampaign(campaignId)
  return getCampaign(userId, eventId, campaignId)
}

export async function cancelCampaign(userId: string, eventId: string, campaignId: string) {
  await requireEventAccess(userId, eventId, 'manage')
  const campaign = await prisma.messageCampaign.findFirst({ where: { id: campaignId, eventId } })
  if (!campaign) throw notFound('Message')
  if (campaign.status !== 'SCHEDULED')
    throw conflict('Only scheduled messages can be cancelled.', 'INVALID_STATUS')
  await prisma.$transaction(async (tx) => {
    await tx.messageCampaign.update({ where: { id: campaignId }, data: { status: 'CANCELLED' } })
    await cancelJob(tx, campaignJobKey(campaignId))
  })
  return getCampaign(userId, eventId, campaignId)
}

/** Changes the automatic reminder offset (or turns it off with null). */
export async function configureReminder(
  userId: string,
  eventId: string,
  offsetMinutes: number | null,
) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  await prisma.$transaction(async (tx) => {
    const existing = await tx.messageCampaign.findFirst({
      where: { eventId, isAutomatic: true, type: 'REMINDER' },
    })
    if (offsetMinutes === null) {
      if (existing && existing.status === 'SCHEDULED') {
        await tx.messageCampaign.update({
          where: { id: existing.id },
          data: { status: 'CANCELLED' },
        })
        await cancelJob(tx, campaignJobKey(existing.id))
      }
      return
    }
    if (existing?.status === 'SENT')
      throw conflict('The reminder has already been sent.', 'ALREADY_SENT')
    if (existing) {
      await tx.messageCampaign.update({
        where: { id: existing.id },
        data: { offsetMinutes, status: 'DRAFT' },
      })
    } else {
      await tx.messageCampaign.create({
        data: {
          eventId,
          type: 'REMINDER',
          status: 'DRAFT',
          subject: `Reminder: ${event.title}`,
          body: '',
          isAutomatic: true,
          offsetMinutes,
        },
      })
    }
    if (event.status === 'PUBLISHED' || event.status === 'ONGOING')
      await scheduleAutomaticReminder(tx, event)
  })
  return listCampaigns(userId, eventId)
}

async function campaignStats(campaignIds: string[]) {
  const rows = await prisma.message.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: campaignIds } },
    _count: { _all: true },
  })
  const stats = new Map<string, Record<string, number>>()
  for (const row of rows) {
    if (!row.campaignId) continue
    const entry = stats.get(row.campaignId) ?? {}
    entry[row.status] = row._count._all
    stats.set(row.campaignId, entry)
  }
  return stats
}

/**
 * Delivery figures. `sent` counts messages handed to the provider; delivered/opened/clicked/bounced
 * are only known when Brevo reports them through the webhook.
 */
function summarise(counts: Record<string, number> = {}) {
  const n = (...statuses: string[]) =>
    statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
  return {
    queued: n('QUEUED', 'SENDING'),
    sent: n('SENT', 'DELIVERED', 'OPENED', 'CLICKED'),
    delivered: n('DELIVERED', 'OPENED', 'CLICKED'),
    opened: n('OPENED', 'CLICKED'),
    clicked: n('CLICKED'),
    bounced: n('BOUNCED'),
    failed: n('FAILED'),
    suppressed: n('SUPPRESSED'),
  }
}

type CampaignRow = Prisma.MessageCampaignGetPayload<{
  include: { form: { select: { id: true; title: true; slug: true } } }
}>

function toCampaign(campaign: CampaignRow, counts?: Record<string, number>) {
  return {
    id: campaign.id,
    type: campaign.type,
    status: campaign.status,
    subject: campaign.subject,
    body: campaign.body,
    audience: campaign.audience,
    customRecipients: campaign.customRecipients,
    form: campaign.form,
    isAutomatic: campaign.isAutomatic,
    offsetMinutes: campaign.offsetMinutes,
    scheduledAt: campaign.scheduledAt,
    sentAt: campaign.sentAt,
    recipientCount: campaign.recipientCount,
    delivery: summarise(counts),
    createdAt: campaign.createdAt,
  }
}

export async function listCampaigns(userId: string, eventId: string) {
  await requireEventAccess(userId, eventId, 'manage')
  const campaigns = await prisma.messageCampaign.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    include: { form: { select: { id: true, title: true, slug: true } } },
  })
  const stats = await campaignStats(campaigns.map((campaign) => campaign.id))
  return campaigns.map((campaign) => toCampaign(campaign, stats.get(campaign.id)))
}

export async function getCampaign(userId: string, eventId: string, campaignId: string) {
  await requireEventAccess(userId, eventId, 'manage')
  const campaign = await prisma.messageCampaign.findFirst({
    where: { id: campaignId, eventId },
    include: { form: { select: { id: true, title: true, slug: true } } },
  })
  if (!campaign) throw notFound('Message')
  return toCampaign(campaign, (await campaignStats([campaignId])).get(campaignId))
}

/** Every email sent about this event, including automatic ones (confirmations, tickets). */
export async function listEventMessages(
  userId: string,
  eventId: string,
  query: { page: number; pageSize: number; type?: MessageType; status?: string; q?: string },
) {
  await requireEventAccess(userId, eventId, 'manage')
  const where: Prisma.MessageWhereInput = {
    eventId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status as Prisma.EnumMessageStatusFilter['equals'] } : {}),
    ...(query.q ? { toEmail: { contains: query.q, mode: 'insensitive' } } : {}),
  }
  const [items, total, byStatus] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        type: true,
        status: true,
        toEmail: true,
        toName: true,
        subject: true,
        errorMessage: true,
        scheduledFor: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        bouncedAt: true,
        createdAt: true,
      },
    }),
    prisma.message.count({ where }),
    prisma.message.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
  ])
  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]))
  return { items, total, summary: summarise(counts) }
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface Preferences {
  reminders: boolean
  announcements: boolean
  invitations: boolean
  unsubscribedAll: boolean
}

async function readPreferences(email: string): Promise<Preferences> {
  const row = await prisma.emailPreference.findUnique({ where: { email } })
  return {
    reminders: row?.reminders ?? true,
    announcements: row?.announcements ?? true,
    invitations: row?.invitations ?? true,
    unsubscribedAll: row?.unsubscribedAllAt != null,
  }
}

async function writePreferences(email: string, patch: Partial<Preferences>): Promise<Preferences> {
  const data = {
    ...(patch.reminders !== undefined ? { reminders: patch.reminders } : {}),
    ...(patch.announcements !== undefined ? { announcements: patch.announcements } : {}),
    ...(patch.invitations !== undefined ? { invitations: patch.invitations } : {}),
    ...(patch.unsubscribedAll !== undefined
      ? { unsubscribedAllAt: patch.unsubscribedAll ? new Date() : null }
      : {}),
  }
  await prisma.emailPreference.upsert({
    where: { email },
    create: { email, ...data },
    update: data,
  })
  return readPreferences(email)
}

export const getMyPreferences = (email: string) => readPreferences(email)
export const updateMyPreferences = (email: string, patch: Partial<Preferences>) =>
  writePreferences(email, patch)

/** Works from the signed link in every non-essential email, so guests can unsubscribe too. */
export async function preferencesByToken(token: string) {
  const email = emailFromUnsubscribeToken(token)
  if (!email) throw badRequest('This link is invalid.', 'INVALID_TOKEN')
  return { email: maskEmail(email), preferences: await readPreferences(email) }
}

export async function updatePreferencesByToken(token: string, patch: Partial<Preferences>) {
  const email = emailFromUnsubscribeToken(token)
  if (!email) throw badRequest('This link is invalid.', 'INVALID_TOKEN')
  return { email: maskEmail(email), preferences: await writePreferences(email, patch) }
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

// ─── Brevo webhook ───────────────────────────────────────────────────────────

const BREVO_EVENTS: Record<
  string,
  {
    status: 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED'
    field: 'deliveredAt' | 'openedAt' | 'clickedAt' | 'bouncedAt'
  }
> = {
  delivered: { status: 'DELIVERED', field: 'deliveredAt' },
  opened: { status: 'OPENED', field: 'openedAt' },
  unique_opened: { status: 'OPENED', field: 'openedAt' },
  click: { status: 'CLICKED', field: 'clickedAt' },
  hard_bounce: { status: 'BOUNCED', field: 'bouncedAt' },
  soft_bounce: { status: 'BOUNCED', field: 'bouncedAt' },
  invalid_email: { status: 'BOUNCED', field: 'bouncedAt' },
  blocked: { status: 'BOUNCED', field: 'bouncedAt' },
}

const STATUS_RANK: Record<string, number> = {
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  CLICKED: 4,
  BOUNCED: 5,
}

/** Applies one Brevo event to the message it refers to. Status only ever moves forward. */
export async function applyBrevoEvent(payload: {
  event?: string
  'message-id'?: string
  email?: string
}): Promise<boolean> {
  const providerMessageId = payload['message-id']
  if (!providerMessageId || !payload.event) return false
  const message = await prisma.message.findFirst({ where: { providerMessageId } })
  if (!message) return false
  if (payload.event === 'spam' || payload.event === 'unsubscribed') {
    await writePreferences(message.toEmail, { unsubscribedAll: true })
    return true
  }
  const mapping = BREVO_EVENTS[payload.event]
  if (!mapping) return false
  const promote = (STATUS_RANK[mapping.status] ?? 0) > (STATUS_RANK[message.status] ?? 0)
  await prisma.message.update({
    where: { id: message.id },
    data: {
      ...(promote ? { status: mapping.status } : {}),
      ...(message[mapping.field] ? {} : { [mapping.field]: new Date() }),
    },
  })
  // A hard bounce means the address should not be mailed again.
  if (payload.event === 'hard_bounce') {
    await writePreferences(message.toEmail, { unsubscribedAll: true })
  }
  return true
}
