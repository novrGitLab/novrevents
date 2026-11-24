import { isUniqueViolation, prisma } from '../../lib/db.js'
import { badRequest } from '../../lib/errors.js'
import { notify } from '../notifications/notifications.service.js'
import { findVisibleProfile, toProfileCards } from '../profiles/profile.service.js'

export async function follow(followerId: string, username: string) {
  const { profile, isSelf } = await findVisibleProfile(username, followerId)
  if (isSelf) throw badRequest('You cannot follow yourself.', 'CANNOT_FOLLOW_SELF')

  try {
    await prisma.$transaction(async (tx) => {
      await tx.follow.create({ data: { followerId, followingId: profile.userId } })
      const follower = await tx.profile.findUniqueOrThrow({
        where: { userId: followerId },
        select: { username: true, displayName: true, visibility: true },
      })
      await notify(tx, {
        userId: profile.userId,
        type: 'NEW_FOLLOWER',
        title: `${follower.displayName} started following you`,
        linkPath: follower.visibility === 'PUBLIC' ? `/u/${follower.username}` : null,
      })
    })
  } catch (error) {
    // Already following: the request is idempotent, so this is a success.
    if (!isUniqueViolation(error)) throw error
  }
  return {
    following: true,
    followerCount: await prisma.follow.count({ where: { followingId: profile.userId } }),
  }
}

export async function unfollow(followerId: string, username: string) {
  // Unfollowing must work even after the target made their profile private or was suspended.
  const profile = await prisma.profile.findUnique({ where: { username }, select: { userId: true } })
  if (profile) {
    await prisma.follow.deleteMany({ where: { followerId, followingId: profile.userId } })
  }
  return {
    following: false,
    followerCount: profile
      ? await prisma.follow.count({ where: { followingId: profile.userId } })
      : 0,
  }
}

const cardSelect = {
  userId: true,
  username: true,
  displayName: true,
  headline: true,
  avatarKey: true,
  publicFields: true,
} as const

/** People who follow `username`. Only public, active profiles are listed. */
export async function listFollowers(
  username: string,
  viewerId: string | null,
  page: number,
  pageSize: number,
) {
  const { profile } = await findVisibleProfile(username, viewerId)
  const where = {
    followingId: profile.userId,
    follower: { status: 'ACTIVE' as const, profile: { visibility: 'PUBLIC' as const } },
  }
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { follower: { select: { profile: { select: cardSelect } } } },
    }),
    prisma.follow.count({ where }),
  ])
  const profiles = rows.flatMap((row) => (row.follower.profile ? [row.follower.profile] : []))
  return { items: await toProfileCards(profiles, viewerId), total }
}

/** People `username` follows. Only public, active profiles are listed. */
export async function listFollowing(
  username: string,
  viewerId: string | null,
  page: number,
  pageSize: number,
) {
  const { profile } = await findVisibleProfile(username, viewerId)
  const where = {
    followerId: profile.userId,
    following: { status: 'ACTIVE' as const, profile: { visibility: 'PUBLIC' as const } },
  }
  const [rows, total] = await Promise.all([
    prisma.follow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { following: { select: { profile: { select: cardSelect } } } },
    }),
    prisma.follow.count({ where }),
  ])
  const profiles = rows.flatMap((row) => (row.following.profile ? [row.following.profile] : []))
  return { items: await toProfileCards(profiles, viewerId), total }
}
