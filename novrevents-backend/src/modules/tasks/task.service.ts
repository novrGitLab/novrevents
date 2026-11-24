import { prisma, type Prisma } from '../../lib/db.js'
import { badRequest, forbidden, notFound } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import type { TaskKind, TaskStatus } from '../../generated/prisma/client.js'
import { requireEventAccess, roleCan } from '../events/event-access.js'
import { notify } from '../notifications/notifications.service.js'
import { isOnEventTeam } from './team.service.js'

/** The standard preparation checklist an organiser can add to any event with one action. */
export const STANDARD_CHECKLIST = [
  'Confirm the date, time and venue',
  'Complete the event description and upload a banner',
  'Build and publish the registration form',
  'Publish the event',
  'Confirm speakers and finalise the agenda',
  'Recruit and brief volunteers',
  'Schedule the attendee reminder',
  'Test QR check-in on a staff device',
  'Prepare the certificate template',
  'Send a thank-you message and feedback form after the event',
]

const taskInclude = {
  assignee: {
    select: {
      id: true,
      profile: { select: { username: true, displayName: true, avatarKey: true } },
    },
  },
} as const

type TaskWithAssignee = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

function toTask(task: TaskWithAssignee) {
  return {
    id: task.id,
    kind: task.kind,
    title: task.title,
    description: task.description,
    status: task.status,
    dueAt: task.dueAt,
    sortOrder: task.sortOrder,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignee: task.assignee
      ? {
          userId: task.assignee.id,
          username: task.assignee.profile?.username ?? '',
          displayName: task.assignee.profile?.displayName ?? '',
          avatarUrl: publicFileUrl(task.assignee.profile?.avatarKey),
        }
      : null,
  }
}

export interface TaskInput {
  title?: string
  description?: string | null
  kind?: TaskKind
  status?: TaskStatus
  assigneeId?: string | null
  dueAt?: Date | null
}

export async function listTasks(
  userId: string,
  eventId: string,
  filter: { kind?: TaskKind; status?: TaskStatus; assignedToMe?: boolean },
) {
  await requireEventAccess(userId, eventId, 'checkin')
  const tasks = await prisma.task.findMany({
    where: {
      eventId,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.assignedToMe ? { assigneeId: userId } : {}),
    },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: taskInclude,
  })
  return tasks.map(toTask)
}

async function assertAssignable(
  event: { id: string; ownerId: string; organizationId: string | null },
  assigneeId: string | null | undefined,
): Promise<void> {
  if (!assigneeId) return
  if (!(await isOnEventTeam(assigneeId, event))) {
    throw badRequest(
      'Tasks can only be assigned to members of the event team.',
      'ASSIGNEE_NOT_ON_TEAM',
    )
  }
}

const completionFor = (status: TaskStatus | undefined) =>
  status === undefined ? {} : { completedAt: status === 'DONE' ? new Date() : null }

export async function createTask(
  userId: string,
  eventId: string,
  input: TaskInput & { title: string },
) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  await assertAssignable(event, input.assigneeId)
  const kind = input.kind ?? 'TASK'
  const last = await prisma.task.aggregate({ where: { eventId, kind }, _max: { sortOrder: true } })

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        eventId,
        kind,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? 'TODO',
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        createdById: userId,
        ...completionFor(input.status),
      },
      include: taskInclude,
    })
    if (created.assigneeId && created.assigneeId !== userId) {
      await notify(tx, {
        userId: created.assigneeId,
        type: 'TASK_ASSIGNED',
        title: `New task for ${event.title}`,
        body: created.title,
        linkPath: `/dashboard/events/${eventId}/tasks`,
      })
    }
    return created
  })
  return toTask(task)
}

export async function updateTask(
  userId: string,
  eventId: string,
  taskId: string,
  patch: TaskInput,
) {
  const { event, role } = await requireEventAccess(userId, eventId, 'checkin')
  const existing = await prisma.task.findFirst({ where: { id: taskId, eventId } })
  if (!existing) throw notFound('Task')

  // Check-in staff may only move their own tasks between statuses.
  if (!roleCan(role, 'manage')) {
    const onlyStatus = Object.keys(patch).every((key) => key === 'status')
    if (existing.assigneeId !== userId || !onlyStatus) {
      throw forbidden('You can only update the status of tasks assigned to you.')
    }
  }
  if (patch.assigneeId !== undefined) await assertAssignable(event, patch.assigneeId)

  const task = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: { ...patch, ...completionFor(patch.status) },
      include: taskInclude,
    })
    const newlyAssigned =
      patch.assigneeId && patch.assigneeId !== existing.assigneeId && patch.assigneeId !== userId
    if (newlyAssigned) {
      await notify(tx, {
        userId: patch.assigneeId as string,
        type: 'TASK_ASSIGNED',
        title: `New task for ${event.title}`,
        body: updated.title,
        linkPath: `/dashboard/events/${eventId}/tasks`,
      })
    }
    return updated
  })
  return toTask(task)
}

export async function deleteTask(userId: string, eventId: string, taskId: string): Promise<void> {
  await requireEventAccess(userId, eventId, 'manage')
  const result = await prisma.task.deleteMany({ where: { id: taskId, eventId } })
  if (result.count === 0) throw notFound('Task')
}

/** Adds the standard checklist items that the event does not already have. */
export async function addStandardChecklist(userId: string, eventId: string): Promise<number> {
  await requireEventAccess(userId, eventId, 'manage')
  const existing = await prisma.task.findMany({
    where: { eventId, kind: 'CHECKLIST' },
    select: { title: true, sortOrder: true },
  })
  const titles = new Set(existing.map((task) => task.title))
  const start = existing.reduce((max, task) => Math.max(max, task.sortOrder), -1) + 1
  const missing = STANDARD_CHECKLIST.filter((title) => !titles.has(title))
  if (missing.length === 0) return 0
  const result = await prisma.task.createMany({
    data: missing.map((title, index) => ({
      eventId,
      kind: 'CHECKLIST' as const,
      title,
      sortOrder: start + index,
      createdById: userId,
    })),
  })
  return result.count
}
