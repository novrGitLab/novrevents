import { prisma, type Prisma } from '../../lib/db.js'
import { notFound } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'

/** Events an organisation shows publicly. Mirrors the public organisation page's count. */
const publicEventWhere = (organizationId: string): Prisma.EventWhereInput => ({
  organizationId,
  visibility: 'PUBLIC' as const,
  status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] as const },
  moderationStatus: { not: 'REMOVED' as const },
})

async function findOrganization(slug: string) {
  return prisma.organization.findUnique({ where: { slug }, select: { id: true, status: true } })
}

/** Follower count, and whether the viewer (if any) follows. Public: the count is shown on the organisation page. */
export async function organizationFollowState(organizationId: string, viewerId: string | null) {
  const [followerCount, following] = await Promise.all([
    prisma.organizationFollow.count({ where: { organizationId } }),
    viewerId
      ? prisma.organizationFollow
          .count({ where: { organizationId, followerId: viewerId } })
          .then((count) => count > 0)
      : Promise.resolve(false),
  ])
  return { following, followerCount }
}

/**
 * Idempotent: following again is a no-op, not an error. Suspended and unknown organisations are reported as
 * "not found", so a suspended organisation cannot gain new followers.
 */
export async function followOrganization(followerId: string, slug: string) {
  const org = await findOrganization(slug)
  if (!org || org.status !== 'ACTIVE') throw notFound('Organization')
  await prisma.organizationFollow.createMany({
    data: [{ followerId, organizationId: org.id }],
    skipDuplicates: true,
  })
  return organizationFollowState(org.id, followerId)
}

/** Idempotent. Works even after the organisation is suspended, so people can always stop following. */
export async function unfollowOrganization(followerId: string, slug: string) {
  const org = await findOrganization(slug)
  if (!org) throw notFound('Organization')
  await prisma.organizationFollow.deleteMany({ where: { followerId, organizationId: org.id } })
  return organizationFollowState(org.id, followerId)
}

/** Active organisations the person follows, newest follow first. Suspended organisations are not listed. */
export async function listFollowedOrganizations(userId: string, page: number, pageSize: number) {
  const where = { followerId: userId, organization: { status: 'ACTIVE' as const } }
  const [rows, total] = await Promise.all([
    prisma.organizationFollow.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { organizationId: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        organization: { select: { id: true, slug: true, name: true, logoKey: true } },
      },
    }),
    prisma.organizationFollow.count({ where }),
  ])
  const items = await Promise.all(
    rows.map(async ({ organization }) => ({
      slug: organization.slug,
      name: organization.name,
      logoUrl: publicFileUrl(organization.logoKey),
      publicEventCount: await prisma.event.count({ where: publicEventWhere(organization.id) }),
    })),
  )
  return { items, total }
}
