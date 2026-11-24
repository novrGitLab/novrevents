import { prisma, type Prisma } from '../../lib/db.js'
import { forbidden, notFound } from '../../lib/errors.js'
import type { Event } from '../../generated/prisma/client.js'
import { getOrgRole, isOrgAdmin } from '../organizations/org-access.js'

/**
 * How a user relates to an event:
 *  OWNER      created the event
 *  ORG_ADMIN  owner/admin of the organisation workspace the event belongs to
 *  MANAGER    event team member who can run the event
 *  STAFF      event team member limited to check-in
 */
export type EventRole = 'OWNER' | 'ORG_ADMIN' | 'MANAGER' | 'STAFF'

/**
 *  checkin  scanner, attendee lookup, attendance dashboard
 *  manage   everything about running the event: content, forms, registrations, messages, analytics
 *  admin    team membership, cancellation, archiving, deletion, moving between workspaces
 */
export type EventCapability = 'checkin' | 'manage' | 'admin'

const ALLOWED: Record<EventCapability, readonly EventRole[]> = {
  checkin: ['OWNER', 'ORG_ADMIN', 'MANAGER', 'STAFF'],
  manage: ['OWNER', 'ORG_ADMIN', 'MANAGER'],
  admin: ['OWNER', 'ORG_ADMIN'],
}

export const roleCan = (role: EventRole | null, capability: EventCapability): boolean =>
  role !== null && ALLOWED[capability].includes(role)

export async function resolveEventRole(
  userId: string,
  event: { id: string; ownerId: string; organizationId: string | null },
): Promise<EventRole | null> {
  if (event.ownerId === userId) return 'OWNER'
  if (event.organizationId && isOrgAdmin(await getOrgRole(userId, event.organizationId)))
    return 'ORG_ADMIN'
  const member = await prisma.eventTeamMember.findUnique({
    where: { eventId_userId: { eventId: event.id, userId } },
    select: { role: true },
  })
  return member?.role ?? null
}

/**
 * The single authorisation gate for organiser-side event data.
 * A user with no relationship to the event gets 404 so the event's existence is not disclosed;
 * a team member without the required capability gets 403.
 */
export async function requireEventAccess(
  userId: string,
  eventId: string,
  capability: EventCapability,
): Promise<{ event: Event; role: EventRole }> {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw notFound('Event')
  const role = await resolveEventRole(userId, event)
  if (!role) throw notFound('Event')
  if (!roleCan(role, capability)) throw forbidden('Your role on this event does not allow this.')
  return { event, role }
}

/** Prisma filter matching every event the user can work on in any capacity. */
export function eventsAccessibleBy(userId: string): Prisma.EventWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { team: { some: { userId } } },
      { organization: { members: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } } } },
    ],
  }
}
