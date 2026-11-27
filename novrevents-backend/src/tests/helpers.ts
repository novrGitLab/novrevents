import { sha256 } from '../lib/crypto.js'
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { prisma } from '../lib/db.js'
import { POLICY_VERSION } from '../config/policy.js'

export const ORIGIN = 'http://localhost:3100'
export const PASSWORD = 'correct-horse-battery-staple'
/** Sign-up consent, as the web app sends it after the person ticks the box. */
export const CONSENT = { acceptTerms: true as const, policyVersion: POLICY_VERSION }

let counter = 0
const suffix = () =>
  `${Date.now().toString(36)}${(counter += 1).toString(36)}${randomBytes(3).toString('hex')}`

export const uniqueEmail = (prefix = 'user') => `${prefix}-${suffix()}@example.test`
export const uniqueUsername = (prefix = 'user') =>
  `${prefix}-${suffix()}`.slice(0, 30).replace(/-$/, 'x')

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp()
  await app.ready()
  return app
}

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  headers: Record<string, string | string[] | number | undefined>
  raw: Buffer
}

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  /** Send as multipart/form-data. `files` entries become file parts; `fields` become text parts. */
  multipart?: {
    fields?: Record<string, string>
    files?: Array<{ field: string; filename: string; contentType: string; content: Buffer }>
  }
  /** Skip the CSRF header and/or Origin to test the protections themselves. */
  csrf?: boolean
  origin?: string | null
}

/** A browser-like API client: keeps the session cookie and sends the CSRF token and Origin. */
export class TestClient {
  private cookie: string | null = null
  csrfToken: string | null = null

  constructor(private readonly app: FastifyInstance) {}

  get sessionCookie(): string | null {
    return this.cookie
  }

  setSessionCookie(value: string | null): void {
    this.cookie = value
  }

  async request<T = unknown>(
    method: string,
    url: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...options.headers }
    if (options.origin !== null) headers.origin = options.origin ?? ORIGIN
    if (this.cookie) headers.cookie = `novr_session=${this.cookie}`
    if (options.csrf !== false && this.csrfToken) headers['x-csrf-token'] = this.csrfToken

    let payload: string | Buffer | undefined
    if (options.multipart) {
      const boundary = `----novrtest${randomBytes(8).toString('hex')}`
      const chunks: Buffer[] = []
      for (const [name, value] of Object.entries(options.multipart.fields ?? {})) {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
          ),
        )
      }
      for (const file of options.multipart.files ?? []) {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
          ),
          file.content,
          Buffer.from('\r\n'),
        )
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`))
      payload = Buffer.concat(chunks)
      headers['content-type'] = `multipart/form-data; boundary=${boundary}`
    } else if (options.body !== undefined) {
      payload = JSON.stringify(options.body)
      headers['content-type'] = 'application/json'
    }

    const query = options.query
      ? Object.fromEntries(
          Object.entries(options.query)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )
      : undefined

    const response = await this.app.inject({
      method: method as 'GET',
      url,
      headers,
      payload,
      query,
    })

    for (const cookie of response.cookies) {
      if (cookie.name === 'novr_session') this.cookie = cookie.value || null
    }

    let body: unknown = null
    const contentType = String(response.headers['content-type'] ?? '')
    if (contentType.includes('application/json') && response.body) body = JSON.parse(response.body)
    else if (contentType.startsWith('text/')) body = response.body

    const maybeToken = (body as { csrfToken?: string | null } | null)?.csrfToken
    if (typeof maybeToken === 'string') this.csrfToken = maybeToken

    return {
      status: response.statusCode,
      body: body as T,
      headers: response.headers,
      raw: response.rawPayload,
    }
  }

  get<T = unknown>(url: string, options?: RequestOptions) {
    return this.request<T>('GET', url, options)
  }
  async registerLegacy<T = unknown>(body: Record<string, unknown>) {
    const email = String(body.email).trim().toLowerCase()
    const proof = randomBytes(32).toString('hex')
    const data = {
      challengeId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 60000),
      sentAt: new Date(),
      codeHash: 'fixture',
      proofHash: sha256(proof),
    }
    await prisma.emailEntry.upsert({ where: { email }, create: { email, ...data }, update: data })
    return this.post<T>('/api/v1/auth/register', { ...body, proof })
  }
  post<T = unknown>(url: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', url, { ...options, body })
  }
  put<T = unknown>(url: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', url, { ...options, body })
  }
  patch<T = unknown>(url: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', url, { ...options, body })
  }
  delete<T = unknown>(url: string, options?: RequestOptions) {
    return this.request<T>('DELETE', url, options)
  }
}

export interface TestUser {
  id: string
  email: string
  username: string
  displayName: string
  password: string
  client: TestClient
}

/** Registers an account through the API and returns a signed-in client for it. */
export async function createUser(
  app: FastifyInstance,
  options: { verified?: boolean; admin?: boolean; displayName?: string; prefix?: string } = {},
): Promise<TestUser> {
  const client = new TestClient(app)
  const email = uniqueEmail(options.prefix)
  const username = uniqueUsername(options.prefix)
  const displayName = options.displayName ?? `Test ${username}`
  const response = await client.registerLegacy<{ user: { id: string } }>({
    email,
    username,
    displayName,
    password: PASSWORD,
    ...CONSENT,
  })
  if (response.status !== 201) {
    throw new Error(`createUser failed: ${response.status} ${JSON.stringify(response.body)}`)
  }
  const id = response.body.user.id
  if (options.verified !== false || options.admin) {
    await prisma.user.update({
      where: { id },
      data: {
        ...(options.verified !== false ? { emailVerifiedAt: new Date() } : {}),
        ...(options.admin ? { role: 'ADMIN' } : {}),
      },
    })
  }
  return { id, email, username, displayName, password: PASSWORD, client }
}

/** Extracts the one-time token from the most recent email of a given type sent to an address. */
export async function latestEmailToken(email: string, type: string): Promise<string> {
  const message = await prisma.message.findFirst({
    where: { toEmail: email, type: type as 'EMAIL_VERIFICATION' },
    orderBy: { createdAt: 'desc' },
  })
  const token = message?.bodyText.match(/[?&]token=([A-Za-z0-9_.-]+)/)?.[1]
  if (!token) throw new Error(`No ${type} email with a token found for ${email}`)
  return token
}

export async function emailsTo(email: string) {
  return prisma.message.findMany({ where: { toEmail: email }, orderBy: { createdAt: 'asc' } })
}

export const errorCode = (response: ApiResponse) =>
  (response.body as { error?: { code?: string } } | null)?.error?.code

// ─── Event helpers ───────────────────────────────────────────────────────────

export const inDays = (days: number, hours = 0) =>
  new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString()

let cachedCategoryId: string | null = null
export async function categoryId(slug = 'application-security'): Promise<string> {
  if (slug === 'application-security' && cachedCategoryId) return cachedCategoryId
  const category = await prisma.eventCategory.findUniqueOrThrow({ where: { slug } })
  if (slug === 'application-security') cachedCategoryId = category.id
  return category.id
}

export interface ManagedEvent {
  id: string
  slug: string
  title: string
  status: string
  effectiveStatus: string
  visibility: string
  registeredCount: number
  capacity: number | null
  registrationFormId: string | null
  privateLink: string | null
  role: string
}

/** A complete, publishable in-person event. Override any field. */
export async function eventPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: `Blue Team Summit ${Math.random().toString(36).slice(2, 8)}`,
    summary: 'A day of detection engineering talks.',
    description:
      'Talks and hands-on labs covering detection engineering, incident response and threat hunting.',
    categoryId: await categoryId(),
    eventType: 'CONFERENCE',
    mode: 'IN_PERSON',
    startsAt: inDays(30),
    endsAt: inDays(30, 8),
    timezone: 'Africa/Lagos',
    venueName: 'Innovation Hub',
    city: 'Abuja',
    country: 'Nigeria',
    ...overrides,
  }
}

export async function createDraftEvent(
  user: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<ManagedEvent> {
  const response = await user.client.post<ManagedEvent>(
    '/api/v1/events',
    await eventPayload(overrides),
  )
  if (response.status !== 201)
    throw new Error(`createDraftEvent failed: ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

export async function createPublishedEvent(
  user: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<ManagedEvent> {
  const draft = await createDraftEvent(user, overrides)
  const response = await user.client.post<ManagedEvent>(`/api/v1/events/${draft.id}/publish`)
  if (response.status !== 200)
    throw new Error(`publish failed: ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

// ─── Form helpers ────────────────────────────────────────────────────────────

export interface FormDetail {
  id: string
  slug: string
  status: string
  purpose: string
  isRegistrationForm: boolean
  publishedVersion: number | null
  draftVersion: number | null
  counts: { received: number; qualifying: number; excluded: number }
  definition: { steps: unknown[]; fields: Array<{ key: string }>; rules: unknown[] }
}

/** Creates a form, saves `definition` as its draft, applies `settings`, and publishes it. */
export async function createPublishedForm(
  user: TestUser,
  options: {
    title?: string
    purpose?: string
    eventId?: string
    definition?: Record<string, unknown>
    settings?: Record<string, unknown>
  } = {},
): Promise<FormDetail> {
  const created = await user.client.post<FormDetail>('/api/v1/forms', {
    title: options.title ?? 'Test form',
    purpose: options.purpose ?? 'GENERAL',
    eventId: options.eventId,
  })
  if (created.status !== 201)
    throw new Error(`create form failed: ${created.status} ${JSON.stringify(created.body)}`)
  if (options.definition) {
    const saved = await user.client.put(
      `/api/v1/forms/${created.body.id}/draft`,
      options.definition,
    )
    if (saved.status !== 200)
      throw new Error(`save draft failed: ${saved.status} ${JSON.stringify(saved.body)}`)
  }
  if (options.settings) {
    const updated = await user.client.patch(`/api/v1/forms/${created.body.id}`, options.settings)
    if (updated.status !== 200)
      throw new Error(`settings failed: ${updated.status} ${JSON.stringify(updated.body)}`)
  }
  const published = await user.client.post<FormDetail>(`/api/v1/forms/${created.body.id}/publish`)
  if (published.status !== 200)
    throw new Error(`publish form failed: ${published.status} ${JSON.stringify(published.body)}`)
  return published.body
}

export interface SubmitResult {
  status: string
  message: string
  registration: { status: string; manageUrl: string } | null
}

/** Submits as an anonymous guest unless a client is passed. */
export function submit(
  app: FastifyInstance,
  slug: string,
  answers: Record<string, unknown>,
  options: {
    client?: TestClient
    idempotencyKey?: string
    ticketTypeId?: string
    versionId?: string
  } = {},
) {
  const client = options.client ?? new TestClient(app)
  return client.post<SubmitResult>(`/api/v1/public/forms/${slug}/submissions`, {
    answers,
    idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    ticketTypeId: options.ticketTypeId,
    versionId: options.versionId,
  })
}

/** Creates a published event with a published registration form. */
export async function createEventWithRegistration(
  user: TestUser,
  options: {
    event?: Record<string, unknown>
    settings?: Record<string, unknown>
    definition?: Record<string, unknown>
  } = {},
) {
  const event = await createPublishedEvent(user, options.event)
  const form = await createPublishedForm(user, {
    title: 'Registration',
    purpose: 'REGISTRATION',
    eventId: event.id,
    definition: options.definition,
    settings: options.settings,
  })
  return { event, form }
}
