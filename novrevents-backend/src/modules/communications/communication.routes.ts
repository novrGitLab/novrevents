import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { audit } from '../../lib/audit.js'
import { safeEqual } from '../../lib/crypto.js'
import { AppError } from '../../lib/errors.js'
import {
  emailField,
  idParams,
  isoDateTime,
  pageOf,
  paginated,
  paginationQuery,
  requiredText,
  responses,
  secured,
} from '../../lib/http.js'
import { requireAuth, requireVerified } from '../../middleware/auth.js'
import { limits } from '../../plugins/rate-limit.js'
import * as service from './communication.service.js'

const deliverySchema = z.object({
  queued: z.number().int(),
  sent: z.number().int(),
  delivered: z.number().int(),
  opened: z.number().int(),
  clicked: z.number().int(),
  bounced: z.number().int(),
  failed: z.number().int(),
  suppressed: z.number().int(),
})

const campaignSchema = z
  .object({
    id: z.uuid(),
    type: z.enum([
      'ANNOUNCEMENT',
      'UPDATE',
      'REMINDER',
      'CANCELLATION',
      'SPEAKER_INVITATION',
      'VOLUNTEER_INVITATION',
    ]),
    status: z.enum(['DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED']),
    subject: z.string(),
    body: z.string(),
    audience: z.enum(['CONFIRMED', 'CHECKED_IN', 'NOT_CHECKED_IN', 'CUSTOM']),
    customRecipients: z.array(z.string()),
    form: z.object({ id: z.uuid(), title: z.string(), slug: z.string() }).nullable(),
    isAutomatic: z.boolean(),
    offsetMinutes: z.number().int().nullable(),
    scheduledAt: z.date().nullable(),
    sentAt: z.date().nullable(),
    recipientCount: z.number().int(),
    delivery: deliverySchema,
    createdAt: z.date(),
  })
  .meta({ id: 'Campaign' })

const messageSchema = z
  .object({
    id: z.uuid(),
    type: z.string(),
    status: z.string(),
    toEmail: z.string(),
    toName: z.string().nullable(),
    subject: z.string(),
    errorMessage: z.string().nullable(),
    scheduledFor: z.date(),
    sentAt: z.date().nullable(),
    deliveredAt: z.date().nullable(),
    openedAt: z.date().nullable(),
    clickedAt: z.date().nullable(),
    bouncedAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'MessageLogEntry' })

const preferencesSchema = z
  .object({
    reminders: z.boolean(),
    announcements: z.boolean(),
    invitations: z.boolean(),
    unsubscribedAll: z.boolean(),
  })
  .meta({ id: 'EmailPreferences' })

const preferencesPatch = preferencesSchema.partial()

const campaignBody = z.object({
  type: z.enum([
    'ANNOUNCEMENT',
    'UPDATE',
    'REMINDER',
    'SPEAKER_INVITATION',
    'VOLUNTEER_INVITATION',
  ]),
  subject: requiredText(3, 150),
  /** Plain text. It is escaped when the email is rendered. */
  body: requiredText(1, 10_000),
  audience: z.enum(['CONFIRMED', 'CHECKED_IN', 'NOT_CHECKED_IN', 'CUSTOM']).default('CONFIRMED'),
  /** Invitations only. */
  customRecipients: z.array(emailField).max(200).default([]),
  /** Invitations only: the speaker or volunteer application form to link to. */
  formId: z.uuid().nullable().default(null),
  /** Omit or null to send now. */
  scheduledAt: isoDateTime.nullable().default(null),
})

const campaignParams = z.object({ id: z.uuid(), campaignId: z.uuid() })
const tokenQuery = z.object({ token: z.string().min(10).max(500) })

export const communicationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/events/:id/campaigns',
    {
      schema: {
        tags: ['Communications'],
        summary: 'List announcements, reminders and invitations',
        ...secured,
        params: idParams,
        response: responses({ 200: z.object({ items: z.array(campaignSchema) }) }),
      },
    },
    async (request) => ({
      items: await service.listCampaigns(requireAuth(request).userId, request.params.id),
    }),
  )

  app.post(
    '/events/:id/campaigns',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Send or schedule a message',
        description:
          'Announcements, updates and reminders go to registered attendees only. Speaker and volunteer ' +
          'invitations go to listed addresses and must link to a published application form of this event; ' +
          'they are capped per event per day. Recipients who opted out are skipped and logged as SUPPRESSED.',
        ...secured,
        params: idParams,
        body: campaignBody,
        response: responses({ 201: campaignSchema }),
      },
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    },
    async (request, reply) => {
      const auth = requireVerified(request)
      const campaign = await service.createCampaign(auth.userId, request.params.id, request.body)
      await audit(request, {
        action: 'communication.campaign_create',
        targetType: 'campaign',
        targetId: campaign.id,
        eventId: request.params.id,
        metadata: {
          type: campaign.type,
          audience: campaign.audience,
          recipients: campaign.recipientCount,
          scheduled: request.body.scheduledAt !== null,
        },
      })
      return reply.status(201).send(campaign)
    },
  )

  app.post(
    '/events/:id/campaigns/:campaignId/cancel',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Cancel a scheduled message',
        ...secured,
        params: campaignParams,
        response: responses({ 200: campaignSchema }),
      },
    },
    async (request) =>
      service.cancelCampaign(
        requireAuth(request).userId,
        request.params.id,
        request.params.campaignId,
      ),
  )

  app.put(
    '/events/:id/reminder',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Configure the automatic attendee reminder',
        description:
          'Minutes before the start to send it; null turns it off. The default is 24 hours.',
        ...secured,
        params: idParams,
        body: z.object({
          offsetMinutes: z
            .number()
            .int()
            .min(15)
            .max(14 * 24 * 60)
            .nullable(),
        }),
        response: responses({ 200: z.object({ items: z.array(campaignSchema) }) }),
      },
    },
    async (request) => ({
      items: await service.configureReminder(
        requireAuth(request).userId,
        request.params.id,
        request.body.offsetMinutes,
      ),
    }),
  )

  app.get(
    '/events/:id/messages',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Message log for an event',
        description:
          'Every email sent about the event, with delivery status where the provider reports it.',
        ...secured,
        params: idParams,
        querystring: paginationQuery.extend({
          type: z
            .enum([
              'SUBMISSION_RECEIPT',
              'REGISTRATION_CONFIRMATION',
              'REGISTRATION_PENDING',
              'REGISTRATION_DECLINED',
              'REGISTRATION_CANCELLED',
              'TICKET_DELIVERY',
              'EVENT_REMINDER',
              'EVENT_UPDATE',
              'EVENT_CANCELLATION',
              'ANNOUNCEMENT',
              'SPEAKER_INVITATION',
              'VOLUNTEER_INVITATION',
              'CERTIFICATE_ISSUED',
            ])
            .optional(),
          status: z
            .enum([
              'QUEUED',
              'SENDING',
              'SENT',
              'DELIVERED',
              'OPENED',
              'CLICKED',
              'BOUNCED',
              'FAILED',
              'SUPPRESSED',
              'CANCELLED',
            ])
            .optional(),
          q: z.string().trim().max(100).optional(),
        }),
        response: responses({ 200: paginated(messageSchema).extend({ summary: deliverySchema }) }),
      },
    },
    async (request) => {
      const result = await service.listEventMessages(
        requireAuth(request).userId,
        request.params.id,
        request.query,
      )
      return {
        ...pageOf(result.items, result.total, request.query.page, request.query.pageSize),
        summary: result.summary,
      }
    },
  )

  // ─── Preferences ───────────────────────────────────────────────────────────

  app.get(
    '/me/email-preferences',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Your email preferences',
        ...secured,
        response: responses({ 200: preferencesSchema }),
      },
    },
    async (request) => service.getMyPreferences(requireAuth(request).email),
  )

  app.patch(
    '/me/email-preferences',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Update your email preferences',
        ...secured,
        body: preferencesPatch,
        response: responses({ 200: preferencesSchema }),
      },
    },
    async (request) => service.updateMyPreferences(requireAuth(request).email, request.body),
  )

  app.get(
    '/public/email-preferences',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Read preferences from an unsubscribe link',
        querystring: tokenQuery,
        response: responses({
          200: z.object({ email: z.string(), preferences: preferencesSchema }),
        }),
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request) => service.preferencesByToken(request.query.token),
  )

  app.patch(
    '/public/email-preferences',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Update preferences from an unsubscribe link (no account needed)',
        querystring: tokenQuery,
        body: preferencesPatch,
        response: responses({
          200: z.object({ email: z.string(), preferences: preferencesSchema }),
        }),
      },
      config: { rateLimit: limits.publicForm },
    },
    async (request) => service.updatePreferencesByToken(request.query.token, request.body),
  )

  app.post(
    '/webhooks/brevo',
    {
      schema: {
        tags: ['Communications'],
        summary: 'Brevo delivery events',
        description:
          'Configure in Brevo as `<API URL>/api/v1/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>`.',
        querystring: z.object({ token: z.string().max(200).optional() }),
        body: z.union([
          z.record(z.string(), z.unknown()),
          z.array(z.record(z.string(), z.unknown())),
        ]),
        response: responses({ 200: z.object({ processed: z.number().int() }) }),
      },
      // Authenticated by the shared token, not by a session cookie.
      config: { csrf: false, rateLimit: { max: 600, timeWindow: '1 minute' } },
    },
    async (request) => {
      const expected = env.BREVO_WEBHOOK_TOKEN
      if (!expected || !request.query.token || !safeEqual(request.query.token, expected)) {
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook token.')
      }
      const events = Array.isArray(request.body) ? request.body : [request.body]
      let processed = 0
      for (const event of events) {
        if (await service.applyBrevoEvent(event as Parameters<typeof service.applyBrevoEvent>[0]))
          processed += 1
      }
      return { processed }
    },
  )
}
