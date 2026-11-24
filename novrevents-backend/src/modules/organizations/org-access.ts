import { prisma } from '../../lib/db.js'
import { forbidden, notFound } from '../../lib/errors.js'
import type { OrganizationRole } from '../../generated/prisma/client.js'

const RANK: Record<OrganizationRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 }

export async function getOrgRole(
  userId: string,
  organizationId: string,
): Promise<OrganizationRole | null> {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  })
  return membership?.role ?? null
}

/**
 * Tenant boundary for organisation workspaces.
 * Non-members get 404 (the organisation's existence is not confirmed); members without enough
 * authority get 403.
 */
export async function requireOrgRole(
  userId: string,
  organizationId: string,
  minimum: OrganizationRole,
): Promise<OrganizationRole> {
  const role = await getOrgRole(userId, organizationId)
  if (!role) throw notFound('Organization')
  if (RANK[role] < RANK[minimum])
    throw forbidden('Your role in this organization does not allow this.')
  return role
}

export const isOrgAdmin = (role: OrganizationRole | null): boolean =>
  role === 'OWNER' || role === 'ADMIN'
