import { z } from 'zod'
import { optionalHttpUrl, optionalText, requiredText } from '../../lib/http.js'

export const orgRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER'])

export const createOrganizationBody = z.object({
  name: requiredText(2, 100),
  description: optionalText(1000),
  websiteUrl: optionalHttpUrl,
})

export const updateOrganizationBody = createOrganizationBody.partial()

export const organizationSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    /** The caller's role in this organisation. */
    role: orgRoleSchema,
    memberCount: z.number().int(),
    eventCount: z.number().int(),
    createdAt: z.date(),
  })
  .meta({ id: 'Organization' })

export const publicOrganizationSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    websiteUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    publicEventCount: z.number().int(),
    followerCount: z.number().int(),
    /** Whether the signed-in viewer follows this organisation. Always false for anonymous visitors. */
    following: z.boolean(),
  })
  .meta({ id: 'PublicOrganization' })

export const memberSchema = z
  .object({
    userId: z.uuid(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    role: orgRoleSchema,
    joinedAt: z.date(),
  })
  .meta({ id: 'OrganizationMember' })

/** Members are added by username: a public identifier, so no email addresses are disclosed. */
export const addMemberBody = z.object({
  username: z.string().trim().toLowerCase().min(1).max(40),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})

export const updateMemberBody = z.object({ role: orgRoleSchema })

export const memberParams = z.object({ id: z.uuid(), userId: z.uuid() })
export const slugParams = z.object({ slug: z.string().trim().toLowerCase().min(1).max(80) })
