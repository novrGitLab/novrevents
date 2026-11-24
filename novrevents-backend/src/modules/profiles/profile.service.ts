import QRCode from 'qrcode'
import { appUrl } from '../../config/env.js'
import { isUniqueViolation, type Prisma, prisma } from '../../lib/db.js'
import { conflict, notFound } from '../../lib/errors.js'
import { deleteStoredFiles, publicFileUrl } from '../../lib/storage/index.js'
import { storeImage } from '../../lib/uploads.js'
import { PUBLIC_FIELDS, SOCIAL_KEYS, type PublicField } from './profile.schemas.js'

type SocialLinks = Record<(typeof SOCIAL_KEYS)[number], string | null>

export function socialLinksOf(value: unknown): SocialLinks {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return Object.fromEntries(
    SOCIAL_KEYS.map((key) => [
      key,
      typeof source[key] === 'string' && source[key] ? (source[key] as string) : null,
    ]),
  ) as SocialLinks
}

const publicFieldsOf = (fields: string[]): PublicField[] =>
  PUBLIC_FIELDS.filter((field) => fields.includes(field))

export const profileUrlFor = (username: string) => `${appUrl}/u/${username}`

async function followCounts(userId: string) {
  const [followerCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ])
  return { followerCount, followingCount }
}

export async function getOwnProfile(userId: string) {
  const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } })
  return {
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    headline: profile.headline,
    bio: profile.bio,
    avatarUrl: publicFileUrl(profile.avatarKey),
    socialLinks: socialLinksOf(profile.socialLinks),
    visibility: profile.visibility,
    publicFields: publicFieldsOf(profile.publicFields),
    shareRegistrations: profile.shareRegistrations,
    ...(await followCounts(userId)),
    profileUrl: profileUrlFor(profile.username),
  }
}

export interface ProfilePatch {
  displayName?: string
  username?: string
  headline?: string | null
  bio?: string | null
  socialLinks?: Partial<SocialLinks>
  visibility?: 'PUBLIC' | 'PRIVATE'
  publicFields?: PublicField[]
  shareRegistrations?: boolean
}

export async function updateOwnProfile(userId: string, patch: ProfilePatch) {
  const data: Prisma.ProfileUpdateInput = {}
  if (patch.displayName !== undefined) data.displayName = patch.displayName
  if (patch.username !== undefined) data.username = patch.username
  if (patch.headline !== undefined) data.headline = patch.headline
  if (patch.bio !== undefined) data.bio = patch.bio
  if (patch.visibility !== undefined) data.visibility = patch.visibility
  if (patch.publicFields !== undefined) data.publicFields = [...new Set(patch.publicFields)]
  if (patch.shareRegistrations !== undefined) data.shareRegistrations = patch.shareRegistrations
  if (patch.socialLinks !== undefined) {
    const current = await prisma.profile.findUniqueOrThrow({
      where: { userId },
      select: { socialLinks: true },
    })
    const merged = { ...socialLinksOf(current.socialLinks), ...patch.socialLinks }
    data.socialLinks = Object.fromEntries(Object.entries(merged).filter(([, value]) => value))
  }
  try {
    await prisma.profile.update({ where: { userId }, data })
  } catch (error) {
    if (isUniqueViolation(error))
      throw conflict('That username is already taken.', 'USERNAME_TAKEN')
    throw error
  }
  return getOwnProfile(userId)
}

export async function setAvatar(userId: string, image: Buffer) {
  const key = await storeImage('avatars', image)
  const previous = await prisma.profile.findUniqueOrThrow({
    where: { userId },
    select: { avatarKey: true },
  })
  await prisma.profile.update({ where: { userId }, data: { avatarKey: key } })
  await deleteStoredFiles([previous.avatarKey])
  return getOwnProfile(userId)
}

export async function removeAvatar(userId: string) {
  const previous = await prisma.profile.findUniqueOrThrow({
    where: { userId },
    select: { avatarKey: true },
  })
  await prisma.profile.update({ where: { userId }, data: { avatarKey: null } })
  await deleteStoredFiles([previous.avatarKey])
  return getOwnProfile(userId)
}

/**
 * Loads a profile that `viewerId` is allowed to see. Private profiles and profiles of suspended
 * accounts are reported as "not found" to everyone but their owner.
 */
export async function findVisibleProfile(username: string, viewerId: string | null) {
  const profile = await prisma.profile.findUnique({
    where: { username },
    include: { user: { select: { status: true } } },
  })
  if (!profile) throw notFound('Profile')
  const isSelf = viewerId === profile.userId
  if (!isSelf && (profile.visibility !== 'PUBLIC' || profile.user.status !== 'ACTIVE'))
    throw notFound('Profile')
  return { profile, isSelf }
}

export async function getPublicProfile(username: string, viewerId: string | null) {
  const { profile, isSelf } = await findVisibleProfile(username, viewerId)
  // The owner previews exactly what the public sees, so the same field filter applies to them.
  const shown = new Set(profile.publicFields)
  const [counts, isFollowing, organizedEventCount] = await Promise.all([
    followCounts(profile.userId),
    viewerId && !isSelf
      ? prisma.follow
          .count({ where: { followerId: viewerId, followingId: profile.userId } })
          .then((n) => n > 0)
      : Promise.resolve(false),
    prisma.event.count({
      where: {
        ownerId: profile.userId,
        visibility: 'PUBLIC',
        status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
        moderationStatus: { not: 'REMOVED' },
      },
    }),
  ])
  return {
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: shown.has('avatar') ? publicFileUrl(profile.avatarKey) : null,
    headline: shown.has('headline') ? profile.headline : null,
    bio: shown.has('bio') ? profile.bio : null,
    socialLinks: shown.has('socialLinks') ? socialLinksOf(profile.socialLinks) : null,
    ...counts,
    organizedEventCount,
    isSelf,
    isFollowing,
    canSeeRegistrations: isSelf || (profile.shareRegistrations && isFollowing),
  }
}

/** QR code that opens the public profile. Kept entirely separate from ticket QR credentials. */
export async function profileQrCode(
  username: string,
  viewerId: string | null,
  format: 'svg' | 'png',
) {
  const { profile } = await findVisibleProfile(username, viewerId)
  if (profile.visibility !== 'PUBLIC') {
    throw conflict('Make your profile public to share it with a QR code.', 'PROFILE_PRIVATE')
  }
  const url = profileUrlFor(profile.username)
  const options = { errorCorrectionLevel: 'M' as const, margin: 2, width: 512 }
  if (format === 'svg') {
    return {
      contentType: 'image/svg+xml',
      body: await QRCode.toString(url, { ...options, type: 'svg' }),
    }
  }
  return { contentType: 'image/png', body: await QRCode.toBuffer(url, { ...options, type: 'png' }) }
}

/** Shapes profiles for follower/following lists, applying each owner's public-field choices. */
export async function toProfileCards(
  profiles: Array<{
    userId: string
    username: string
    displayName: string
    headline: string | null
    avatarKey: string | null
    publicFields: string[]
  }>,
  viewerId: string | null,
) {
  const followed = viewerId
    ? new Set(
        (
          await prisma.follow.findMany({
            where: {
              followerId: viewerId,
              followingId: { in: profiles.map((profile) => profile.userId) },
            },
            select: { followingId: true },
          })
        ).map((follow) => follow.followingId),
      )
    : new Set<string>()
  return profiles.map((profile) => ({
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.publicFields.includes('avatar') ? publicFileUrl(profile.avatarKey) : null,
    headline: profile.publicFields.includes('headline') ? profile.headline : null,
    isFollowing: followed.has(profile.userId),
    isSelf: viewerId === profile.userId,
  }))
}
