import type { FastifyBaseLogger } from 'fastify'
import { appUrl, env } from '../../config/env.js'
import { signValue, verifySignedValue } from '../../lib/crypto.js'
import { Prisma, prisma, type Db } from '../../lib/db.js'
import {
  createEmailProvider,
  EmailSendError,
  type EmailProvider,
} from '../../lib/email/provider.js'
import { renderEmail, type EmailContent } from '../../lib/email/render.js'
import type { MessageStatus, MessageType } from '../../generated/prisma/client.js'

/**
 * How a message relates to the recipient's preferences:
 *  TRANSACTIONAL  a direct result of something the recipient did, or a service-critical notice
 *                 (verification, receipts, tickets, cancellations). Always sent.
 *  REMINDER / ANNOUNCEMENT / INVITATION  optional mail. Skipped when the address has opted out
 *                 of that category or unsubscribed from everything.
 */
export type MessageCategory = 'TRANSACTIONAL' | 'REMINDER' | 'ANNOUNCEMENT' | 'INVITATION'

export const MESSAGE_CATEGORY: Record<MessageType, MessageCategory> = {
  EMAIL_VERIFICATION: 'TRANSACTIONAL',
  PASSWORD_RESET: 'TRANSACTIONAL',
  ACCOUNT_NOTICE: 'TRANSACTIONAL',
  SUBMISSION_RECEIPT: 'TRANSACTIONAL',
  REGISTRATION_CONFIRMATION: 'TRANSACTIONAL',
  REGISTRATION_PENDING: 'TRANSACTIONAL',
  REGISTRATION_DECLINED: 'TRANSACTIONAL',
  REGISTRATION_CANCELLED: 'TRANSACTIONAL',
  TICKET_DELIVERY: 'TRANSACTIONAL',
  EVENT_CANCELLATION: 'TRANSACTIONAL',
  CERTIFICATE_ISSUED: 'TRANSACTIONAL',
  EVENT_REMINDER: 'REMINDER',
  EVENT_UPDATE: 'ANNOUNCEMENT',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  SPEAKER_INVITATION: 'INVITATION',
  VOLUNTEER_INVITATION: 'INVITATION',
}

const MAX_ATTEMPTS = 5
const STUCK_AFTER_MS = 10 * 60 * 1000

let provider: EmailProvider = createEmailProvider()
let logger: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'> | null = null

export function configureOutbox(options: {
  logger?: typeof logger
  provider?: EmailProvider
}): void {
  if (options.logger !== undefined) logger = options.logger
  if (options.provider) provider = options.provider
}

// ─── Unsubscribe links ───────────────────────────────────────────────────────

export function unsubscribeTokenFor(email: string): string {
  return signValue('unsubscribe', Buffer.from(email.toLowerCase()).toString('base64url'))
}

export function emailFromUnsubscribeToken(token: string): string | null {
  const payload = verifySignedValue('unsubscribe', token)
  if (!payload) return null
  const email = Buffer.from(payload, 'base64url').toString('utf8')
  return email.includes('@') ? email : null
}

export function unsubscribeUrlFor(email: string): string {
  return `${appUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeTokenFor(email))}`
}

export async function isSuppressed(
  db: Db,
  email: string,
  category: MessageCategory,
): Promise<boolean> {
  if (category === 'TRANSACTIONAL') return false
  const preference = await db.emailPreference.findUnique({ where: { email: email.toLowerCase() } })
  if (!preference) return false
  if (preference.unsubscribedAllAt) return true
  if (category === 'REMINDER') return !preference.reminders
  if (category === 'ANNOUNCEMENT') return !preference.announcements
  return !preference.invitations
}

// ─── Queueing ────────────────────────────────────────────────────────────────

export interface EmailAttachmentRef {
  kind: string
  id: string
}

export interface QueueEmailInput {
  type: MessageType
  to: { email: string; name?: string | null }
  /** Receives the unsubscribe link (null for transactional mail) and returns the content. */
  content: (context: { unsubscribeUrl: string | null }) => EmailContent
  userId?: string | null
  eventId?: string | null
  registrationId?: string | null
  campaignId?: string | null
  attachments?: EmailAttachmentRef[]
  scheduledFor?: Date
}

/**
 * Writes a message to the outbox. It is sent by the background worker, never inline, so a slow or
 * failing email provider cannot break the request that triggered it. Pass the transaction client
 * to make the email atomic with the change that caused it.
 */
export async function queueEmail(
  db: Db,
  input: QueueEmailInput,
): Promise<{ id: string; status: MessageStatus }> {
  const email = input.to.email.toLowerCase()
  const category = MESSAGE_CATEGORY[input.type]
  const suppressed = await isSuppressed(db, email, category)
  const unsubscribeUrl = category === 'TRANSACTIONAL' ? null : unsubscribeUrlFor(email)
  const rendered = renderEmail({ ...input.content({ unsubscribeUrl }), unsubscribeUrl })

  const data: Prisma.InputJsonValue | typeof Prisma.JsonNull = input.attachments?.length
    ? ({ attachments: input.attachments, unsubscribeUrl } as unknown as Prisma.InputJsonValue)
    : unsubscribeUrl
      ? { unsubscribeUrl }
      : Prisma.JsonNull

  return db.message.create({
    data: {
      type: input.type,
      // Suppressed messages are recorded (so the organiser can see why nothing was sent) but never leave.
      status: suppressed ? 'SUPPRESSED' : 'QUEUED',
      toEmail: email,
      toName: input.to.name ?? null,
      userId: input.userId ?? null,
      eventId: input.eventId ?? null,
      registrationId: input.registrationId ?? null,
      campaignId: input.campaignId ?? null,
      subject: rendered.subject,
      bodyText: rendered.text,
      bodyHtml: rendered.html,
      data,
      scheduledFor: input.scheduledFor ?? new Date(),
    },
    select: { id: true, status: true },
  })
}

// ─── Attachments ─────────────────────────────────────────────────────────────

type AttachmentResolver = (id: string) => Promise<{ filename: string; content: Buffer } | null>
const attachmentResolvers = new Map<string, AttachmentResolver>()

/** Lets a domain module (e.g. tickets) supply attachments without the outbox depending on it. */
export function registerEmailAttachment(kind: string, resolver: AttachmentResolver): void {
  attachmentResolvers.set(kind, resolver)
}

async function resolveAttachments(
  data: unknown,
): Promise<Array<{ filename: string; content: Buffer }>> {
  const refs = (data as { attachments?: EmailAttachmentRef[] } | null)?.attachments ?? []
  const files: Array<{ filename: string; content: Buffer }> = []
  for (const ref of refs) {
    const file = await attachmentResolvers.get(ref.kind)?.(ref.id)
    if (file) files.push(file)
  }
  return files
}

// ─── Delivery ────────────────────────────────────────────────────────────────

function backoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 30_000 * 2 ** (attempt - 1))
}

/**
 * Sends due messages. Rows are claimed with FOR UPDATE SKIP LOCKED, so several workers can run
 * this concurrently without sending a message twice.
 */
export async function flushOutbox(options: { limit?: number; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 25

  // Recover messages left in SENDING by a worker that died mid-send.
  await prisma.message.updateMany({
    where: { status: 'SENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
    data: { status: 'QUEUED' },
  })

  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE messages
       SET status = 'SENDING', attempts = attempts + 1, updated_at = now()
     WHERE id IN (
       SELECT id FROM messages
        WHERE status = 'QUEUED' AND scheduled_for <= ${now}
        ORDER BY scheduled_for
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id`

  let sent = 0
  for (const { id } of claimed) {
    const message = await prisma.message.findUnique({ where: { id } })
    if (!message) continue
    try {
      const unsubscribeUrl = (message.data as { unsubscribeUrl?: string } | null)?.unsubscribeUrl
      const result = await provider.send({
        to: { email: message.toEmail, name: message.toName },
        subject: message.subject,
        html: message.bodyHtml,
        text: message.bodyText,
        attachments: await resolveAttachments(message.data),
        tags: [message.type],
        headers: unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>` } : undefined,
      })
      await prisma.message.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          provider: provider.name,
          providerMessageId: result.providerMessageId,
          errorMessage: null,
        },
      })
      sent += 1
      if (provider.name === 'log' && env.NODE_ENV === 'development') {
        logger?.info(
          { to: message.toEmail, subject: message.subject },
          `email (log driver, not sent)\n${message.bodyText}`,
        )
      }
    } catch (error) {
      const retryable = error instanceof EmailSendError ? error.retryable : true
      const exhausted = message.attempts >= MAX_ATTEMPTS
      const errorMessage = (error as Error).message.slice(0, 500)
      await prisma.message.update({
        where: { id },
        data:
          retryable && !exhausted
            ? {
                status: 'QUEUED',
                errorMessage,
                scheduledFor: new Date(Date.now() + backoffMs(message.attempts)),
              }
            : { status: 'FAILED', errorMessage },
      })
      logger?.warn({ messageId: id, err: error }, 'email send failed')
    }
  }
  return sent
}
