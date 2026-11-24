import { z } from 'zod'
import { optionalHttpUrl, optionalText, requiredText } from '../../lib/http.js'
import { usernameField } from '../auth/auth.schemas.js'

/** Optional profile fields the owner can choose to show on the public profile. */
export const PUBLIC_FIELDS = ['avatar', 'headline', 'bio', 'socialLinks'] as const
export type PublicField = (typeof PUBLIC_FIELDS)[number]

export const SOCIAL_KEYS = ['website', 'linkedin', 'github', 'x'] as const

export const socialLinksInput = z.object({
  website: optionalHttpUrl,
  linkedin: optionalHttpUrl,
  github: optionalHttpUrl,
  x: optionalHttpUrl,
})

export const socialLinksSchema = z
  .object({
    website: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    x: z.string().nullable(),
  })
  .meta({ id: 'SocialLinks' })

export const updateProfileBody = z
  .object({
    displayName: requiredText(2, 80),
    username: usernameField,
    headline: optionalText(120),
    bio: optionalText(600),
    socialLinks: socialLinksInput,
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    publicFields: z.array(z.enum(PUBLIC_FIELDS)).max(PUBLIC_FIELDS.length),
    /** Show events you are registered for to your followers. Off unless you turn it on. */
    shareRegistrations: z.boolean(),
  })
  .partial()

export const ownProfileSchema = z
  .object({
    userId: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    socialLinks: socialLinksSchema,
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    publicFields: z.array(z.enum(PUBLIC_FIELDS)),
    shareRegistrations: z.boolean(),
    followerCount: z.number().int(),
    followingCount: z.number().int(),
    /** Absolute URL of the public profile; this is what the profile QR code encodes. */
    profileUrl: z.string(),
  })
  .meta({ id: 'OwnProfile' })

export const publicProfileSchema = z
  .object({
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    socialLinks: socialLinksSchema.nullable(),
    followerCount: z.number().int(),
    followingCount: z.number().int(),
    organizedEventCount: z.number().int(),
    isSelf: z.boolean(),
    isFollowing: z.boolean(),
    /** True when this viewer is allowed to see the events this person is registered for. */
    canSeeRegistrations: z.boolean(),
  })
  .meta({ id: 'PublicProfile' })

export const profileCardSchema = z
  .object({
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    headline: z.string().nullable(),
    isFollowing: z.boolean(),
    isSelf: z.boolean(),
  })
  .meta({ id: 'ProfileCard' })

export const usernameParams = z.object({ username: z.string().trim().toLowerCase().min(1).max(40) })
