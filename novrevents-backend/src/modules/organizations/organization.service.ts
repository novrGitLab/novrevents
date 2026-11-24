import { isUniqueViolation, prisma, type Prisma } from '../../lib/db.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { slugify, slugWithSuffix } from '../../lib/slug.js'
import { deleteStoredFiles, publicFileUrl } from '../../lib/storage/index.js'
import { storeImage } from '../../lib/uploads.js'
import type { OrganizationRole } from '../../generated/prisma/client.js'
import { organizationFollowState } from '../follows/organization-follow.service.js'
import { notify } from '../notifications/notifications.service.js'
import { requireOrgRole } from './org-access.js'

const orgInclude = { _count: { select: { members: true, events: true } } } as const

type OrgWithCounts = Prisma.OrganizationGetPayload<{ include: typeof orgInclude }>

function toOrganization(org: OrgWithCounts, role: OrganizationRole) {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    description: org.description,
    websiteUrl: org.websiteUrl,
    logoUrl: publicFileUrl(org.logoKey),
    status: org.status,
    role,
    memberCount: org._count.members,
    eventCount: org._count.events,
    createdAt: org.createdAt,
  }
}

export async function createOrganization(
  userId: string,
  input: { name: string; description: string | null; websiteUrl: string | null },
) {
  // Prefer the clean slug; fall back to a suffixed one when the name is already in use.
  for (const slug of [
    slugify(input.name),
    slugWithSuffix(input.name),
    slugWithSuffix(input.name),
  ]) {
    try {
      const org = await prisma.organization.create({
        data: {
          slug,
          name: input.name,
          description: input.description,
          websiteUrl: input.websiteUrl,
          createdById: userId,
          members: { create: { userId, role: 'OWNER' } },
        },
        include: orgInclude,
      })
      return toOrganization(org, 'OWNER')
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
    }
  }
  throw conflict('Could not create a unique address for this organization. Try a different name.')
}

export async function listMyOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { organization: { include: orgInclude } },
  })
  return memberships.map((membership) => toOrganization(membership.organization, membership.role))
}

export async function getOrganization(userId: string, organizationId: string) {
  const role = await requireOrgRole(userId, organizationId, 'MEMBER')
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    include: orgInclude,
  })
  return toOrganization(org, role)
}

export async function updateOrganization(
  userId: string,
  organizationId: string,
  patch: { name?: string; description?: string | null; websiteUrl?: string | null },
) {
  const role = await requireOrgRole(userId, organizationId, 'ADMIN')
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: patch,
    include: orgInclude,
  })
  return toOrganization(org, role)
}

export async function setOrganizationLogo(userId: string, organizationId: string, image: Buffer) {
  const role = await requireOrgRole(userId, organizationId, 'ADMIN')
  const key = await storeImage('logos', image)
  const previous = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { logoKey: true },
  })
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { logoKey: key },
    include: orgInclude,
  })
  await deleteStoredFiles([previous.logoKey])
  return toOrganization(org, role)
}

/** Only an empty workspace can be deleted, so events and forms are never orphaned by accident. */
export async function deleteOrganization(userId: string, organizationId: string): Promise<void> {
  await requireOrgRole(userId, organizationId, 'OWNER')
  const [events, forms] = await Promise.all([
    prisma.event.count({ where: { organizationId } }),
    prisma.form.count({ where: { organizationId } }),
  ])
  if (events > 0 || forms > 0) {
    throw conflict(
      'Move or delete this organization’s events and forms before deleting it.',
      'ORGANIZATION_NOT_EMPTY',
    )
  }
  const org = await prisma.organization.delete({
    where: { id: organizationId },
    select: { logoKey: true },
  })
  await deleteStoredFiles([org.logoKey])
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function listMembers(userId: string, organizationId: string) {
  await requireOrgRole(userId, organizationId, 'MEMBER')
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    include: {
      user: {
        select: { profile: { select: { username: true, displayName: true, avatarKey: true } } },
      },
    },
  })
  return members.map((member) => ({
    userId: member.userId,
    username: member.user.profile?.username ?? '',
    displayName: member.user.profile?.displayName ?? '',
    avatarUrl: publicFileUrl(member.user.profile?.avatarKey),
    role: member.role,
    joinedAt: member.createdAt,
  }))
}

export async function addMember(
  actorId: string,
  organizationId: string,
  input: { username: string; role: 'ADMIN' | 'MEMBER' },
) {
  await requireOrgRole(actorId, organizationId, 'ADMIN')
  const profile = await prisma.profile.findUnique({
    where: { username: input.username },
    select: { userId: true, user: { select: { status: true } } },
  })
  if (!profile || profile.user.status !== 'ACTIVE') throw notFound('User')
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  })
  try {
    await prisma.$transaction(async (tx) => {
      await tx.organizationMember.create({
        data: { organizationId, userId: profile.userId, role: input.role },
      })
      await notify(tx, {
        userId: profile.userId,
        type: 'ORGANIZATION_ADDED',
        title: `You were added to ${org.name}`,
        body: `You are now a ${input.role === 'ADMIN' ? 'workspace admin' : 'member'} of this organization.`,
        linkPath: `/dashboard/organizations/${organizationId}`,
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('That user is already a member.', 'ALREADY_MEMBER')
    throw error
  }
  return profile.userId
}

async function assertNotLastOwner(organizationId: string, userId: string): Promise<void> {
  const owners = await prisma.organizationMember.findMany({
    where: { organizationId, role: 'OWNER' },
    select: { userId: true },
  })
  if (owners.length === 1 && owners[0]?.userId === userId) {
    throw conflict('An organization must keep at least one owner.', 'LAST_OWNER')
  }
}

export async function updateMemberRole(
  actorId: string,
  organizationId: string,
  targetUserId: string,
  role: OrganizationRole,
): Promise<void> {
  const actorRole = await requireOrgRole(actorId, organizationId, 'ADMIN')
  const target = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  })
  if (!target) throw notFound('Member')
  // Only owners may grant or remove ownership.
  if ((role === 'OWNER' || target.role === 'OWNER') && actorRole !== 'OWNER') {
    throw badRequest('Only an owner can change ownership.', 'OWNER_REQUIRED')
  }
  if (target.role === 'OWNER' && role !== 'OWNER')
    await assertNotLastOwner(organizationId, targetUserId)
  await prisma.organizationMember.update({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
    data: { role },
  })
}

/** Admins can remove members; anyone can remove themselves (leave). */
export async function removeMember(
  actorId: string,
  organizationId: string,
  targetUserId: string,
): Promise<void> {
  const actorRole = await requireOrgRole(
    actorId,
    organizationId,
    actorId === targetUserId ? 'MEMBER' : 'ADMIN',
  )
  const target = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  })
  if (!target) throw notFound('Member')
  if (target.role === 'OWNER') {
    if (actorRole !== 'OWNER')
      throw badRequest('Only an owner can remove another owner.', 'OWNER_REQUIRED')
    await assertNotLastOwner(organizationId, targetUserId)
  }
  await prisma.organizationMember.delete({
    where: { organizationId_userId: { organizationId, userId: targetUserId } },
  })
}

// ─── Public ──────────────────────────────────────────────────────────────────

export async function getPublicOrganization(slug: string, viewerId: string | null = null) {
  const org = await prisma.organization.findUnique({ where: { slug } })
  if (!org || org.status !== 'ACTIVE') throw notFound('Organization')
  const publicEventCount = await prisma.event.count({
    where: {
      organizationId: org.id,
      visibility: 'PUBLIC',
      status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
      moderationStatus: { not: 'REMOVED' },
    },
  })
  return {
    slug: org.slug,
    name: org.name,
    description: org.description,
    websiteUrl: org.websiteUrl,
    logoUrl: publicFileUrl(org.logoKey),
    publicEventCount,
    ...(await organizationFollowState(org.id, viewerId)),
  }
}
