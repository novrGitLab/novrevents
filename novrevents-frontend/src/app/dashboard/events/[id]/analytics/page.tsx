'use client'

import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import * as React from 'react'
import { BarsChart, TrendChart } from '@/components/charts'
import { StatCard } from '@/components/common'
import { useManagedEvent } from '@/components/events/event-context'
import { ErrorState, LoadingState } from '@/components/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Disclosure } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatNumber, formatPercent } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

const DEFINITION_LABELS: Record<string, string> = {
  pageViews: 'Page views',
  uniqueVisitors: 'Unique visitors',
  registrationStarts: 'Registration starts',
  registrationCompletions: 'Registration completions',
  conversionRate: 'Conversion rate',
  formCompletionRate: 'Form completion rate',
  responses: 'Responses',
  ticketsIssued: 'Tickets issued',
  attendanceRate: 'Attendance rate',
  noShowRate: 'No-show rate',
  emailDelivery: 'Email delivery',
}

export default function AnalyticsPage() {
  const { event } = useManagedEvent()
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const params = { from: from || undefined, to: to || undefined }
  const query = useQuery({
    queryKey: keys.eventPart(event.id, 'analytics', params),
    queryFn: () =>
      unwrap(api.GET('/api/v1/events/{id}/analytics', { params: { path: { id: event.id }, query: params } })),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="a-from">From (UTC)</Label>
          <Input
            id="a-from"
            type="date"
            value={from}
            onChange={(changeEvent) => setFrom(changeEvent.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="a-to">To (UTC)</Label>
          <Input
            id="a-to"
            type="date"
            value={to}
            onChange={(changeEvent) => setTo(changeEvent.target.value)}
          />
        </div>
      </div>
      {query.isPending ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        (() => {
          const data = query.data
          const funnel = [
            { stage: 'Unique visitors', count: data.traffic.uniqueVisitors },
            { stage: 'Started registration', count: data.funnel.registrationStarts },
            { stage: 'Registered', count: data.funnel.registrationCompletions },
            { stage: 'Checked in', count: data.attendance.checkedIn },
          ]
          return (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  label="Page views"
                  value={formatNumber(data.traffic.pageViews)}
                  hint={`${formatNumber(data.traffic.uniqueVisitors)} unique visitors`}
                />
                <StatCard
                  label="Registrations"
                  value={formatNumber(data.funnel.registrationCompletions)}
                  hint={`${formatNumber(data.funnel.registrationStarts)} started`}
                />
                <StatCard
                  label="Conversion"
                  value={formatPercent(data.funnel.conversionRate)}
                  hint="Registrations ÷ unique visitors"
                />
                <StatCard
                  label="Form completion"
                  value={formatPercent(data.funnel.formCompletionRate)}
                  hint="Registrations ÷ starts"
                />
                <StatCard label="Tickets issued" value={formatNumber(data.tickets.issued)} />
                <StatCard
                  label="Attendance rate"
                  value={formatPercent(data.attendance.attendanceRate)}
                  hint={`${data.attendance.checkedIn} of ${data.attendance.expected} checked in`}
                />
                <StatCard
                  label="No-show rate"
                  value={formatPercent(data.attendance.noShowRate)}
                  hint={
                    data.attendance.noShows === null
                      ? 'After the event ends'
                      : `${data.attendance.noShows} no-shows`
                  }
                />
                <StatCard
                  label="Responses"
                  value={formatNumber(data.responses.received)}
                  hint={`${data.responses.qualifying} qualifying · ${data.responses.excluded} excluded`}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Daily traffic and registrations (UTC)</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendChart
                    data={data.daily}
                    xKey="date"
                    series={[
                      { key: 'views', label: 'Page views', color: 'var(--chart-3)' },
                      { key: 'registrations', label: 'Registrations', color: 'var(--chart-1)' },
                    ]}
                  />
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Funnel</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarsChart
                      horizontal
                      data={funnel}
                      xKey="stage"
                      series={[{ key: 'count', label: 'People', color: 'var(--chart-1)' }]}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Where visitors came from</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarsChart
                      horizontal
                      data={data.traffic.referrers}
                      xKey="host"
                      series={[{ key: 'views', label: 'Views', color: 'var(--chart-2)' }]}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Registrations by status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarsChart
                      data={[
                        { status: 'Confirmed', count: data.registrations.confirmed },
                        { status: 'Pending', count: data.registrations.pending },
                        { status: 'Declined', count: data.registrations.declined },
                        { status: 'Cancelled', count: data.registrations.cancelled },
                      ]}
                      xKey="status"
                      series={[{ key: 'count', label: 'Registrations', color: 'var(--chart-1)' }]}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Email performance</CardTitle>
                    <CardDescription>
                      {emailDeliveryEnabled ? (
                        <>
                          {formatNumber(data.communications.sent)} sent · delivery{' '}
                          {formatPercent(data.communications.deliveryRate)} · opens{' '}
                          {formatPercent(data.communications.openRate)}
                        </>
                      ) : (
                        <>
                          Email delivery is not switched on yet. {formatNumber(data.communications.sent)}{' '}
                          messages were recorded but not delivered to inboxes.
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BarsChart
                      data={[
                        { stage: 'Sent', count: data.communications.sent },
                        { stage: 'Delivered', count: data.communications.delivered },
                        { stage: 'Opened', count: data.communications.opened },
                        { stage: 'Bounced', count: data.communications.bounced },
                        { stage: 'Failed', count: data.communications.failed },
                        { stage: 'Opted out', count: data.communications.suppressed },
                      ]}
                      xKey="stage"
                      series={[{ key: 'count', label: 'Messages', color: 'var(--chart-3)' }]}
                    />
                  </CardContent>
                </Card>
              </div>

              <Disclosure
                title={
                  <span className="flex items-center gap-2">
                    <Info className="size-4" aria-hidden /> How these metrics are calculated
                  </span>
                }
              >
                <dl className="space-y-2 text-sm">
                  {Object.entries(data.definitions).map(([key, text]) => (
                    <div key={key}>
                      <dt className="font-medium">{DEFINITION_LABELS[key] ?? key}</dt>
                      <dd className="text-muted-foreground">{text}</dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>
            </>
          )
        })()
      )}
    </div>
  )
}
