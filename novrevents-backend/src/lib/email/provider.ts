import { env } from '../../config/env.js'

export interface OutgoingEmail {
  to: { email: string; name?: string | null }
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
  attachments?: Array<{ filename: string; content: Buffer }>
  tags?: string[]
}

export interface EmailProvider {
  readonly name: string
  send(email: OutgoingEmail): Promise<{ providerMessageId: string | null }>
}

/** `retryable` tells the outbox whether another attempt could succeed. */
export class EmailSendError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.name = 'EmailSendError'
    this.retryable = retryable
  }
}

/**
 * Brevo transactional email (https://developers.brevo.com/reference/sendtransacemail).
 * Uses the HTTPS API directly so no SDK dependency is needed.
 */
export class BrevoProvider implements EmailProvider {
  readonly name = 'brevo'
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string | null }> {
    const payload: Record<string, unknown> = {
      sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
      to: [{ email: email.to.email, ...(email.to.name ? { name: email.to.name } : {}) }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
    }
    if (env.EMAIL_REPLY_TO) payload.replyTo = { email: env.EMAIL_REPLY_TO }
    if (email.headers && Object.keys(email.headers).length > 0) payload.headers = email.headers
    if (email.tags?.length) payload.tags = email.tags
    if (email.attachments?.length) {
      payload.attachment = email.attachments.map((file) => ({
        name: file.filename,
        content: file.content.toString('base64'),
      }))
    }

    let response: Response
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      throw new EmailSendError(`Brevo request failed: ${(error as Error).message}`, true)
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      // 429 and 5xx are transient; 4xx means the request itself is wrong (bad key, invalid address…).
      const retryable = response.status === 429 || response.status >= 500
      throw new EmailSendError(
        `Brevo responded ${response.status}: ${body.slice(0, 300)}`,
        retryable,
      )
    }

    const result = (await response.json().catch(() => ({}))) as { messageId?: string }
    return { providerMessageId: result.messageId ?? null }
  }
}

/**
 * Development/test provider: nothing leaves the machine. The message is still stored in the
 * `messages` table by the outbox, and the outbox logs its subject and text body.
 */
export class LogProvider implements EmailProvider {
  readonly name = 'log'

  async send(): Promise<{ providerMessageId: string | null }> {
    return { providerMessageId: null }
  }
}

export function createEmailProvider(): EmailProvider {
  if (env.EMAIL_DRIVER === 'brevo' && env.BREVO_API_KEY) return new BrevoProvider(env.BREVO_API_KEY)
  return new LogProvider()
}
