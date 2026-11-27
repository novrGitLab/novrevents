// Phase 1: sign-up consent, one-time welcome, unauthenticated verification resend, organiser contact
// privacy and minimal profile defaults. Runs against real PostgreSQL.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { POLICY_VERSION } from '../config/policy.js'
import { prisma } from '../lib/db.js'
import {
  createEventWithRegistration,
  createPublishedEvent,
  createTestApp,
  createUser,
  CONSENT,
  errorCode,
  PASSWORD,
  submit,
  TestClient,
  uniqueEmail,
  uniqueUsername,
} from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

interface SessionBody {
  authenticated: boolean
  user: { id: string; onboarded: boolean; emailVerified: boolean } | null
}

const signUp = (client: TestClient, body: Record<string, unknown>) =>
  client.registerLegacy<SessionBody>({
    email: uniqueEmail('consent'),
    username: uniqueUsername('consent'),
    displayName: 'Consent Example',
    password: PASSWORD,
    ...body,
  })

describe('sign-up consent', () => {
  it('refuses to create an account without accepted terms', async () => {
    const email = uniqueEmail('noconsent')
    const response = await signUp(new TestClient(app), { email, policyVersion: POLICY_VERSION })
    expect(response.status).toBe(400)
    expect(await prisma.user.count({ where: { email } })).toBe(0)
  })

  it('refuses an explicit refusal of the terms', async () => {
    const response = await signUp(new TestClient(app), {
      acceptTerms: false,
      policyVersion: POLICY_VERSION,
    })
    expect(response.status).toBe(400)
  })

  it('refuses consent to a policy version other than the current one', async () => {
    const response = await signUp(new TestClient(app), {
      acceptTerms: true,
      policyVersion: '1999-01-01',
    })
    expect(response.status).toBe(400)
  })

  it('records acceptance with the policy version and a server timestamp', async () => {
    const before = Date.now()
    const email = uniqueEmail('recorded')
    const response = await signUp(new TestClient(app), { email, ...CONSENT })
    expect(response.status).toBe(201)

    const row = await prisma.user.findUniqueOrThrow({ where: { email } })
    expect(row.termsVersion).toBe(POLICY_VERSION)
    expect(row.termsAcceptedAt).not.toBeNull()
    expect(row.termsAcceptedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('creates new accounts as not yet onboarded', async () => {
    const response = await signUp(new TestClient(app), { ...CONSENT })
    expect(response.status).toBe(201)
    expect(response.body.user?.onboarded).toBe(false)
  })
})

describe('one-time welcome', () => {
  it('requires a signed-in session to finish onboarding', async () => {
    const response = await new TestClient(app).post('/api/v1/me/onboarding')
    expect(response.status).toBe(401)
  })

  it('marks the welcome as done, reports it in the session, and keeps the first time', async () => {
    const user = await createUser(app)
    const first = await user.client.post('/api/v1/me/onboarding')
    expect(first.status).toBe(200)

    const session = await user.client.get<SessionBody>('/api/v1/auth/session')
    expect(session.body.user?.onboarded).toBe(true)

    const stamp = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    const again = await user.client.post('/api/v1/me/onboarding')
    expect(again.status).toBe(200)
    const later = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(later.onboardedAt?.getTime()).toBe(stamp.onboardedAt?.getTime())
  })
})

describe('unauthenticated verification resend', () => {
  it('answers the same way for unknown, verified and unverified addresses', async () => {
    const unknown = await new TestClient(app).post('/api/v1/auth/resend-verification-by-email', {
      email: uniqueEmail('nobody'),
    })
    const verified = await createUser(app)
    const verifiedResponse = await new TestClient(app).post(
      '/api/v1/auth/resend-verification-by-email',
      { email: verified.email },
    )
    const unverified = await createUser(app, { verified: false })
    const unverifiedResponse = await new TestClient(app).post(
      '/api/v1/auth/resend-verification-by-email',
      { email: unverified.email },
    )

    expect(unknown.status).toBe(200)
    expect(verifiedResponse.status).toBe(200)
    expect(unverifiedResponse.status).toBe(200)
    expect(unknown.body).toEqual(verifiedResponse.body)
    expect(unknown.body).toEqual(unverifiedResponse.body)
  })

  it('emails a new link only to an unverified account', async () => {
    const unverified = await createUser(app, { verified: false })
    // Registration already emailed one link; age it past the cooldown so this resend is allowed.
    await prisma.authToken.updateMany({
      where: { userId: unverified.id },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    })
    const before = await prisma.message.count({
      where: { toEmail: unverified.email, type: 'EMAIL_VERIFICATION' },
    })
    await new TestClient(app).post('/api/v1/auth/resend-verification-by-email', {
      email: unverified.email,
    })
    const after = await prisma.message.count({
      where: { toEmail: unverified.email, type: 'EMAIL_VERIFICATION' },
    })
    expect(after).toBe(before + 1)
  })

  it('never emails a verified account', async () => {
    const verified = await createUser(app)
    const before = await prisma.message.count({ where: { toEmail: verified.email } })
    await new TestClient(app).post('/api/v1/auth/resend-verification-by-email', {
      email: verified.email,
    })
    expect(await prisma.message.count({ where: { toEmail: verified.email } })).toBe(before)
  })

  it('sends at most one email within the cooldown window', async () => {
    const unverified = await createUser(app, { verified: false })
    const client = new TestClient(app)
    await client.post('/api/v1/auth/resend-verification-by-email', { email: unverified.email })
    await client.post('/api/v1/auth/resend-verification-by-email', { email: unverified.email })
    await client.post('/api/v1/auth/resend-verification-by-email', { email: unverified.email })
    expect(
      await prisma.message.count({
        where: { toEmail: unverified.email, type: 'EMAIL_VERIFICATION' },
      }),
    ).toBe(1)
  })

  it('validates the address format', async () => {
    const response = await new TestClient(app).post('/api/v1/auth/resend-verification-by-email', {
      email: 'not-an-address',
    })
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('VALIDATION_ERROR')
  })
})

describe('organiser contact privacy', () => {
  it('hides the organiser email on the public page unless it is designated public', async () => {
    const owner = await createUser(app)
    const event = await createPublishedEvent(owner, { organizerEmail: 'contact@example.test' })

    const pub = await new TestClient(app).get<{ organizerEmail: string | null }>(
      `/api/v1/public/events/${event.slug}`,
    )
    expect(pub.status).toBe(200)
    expect(pub.body.organizerEmail).toBeNull()

    // The organiser still sees their own address.
    const manage = await owner.client.get<{
      organizerEmail: string | null
      organizerEmailPublic: boolean
    }>(`/api/v1/events/${event.id}`)
    expect(manage.body.organizerEmail).toBe('contact@example.test')
    expect(manage.body.organizerEmailPublic).toBe(false)
  })

  it('shows the email publicly once the organiser designates it as public contact', async () => {
    const owner = await createUser(app)
    const event = await createPublishedEvent(owner, { organizerEmail: 'contact@example.test' })
    const updated = await owner.client.patch(`/api/v1/events/${event.id}`, {
      organizerEmailPublic: true,
    })
    expect(updated.status).toBe(200)

    const pub = await new TestClient(app).get<{ organizerEmail: string | null }>(
      `/api/v1/public/events/${event.slug}`,
    )
    expect(pub.body.organizerEmail).toBe('contact@example.test')
  })
})

describe('minimal profile defaults', () => {
  it('gives new profiles a public headline only', async () => {
    const user = await createUser(app)
    const profile = await user.client.get<{
      visibility: string
      publicFields: string[]
      shareRegistrations: boolean
    }>('/api/v1/profiles/me')
    expect(profile.body.visibility).toBe('PUBLIC')
    expect(profile.body.publicFields).toEqual(['headline'])
    expect(profile.body.shareRegistrations).toBe(false)
  })
})

describe('organiser contact privacy for attendees', () => {
  it('shows an attendee the organiser email only once it is designated public', async () => {
    const owner = await createUser(app)
    const { event, form } = await createEventWithRegistration(owner, {
      event: { organizerEmail: 'contact@example.test' },
    })
    const attendee = await createUser(app)
    const registered = await submit(
      app,
      form.slug,
      { full_name: 'Attendee Example', email: attendee.email },
      { client: attendee.client },
    )
    expect(registered.status).toBeLessThan(300)

    const hidden = await attendee.client.get<{
      items: Array<{ event: { slug: string; organizerEmail: string | null } }>
    }>('/api/v1/me/registrations')
    const mine = hidden.body.items.find((item) => item.event.slug === event.slug)
    expect(mine?.event.organizerEmail).toBeNull()

    await owner.client.patch(`/api/v1/events/${event.id}`, { organizerEmailPublic: true })
    const shown = await attendee.client.get<{
      items: Array<{ event: { slug: string; organizerEmail: string | null } }>
    }>('/api/v1/me/registrations')
    expect(
      shown.body.items.find((item) => item.event.slug === event.slug)?.event.organizerEmail,
    ).toBe('contact@example.test')
  })
})
