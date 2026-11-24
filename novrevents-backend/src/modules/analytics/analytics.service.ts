import { localDayKey } from '../../lib/datetime.js'
import { prisma } from '../../lib/db.js'
import { requireEventAccess } from '../events/event-access.js'

/**
 * Event metrics. Every figure is computed from stored records with SQL aggregates; nothing is
 * estimated or sampled. Definitions (also returned with the data so the dashboard can show them):
 */
export const METRIC_DEFINITIONS = {
  pageViews:
    'Visits to the public event page, counting a visitor at most once per 30 minutes. Visits by the event team are not counted.',
  uniqueVisitors:
    'Distinct visitors per day, summed over days. Visitors are identified by a salted hash that changes daily, so they cannot be tracked across days.',
  registrationStarts:
    'Registration form sessions in which the visitor began answering (or submitted).',
  registrationCompletions:
    'Registrations created from qualifying responses, including ones later cancelled or declined.',
  conversionRate: 'Registration completions divided by unique visitors to the event page.',
  formCompletionRate: 'Registration completions divided by registration starts.',
  responses:
    'All responses received by the event’s forms. Qualifying responses matched no exclusion rule; excluded responses matched at least one.',
  ticketsIssued: 'Tickets issued, including tickets later voided.',
  attendanceRate: 'Checked-in confirmed registrations divided by confirmed registrations.',
  noShowRate:
    'Confirmed registrations without a check-in, divided by confirmed registrations. Only reported after the event ends.',
  emailDelivery:
    'Delivered, opened and clicked figures come from Brevo webhooks and are only available when the webhook is configured.',
} as const

const rate = (numerator: number, denominator: number) =>
  denominator > 0 ? numerator / denominator : null

export async function eventAnalytics(
  userId: string,
  eventId: string,
  range: { from?: string; to?: string },
) {
  const { event } = await requireEventAccess(userId, eventId, 'manage')
  const from = range.from
    ? new Date(`${range.from}T00:00:00.000Z`)
    : new Date(Math.min(event.createdAt.getTime(), event.startsAt.getTime() - 90 * 86_400_000))
  const to = range.to ? new Date(`${range.to}T23:59:59.999Z`) : new Date()
  const formId = event.registrationFormId

  const [
    views,
    starts,
    registrationsByStatus,
    responses,
    tickets,
    confirmed,
    checkedIn,
    viewsPerDay,
    registrationsPerDay,
    referrers,
    messages,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ views: bigint; visitors: bigint }>>`
      SELECT count(*) AS views,
             count(DISTINCT (visitor_key, date_trunc('day', occurred_at))) AS visitors
        FROM analytics_events
       WHERE event_id = ${eventId}::uuid AND type = 'EVENT_VIEW' AND occurred_at BETWEEN ${from} AND ${to}`,
    formId
      ? prisma.analyticsEvent.count({
          where: { formId, type: 'FORM_START', occurredAt: { gte: from, lte: to } },
        })
      : Promise.resolve(0),
    prisma.registration.groupBy({
      by: ['status'],
      where: { eventId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.formSubmission.groupBy({
      by: ['qualification'],
      where: { form: { eventId }, submittedAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.ticket.count({ where: { eventId } }),
    prisma.registration.count({ where: { eventId, status: 'CONFIRMED' } }),
    prisma.checkIn.count({ where: { eventId, ticket: { registration: { status: 'CONFIRMED' } } } }),
    prisma.$queryRaw<Array<{ day: Date; views: bigint }>>`
      SELECT date_trunc('day', occurred_at) AS day, count(*) AS views
        FROM analytics_events
       WHERE event_id = ${eventId}::uuid AND type = 'EVENT_VIEW' AND occurred_at BETWEEN ${from} AND ${to}
       GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ day: Date; registrations: bigint }>>`
      SELECT date_trunc('day', created_at) AS day, count(*) AS registrations
        FROM registrations
       WHERE event_id = ${eventId}::uuid AND created_at BETWEEN ${from} AND ${to}
       GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<Array<{ host: string | null; views: bigint }>>`
      SELECT referrer_host AS host, count(*) AS views
        FROM analytics_events
       WHERE event_id = ${eventId}::uuid AND type = 'EVENT_VIEW' AND occurred_at BETWEEN ${from} AND ${to}
       GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.message.groupBy({
      by: ['status'],
      where: { eventId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
  ])

  const pageViews = Number(views[0]?.views ?? 0)
  const uniqueVisitors = Number(views[0]?.visitors ?? 0)
  const registrationCompletions = registrationsByStatus.reduce(
    (sum, row) => sum + row._count._all,
    0,
  )
  const statusCount = (status: string) =>
    registrationsByStatus.find((row) => row.status === status)?._count._all ?? 0
  const qualifying = responses.find((row) => row.qualification === 'QUALIFYING')?._count._all ?? 0
  const excluded = responses.find((row) => row.qualification === 'EXCLUDED')?._count._all ?? 0
  const ended = event.endsAt <= new Date()
  const messageCount = (...statuses: string[]) =>
    messages
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0)
  const sent = messageCount('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED')
  const delivered = messageCount('DELIVERED', 'OPENED', 'CLICKED')
  const opened = messageCount('OPENED', 'CLICKED')

  // Merge both daily series into one continuous range of days, in the event's timezone.
  const days = new Map<string, { date: string; views: number; registrations: number }>()
  const dayOf = (date: Date) => localDayKey(date, 'UTC')
  for (const row of viewsPerDay)
    days.set(dayOf(row.day), { date: dayOf(row.day), views: Number(row.views), registrations: 0 })
  for (const row of registrationsPerDay) {
    const key = dayOf(row.day)
    const entry = days.get(key) ?? { date: key, views: 0, registrations: 0 }
    entry.registrations = Number(row.registrations)
    days.set(key, entry)
  }

  return {
    range: { from, to },
    traffic: {
      pageViews,
      uniqueVisitors,
      referrers: referrers.map((row) => ({
        host: row.host ?? 'Direct or unknown',
        views: Number(row.views),
      })),
    },
    funnel: {
      registrationStarts: Math.max(starts, registrationCompletions),
      registrationCompletions,
      conversionRate: rate(registrationCompletions, uniqueVisitors),
      formCompletionRate: rate(registrationCompletions, Math.max(starts, registrationCompletions)),
    },
    registrations: {
      confirmed: statusCount('CONFIRMED'),
      pending: statusCount('PENDING'),
      declined: statusCount('DECLINED'),
      cancelled: statusCount('CANCELLED'),
    },
    responses: { received: qualifying + excluded, qualifying, excluded },
    tickets: { issued: tickets },
    attendance: {
      expected: confirmed,
      checkedIn,
      attendanceRate: rate(checkedIn, confirmed),
      noShows: ended ? Math.max(0, confirmed - checkedIn) : null,
      noShowRate: ended ? rate(Math.max(0, confirmed - checkedIn), confirmed) : null,
    },
    communications: {
      sent,
      delivered,
      opened,
      bounced: messageCount('BOUNCED'),
      failed: messageCount('FAILED'),
      suppressed: messageCount('SUPPRESSED'),
      deliveryRate: rate(delivered, sent),
      openRate: rate(opened, delivered),
    },
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    definitions: METRIC_DEFINITIONS,
  }
}

/** Headline figures across every event the user can manage, for the organiser overview. */
export async function organizerOverview(userId: string) {
  const now = new Date()
  const where = {
    OR: [
      { ownerId: userId },
      { team: { some: { userId, role: 'MANAGER' as const } } },
      {
        organization: {
          members: { some: { userId, role: { in: ['OWNER' as const, 'ADMIN' as const] } } },
        },
      },
    ],
  }
  const [byStatus, upcoming, registrations, checkIns, pendingRegistrations, forms] =
    await Promise.all([
      prisma.event.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.event.findMany({
        where: { ...where, status: { in: ['PUBLISHED', 'ONGOING'] }, endsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: {
          id: true,
          slug: true,
          title: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          registeredCount: true,
          capacity: true,
        },
      }),
      prisma.registration.count({ where: { status: 'CONFIRMED', event: where } }),
      prisma.checkIn.count({ where: { event: where } }),
      prisma.registration.count({ where: { status: 'PENDING', event: where } }),
      prisma.form.count({ where: { OR: [{ ownerId: userId }, { event: where }] } }),
    ])
  return {
    events: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<
      string,
      number
    >,
    confirmedRegistrations: registrations,
    pendingRegistrations,
    checkIns,
    forms,
    upcoming,
  }
}
