'use client'

import { useQuery } from '@tanstack/react-query'
import { Info } from '@/components/ui/icons'
import * as React from 'react'
import { BarsChart, TrendChart } from '@/components/charts'
import { useManagedEvent } from '@/components/events/event-context'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Disclosure } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatNumber, formatPercent } from '@/lib/format'
import { useAuthProviders } from '@/lib/auth-providers'

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

/** A row of related metrics drawn as one banded panel with hairline rules. */
function MetricBand({
  title,
  metrics,
}: {
  title: string
  metrics: { label: string; value: string; hint?: string }[]
}) {
  return (
    <section aria-label={title}>
      <h2 className="eyebrow mb-2">{title}</h2>
      <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border shadow-xs lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-card px-5 py-4">
            <dt className="text-muted-foreground text-[13px]">{metric.label}</dt>
            <dd className="text-headline-md mt-1 tabular-nums">{metric.value}</dd>
            {metric.hint && <dd className="text-subtle-foreground mt-0.5 text-xs">{metric.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}

function Panel({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default function AnalyticsPage() {
  const emailDeliveryEnabled = useAuthProviders().data?.emailDelivery === true
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-muted-foreground max-w-xl text-[13px]">
          Counts come from this event’s pages, forms, tickets and check-ins. Visits by the event team are not
          counted.
        </p>
        <fieldset className="flex flex-wrap items-end gap-2">
          <legend className="eyebrow mb-1.5">Date range (UTC)</legend>
          <Label htmlFor="a-from" className="sr-only">
            From
          </Label>
          <Input
            id="a-from"
            type="date"
            className="w-40"
            value={from}
            onChange={(changeEvent) => setFrom(changeEvent.target.value)}
          />
          <span className="text-muted-foreground pb-2.5 text-sm" aria-hidden>
            to
          </span>
          <Label htmlFor="a-to" className="sr-only">
            To
          </Label>
          <Input
            id="a-to"
            type="date"
            className="w-40"
            value={to}
            onChange={(changeEvent) => setTo(changeEvent.target.value)}
          />
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Clear
            </Button>
          )}
        </fieldset>
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
          const top = Math.max(1, ...funnel.map((step) => step.count))
          return (
            <>
              <MetricBand
                title="Audience"
                metrics={[
                  {
                    label: 'Page views',
                    value: formatNumber(data.traffic.pageViews),
                    hint: `${formatNumber(data.traffic.uniqueVisitors)} unique visitors`,
                  },
                  {
                    label: 'Registrations',
                    value: formatNumber(data.funnel.registrationCompletions),
                    hint: `${formatNumber(data.funnel.registrationStarts)} started`,
                  },
                  {
                    label: 'Conversion',
                    value: formatPercent(data.funnel.conversionRate),
                    hint: 'Registrations ÷ unique visitors',
                  },
                  {
                    label: 'Form completion',
                    value: formatPercent(data.funnel.formCompletionRate),
                    hint: 'Registrations ÷ starts',
                  },
                ]}
              />
              <MetricBand
                title="Attendance"
                metrics={[
                  { label: 'Tickets issued', value: formatNumber(data.tickets.issued) },
                  {
                    label: 'Attendance rate',
                    value: formatPercent(data.attendance.attendanceRate),
                    hint: `${data.attendance.checkedIn} of ${data.attendance.expected} checked in`,
                  },
                  {
                    label: 'No-show rate',
                    value: formatPercent(data.attendance.noShowRate),
                    hint:
                      data.attendance.noShows === null
                        ? 'Shown after the event ends'
                        : `${data.attendance.noShows} no-shows`,
                  },
                  {
                    label: 'Form responses',
                    value: formatNumber(data.responses.received),
                    hint: `${data.responses.qualifying} qualifying · ${data.responses.excluded} excluded`,
                  },
                ]}
              />

              <Panel title="Daily traffic and registrations (UTC)">
                <TrendChart
                  data={data.daily}
                  xKey="date"
                  series={[
                    { key: 'views', label: 'Page views', color: 'var(--chart-3)' },
                    { key: 'registrations', label: 'Registrations', color: 'var(--chart-1)' },
                  ]}
                />
              </Panel>

              <div className="grid items-start gap-6 lg:grid-cols-2">
                <Panel title="Funnel" description="Share of unique visitors reaching each step.">
                  <ol className="space-y-4">
                    {funnel.map((step) => (
                      <li key={step.stage}>
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                          <span className="font-medium">{step.stage}</span>
                          <span className="text-muted-foreground tabular-nums">
                            <span className="text-foreground font-semibold">{formatNumber(step.count)}</span>
                            {data.traffic.uniqueVisitors > 0 &&
                              ` · ${Math.round((step.count / data.traffic.uniqueVisitors) * 100)}%`}
                          </span>
                        </div>
                        <div className="bg-muted mt-1.5 h-2 overflow-hidden rounded-sm" aria-hidden>
                          <div
                            className="bg-primary h-full rounded-sm"
                            style={{ width: `${step.count === 0 ? 0 : Math.max(1, (step.count / top) * 100)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                </Panel>
                <Panel title="Where visitors came from">
                  {data.traffic.referrers.length === 0 ? (
                    <p className="text-muted-foreground py-6 text-center text-[13px]">
                      No referring sites recorded yet.
                    </p>
                  ) : (
                    <BarsChart
                      horizontal
                      data={data.traffic.referrers}
                      xKey="host"
                      series={[{ key: 'views', label: 'Views', color: 'var(--chart-2)' }]}
                    />
                  )}
                </Panel>
                <Panel title="Registrations by status">
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
                </Panel>
                <Panel
                  title="Email performance"
                  description={
                    emailDeliveryEnabled ? (
                      <>
                        {formatNumber(data.communications.sent)} sent · delivery{' '}
                        {formatPercent(data.communications.deliveryRate)} · opens{' '}
                        {formatPercent(data.communications.openRate)}
                      </>
                    ) : undefined
                  }
                >
                  {emailDeliveryEnabled ? (
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
                  ) : (
                    <p className="text-muted-foreground rounded-sm border border-dashed px-4 py-6 text-center text-[13px]">
                      Email delivery is not switched on yet. {formatNumber(data.communications.sent)} messages were
                      recorded but not delivered to inboxes.
                    </p>
                  )}
                </Panel>
              </div>

              <Disclosure
                title={
                  <span className="flex items-center gap-2">
                    <Info className="size-4" aria-hidden /> How these metrics are calculated
                  </span>
                }
              >
                <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                  {Object.entries(data.definitions).map(([key, text]) => (
                    <div key={key}>
                      <dt className="font-medium">{DEFINITION_LABELS[key] ?? key}</dt>
                      <dd className="text-muted-foreground text-[13px]">{text}</dd>
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
