import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  categoryId,
  createPublishedEvent,
  createTestApp,
  createUser,
  errorCode,
  inDays,
  TestClient,
  type TestUser,
} from './helpers.js'

interface Page {
  items: Array<{ slug: string; title: string }>
  total: number
  page: number
  totalPages: number
}

let app: FastifyInstance
let organiser: TestUser
let anonymous: TestClient
// Other suites also create events in the same database, so every query here is scoped by a marker.
const marker = `disc${Date.now().toString(36)}`
const titles = async (query: Record<string, string | number>) => {
  const response = await anonymous.get<Page>('/api/v1/public/events', {
    query: { q: marker, ...query },
  })
  expect(response.status).toBe(200)
  return response.body.items.map((item) => item.title.replace(` ${marker}`, ''))
}

beforeAll(async () => {
  app = await createTestApp()
  anonymous = new TestClient(app)
  organiser = await createUser(app, { prefix: 'disco' })

  await createPublishedEvent(organiser, {
    title: `Lagos AppSec Day ${marker}`,
    city: 'Lagos',
    country: 'Nigeria',
    eventType: 'CONFERENCE',
    mode: 'IN_PERSON',
    startsAt: inDays(10),
    endsAt: inDays(10, 6),
  })
  await createPublishedEvent(organiser, {
    title: `Cloud Security Webinar ${marker}`,
    categoryId: await categoryId('cloud-security'),
    eventType: 'WEBINAR',
    mode: 'VIRTUAL',
    venueName: null,
    city: null,
    country: null,
    startsAt: inDays(20),
    endsAt: inDays(20, 2),
  })
  await createPublishedEvent(organiser, {
    title: `Nairobi Red Team Training ${marker}`,
    categoryId: await categoryId('offensive-security'),
    eventType: 'TRAINING',
    mode: 'HYBRID',
    city: 'Nairobi',
    country: 'Kenya',
    isPaid: true,
    priceInfo: 'USD 150',
    startsAt: inDays(40),
    endsAt: inDays(42),
  })
  const past = await createPublishedEvent(organiser, {
    title: `Last Year CTF ${marker}`,
    eventType: 'CTF',
  })
  await prisma.event.update({
    where: { id: past.id },
    data: {
      startsAt: new Date(Date.now() - 10 * 86_400_000),
      endsAt: new Date(Date.now() - 9 * 86_400_000),
    },
  })
})

afterAll(async () => {
  await app.close()
})

describe('event directory', () => {
  it('lists upcoming events soonest first by default', async () => {
    expect(await titles({})).toEqual([
      'Lagos AppSec Day',
      'Cloud Security Webinar',
      'Nairobi Red Team Training',
    ])
  })

  it('filters by timeframe', async () => {
    expect(await titles({ timeframe: 'past' })).toEqual(['Last Year CTF'])
    expect(await titles({ timeframe: 'all' })).toHaveLength(4)
  })

  it('filters by category, event type, format and price', async () => {
    expect(await titles({ category: 'cloud-security' })).toEqual(['Cloud Security Webinar'])
    expect(await titles({ type: 'TRAINING' })).toEqual(['Nairobi Red Team Training'])
    expect(await titles({ mode: 'VIRTUAL' })).toEqual(['Cloud Security Webinar'])
    expect(await titles({ price: 'paid' })).toEqual(['Nairobi Red Team Training'])
    expect(await titles({ price: 'free' })).toEqual(['Lagos AppSec Day', 'Cloud Security Webinar'])
  })

  it('filters by location and by date range', async () => {
    expect(await titles({ location: 'kenya' })).toEqual(['Nairobi Red Team Training'])
    expect(await titles({ location: 'lagos' })).toEqual(['Lagos AppSec Day'])

    const day15 = inDays(15).slice(0, 10)
    const day25 = inDays(25).slice(0, 10)
    expect(await titles({ from: day15, to: day25 })).toEqual(['Cloud Security Webinar'])
  })

  it('filters by organiser', async () => {
    expect(await titles({ organizer: organiser.username })).toHaveLength(3)
    const other = await createUser(app)
    expect(await titles({ organizer: other.username })).toHaveLength(0)
  })

  it('searches case-insensitively and combines filters', async () => {
    const response = await anonymous.get<Page>('/api/v1/public/events', {
      query: { q: `NAIROBI red team training ${marker}` },
    })
    expect(response.body.items).toHaveLength(1)
    expect(await titles({ mode: 'HYBRID', price: 'free' })).toHaveLength(0)
  })

  it('sorts and paginates', async () => {
    expect(await titles({ sort: 'latest' })).toEqual([
      'Nairobi Red Team Training',
      'Cloud Security Webinar',
      'Lagos AppSec Day',
    ])

    const first = await anonymous.get<Page>('/api/v1/public/events', {
      query: { q: marker, pageSize: 2, page: 1 },
    })
    expect(first.body).toMatchObject({ total: 3, page: 1, totalPages: 2 })
    expect(first.body.items).toHaveLength(2)
    const second = await anonymous.get<Page>('/api/v1/public/events', {
      query: { q: marker, pageSize: 2, page: 2 },
    })
    expect(second.body.items).toHaveLength(1)
    expect(first.body.items.map((item) => item.slug)).not.toContain(second.body.items[0]?.slug)
  })

  it('rejects invalid filter values', async () => {
    const response = await anonymous.get('/api/v1/public/events', { query: { mode: 'TELEPATHIC' } })
    expect(response.status).toBe(400)
    expect(errorCode(response)).toBe('VALIDATION_ERROR')
    expect(
      (await anonymous.get('/api/v1/public/events', { query: { pageSize: 1000 } })).status,
    ).toBe(400)
  })

  it('hides events removed by moderators and events of suspended organisers', async () => {
    const owner = await createUser(app)
    const removed = await createPublishedEvent(owner, { title: `Removed Meetup ${marker}` })
    await prisma.event.update({ where: { id: removed.id }, data: { moderationStatus: 'REMOVED' } })
    expect(await titles({ timeframe: 'all' })).not.toContain('Removed Meetup')
    expect((await anonymous.get(`/api/v1/public/events/${removed.slug}`)).status).toBe(404)

    const suspended = await createUser(app)
    const theirs = await createPublishedEvent(suspended, {
      title: `Suspended Owner Event ${marker}`,
    })
    await prisma.user.update({ where: { id: suspended.id }, data: { status: 'SUSPENDED' } })
    expect(await titles({ timeframe: 'all' })).not.toContain('Suspended Owner Event')
    expect((await anonymous.get(`/api/v1/public/events/${theirs.slug}`)).status).toBe(404)
  })
})

describe('saved events', () => {
  it('saves and removes an event for the signed-in user only', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(organiser, { title: `Bookmark Me ${marker}` })

    expect((await anonymous.put(`/api/v1/public/events/${event.slug}/save`)).status).toBe(401)

    await user.client.put(`/api/v1/public/events/${event.slug}/save`)
    await user.client.put(`/api/v1/public/events/${event.slug}/save`)
    const saved = await user.client.get<Page>('/api/v1/me/saved-events')
    expect(saved.body.items.map((item) => item.slug)).toEqual([event.slug])

    const page = await user.client.get<{ viewer: { isSaved: boolean } }>(
      `/api/v1/public/events/${event.slug}`,
    )
    expect(page.body.viewer.isSaved).toBe(true)

    await user.client.delete(`/api/v1/public/events/${event.slug}/save`)
    expect((await user.client.get<Page>('/api/v1/me/saved-events')).body.items).toHaveLength(0)
  })
})

describe('abuse reporting and moderation flags', () => {
  it('accepts one report per reporter and flags the event at the threshold', async () => {
    const event = await createPublishedEvent(organiser, { title: `Suspicious Giveaway ${marker}` })
    const reporters = await Promise.all([createUser(app), createUser(app), createUser(app)])

    const first = await reporters[0]!.client.post(`/api/v1/public/events/${event.slug}/report`, {
      reason: 'SCAM',
      details: 'Asks for wallet seed phrases.',
    })
    expect(first.status).toBe(201)
    const duplicate = await reporters[0]!.client.post(
      `/api/v1/public/events/${event.slug}/report`,
      { reason: 'SPAM' },
    )
    expect(duplicate.status).toBe(409)
    expect(errorCode(duplicate)).toBe('ALREADY_REPORTED')

    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).moderationStatus,
    ).toBe('CLEAR')
    await reporters[1]!.client.post(`/api/v1/public/events/${event.slug}/report`, {
      reason: 'SCAM',
    })
    await reporters[2]!.client.post(`/api/v1/public/events/${event.slug}/report`, {
      reason: 'MALICIOUS',
    })

    // Default threshold is three independent open reports.
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).moderationStatus,
    ).toBe('FLAGGED')
    expect(
      await prisma.auditLog.count({ where: { eventId: event.id, action: 'event.auto_flagged' } }),
    ).toBe(1)
  })

  it('does not let organisers report their own event', async () => {
    const event = await createPublishedEvent(organiser, { title: `Own Event ${marker}` })
    const response = await organiser.client.post(`/api/v1/public/events/${event.slug}/report`, {
      reason: 'OTHER',
    })
    expect(response.status).toBe(400)
  })
})

describe('page view analytics beacon', () => {
  it('counts a visitor once per window and ignores the event team', async () => {
    const event = await createPublishedEvent(organiser, { title: `Counted Event ${marker}` })
    const visitor = new TestClient(app)

    const first = await visitor.post<{ counted: boolean }>(
      `/api/v1/public/events/${event.slug}/view`,
      {},
    )
    const repeat = await visitor.post<{ counted: boolean }>(
      `/api/v1/public/events/${event.slug}/view`,
      {},
    )
    const team = await organiser.client.post<{ counted: boolean }>(
      `/api/v1/public/events/${event.slug}/view`,
      {},
    )
    expect(first.body.counted).toBe(true)
    expect(repeat.body.counted).toBe(false)
    expect(team.body.counted).toBe(false)

    const stored = await prisma.analyticsEvent.findMany({
      where: { eventId: event.id, type: 'EVENT_VIEW' },
    })
    expect(stored).toHaveLength(1)
    // Only a salted hash is stored — never the raw address.
    expect(stored[0]?.visitorKey).not.toContain('127.0.0.1')
  })
})
