import { isUniqueViolation, prisma } from '../../lib/db.js'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import type { EventTeamRole } from '../../generated/prisma/client.js'
import { requireEventAccess, resolveEventRole } from '../events/event-access.js'
import { notify } from '../notifications/notifications.service.js'

const personSelect = {
  profile: { select: { username: true, displayName: true, avatarKey: true } },
} as const

type Person = {
  profile: { username: string; displayName: string; avatarKey: string | null } | null
}

const toPerson = (userId: string, user: Person) => ({
  userId,
  username: user.profile?.username ?? '',
  displayName: user.profile?.displayName ?? '',
  avatarUrl: publicFileUrl(user.profile?.avatarKey),
})

/** The owner followed by the team members added to the event. */
export async function listTeam(userId: string, eventId: string) {
  const { event } = await requireEventAccess(userId, eventId, 'checkin')
  const [owner, members] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: event.ownerId }, select: personSelect }),
    prisma.eventTeamMember.findMany({
      where: { eventId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: personSelect } },
    }),
  ])
  return [
    { ...toPerson(event.ownerId, owner), role: 'OWNER' as const, addedAt: event.createdAt },
    ...members.map((member) => ({
      ...toPerson(member.userId, member.user),
      role: member.role,
      addedAt: member.createdAt,
    })),
  ]
}

export async function addTeamMember(
  actorId: string,
  eventId: string,
  input: { username: string; role: EventTeamRole },
): Promise<string> {
  const { event } = await requireEventAccess(actorId, eventId, 'admin')
  const profile = await prisma.profile.findUnique({
    where: { username: input.username },
    select: { userId: true, user: { select: { status: true } } },
  })
  if (!profile || profile.user.status !== 'ACTIVE') throw notFound('User')
  if (profile.userId === event.ownerId)
    throw badRequest('The event owner is already on the team.', 'ALREADY_MEMBER')
  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventTeamMember.create({
        data: { eventId, userId: profile.userId, role: input.role, addedById: actorId },
      })
      await notify(tx, {
        userId: profile.userId,
        type: 'TEAM_ADDED',
        title: `You were added to the team for ${event.title}`,
        body:
          input.role === 'MANAGER'
            ? 'You can help manage this event.'
            : 'You can check attendees in at this event.',
        linkPath: `/dashboard/events/${eventId}`,
      })
    })
  } catch (error) {
    if (isUniqueViolation(error))
      throw conflict('That user is already on the team.', 'ALREADY_MEMBER')
    throw error
  }
  return profile.userId
}

export async function updateTeamMember(
  actorId: string,
  eventId: string,
  targetUserId: string,
  role: EventTeamRole,
): Promise<void> {
  await requireEventAccess(actorId, eventId, 'admin')
  const result = await prisma.eventTeamMember.updateMany({
    where: { eventId, userId: targetUserId },
    data: { role },
  })
  if (result.count === 0) throw notFound('Team member')
}

/** Owners and organization admins can remove anyone; a team member can remove themselves. */
export async function removeTeamMember(
  actorId: string,
  eventId: string,
  targetUserId: string,
): Promise<void> {
  const { role } = await requireEventAccess(actorId, eventId, 'checkin')
  if (actorId !== targetUserId && role !== 'OWNER' && role !== 'ORG_ADMIN') {
    throw forbidden('Only the event owner can remove team members.')
  }
  const result = await prisma.$transaction(async (tx) => {
    // Tasks assigned to the departing member become unassigned rather than disappearing.
    await tx.task.updateMany({
      where: { eventId, assigneeId: targetUserId },
      data: { assigneeId: null },
    })
    return tx.eventTeamMember.deleteMany({ where: { eventId, userId: targetUserId } })
  })
  if (result.count === 0) throw notFound('Team member')
}

/** True when the user is the owner, an organization admin, or on the event team. */
export async function isOnEventTeam(
  userId: string,
  event: { id: string; ownerId: string; organizationId: string | null },
): Promise<boolean> {
  return (await resolveEventRole(userId, event)) !== null
}
