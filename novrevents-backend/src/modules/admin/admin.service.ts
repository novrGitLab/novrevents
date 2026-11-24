import { prisma, type Prisma } from '../../lib/db.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { publicFileUrl } from '../../lib/storage/index.js'
import { queueEmail } from '../communications/outbox.js'
import { accountNoticeContent } from '../communications/templates.js'
import { revokeAllSessions } from '../auth/auth.service.js'
import { notify } from '../notifications/notifications.service.js'

// ─── Users ───────────────────────────────────────────────────────────────────

export async function listUsers(query: {
  page: number
  pageSize: number
  q?: string
  status?: 'ACTIVE' | 'SUSPENDED'
  role?: 'USER' | 'ADMIN'
}) {
  const where: Prisma.UserWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { profile: { username: { contains: query.q, mode: 'insensitive' } } },
            { profile: { displayName: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        profile: { select: { username: true, displayName: true, avatarKey: true } },
        _count: { select: { ownedEvents: true, registrations: true } },
      },
    }),
    prisma.user.count({ where }),
  ])
  return {
    items: rows.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.profile?.username ?? '',
      displayName: user.profile?.displayName ?? '',
      avatarUrl: publicFileUrl(user.profile?.avatarKey),
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      eventCount: user._count.ownedEvents,
      registrationCount: user._count.registrations,
    })),
    total,
  }
}

export async function setUserStatus(
  adminId: string,
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED',
  reason: string | null,
) {
  if (adminId === userId)
    throw badRequest('You cannot change the status of your own account.', 'CANNOT_MODIFY_SELF')
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { profile: true } })
  if (!user) throw notFound('User')
  if (status === 'SUSPENDED' && !reason)
    throw badRequest('Give a reason for the suspension.', 'REASON_REQUIRED')
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data:
        status === 'SUSPENDED'
          ? { status, suspendedAt: new Date(), suspendedReason: reason }
          : { status, suspendedAt: null, suspendedReason: null },
    })
    // A suspension ends every active session immediately.
    if (status === 'SUSPENDED') await revokeAllSessions(tx, userId)
    await queueEmail(tx, {
      type: 'ACCOUNT_NOTICE',
      to: { email: user.email, name: user.profile?.displayName },
      userId,
      content: () =>
        accountNoticeContent({
          name: user.profile?.displayName ?? '',
          subject:
            status === 'SUSPENDED'
              ? 'Your account has been suspended'
              : 'Your account has been reinstated',
          message:
            status === 'SUSPENDED'
              ? `Your NOVR Events account has been suspended. Reason: ${reason}. Your public events are hidden while the suspension is in place.`
              : 'Your NOVR Events account is active again.',
        }),
    })
  })
}

export async function setUserRole(adminId: string, userId: string, role: 'USER' | 'ADMIN') {
  if (adminId === userId) throw badRequest('You cannot change your own role.', 'CANNOT_MODIFY_SELF')
  const result = await prisma.user.updateMany({ where: { id: userId }, data: { role } })
  if (result.count === 0) throw notFound('User')
}

// ─── Events and moderation ───────────────────────────────────────────────────

export async function listEvents(query: {
  page: number
  pageSize: number
  q?: string
  moderation?: 'CLEAR' | 'FLAGGED' | 'REMOVED'
  status?: 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED'
}) {
  const where: Prisma.EventWhereInput = {
    ...(query.moderation ? { moderationStatus: query.moderation } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { organizerName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        owner: { select: { id: true, email: true, profile: { select: { username: true } } } },
        _count: { select: { reports: { where: { status: 'OPEN' } }, registrations: true } },
      },
    }),
    prisma.event.count({ where }),
  ])
  return {
    items: rows.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      organizerName: event.organizerName,
      owner: {
        id: event.owner.id,
        email: event.owner.email,
        username: event.owner.profile?.username ?? '',
      },
      status: event.status,
      visibility: event.visibility,
      moderationStatus: event.moderationStatus,
      moderationNote: event.moderationNote,
      startsAt: event.startsAt,
      openReports: event._count.reports,
      registrations: event._count.registrations,
      createdAt: event.createdAt,
    })),
    total,
  }
}

/**
 * CLEAR    visible normally (also dismisses the flag)
 * FLAGGED  still visible; marked for review
 * REMOVED  hidden from every public surface and cannot be re-published by the organiser
 */
export async function moderateEvent(
  eventId: string,
  status: 'CLEAR' | 'FLAGGED' | 'REMOVED',
  note: string | null,
) {
  const event = await prisma.event.findUnique({ where: { id: eventId } })
  if (!event) throw notFound('Event')
  if (status === 'REMOVED' && !note)
    throw badRequest('Explain why the event is being removed.', 'REASON_REQUIRED')
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: { moderationStatus: status, moderationNote: note },
    })
    if (status === 'REMOVED' || status === 'CLEAR') {
      await tx.eventReport.updateMany({
        where: { eventId, status: 'OPEN' },
        data: {
          status: status === 'REMOVED' ? 'RESOLVED' : 'DISMISSED',
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      })
    }
    if (status === 'REMOVED') {
      await notify(tx, {
        userId: event.ownerId,
        type: 'EVENT_MODERATED',
        title: `${event.title} was removed by a moderator`,
        body: note,
        linkPath: `/dashboard/events/${event.id}`,
      })
    }
  })
}

export async function listReports(query: {
  page: number
  pageSize: number
  status?: 'OPEN' | 'RESOLVED' | 'DISMISSED'
}) {
  const where: Prisma.EventReportWhereInput = query.status ? { status: query.status } : {}
  const [rows, total] = await Promise.all([
    prisma.eventReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { event: { select: { id: true, slug: true, title: true, moderationStatus: true } } },
    }),
    prisma.eventReport.count({ where }),
  ])
  return {
    items: rows.map((report) => ({
      id: report.id,
      event: report.event,
      reason: report.reason,
      details: report.details,
      reporterEmail: report.reporterEmail,
      isAnonymous: report.reporterId === null,
      status: report.status,
      resolutionNote: report.resolutionNote,
      resolvedAt: report.resolvedAt,
      createdAt: report.createdAt,
    })),
    total,
  }
}

export async function resolveReport(
  adminId: string,
  reportId: string,
  status: 'RESOLVED' | 'DISMISSED',
  note: string | null,
) {
  const report = await prisma.eventReport.findUnique({ where: { id: reportId } })
  if (!report) throw notFound('Report')
  if (report.status !== 'OPEN')
    throw conflict('This report has already been handled.', 'ALREADY_RESOLVED')
  await prisma.eventReport.update({
    where: { id: reportId },
    data: { status, resolvedById: adminId, resolvedAt: new Date(), resolutionNote: note },
  })
  return report.eventId
}

// ─── Organizations ───────────────────────────────────────────────────────────

export async function listOrganizations(query: {
  page: number
  pageSize: number
  q?: string
  status?: 'ACTIVE' | 'SUSPENDED'
}) {
  const where: Prisma.OrganizationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { members: true, events: true } } },
    }),
    prisma.organization.count({ where }),
  ])
  return {
    items: rows.map((org) => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status,
      memberCount: org._count.members,
      eventCount: org._count.events,
      createdAt: org.createdAt,
    })),
    total,
  }
}

export async function setOrganizationStatus(
  organizationId: string,
  status: 'ACTIVE' | 'SUSPENDED',
) {
  const result = await prisma.organization.updateMany({
    where: { id: organizationId },
    data: { status },
  })
  if (result.count === 0) throw notFound('Organization')
}

// ─── Statistics and audit ────────────────────────────────────────────────────

export async function platformStats() {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [
    users,
    newUsers,
    suspended,
    events,
    publishedEvents,
    flagged,
    openReports,
    organizations,
    registrations,
    submissions,
    checkIns,
    failedEmails,
    signupsPerDay,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gt: since } } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.event.count(),
    prisma.event.count({ where: { status: { in: ['PUBLISHED', 'ONGOING'] } } }),
    prisma.event.count({ where: { moderationStatus: 'FLAGGED' } }),
    prisma.eventReport.count({ where: { status: 'OPEN' } }),
    prisma.organization.count(),
    prisma.registration.count({ where: { status: 'CONFIRMED' } }),
    prisma.formSubmission.count(),
    prisma.checkIn.count(),
    prisma.message.count({ where: { status: 'FAILED', createdAt: { gt: since } } }),
    prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', created_at) AS day, count(*) AS count
          FROM users WHERE created_at > ${since}
         GROUP BY 1 ORDER BY 1`,
  ])
  return {
    users,
    newUsersLast30Days: newUsers,
    suspendedUsers: suspended,
    events,
    liveEvents: publishedEvents,
    flaggedEvents: flagged,
    openReports,
    organizations,
    confirmedRegistrations: registrations,
    formResponses: submissions,
    checkIns,
    failedEmailsLast30Days: failedEmails,
    signupsPerDay: signupsPerDay.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      count: Number(row.count),
    })),
  }
}

export async function listAuditLogs(query: {
  page: number
  pageSize: number
  action?: string
  actorId?: string
  targetId?: string
  eventId?: string
  from?: string
  to?: string
}) {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.targetId ? { targetId: query.targetId } : {}),
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { email: true, profile: { select: { username: true } } } } },
    }),
    prisma.auditLog.count({ where }),
  ])
  return {
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorRole: row.actorRole,
      actorEmail: row.actor?.email ?? null,
      actorUsername: row.actor?.profile?.username ?? null,
      targetType: row.targetType,
      targetId: row.targetId,
      eventId: row.eventId,
      organizationId: row.organizationId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      ipAddress: row.ipAddress,
      requestId: row.requestId,
      createdAt: row.createdAt,
    })),
    total,
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function listAllCategories() {
  return prisma.eventCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { events: true } } },
  })
}
