'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, CalendarDays, Flag, ScrollText, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { TrendChart } from '@/components/charts'
import { PageHeader } from '@/components/common'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function MetricBand({
  title,
  metrics,
}: {
  title: string
  metrics: { label: string; value: number; hint?: string; alert?: boolean }[]
}) {
  return (
    <section aria-label={title}>
      <h2 className="eyebrow mb-2">{title}</h2>
      <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border shadow-xs lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-card px-5 py-4">
            <dt className="text-muted-foreground text-[13px]">{metric.label}</dt>
            <dd className={cn('text-headline-md mt-1 tabular-nums', metric.alert && 'text-destructive')}>
              {formatNumber(metric.value)}
            </dd>
            {metric.hint && <dd className="text-subtle-foreground mt-0.5 text-xs">{metric.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}

const SECTIONS = [
  { href: '/admin/users', label: 'Users', text: 'Suspend, reinstate and grant admin access.', icon: Users },
  { href: '/admin/events', label: 'Events', text: 'Every event, with moderation controls.', icon: CalendarDays },
  { href: '/admin/reports', label: 'Reports', text: 'Reports from visitors about events.', icon: Flag },
  { href: '/admin/organizations', label: 'Organizations', text: 'Shared organiser workspaces.', icon: Building2 },
  { href: '/admin/audit-logs', label: 'Audit logs', text: 'Sensitive actions across the platform.', icon: ScrollText },
  { href: '/admin/settings', label: 'Configuration', text: 'Categories and platform settings.', icon: Settings },
] as const

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: keys.admin('stats'),
    queryFn: () => unwrap(api.GET('/api/v1/admin/stats')),
  })
  if (query.isPending) return <LoadingState rows={4} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const stats = query.data
  const moderation = stats.openReports + stats.flaggedEvents

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Accounts, events and activity across every organiser on NOVR Events."
      />

      {moderation > 0 && (
        <section
          aria-label="Moderation"
          className="border-destructive/25 bg-destructive/5 mb-8 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <span className="bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-sm">
              <Flag className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Moderation needs attention</p>
              <p className="text-muted-foreground text-[13px] tabular-nums">
                {stats.openReports} open {stats.openReports === 1 ? 'report' : 'reports'} ·{' '}
                {stats.flaggedEvents} flagged {stats.flaggedEvents === 1 ? 'event' : 'events'}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/admin/reports">
              Review reports <ArrowRight />
            </Link>
          </Button>
        </section>
      )}

      <div className="space-y-6">
        <MetricBand
          title="Platform"
          metrics={[
            {
              label: 'Users',
              value: stats.users,
              hint: `${stats.newUsersLast30Days} new in 30 days · ${stats.suspendedUsers} suspended`,
            },
            { label: 'Events', value: stats.events, hint: `${stats.liveEvents} live now` },
            { label: 'Organizations', value: stats.organizations },
            {
              label: 'Open reports',
              value: stats.openReports,
              hint: `${stats.flaggedEvents} flagged events`,
              alert: stats.openReports > 0,
            },
          ]}
        />
        <MetricBand
          title="Activity"
          metrics={[
            { label: 'Confirmed registrations', value: stats.confirmedRegistrations },
            { label: 'Form responses', value: stats.formResponses },
            { label: 'Check-ins', value: stats.checkIns },
            {
              label: 'Failed emails',
              value: stats.failedEmailsLast30Days,
              hint: 'Last 30 days',
              alert: stats.failedEmailsLast30Days > 0,
            },
          ]}
        />
      </div>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Sign-ups per day (last 30 days, UTC)</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={stats.signupsPerDay}
              xKey="date"
              series={[{ key: 'count', label: 'Sign-ups', color: 'var(--chart-1)' }]}
            />
          </CardContent>
        </Card>
        <nav aria-label="Administration areas" className="bg-card divide-y rounded-lg border shadow-xs">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="hover:bg-brand-soft/50 flex items-center gap-3 px-4 py-3"
            >
              <span className="bg-brand-soft text-primary flex size-8 shrink-0 items-center justify-center rounded-sm">
                <section.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{section.label}</span>
                <span className="text-muted-foreground block truncate text-xs">{section.text}</span>
              </span>
              <ArrowRight className="text-subtle-foreground size-4 shrink-0" aria-hidden />
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}
