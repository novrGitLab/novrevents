// Phase 2D: organiser workspace authorisation. Attendee detail, answer visibility by role, event visibility
// editing, and registration decisions. Real PostgreSQL, real sessions.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createEventWithRegistration,
  createPublishedEvent,
  createTestApp,
  createUser,
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

interface Detail {
  id: string
  status: string
  submissionId: string | null
  answers?: unknown
  exclusionReasons?: unknown
}

async function setup(owner: TestUser, attendee: TestUser) {
  const { event, form } = await createEventWithRegistration(owner)
  const result = await submit(
    app,
    form.slug,
    { full_name: attendee.displayName, email: attendee.email },
    { client: attendee.client },
  )
  expect(result.status).toBeLessThan(300)
  const registration = await prisma.registration.findFirstOrThrow({
    where: { eventId: event.id, userId: attendee.id },
  })
  return { event, form, registration }
}

describe('attendee detail access', () => {
  it('lets check-in staff read the attendee record but not the answers', async () => {
    const owner = await createUser(app)
    const staff = await createUser(app)
    const attendee = await createUser(app)
    const { event, form, registration } = await setup(owner, attendee)
    await owner.client.post(`/api/v1/events/${event.id}/team`, { username: staff.username, role: 'STAFF' })

    const detail = await staff.client.get<Detail>(
      `/api/v1/events/${event.id}/registrations/${registration.id}`,
    )
    expect(detail.status).toBe(200)
    expect(detail.body.id).toBe(registration.id)
    // The attendee record never carries answers or exclusion reasons.
    expect(detail.body).not.toHaveProperty('answers')
    expect(detail.body).not.toHaveProperty('exclusionReasons')

    // The answers themselves are form-level data: staff are refused.
    const answers = await staff.client.get(
      `/api/v1/forms/${form.id}/submissions/${registration.submissionId}`,
    )
    expect(answers.status).toBeGreaterThanOrEqual(400)
    expect(answers.status).not.toBe(200)
  })

  it('lets the event manager read the answers behind a registration', async () => {
    const owner = await createUser(app)
    const manager = await createUser(app)
    const attendee = await createUser(app)
    const { event, form, registration } = await setup(owner, attendee)
    await owner.client.post(`/api/v1/events/${event.id}/team`, { username: manager.username, role: 'MANAGER' })

    const answers = await manager.client.get<{ answers: Array<{ fieldKey: string }> }>(
      `/api/v1/forms/${form.id}/submissions/${registration.submissionId}`,
    )
    expect(answers.status).toBe(200)
    expect(answers.body.answers.map((answer) => answer.fieldKey)).toContain('full_name')
  })

  it('hides every registration of an event from unrelated accounts', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const stranger = await createUser(app)
    const { event, registration } = await setup(owner, attendee)

    const response = await stranger.client.get(
      `/api/v1/events/${event.id}/registrations/${registration.id}`,
    )
    expect(response.status).toBe(404)
  })

  it('does not let a registration from another event be read through this event', async () => {
    const owner = await createUser(app)
    const attendee = await createUser(app)
    const { event } = await setup(owner, attendee)
    const other = await createPublishedEvent(owner)
    const registration = await prisma.registration.findFirstOrThrow({
      where: { eventId: event.id, userId: attendee.id },
    })
    const response = await owner.client.get(
      `/api/v1/events/${other.id}/registrations/${registration.id}`,
    )
    expect(response.status).toBe(404)
  })
})

describe('event visibility editing', () => {
  it('lets the owner change visibility, and refuses staff and anonymous visitors', async () => {
    const owner = await createUser(app)
    const staff = await createUser(app)
    const event = await createPublishedEvent(owner, { visibility: 'PUBLIC' })
    await owner.client.post(`/api/v1/events/${event.id}/team`, { username: staff.username, role: 'STAFF' })
    const base = `/api/v1/events/${event.id}`

    expect((await staff.client.patch(base, { visibility: 'PRIVATE' })).status).toBe(403)
    expect((await new TestClient(app).patch(base, { visibility: 'PRIVATE' })).status).toBe(401)
    expect(
      (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).visibility,
    ).toBe('PUBLIC')

    const changed = await owner.client.patch<{ visibility: string }>(base, { visibility: 'PRIVATE' })
    expect(changed.status).toBe(200)
    expect(changed.body.visibility).toBe('PRIVATE')
  })
})

describe('registration decisions', () => {
  it('lets staff see but not decide a pending registration', async () => {
    const owner = await createUser(app)
    const staff = await createUser(app)
    const attendee = await createUser(app)
    const { event, registration } = await setup(owner, attendee)
    await owner.client.post(`/api/v1/events/${event.id}/team`, { username: staff.username, role: 'STAFF' })
    await prisma.registration.update({ where: { id: registration.id }, data: { status: 'PENDING' } })

    const decline = await staff.client.post(
      `/api/v1/events/${event.id}/registrations/${registration.id}/decline`,
      {},
    )
    expect(decline.status).toBe(403)
    const approve = await staff.client.post(
      `/api/v1/events/${event.id}/registrations/${registration.id}/approve`,
    )
    expect(approve.status).toBe(403)
    const stillPending = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })
    expect(stillPending.status).toBe('PENDING')
  })
})
