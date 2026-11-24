// Phase 2B: public event access, calendar export, guest ticket access and public profile privacy.
// Real PostgreSQL, real sessions.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  createDraftEvent,
  createEventWithRegistration,
  createPublishedEvent,
  createTestApp,
  createUser,
  errorCode,
  submit,
  TestClient,
  type TestUser,
  uniqueEmail,
} from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

/** Calendar lines of a response body, unfolded (RFC 5545 continuation lines start with a space). */
function unfold(text: string): string {
  return text.replace(/\r\n /g, '')
}

describe('calendar export (.ics)', () => {
  it('describes the event in UTC, names its timezone, and leaks no contact or join details', async () => {
    const owner = await createUser(app)
    const event = await createPublishedEvent(owner, {
      title: 'Calendar, test; event',
      organizerEmail: 'secret-contact@example.test',
      onlineUrl: 'https://meet.example.test/private-join-link',
      mode: 'HYBRID',
      timezone: 'Africa/Lagos',
    })

    const response = await new TestClient(app).get<string>(
      `/api/v1/public/events/${event.slug}/calendar.ics`,
    )
    expect(response.status).toBe(200)
    expect(String(response.headers['content-type'])).toContain('text/calendar')
    expect(String(response.headers['content-disposition'])).toContain('attachment')

    const text = unfold(response.raw.toString('utf8'))
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain(`UID:${event.id}@novr-events`)
    expect(text).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(text).toContain('SUMMARY:Calendar\\, test\\; event')
    expect(text).toContain('Africa/Lagos')
    expect(text).toContain('STATUS:CONFIRMED')
    expect(text).not.toContain('secret-contact@example.test')
    expect(text).not.toContain('private-join-link')
  })

  it('hides drafts, removed events and private events without their key', async () => {
    const owner = await createUser(app)
    const client = new TestClient(app)

    const draft = await createDraftEvent(owner)
    expect((await client.get(`/api/v1/public/events/${draft.slug}/calendar.ics`)).status).toBe(404)

    const removed = await createPublishedEvent(owner)
    await prisma.event.update({ where: { id: removed.id }, data: { moderationStatus: 'REMOVED' } })
    expect((await client.get(`/api/v1/public/events/${removed.slug}/calendar.ics`)).status).toBe(
      404,
    )

    const priv = await createPublishedEvent(owner, { visibility: 'PRIVATE' })
    expect((await client.get(`/api/v1/public/events/${priv.slug}/calendar.ics`)).status).toBe(404)
    const withKey = await prisma.event.findUniqueOrThrow({ where: { id: priv.id } })
    expect(
      (await client.get(`/api/v1/public/events/${priv.slug}/calendar.ics?key=${withKey.accessKey}`))
        .status,
    ).toBe(200)
    expect(
      (await client.get(`/api/v1/public/events/${priv.slug}/calendar.ics?key=wrong`)).status,
    ).toBe(404)
  })

  it('marks a cancelled event as cancelled, so calendars remove it', async () => {
    const owner = await createUser(app)
    const event = await createPublishedEvent(owner)
    const cancelled = await owner.client.post(`/api/v1/events/${event.id}/cancel`, {
      reason: 'Venue unavailable',
      notifyAttendees: false,
    })
    expect(cancelled.status).toBe(200)
    const response = await new TestClient(app).get<string>(
      `/api/v1/public/events/${event.slug}/calendar.ics`,
    )
    expect(response.raw.toString('utf8')).toContain('STATUS:CANCELLED')
  })
})

describe('guest ticket access', () => {
  async function guestRegistration(owner: TestUser) {
    const { event, form } = await createEventWithRegistration(owner)
    const email = uniqueEmail('guest')
    const result = await submit(app, form.slug, { full_name: 'Guest Example', email })
    expect(result.status).toBeLessThan(300)
    const body = result.body as { registration?: { manageUrl: string } | null }
    const token = body.registration?.manageUrl.split('/r/')[1] ?? ''
    expect(token).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/)
    return { event, form, token }
  }

  it('gives a guest their ticket through a random, signed link without an account', async () => {
    const owner = await createUser(app)
    const { token } = await guestRegistration(owner)
    const response = await new TestClient(app).get(
      `/api/v1/public/registrations/${token}/ticket?format=svg`,
    )
    expect(response.status).toBe(200)
    expect(String(response.headers['content-type'])).toContain('image/svg+xml')
  })

  it('rejects a link whose signature has been changed, or that belongs to another registration', async () => {
    const owner = await createUser(app)
    const first = await guestRegistration(owner)
    const second = await guestRegistration(owner)
    const client = new TestClient(app)

    const [id, signature] = first.token.split('.') as [string, string]
    const tampered = `${id}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`
    expect((await client.get(`/api/v1/public/registrations/${tampered}`)).status).toBe(404)

    // The second registration's id with the first registration's signature.
    const [, secondSignature] = second.token.split('.') as [string, string]
    const swapped = `${id}.${secondSignature}`
    expect((await client.get(`/api/v1/public/registrations/${swapped}`)).status).toBe(404)
    expect((await client.get(`/api/v1/public/registrations/not-a-token`)).status).toBe(400)
  })

  it('stops the ticket working once the guest cancels, and rejects it as void', async () => {
    const owner = await createUser(app)
    const { token } = await guestRegistration(owner)
    const client = new TestClient(app)
    expect(
      (await client.get(`/api/v1/public/registrations/${token}/ticket?format=svg`)).status,
    ).toBe(200)

    const cancelled = await client.post(`/api/v1/public/registrations/${token}/cancel`)
    expect(cancelled.status).toBe(200)

    const after = await client.get(`/api/v1/public/registrations/${token}/ticket?format=svg`)
    expect(after.status).toBe(409)
    expect(errorCode(after)).toBe('TICKET_VOID')
  })

  it('does not let a signed-in person read another person’s registration or ticket', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const intruder = await createUser(app)
    const { event, form } = await createEventWithRegistration(owner)
    const result = await submit(
      app,
      form.slug,
      { full_name: attendee.displayName, email: attendee.email },
      {
        client: attendee.client,
      },
    )
    expect(result.status).toBeLessThan(300)
    const registration = await prisma.registration.findFirstOrThrow({
      where: { eventId: event.id, userId: attendee.id },
    })

    expect((await attendee.client.get(`/api/v1/me/registrations/${registration.id}`)).status).toBe(
      200,
    )
    expect((await intruder.client.get(`/api/v1/me/registrations/${registration.id}`)).status).toBe(
      404,
    )
    expect(
      (await intruder.client.get(`/api/v1/me/registrations/${registration.id}/ticket`)).status,
    ).toBe(404)
    expect((await new TestClient(app).get('/api/v1/me/registrations')).status).toBe(401)
  })
})

describe('public profile privacy', () => {
  it('never shows the account email on a public profile', async () => {
    const user = await createUser(app)
    await user.client.patch('/api/v1/profiles/me', {
      publicFields: ['avatar', 'headline', 'bio', 'socialLinks'],
      headline: 'Visible headline',
    })
    const response = await new TestClient(app).get(`/api/v1/profiles/${user.username}`)
    expect(response.status).toBe(200)
    expect(JSON.stringify(response.body)).not.toContain(user.email)
  })

  it('shows registered events to followers only after the owner opts in, and never registration answers', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const follower = await createUser(app)
    const { event, form } = await createEventWithRegistration(owner)
    await submit(
      app,
      form.slug,
      { full_name: attendee.displayName, email: attendee.email },
      {
        client: attendee.client,
      },
    )
    await attendee.client.patch('/api/v1/profiles/me', { shareRegistrations: true })
    await follower.client.post(`/api/v1/profiles/${attendee.username}/follow`)

    const anonymous = await new TestClient(app).get<{ visible: boolean; items: unknown[] }>(
      `/api/v1/profiles/${attendee.username}/registered-events`,
    )
    expect(anonymous.body.visible).toBe(false)

    const shown = await follower.client.get<{
      visible: boolean
      items: Array<Record<string, unknown>>
    }>(`/api/v1/profiles/${attendee.username}/registered-events`)
    expect(shown.body.visible).toBe(true)
    expect(shown.body.items.map((item) => item.slug)).toContain(event.slug)
    const serialised = JSON.stringify(shown.body)
    expect(serialised).not.toContain(attendee.email)
    expect(serialised).not.toContain('full_name')
  })
})
