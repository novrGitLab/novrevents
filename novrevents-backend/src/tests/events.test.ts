import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import { clearSettingsCache } from '../modules/admin/settings.service.js'
import {
  createDraftEvent,
  createPublishedEvent,
  createTestApp,
  createUser,
  errorCode,
  eventPayload,
  inDays,
  TestClient,
  type ManagedEvent,
} from './helpers.js'

interface EventPage {
  slug: string
  title: string
  status: string
  cancellationReason: string | null
  registration: { open: boolean; reason: string }
  speakers: Array<{ name: string }>
  sessions: Array<{ title: string; speakerIds: string[] }>
  viewer: { canManage: boolean; onlineUrl: string | null }
}

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

describe('event creation', () => {
  it('lets any signed-in user create a draft with a default ticket type', async () => {
    const user = await createUser(app)
    const event = await createDraftEvent(user, { title: 'Purple Team Workshop' })

    expect(event.status).toBe('DRAFT')
    expect(event.role).toBe('OWNER')
    expect(event.slug).toMatch(/^purple-team-workshop-[a-z0-9]{5}$/)

    const stored = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { ticketTypes: true },
    })
    expect(stored.ownerId).toBe(user.id)
    expect(stored.timezone).toBe('Africa/Lagos')
    expect(stored.organizerName).toBe(user.displayName)
    expect(stored.ticketTypes.map((type) => type.name)).toEqual(['General Admission'])
  })

  it('publishes guest questions and derives venue-only fields from the event format', async () => {
    const owner = await createUser(app)
    const guestInfo = {
      doorsBeforeMinutes: 45,
      minimumAge: 18,
      accessibility: 'Step-free entrance',
      parking: 'Use the north gate',
      faqs: [{ question: 'Are coats allowed?', answer: 'Yes, a cloakroom is available.' }],
    }
    const event = await createPublishedEvent(owner, { guestInfo })
    const guest = new TestClient(app)
    const readInfo = async () =>
      (await guest.get<{ guestInfo: typeof guestInfo }>(`/api/v1/public/events/${event.slug}`)).body
        .guestInfo
    expect(await readInfo()).toEqual(guestInfo)
    expect(
      (await owner.client.patch(`/api/v1/events/${event.id}`, { mode: 'VIRTUAL' })).status,
    ).toBe(200)
    expect(await readInfo()).toMatchObject({
      doorsBeforeMinutes: null,
      parking: '',
      faqs: guestInfo.faqs,
    })
    expect(
      (await owner.client.patch(`/api/v1/events/${event.id}`, { guestInfo: { minimumAge: -1 } }))
        .status,
    ).toBe(400)
  })

  it('requires authentication', async () => {
    const response = await new TestClient(app).post('/api/v1/events', await eventPayload())
    expect(response.status).toBe(401)
  })

  it('validates dates, timezone and links on the server', async () => {
    const user = await createUser(app)
    const backwards = await user.client.post(
      '/api/v1/events',
      await eventPayload({ startsAt: inDays(10), endsAt: inDays(9) }),
    )
    expect(backwards.status).toBe(400)
    expect(errorCode(backwards)).toBe('VALIDATION_ERROR')

    const badZone = await user.client.post(
      '/api/v1/events',
      await eventPayload({ timezone: 'Mars/Olympus' }),
    )
    expect(badZone.status).toBe(400)

    const badLink = await user.client.post(
      '/api/v1/events',
      await eventPayload({ onlineUrl: 'javascript:alert(1)' }),
    )
    expect(badLink.status).toBe(400)
  })

  it('stores timestamps in UTC regardless of the offset sent', async () => {
    const user = await createUser(app)
    const event = await createDraftEvent(user, {
      startsAt: '2031-03-01T09:00:00+01:00',
      endsAt: '2031-03-01T17:00:00+01:00',
    })
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    expect(stored.startsAt.toISOString()).toBe('2031-03-01T08:00:00.000Z')
    expect(stored.endsAt.toISOString()).toBe('2031-03-01T16:00:00.000Z')
  })
})

describe('event publishing', () => {
  it('requires a verified email address', async () => {
    const user = await createUser(app, { verified: false })
    const event = await createDraftEvent(user)
    const response = await user.client.post(`/api/v1/events/${event.id}/publish`)
    expect(response.status).toBe(403)
    expect(errorCode(response)).toBe('EMAIL_NOT_VERIFIED')
  })

  it('refuses an incomplete listing and says what is missing', async () => {
    const user = await createUser(app)
    const event = await createDraftEvent(user, {
      description: 'Too short',
      categoryId: null,
      venueName: null,
      city: null,
    })
    const response = await user.client.post(`/api/v1/events/${event.id}/publish`)
    expect(response.status).toBe(422)
    expect(errorCode(response)).toBe('EVENT_INCOMPLETE')
    const paths = (
      response.body as { error: { details: Array<{ path: string }> } }
    ).error.details.map((d) => d.path)
    expect(paths).toEqual(
      expect.arrayContaining(['description', 'categoryId', 'city', 'venueName']),
    )
  })

  it('does not require a venue for virtual events', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user, {
      mode: 'VIRTUAL',
      venueName: null,
      city: null,
      country: null,
    })
    expect(event.status).toBe('PUBLISHED')
  })

  it('makes a published public event visible to everyone', async () => {
    const user = await createUser(app)
    const draft = await createDraftEvent(user, { title: 'Visibility Check Conference' })
    const anonymous = new TestClient(app)

    expect((await anonymous.get(`/api/v1/public/events/${draft.slug}`)).status).toBe(404)
    // The owner can preview a draft through the same endpoint.
    expect((await user.client.get(`/api/v1/public/events/${draft.slug}`)).status).toBe(200)

    await user.client.post(`/api/v1/events/${draft.id}/publish`)
    const page = await anonymous.get<EventPage>(`/api/v1/public/events/${draft.slug}`)
    expect(page.status).toBe(200)
    expect(page.body.status).toBe('PUBLISHED')
    expect(page.body.viewer.canManage).toBe(false)

    const listing = await anonymous.get<{ items: Array<{ slug: string }> }>(
      '/api/v1/public/events',
      {
        query: { q: 'Visibility Check Conference' },
      },
    )
    expect(listing.body.items.map((item) => item.slug)).toContain(draft.slug)
  })

  it('cannot publish twice or publish an event that already ended', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user)
    const again = await user.client.post(`/api/v1/events/${event.id}/publish`)
    expect(again.status).toBe(409)

    const past = await createDraftEvent(user)
    await prisma.event.update({
      where: { id: past.id },
      data: {
        startsAt: new Date(Date.now() - 2 * 86_400_000),
        endsAt: new Date(Date.now() - 86_400_000),
      },
    })
    const response = await user.client.post(`/api/v1/events/${past.id}/publish`)
    expect(response.status).toBe(422)
  })

  it('enforces the daily publishing limit', async () => {
    const user = await createUser(app)
    await prisma.systemSetting.upsert({
      where: { key: 'maxEventsPublishedPerDay' },
      create: { key: 'maxEventsPublishedPerDay', value: 1 },
      update: { value: 1 },
    })
    clearSettingsCache()
    try {
      await createPublishedEvent(user)
      const second = await createDraftEvent(user)
      const response = await user.client.post(`/api/v1/events/${second.id}/publish`)
      expect(response.status).toBe(429)
      expect(errorCode(response)).toBe('PUBLISH_LIMIT')
    } finally {
      await prisma.systemSetting.delete({ where: { key: 'maxEventsPublishedPerDay' } })
      clearSettingsCache()
    }
  })
})

describe('event visibility', () => {
  it('keeps unlisted events out of the directory but reachable by link', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user, {
      title: 'Unlisted Tabletop Exercise',
      visibility: 'UNLISTED',
    })
    const anonymous = new TestClient(app)

    const listing = await anonymous.get<{ items: Array<{ slug: string }> }>(
      '/api/v1/public/events',
      {
        query: { q: 'Unlisted Tabletop Exercise' },
      },
    )
    expect(listing.body.items).toHaveLength(0)
    expect((await anonymous.get(`/api/v1/public/events/${event.slug}`)).status).toBe(200)
  })

  it('requires the share key for private events', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user, {
      title: 'Private Briefing',
      visibility: 'PRIVATE',
    })
    const anonymous = new TestClient(app)
    const key = new URL(event.privateLink as string).searchParams.get('key') as string

    expect((await anonymous.get(`/api/v1/public/events/${event.slug}`)).status).toBe(404)
    expect(
      (await anonymous.get(`/api/v1/public/events/${event.slug}`, { query: { key: 'wrong-key' } }))
        .status,
    ).toBe(404)
    expect(
      (await anonymous.get(`/api/v1/public/events/${event.slug}`, { query: { key } })).status,
    ).toBe(200)

    const listing = await anonymous.get<{ items: unknown[] }>('/api/v1/public/events', {
      query: { q: 'Private Briefing' },
    })
    expect(listing.body.items).toHaveLength(0)
  })

  it('never discloses the join link to the public', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user, {
      mode: 'HYBRID',
      onlineUrl: 'https://meet.example.test/secret-room',
    })
    const anonymous = await new TestClient(app).get<EventPage>(
      `/api/v1/public/events/${event.slug}`,
    )
    expect(anonymous.body.viewer.onlineUrl).toBeNull()
    expect(JSON.stringify(anonymous.body)).not.toContain('secret-room')

    const owner = await user.client.get<EventPage>(`/api/v1/public/events/${event.slug}`)
    expect(owner.body.viewer.onlineUrl).toBe('https://meet.example.test/secret-room')
  })
})

describe('event lifecycle', () => {
  it('reports an event that has started as ONGOING and one that has ended as COMPLETED', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user)
    const anonymous = new TestClient(app)

    await prisma.event.update({
      where: { id: event.id },
      data: {
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 3_600_000),
      },
    })
    expect(
      (await anonymous.get<EventPage>(`/api/v1/public/events/${event.slug}`)).body.status,
    ).toBe('ONGOING')

    await prisma.event.update({
      where: { id: event.id },
      data: {
        startsAt: new Date(Date.now() - 7_200_000),
        endsAt: new Date(Date.now() - 3_600_000),
      },
    })
    const ended = await anonymous.get<EventPage>(`/api/v1/public/events/${event.slug}`)
    expect(ended.body.status).toBe('COMPLETED')
    expect(ended.body.registration).toMatchObject({ open: false, reason: 'EVENT_ENDED' })
  })

  it('unpublishes back to draft while nobody has registered', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user)
    const response = await user.client.post<ManagedEvent>(`/api/v1/events/${event.id}/unpublish`)
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('DRAFT')
    expect((await new TestClient(app).get(`/api/v1/public/events/${event.slug}`)).status).toBe(404)
  })

  it('cancels an event and shows the reason publicly', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user)
    const response = await user.client.post<ManagedEvent>(`/api/v1/events/${event.id}/cancel`, {
      reason: 'Venue unavailable',
      notifyAttendees: true,
    })
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('CANCELLED')

    const page = await new TestClient(app).get<EventPage>(`/api/v1/public/events/${event.slug}`)
    expect(page.body.status).toBe('CANCELLED')
    expect(page.body.cancellationReason).toBe('Venue unavailable')
    expect(page.body.registration).toMatchObject({ open: false, reason: 'EVENT_CANCELLED' })

    // Cancelled events are read-only.
    const edit = await user.client.patch(`/api/v1/events/${event.id}`, { title: 'Changed' })
    expect(edit.status).toBe(409)
  })

  it('archives and restores an event', async () => {
    const user = await createUser(app)
    const draft = await createDraftEvent(user)
    const archived = await user.client.post<ManagedEvent>(`/api/v1/events/${draft.id}/archive`)
    expect(archived.body.status).toBe('ARCHIVED')

    const hidden = await user.client.get<{ items: Array<{ id: string }> }>('/api/v1/events')
    expect(hidden.body.items.map((item) => item.id)).not.toContain(draft.id)
    const shown = await user.client.get<{ items: Array<{ id: string }> }>('/api/v1/events', {
      query: { status: 'ARCHIVED' },
    })
    expect(shown.body.items.map((item) => item.id)).toContain(draft.id)

    const restored = await user.client.post<ManagedEvent>(`/api/v1/events/${draft.id}/unarchive`)
    expect(restored.body.status).toBe('DRAFT')

    const live = await createPublishedEvent(user)
    expect((await user.client.post(`/api/v1/events/${live.id}/archive`)).status).toBe(409)
  })

  it('duplicates the listing, ticket types, speakers and agenda into a new draft', async () => {
    const user = await createUser(app)
    const source = await createPublishedEvent(user, { title: 'Original Summit', capacity: 120 })
    const speaker = await user.client.post<{ id: string }>(`/api/v1/events/${source.id}/speakers`, {
      name: 'Grace Hopper',
    })
    const sourceRow = await prisma.event.findUniqueOrThrow({ where: { id: source.id } })
    const session = await user.client.post(`/api/v1/events/${source.id}/sessions`, {
      title: 'Opening keynote',
      startsAt: sourceRow.startsAt.toISOString(),
      endsAt: new Date(sourceRow.startsAt.getTime() + 3_600_000).toISOString(),
      speakerIds: [speaker.body.id],
    })
    expect(session.status).toBe(201)

    const copy = await user.client.post<ManagedEvent>(`/api/v1/events/${source.id}/duplicate`)
    expect(copy.status).toBe(201)
    expect(copy.body.status).toBe('DRAFT')
    expect(copy.body.title).toBe('Original Summit (copy)')
    expect(copy.body.id).not.toBe(source.id)
    expect(copy.body.slug).not.toBe(source.slug)
    expect(copy.body.capacity).toBe(120)

    const page = await user.client.get<EventPage>(`/api/v1/public/events/${copy.body.slug}`)
    expect(page.body.speakers.map((item) => item.name)).toEqual(['Grace Hopper'])
    expect(page.body.sessions).toHaveLength(1)
    expect(page.body.sessions[0]?.speakerIds).toHaveLength(1)
    // The copy has its own speaker rows, not references to the original's.
    expect(page.body.sessions[0]?.speakerIds[0]).not.toBe(speaker.body.id)
  })

  it('deletes drafts only', async () => {
    const user = await createUser(app)
    const draft = await createDraftEvent(user)
    expect((await user.client.delete(`/api/v1/events/${draft.id}`)).status).toBe(200)
    expect(await prisma.event.count({ where: { id: draft.id } })).toBe(0)

    const live = await createPublishedEvent(user)
    const response = await user.client.delete(`/api/v1/events/${live.id}`)
    expect(response.status).toBe(409)
    expect(await prisma.event.count({ where: { id: live.id } })).toBe(1)
  })

  it('writes an audit log entry for sensitive operations', async () => {
    const user = await createUser(app)
    const event = await createPublishedEvent(user)
    await user.client.post(`/api/v1/events/${event.id}/cancel`, { notifyAttendees: false })
    const actions = (
      await prisma.auditLog.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((entry) => entry.action)
    expect(actions).toEqual(['event.create', 'event.publish', 'event.cancel'])
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { eventId: event.id, action: 'event.cancel' },
    })
    expect(entry.actorId).toBe(user.id)
  })
})

describe('agenda and speakers', () => {
  it('keeps sessions inside the event window and speakers inside the event', async () => {
    const user = await createUser(app)
    const other = await createUser(app)
    const event = await createDraftEvent(user)
    const otherEvent = await createDraftEvent(other)
    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })

    const outside = await user.client.post(`/api/v1/events/${event.id}/sessions`, {
      title: 'Too early',
      startsAt: new Date(row.startsAt.getTime() - 3_600_000).toISOString(),
      endsAt: row.startsAt.toISOString(),
    })
    expect(outside.status).toBe(400)

    const foreignSpeaker = await other.client.post<{ id: string }>(
      `/api/v1/events/${otherEvent.id}/speakers`,
      {
        name: 'Someone Else',
      },
    )
    const crossEvent = await user.client.post(`/api/v1/events/${event.id}/sessions`, {
      title: 'Borrowed speaker',
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      speakerIds: [foreignSpeaker.body.id],
    })
    expect(crossEvent.status).toBe(400)
    expect(errorCode(crossEvent)).toBe('INVALID_SPEAKER')
  })
})

describe('tasks and checklist', () => {
  it('adds the standard checklist once and tracks completion', async () => {
    const user = await createUser(app)
    const event = await createDraftEvent(user)

    const first = await user.client.post<{ added: number }>(
      `/api/v1/events/${event.id}/tasks/checklist`,
    )
    expect(first.body.added).toBeGreaterThan(5)
    const second = await user.client.post<{ added: number }>(
      `/api/v1/events/${event.id}/tasks/checklist`,
    )
    expect(second.body.added).toBe(0)

    const list = await user.client.get<{
      items: Array<{ id: string; kind: string; status: string }>
    }>(`/api/v1/events/${event.id}/tasks`, { query: { kind: 'CHECKLIST' } })
    const item = list.body.items[0]
    const done = await user.client.patch<{ status: string; completedAt: string | null }>(
      `/api/v1/events/${event.id}/tasks/${item?.id}`,
      { status: 'DONE' },
    )
    expect(done.body.status).toBe('DONE')
    expect(done.body.completedAt).not.toBeNull()
  })

  it('only assigns tasks to people on the event team and notifies them', async () => {
    const owner = await createUser(app)
    const helper = await createUser(app)
    const stranger = await createUser(app)
    const event = await createDraftEvent(owner)

    const rejected = await owner.client.post(`/api/v1/events/${event.id}/tasks`, {
      title: 'Book the venue',
      assigneeId: stranger.id,
    })
    expect(rejected.status).toBe(400)
    expect(errorCode(rejected)).toBe('ASSIGNEE_NOT_ON_TEAM')

    await owner.client.post(`/api/v1/events/${event.id}/team`, {
      username: helper.username,
      role: 'STAFF',
    })
    const created = await owner.client.post<{ id: string; assignee: { userId: string } }>(
      `/api/v1/events/${event.id}/tasks`,
      { title: 'Print badges', assigneeId: helper.id, dueAt: inDays(5) },
    )
    expect(created.status).toBe(201)
    expect(created.body.assignee.userId).toBe(helper.id)

    const notifications = await prisma.notification.findMany({
      where: { userId: helper.id, type: 'TASK_ASSIGNED' },
    })
    expect(notifications).toHaveLength(1)

    // Staff can progress their own task but cannot rewrite it.
    const progress = await helper.client.patch(
      `/api/v1/events/${event.id}/tasks/${created.body.id}`,
      { status: 'IN_PROGRESS' },
    )
    expect(progress.status).toBe(200)
    const rename = await helper.client.patch(
      `/api/v1/events/${event.id}/tasks/${created.body.id}`,
      { title: 'Something else' },
    )
    expect(rename.status).toBe(403)
  })
})
