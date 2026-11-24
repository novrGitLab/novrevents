// Phase 2A: following public organisations. Real PostgreSQL, real sessions and CSRF.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  createDraftEvent,
  createPublishedEvent,
  createTestApp,
  createUser,
  errorCode,
  TestClient,
  type TestUser,
  uniqueUsername,
} from './helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

interface OrgBody {
  slug: string
  id: string
}

async function createOrganization(owner: TestUser): Promise<OrgBody> {
  const response = await owner.client.post<OrgBody>('/api/v1/organizations', {
    name: `Org ${uniqueUsername('org')}`,
    description: 'A test organisation.',
  })
  expect(response.status).toBe(201)
  return response.body
}

const follow = (user: TestUser, slug: string) =>
  user.client.post<{ following: boolean; followerCount: number }>(
    `/api/v1/public/organizations/${slug}/follow`,
  )
const unfollow = (user: TestUser, slug: string) =>
  user.client.delete<{ following: boolean; followerCount: number }>(
    `/api/v1/public/organizations/${slug}/follow`,
  )

describe('following organisations', () => {
  it('requires a signed-in session', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const response = await new TestClient(app).post(
      `/api/v1/public/organizations/${org.slug}/follow`,
    )
    expect(response.status).toBe(401)
  })

  it('follows and unfollows idempotently and keeps an accurate follower count', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const fan = await createUser(app)
    const second = await createUser(app)

    const first = await follow(fan, org.slug)
    expect(first.status).toBe(200)
    expect(first.body).toEqual({ following: true, followerCount: 1 })

    // Following again changes nothing and is not an error.
    const again = await follow(fan, org.slug)
    expect(again.status).toBe(200)
    expect(again.body).toEqual({ following: true, followerCount: 1 })

    expect((await follow(second, org.slug)).body.followerCount).toBe(2)

    const stopped = await unfollow(fan, org.slug)
    expect(stopped.body).toEqual({ following: false, followerCount: 1 })
    const stoppedAgain = await unfollow(fan, org.slug)
    expect(stoppedAgain.status).toBe(200)
    expect(stoppedAgain.body).toEqual({ following: false, followerCount: 1 })
  })

  it('returns not found for an unknown organisation, in both directions', async () => {
    const user = await createUser(app)
    expect(errorCode(await follow(user, 'no-such-organisation-xyz'))).toBe('NOT_FOUND')
    expect((await unfollow(user, 'no-such-organisation-xyz')).status).toBe(404)
  })

  it('does not let anyone follow a suspended organisation, but lets them stop following it', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const fan = await createUser(app)
    expect((await follow(fan, org.slug)).status).toBe(200)

    await prisma.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } })

    const newFan = await createUser(app)
    expect((await follow(newFan, org.slug)).status).toBe(404)
    const stopped = await unfollow(fan, org.slug)
    expect(stopped.status).toBe(200)
    expect(stopped.body.following).toBe(false)
  })

  it('shows the follow state to the viewer, and not to anonymous visitors', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const fan = await createUser(app)
    await follow(fan, org.slug)

    const anonymous = await new TestClient(app).get<{ followerCount: number; following: boolean }>(
      `/api/v1/public/organizations/${org.slug}`,
    )
    expect(anonymous.body.followerCount).toBe(1)
    expect(anonymous.body.following).toBe(false)

    const asFan = await fan.client.get<{ following: boolean }>(
      `/api/v1/public/organizations/${org.slug}`,
    )
    expect(asFan.body.following).toBe(true)
  })

  it('lists followed organisations and hides suspended ones', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const fan = await createUser(app)
    await follow(fan, org.slug)

    const listed = await fan.client.get<{ items: Array<{ slug: string }>; total: number }>(
      '/api/v1/me/followed-organizations',
    )
    expect(listed.body.items.map((item) => item.slug)).toContain(org.slug)

    await prisma.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } })
    const after = await fan.client.get<{ items: Array<{ slug: string }> }>(
      '/api/v1/me/followed-organizations',
    )
    expect(after.body.items.map((item) => item.slug)).not.toContain(org.slug)
  })
})

describe('feed from followed organisations', () => {
  it('includes eligible published events and never the inaccessible ones', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const fan = await createUser(app)
    await follow(fan, org.slug)

    const published = await createPublishedEvent(owner, {
      organizationId: org.id,
      title: 'Org public event',
    })
    const draft = await createDraftEvent(owner, {
      organizationId: org.id,
      title: 'Org draft event',
    })
    const priv = await createPublishedEvent(owner, {
      organizationId: org.id,
      visibility: 'PRIVATE',
      title: 'Org private event',
    })
    const unlisted = await createPublishedEvent(owner, {
      organizationId: org.id,
      visibility: 'UNLISTED',
      title: 'Org unlisted event',
    })
    const removed = await createPublishedEvent(owner, {
      organizationId: org.id,
      title: 'Org removed event',
    })
    await prisma.event.update({ where: { id: removed.id }, data: { moderationStatus: 'REMOVED' } })

    const feed = await fan.client.get<{ items: Array<{ id: string; title: string }> }>(
      '/api/v1/me/feed?pageSize=50',
    )
    const ids = feed.body.items.map((item) => item.id)
    expect(ids).toContain(published.id)
    expect(ids).not.toContain(draft.id)
    expect(ids).not.toContain(priv.id)
    expect(ids).not.toContain(unlisted.id)
    expect(ids).not.toContain(removed.id)
  })

  it('stops showing an organisation’s events once it is suspended', async () => {
    const owner = await createUser(app)
    const org = await createOrganization(owner)
    const fan = await createUser(app)
    await follow(fan, org.slug)
    const event = await createPublishedEvent(owner, {
      organizationId: org.id,
      title: 'Soon hidden',
    })

    const before = await fan.client.get<{ items: Array<{ id: string }> }>(
      '/api/v1/me/feed?pageSize=50',
    )
    expect(before.body.items.map((item) => item.id)).toContain(event.id)

    await prisma.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } })
    const after = await fan.client.get<{ items: Array<{ id: string }> }>(
      '/api/v1/me/feed?pageSize=50',
    )
    expect(after.body.items.map((item) => item.id)).not.toContain(event.id)
  })

  it('still includes events from people the viewer follows', async () => {
    const author = await createUser(app)
    const reader = await createUser(app)
    const event = await createPublishedEvent(author, { title: 'Person event' })
    await reader.client.post(`/api/v1/profiles/${author.username}/follow`)

    const feed = await reader.client.get<{ items: Array<{ id: string }> }>(
      '/api/v1/me/feed?pageSize=50',
    )
    expect(feed.body.items.map((item) => item.id)).toContain(event.id)
  })
})
