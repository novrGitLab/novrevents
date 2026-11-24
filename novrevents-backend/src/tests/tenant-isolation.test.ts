import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  createDraftEvent,
  createPublishedEvent,
  createTestApp,
  createUser,
  eventPayload,
  type ManagedEvent,
  type TestUser,
} from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

describe('event isolation between unrelated users', () => {
  let owner: TestUser
  let outsider: TestUser
  let event: ManagedEvent

  beforeAll(async () => {
    owner = await createUser(app)
    outsider = await createUser(app)
    event = await createPublishedEvent(owner, { title: 'Owner Only Event' })
    await owner.client.post(`/api/v1/events/${event.id}/tasks`, { title: 'Confidential prep task' })
  })

  it('returns 404 (not 403) for every organiser endpoint, so existence is not disclosed', async () => {
    const base = `/api/v1/events/${event.id}`
    const attempts = await Promise.all([
      outsider.client.get(base),
      outsider.client.patch(base, { title: 'Hijacked' }),
      outsider.client.post(`${base}/unpublish`),
      outsider.client.post(`${base}/cancel`, { notifyAttendees: false }),
      outsider.client.post(`${base}/archive`),
      outsider.client.post(`${base}/duplicate`),
      outsider.client.delete(base),
      outsider.client.get(`${base}/speakers`),
      outsider.client.post(`${base}/speakers`, { name: 'Intruder' }),
      outsider.client.get(`${base}/sessions`),
      outsider.client.get(`${base}/tasks`),
      outsider.client.post(`${base}/tasks`, { title: 'Injected task' }),
      outsider.client.get(`${base}/team`),
      outsider.client.post(`${base}/team`, { username: outsider.username, role: 'MANAGER' }),
    ])
    expect(attempts.map((response) => response.status)).toEqual(attempts.map(() => 404))

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    expect(stored.title).toBe('Owner Only Event')
    expect(stored.status).toBe('PUBLISHED')
    expect(await prisma.eventTeamMember.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("does not list another user's events", async () => {
    const mine = await outsider.client.get<{ items: Array<{ id: string }> }>('/api/v1/events')
    expect(mine.body.items.map((item) => item.id)).not.toContain(event.id)
  })
})

describe('event team roles', () => {
  it('limits check-in staff and managers to their capabilities', async () => {
    const owner = await createUser(app)
    const staff = await createUser(app)
    const manager = await createUser(app)
    const event = await createPublishedEvent(owner)
    const base = `/api/v1/events/${event.id}`

    await owner.client.post(`${base}/team`, { username: staff.username, role: 'STAFF' })
    await owner.client.post(`${base}/team`, { username: manager.username, role: 'MANAGER' })

    // Staff: can open the event, cannot change it, and is not given the private share link.
    const staffView = await staff.client.get<ManagedEvent>(base)
    expect(staffView.status).toBe(200)
    expect(staffView.body.role).toBe('STAFF')
    expect(staffView.body.privateLink).toBeNull()
    expect((await staff.client.patch(base, { title: 'Staff edit' })).status).toBe(403)
    expect((await staff.client.post(`${base}/speakers`, { name: 'Staff speaker' })).status).toBe(
      403,
    )
    expect((await staff.client.post(`${base}/tasks`, { title: 'Staff task' })).status).toBe(403)

    // Manager: can run the event but cannot cancel, delete or manage the team.
    expect((await manager.client.patch(base, { summary: 'Updated by a manager' })).status).toBe(200)
    expect((await manager.client.post(`${base}/cancel`, { notifyAttendees: false })).status).toBe(
      403,
    )
    expect((await manager.client.delete(base)).status).toBe(403)
    expect(
      (await manager.client.post(`${base}/team`, { username: staff.username, role: 'MANAGER' }))
        .status,
    ).toBe(403)

    // Removing a member ends their access immediately.
    await owner.client.delete(`${base}/team/${staff.id}`)
    expect((await staff.client.get(base)).status).toBe(404)
  })
})

describe('organization workspaces', () => {
  it('scopes organization data to its members', async () => {
    const founder = await createUser(app)
    const member = await createUser(app)
    const outsider = await createUser(app)

    const org = await founder.client.post<{ id: string; slug: string; role: string }>(
      '/api/v1/organizations',
      {
        name: `Isolation Org ${Date.now().toString(36)}`,
      },
    )
    expect(org.status).toBe(201)
    expect(org.body.role).toBe('OWNER')
    await founder.client.post(`/api/v1/organizations/${org.body.id}/members`, {
      username: member.username,
      role: 'MEMBER',
    })

    // Outsiders cannot see the workspace, its members, or change anything.
    const base = `/api/v1/organizations/${org.body.id}`
    const attempts = await Promise.all([
      outsider.client.get(base),
      outsider.client.get(`${base}/members`),
      outsider.client.patch(base, { name: 'Taken over' }),
      outsider.client.post(`${base}/members`, { username: outsider.username, role: 'ADMIN' }),
      outsider.client.delete(base),
    ])
    expect(attempts.map((response) => response.status)).toEqual([404, 404, 404, 404, 404])

    // A plain member can read but not administer.
    expect((await member.client.get(base)).status).toBe(200)
    expect((await member.client.patch(base, { name: 'Member rename' })).status).toBe(403)
    expect(
      (await member.client.post(`${base}/members`, { username: outsider.username })).status,
    ).toBe(403)

    // Events cannot be created in a workspace by a non-member.
    const foreign = await outsider.client.post(
      '/api/v1/events',
      await eventPayload({ organizationId: org.body.id }),
    )
    expect(foreign.status).toBe(404)
  })

  it('gives organization admins access to workspace events, but not plain members', async () => {
    const founder = await createUser(app)
    const admin = await createUser(app)
    const member = await createUser(app)

    const org = await founder.client.post<{ id: string }>('/api/v1/organizations', {
      name: `Workspace ${Date.now().toString(36)}`,
    })
    await founder.client.post(`/api/v1/organizations/${org.body.id}/members`, {
      username: admin.username,
      role: 'ADMIN',
    })
    await founder.client.post(`/api/v1/organizations/${org.body.id}/members`, {
      username: member.username,
      role: 'MEMBER',
    })

    const event = await createDraftEvent(member, {
      organizationId: org.body.id,
      title: 'Workspace Event',
    })

    const adminView = await admin.client.get<ManagedEvent>(`/api/v1/events/${event.id}`)
    expect(adminView.status).toBe(200)
    expect(adminView.body.role).toBe('ORG_ADMIN')

    const otherMember = await createUser(app)
    await founder.client.post(`/api/v1/organizations/${org.body.id}/members`, {
      username: otherMember.username,
    })
    expect((await otherMember.client.get(`/api/v1/events/${event.id}`)).status).toBe(404)
  })

  it('keeps at least one owner and blocks deleting a workspace that still has events', async () => {
    const founder = await createUser(app)
    const org = await founder.client.post<{ id: string }>('/api/v1/organizations', {
      name: `Sole Owner ${Date.now().toString(36)}`,
    })
    const leave = await founder.client.delete(
      `/api/v1/organizations/${org.body.id}/members/${founder.id}`,
    )
    expect(leave.status).toBe(409)

    await createDraftEvent(founder, { organizationId: org.body.id })
    const remove = await founder.client.delete(`/api/v1/organizations/${org.body.id}`)
    expect(remove.status).toBe(409)
  })
})
