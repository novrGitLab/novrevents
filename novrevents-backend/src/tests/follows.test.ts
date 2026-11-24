import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../lib/db.js'
import {
  createPublishedEvent,
  createTestApp,
  createUser,
  errorCode,
  TestClient,
} from './helpers.js'

interface FollowState {
  following: boolean
  followerCount: number
}
interface PublicProfile {
  username: string
  followerCount: number
  followingCount: number
  isFollowing: boolean
  isSelf: boolean
}
interface Page<T> {
  items: T[]
  total: number
}

let app: FastifyInstance

beforeAll(async () => {
  app = await createTestApp()
})

afterAll(async () => {
  await app.close()
})

describe('follow and unfollow', () => {
  it('follows a user, updates counts and notifies them once', async () => {
    const alice = await createUser(app, { displayName: 'Alice Analyst' })
    const bob = await createUser(app)

    const follow = await alice.client.post<FollowState>(`/api/v1/profiles/${bob.username}/follow`)
    expect(follow.status).toBe(200)
    expect(follow.body).toEqual({ following: true, followerCount: 1 })

    // Following again is idempotent and does not create a second notification.
    const again = await alice.client.post<FollowState>(`/api/v1/profiles/${bob.username}/follow`)
    expect(again.body).toEqual({ following: true, followerCount: 1 })

    const notifications = await prisma.notification.findMany({
      where: { userId: bob.id, type: 'NEW_FOLLOWER' },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.title).toContain('Alice Analyst')

    const bobProfile = await alice.client.get<PublicProfile>(`/api/v1/profiles/${bob.username}`)
    expect(bobProfile.body).toMatchObject({ followerCount: 1, isFollowing: true, isSelf: false })
    const aliceProfile = await alice.client.get<PublicProfile>(`/api/v1/profiles/${alice.username}`)
    expect(aliceProfile.body).toMatchObject({ followingCount: 1, isSelf: true })
  })

  it('unfollows', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    await alice.client.post(`/api/v1/profiles/${bob.username}/follow`)

    const unfollow = await alice.client.delete<FollowState>(
      `/api/v1/profiles/${bob.username}/follow`,
    )
    expect(unfollow.body).toEqual({ following: false, followerCount: 0 })
    expect(
      await prisma.follow.count({ where: { followerId: alice.id, followingId: bob.id } }),
    ).toBe(0)
  })

  it('rejects following yourself, anonymously, or a profile that cannot be seen', async () => {
    const alice = await createUser(app)
    const hidden = await createUser(app)
    await hidden.client.patch('/api/v1/profiles/me', { visibility: 'PRIVATE' })

    const self = await alice.client.post(`/api/v1/profiles/${alice.username}/follow`)
    expect(self.status).toBe(400)
    expect(errorCode(self)).toBe('CANNOT_FOLLOW_SELF')

    expect(
      (await new TestClient(app).post(`/api/v1/profiles/${alice.username}/follow`)).status,
    ).toBe(401)
    expect((await alice.client.post(`/api/v1/profiles/${hidden.username}/follow`)).status).toBe(404)
    expect((await alice.client.post('/api/v1/profiles/no-such-user-anywhere/follow')).status).toBe(
      404,
    )
  })

  it('lists followers and following, leaving out private profiles', async () => {
    const star = await createUser(app)
    const fan = await createUser(app)
    const shyFan = await createUser(app)
    await fan.client.post(`/api/v1/profiles/${star.username}/follow`)
    await shyFan.client.post(`/api/v1/profiles/${star.username}/follow`)
    await shyFan.client.patch('/api/v1/profiles/me', { visibility: 'PRIVATE' })

    const followers = await new TestClient(app).get<Page<{ username: string }>>(
      `/api/v1/profiles/${star.username}/followers`,
    )
    expect(followers.body.items.map((item) => item.username)).toEqual([fan.username])

    const following = await new TestClient(app).get<Page<{ username: string }>>(
      `/api/v1/profiles/${fan.username}/following`,
    )
    expect(following.body.items.map((item) => item.username)).toEqual([star.username])
  })
})

describe('followed organisers', () => {
  it('notifies followers when a followed user publishes a public event, and shows it in their feed', async () => {
    const organiser = await createUser(app, { displayName: 'Octavia Organiser' })
    const follower = await createUser(app)
    const bystander = await createUser(app)
    await follower.client.post(`/api/v1/profiles/${organiser.username}/follow`)

    const event = await createPublishedEvent(organiser, { title: 'Followers Only Heads-up' })

    const notified = await prisma.notification.findMany({
      where: { userId: follower.id, type: 'FOLLOWED_USER_EVENT' },
    })
    expect(notified).toHaveLength(1)
    expect(notified[0]).toMatchObject({
      body: 'Followers Only Heads-up',
      linkPath: `/events/${event.slug}`,
    })
    expect(
      await prisma.notification.count({
        where: { userId: bystander.id, type: 'FOLLOWED_USER_EVENT' },
      }),
    ).toBe(0)

    const feed = await follower.client.get<Page<{ slug: string }>>('/api/v1/me/feed')
    expect(feed.body.items.map((item) => item.slug)).toEqual([event.slug])
    const emptyFeed = await bystander.client.get<Page<{ slug: string }>>('/api/v1/me/feed')
    expect(emptyFeed.body.items).toHaveLength(0)

    const inbox = await follower.client.get<{ unreadCount: number; items: Array<{ id: string }> }>(
      '/api/v1/notifications',
    )
    expect(inbox.body.unreadCount).toBe(1)
    await follower.client.post(`/api/v1/notifications/${inbox.body.items[0]?.id}/read`)
    const after = await follower.client.get<{ unreadCount: number }>('/api/v1/notifications')
    expect(after.body.unreadCount).toBe(0)
  })

  it('does not announce unlisted or private events to followers', async () => {
    const organiser = await createUser(app)
    const follower = await createUser(app)
    await follower.client.post(`/api/v1/profiles/${organiser.username}/follow`)

    await createPublishedEvent(organiser, { visibility: 'UNLISTED' })
    await createPublishedEvent(organiser, { visibility: 'PRIVATE' })

    expect(
      await prisma.notification.count({
        where: { userId: follower.id, type: 'FOLLOWED_USER_EVENT' },
      }),
    ).toBe(0)
    const feed = await follower.client.get<Page<unknown>>('/api/v1/me/feed')
    expect(feed.body.items).toHaveLength(0)
  })
})
