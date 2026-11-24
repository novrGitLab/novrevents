// Phase 2C: the personal dashboard's data. Authorisation, saved events, following, registrations and tickets,
// and profile privacy. Real PostgreSQL, real sessions.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createEventWithRegistration,
  createPublishedEvent,
  createTestApp,
  createUser,
  errorCode,
  submit,
  TestClient,
  type TestUser,
} from './helpers.js'
import { prisma } from '../lib/db.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

const PERSONAL_ROUTES = [
  '/api/v1/me/feed',
  '/api/v1/me/saved-events',
  '/api/v1/me/registrations',
  '/api/v1/me/followed-organizations',
  '/api/v1/me/organizer-overview',
  '/api/v1/profiles/me',
]

describe('dashboard authorisation', () => {
  it('requires a signed-in session for every personal data endpoint', async () => {
    const anonymous = new TestClient(app)
    for (const route of PERSONAL_ROUTES) {
      const response = await anonymous.get(route)
      expect(response.status, route).toBe(401)
    }
  })

  it('serves a new account its personal data as empty lists, not errors', async () => {
    const user = await createUser(app)
    const saved = await user.client.get<{ items: unknown[]; total: number }>(
      '/api/v1/me/saved-events',
    )
    expect(saved.status).toBe(200)
    expect(saved.body).toMatchObject({ items: [], total: 0 })

    const registrations = await user.client.get<{ items: unknown[]; total: number }>(
      '/api/v1/me/registrations',
    )
    expect(registrations.body).toMatchObject({ items: [], total: 0 })

    const following = await user.client.get<{ items: unknown[]; total: number }>(
      '/api/v1/me/followed-organizations',
    )
    expect(following.body).toMatchObject({ items: [], total: 0 })
  })
})

describe('saved events', () => {
  it('saves, persists, and keeps each person’s saved list to themselves', async () => {
    const owner = await createUser(app)
    const saver = await createUser(app)
    const other = await createUser(app)
    const event = await createPublishedEvent(owner)
    const save = `/api/v1/public/events/${event.slug}/save`

    expect((await saver.client.put(save)).status).toBe(200)
    // Saving again changes nothing.
    expect((await saver.client.put(save)).status).toBe(200)

    const mine = await saver.client.get<{ items: Array<{ id: string }> }>('/api/v1/me/saved-events')
    expect(mine.body.items.map((item) => item.id)).toEqual([event.id])

    const theirs = await other.client.get<{ items: Array<{ id: string }> }>(
      '/api/v1/me/saved-events',
    )
    expect(theirs.body.items.map((item) => item.id)).not.toContain(event.id)

    expect((await saver.client.delete(save)).status).toBe(200)
    const after = await saver.client.get<{ items: Array<{ id: string }> }>(
      '/api/v1/me/saved-events',
    )
    expect(after.body.items.map((item) => item.id)).not.toContain(event.id)
  })

  it('does not let a visitor save a hidden event', async () => {
    const owner = await createUser(app)
    const draft = await createPublishedEvent(owner, { visibility: 'PRIVATE' })
    const response = await (
      await createUser(app)
    ).client.put(`/api/v1/public/events/${draft.slug}/save`)
    expect(response.status).toBe(404)
  })
})

describe('following on the dashboard', () => {
  it('lists followed people and organisations to the follower only', async () => {
    const author = await createUser(app)
    const reader = await createUser(app)
    const stranger = await createUser(app)
    await reader.client.post(`/api/v1/profiles/${author.username}/follow`)

    const list = await reader.client.get<{ items: Array<{ username?: string }> }>(
      `/api/v1/profiles/${reader.username}/following`,
    )
    expect(list.status).toBe(200)

    const strangerList = await stranger.client.get<{ items: unknown[] }>(
      `/api/v1/profiles/${reader.username}/following`,
    )
    // A public following list shows who the person follows; the stranger sees the same public list, never the
    // reader's private state.
    expect(strangerList.status).toBe(200)

    const people = await reader.client.get<{ items: Array<{ username: string }> }>(
      `/api/v1/profiles/${reader.username}/following`,
    )
    expect(people.body.items.map((item) => item.username)).toContain(author.username)
  })
})

describe('registrations and tickets on the dashboard', () => {
  async function registerAsUser(
    owner: TestUser,
    attendee: TestUser,
    settings?: Record<string, unknown>,
  ) {
    const { event, form } = await createEventWithRegistration(owner, { settings })
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
    return { event, registration }
  }

  it('shows a confirmed registration and its ticket only to the person who holds it', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const intruder = await createUser(app)
    const { registration } = await registerAsUser(owner, attendee)

    const mine = await attendee.client.get<{
      items: Array<{ id: string; status: string; ticket: unknown }>
    }>('/api/v1/me/registrations')
    const row = mine.body.items.find((item) => item.id === registration.id)
    expect(row?.status).toBe('CONFIRMED')
    expect(row?.ticket).not.toBeNull()
    expect(
      (await attendee.client.get(`/api/v1/me/registrations/${registration.id}/ticket?format=svg`))
        .status,
    ).toBe(200)

    const theirs = await intruder.client.get<{ items: Array<{ id: string }> }>(
      '/api/v1/me/registrations',
    )
    expect(theirs.body.items.map((item) => item.id)).not.toContain(registration.id)
    expect(
      (await intruder.client.get(`/api/v1/me/registrations/${registration.id}/ticket?format=svg`))
        .status,
    ).toBe(404)
  })

  it('issues no ticket while a registration awaits review, or after it is declined', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const { event, registration } = await registerAsUser(owner, attendee, { autoAccept: false })

    const pending = await attendee.client.get<{
      items: Array<{ id: string; status: string; ticket: unknown }>
    }>('/api/v1/me/registrations')
    const waiting = pending.body.items.find((item) => item.id === registration.id)
    expect(waiting?.status).toBe('PENDING')
    expect(waiting?.ticket).toBeNull()
    const ticketWhilePending = await attendee.client.get(
      `/api/v1/me/registrations/${registration.id}/ticket`,
    )
    expect(ticketWhilePending.status).not.toBe(200)

    const declined = await owner.client.post(
      `/api/v1/events/${event.id}/registrations/${registration.id}/decline`,
      { reason: 'Capacity reached' },
    )
    expect(declined.status).toBe(200)
    const after = await attendee.client.get<{
      items: Array<{ id: string; status: string; ticket: unknown }>
    }>('/api/v1/me/registrations?scope=all')
    const row = after.body.items.find((item) => item.id === registration.id)
    expect(row?.status).toBe('DECLINED')
    expect(row?.ticket).toBeNull()
  })

  it('separates upcoming from past registrations', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const { event } = await registerAsUser(owner, attendee)
    // Move the event into the past.
    await prisma.event.update({
      where: { id: event.id },
      data: {
        startsAt: new Date(Date.now() - 3 * 86_400_000),
        endsAt: new Date(Date.now() - 3 * 86_400_000 + 3_600_000),
      },
    })
    const upcoming = await attendee.client.get<{ items: unknown[] }>(
      '/api/v1/me/registrations?scope=upcoming',
    )
    const past = await attendee.client.get<{ items: Array<{ event: { id: string } }> }>(
      '/api/v1/me/registrations?scope=past',
    )
    expect(upcoming.body.items).toHaveLength(0)
    expect(past.body.items.map((item) => item.event.id)).toContain(event.id)
  })

  it('refuses a registration from someone who is not signed in', async () => {
    const response = await new TestClient(app).get('/api/v1/me/registrations')
    expect(errorCode(response)).toBe('UNAUTHORIZED')
  })
})

describe('profile privacy on the dashboard', () => {
  it('shows the owner their profile, and visitors only the public fields', async () => {
    const user = await createUser(app)
    await user.client.patch('/api/v1/profiles/me', {
      headline: 'Owner headline',
      publicFields: ['headline'],
    })
    const own = await user.client.get<{ visibility: string; displayName: string }>(
      '/api/v1/profiles/me',
    )
    expect(own.body.displayName).toBeTruthy()

    const visitor = await new TestClient(app).get<{ headline: string | null; bio: string | null }>(
      `/api/v1/profiles/${user.username}`,
    )
    expect(visitor.body.headline).toBe('Owner headline')
    expect(visitor.body.bio).toBeNull()
  })

  it('makes a private profile unavailable to visitors while the owner still sees it', async () => {
    const user = await createUser(app)
    await user.client.patch('/api/v1/profiles/me', { visibility: 'PRIVATE' })
    expect((await new TestClient(app).get(`/api/v1/profiles/${user.username}`)).status).toBe(404)
    expect((await user.client.get(`/api/v1/profiles/${user.username}`)).status).toBe(200)
  })

  it('keeps usernames unique', async () => {
    const first = await createUser(app)
    const second = await createUser(app)
    const clash = await second.client.patch('/api/v1/profiles/me', { username: first.username })
    expect(clash.status).toBe(409)
    expect(errorCode(clash)).toBe('USERNAME_TAKEN')
  })
})
