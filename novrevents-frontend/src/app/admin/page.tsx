'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { TrendChart } from '@/components/charts'
import { PageHeader, StatCard } from '@/components/common'
import { ErrorState, LoadingState } from '@/components/states'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatNumber } from '@/lib/format'

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: keys.admin('stats'),
    queryFn: () => unwrap(api.GET('/api/v1/admin/stats')),
  })
  if (query.isPending) return <LoadingState rows={4} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const stats = query.data
  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Accounts, events and activity across every organiser on NOVR Events."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Users"
          value={formatNumber(stats.users)}
          hint={`${stats.newUsersLast30Days} new in 30 days · ${stats.suspendedUsers} suspended`}
        />
        <StatCard label="Events" value={formatNumber(stats.events)} hint={`${stats.liveEvents} live now`} />
        <StatCard
          label="Needs moderation"
          value={
            <Link href="/admin/reports" className="hover:underline">
              {stats.openReports}
            </Link>
          }
          hint={`${stats.flaggedEvents} flagged events`}
        />
        <StatCard label="Organizations" value={formatNumber(stats.organizations)} />
        <StatCard label="Confirmed registrations" value={formatNumber(stats.confirmedRegistrations)} />
        <StatCard label="Form responses" value={formatNumber(stats.formResponses)} />
        <StatCard label="Check-ins" value={formatNumber(stats.checkIns)} />
        <StatCard label="Failed emails (30 days)" value={formatNumber(stats.failedEmailsLast30Days)} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Sign-ups per day (last 30 days, UTC)</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendChart
            data={stats.signupsPerDay}
            xKey="date"
            series={[{ key: 'count', label: 'Sign-ups', color: 'var(--chart-1)' }]}
          />
        </CardContent>
      </Card>
    </>
  )
}
