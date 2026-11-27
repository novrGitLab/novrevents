'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Copy, Search, XCircle } from '@/components/ui/icons'
import * as React from 'react'
import { QrScanner } from '@/components/attendance/qr-scanner'
import { useManagedEvent } from '@/components/events/event-context'
import { Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type Outcome = Schema<'ScanOutcome'>

const RESULT_STYLE = {
  ACCEPTED: {
    tone: 'border-success bg-success/10',
    icon: CheckCircle2,
    iconClass: 'text-success',
    title: 'Checked in',
  },
  DUPLICATE: {
    tone: 'border-warning bg-warning/15',
    icon: Copy,
    iconClass: 'text-warning',
    title: 'Already used',
  },
  INVALID: {
    tone: 'border-destructive bg-destructive/10',
    icon: XCircle,
    iconClass: 'text-destructive',
    title: 'Invalid ticket',
  },
  WRONG_EVENT: {
    tone: 'border-destructive bg-destructive/10',
    icon: AlertTriangle,
    iconClass: 'text-destructive',
    title: 'Wrong event',
  },
  VOID: {
    tone: 'border-destructive bg-destructive/10',
    icon: XCircle,
    iconClass: 'text-destructive',
    title: 'Not valid',
  },
} as const

export default function ScannerPage() {
  const { event } = useManagedEvent()
  const queryClient = useQueryClient()
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)
  const [history, setHistory] = React.useState<Array<Outcome & { at: number }>>([])

  const record = (result: Outcome) => {
    setOutcome(result)
    setHistory((previous) => [{ ...result, at: Date.now() }, ...previous].slice(0, 15))
    if ('vibrate' in navigator) navigator.vibrate(result.result === 'ACCEPTED' ? 80 : [60, 60, 60])
    void queryClient.invalidateQueries({ queryKey: keys.eventPart(event.id, 'attendance') })
  }

  const scan = useMutation({
    mutationFn: (payload: string) =>
      unwrap(
        api.POST('/api/v1/events/{id}/check-in/scan', {
          params: { path: { id: event.id } },
          body: { payload },
        }),
      ),
    onSuccess: record,
    onError: (error) =>
      setOutcome({
        result: 'INVALID',
        message: errorMessage(error),
        attendee: null,
        checkedInAt: null,
        previousMethod: null,
      }),
  })
  const manual = useMutation({
    mutationFn: (body: { registrationId?: string; ticketCode?: string }) =>
      unwrap(api.POST('/api/v1/events/{id}/check-in/manual', { params: { path: { id: event.id } }, body })),
    onSuccess: record,
    onError: (error) =>
      setOutcome({
        result: 'INVALID',
        message: errorMessage(error),
        attendee: null,
        checkedInAt: null,
        previousMethod: null,
      }),
  })

  const summary = useQuery({
    queryKey: keys.eventPart(event.id, 'attendance'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/attendance', { params: { path: { id: event.id } } })),
    refetchInterval: 15_000,
  })

  if (event.status === 'DRAFT' || event.status === 'ARCHIVED') {
    return <Notice tone="warning">Check-in opens once the event is published.</Notice>
  }

  const style = outcome ? RESULT_STYLE[outcome.result] : null

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {event.status === 'CANCELLED' && (
          <Notice tone="error">This event is cancelled; every ticket is void.</Notice>
        )}
        {summary.data && (
          <section aria-label="Check-in progress" className="bg-card rounded-lg border p-5 shadow-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p aria-live="polite">
                <span className="text-headline-md tabular-nums">{summary.data.checkedIn}</span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {' '}
                  / {summary.data.expected} checked in
                </span>
              </p>
              {summary.data.expected > 0 && (
                <span className="bg-brand-soft text-brand-text rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums">
                  {Math.round((summary.data.checkedIn / summary.data.expected) * 100)}% admitted
                </span>
              )}
            </div>
            <div className="bg-muted mt-3 h-1.5 rounded-full" aria-hidden>
              <div
                className="bg-primary h-1.5 rounded-full transition-[width]"
                style={{
                  width: `${summary.data.expected > 0 ? Math.max(1, (summary.data.checkedIn / summary.data.expected) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="text-muted-foreground mt-2 text-xs tabular-nums">
              {Math.max(0, summary.data.expected - summary.data.checkedIn)} still expected
            </p>
          </section>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Scan tickets</CardTitle>
            <CardDescription>Point the camera at the QR code on the attendee’s ticket.</CardDescription>
          </CardHeader>
          <CardContent>
            <QrScanner paused={scan.isPending} onScan={(payload) => scan.mutate(payload)} />
          </CardContent>
        </Card>
        <ManualCheckIn eventId={event.id} busy={manual.isPending} onCheckIn={(body) => manual.mutate(body)} />
      </div>

      <div className="space-y-4">
        <div aria-live="assertive" aria-atomic="true">
          {outcome && style ? (
            <div className={cn('rounded-lg border-2 p-5 shadow-xs', style.tone)}>
              <div className="flex items-center gap-3">
                <style.icon className={cn('size-10 shrink-0', style.iconClass)} aria-hidden />
                <div>
                  <p className="text-headline-sm">{style.title}</p>
                  <p className="text-sm">{outcome.message}</p>
                </div>
              </div>
              {outcome.attendee && (
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="eyebrow self-center">Name</dt>
                  <dd className="text-base font-semibold">{outcome.attendee.name}</dd>
                  <dt className="eyebrow self-center">Ticket</dt>
                  <dd>{outcome.attendee.ticketType}</dd>
                  <dt className="eyebrow self-center">Code</dt>
                  <dd className="font-mono">{outcome.attendee.ticketCode}</dd>
                  {outcome.result === 'DUPLICATE' && outcome.checkedInAt && (
                    <>
                      <dt className="eyebrow self-center">First used</dt>
                      <dd>
                        {formatTime(outcome.checkedInAt, event.timezone)} (
                        {outcome.previousMethod === 'MANUAL' ? 'manual' : 'QR'})
                      </dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground bg-card rounded-lg border border-dashed p-8 text-center text-sm">
              Scan results appear here.
            </div>
          )}
        </div>
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Scans on this device</CardTitle>
              <CardDescription>
                Kept in this browser only. The server’s full check-in history is on the attendance page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {history.map((item) => (
                  <li key={item.at} className="flex items-center justify-between gap-2 py-2">
                    <span className="truncate">{item.attendee?.name ?? 'Unknown ticket'}</span>
                    <Badge
                      variant={
                        item.result === 'ACCEPTED'
                          ? 'success'
                          : item.result === 'DUPLICATE'
                            ? 'warning'
                            : 'destructive'
                      }
                    >
                      {RESULT_STYLE[item.result].title}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function ManualCheckIn({
  eventId,
  busy,
  onCheckIn,
}: {
  eventId: string
  busy: boolean
  onCheckIn: (body: { registrationId?: string; ticketCode?: string }) => void
}) {
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const results = useQuery({
    queryKey: keys.eventPart(eventId, 'lookup', { search }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/events/{id}/check-in/lookup', {
          params: { path: { id: eventId }, query: { q: search } },
        }),
      ),
    enabled: search.length >= 2,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual check-in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            setSearch(q.trim())
          }}
        >
          <label htmlFor="lookup" className="sr-only">
            Search attendee
          </label>
          <Input
            id="lookup"
            placeholder="Name, email or the code printed on the ticket"
            value={q}
            onChange={(changeEvent) => setQ(changeEvent.target.value)}
          />
          <Button type="submit" variant="outline" disabled={q.trim().length < 2}>
            <Search /> Find
          </Button>
        </form>
        {/^[2-9a-z]{4}[- ]?[2-9a-z]{4}[- ]?[2-9a-z]{4}$/i.test(q.trim()) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onCheckIn({ ticketCode: q.trim() })}
            disabled={busy}
          >
            Check in ticket code {q.trim().toUpperCase()}
          </Button>
        )}
        {results.isFetching && <p className="text-muted-foreground text-sm">Searching…</p>}
        {results.data && results.data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">No attendee found.</p>
        )}
        {results.data && results.data.items.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {results.data.items.map((item) => (
              <li key={item.registrationId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.email} · {item.ticketType}
                  </p>
                </div>
                {item.checkedInAt ? (
                  <Badge variant="success">Checked in {formatTime(item.checkedInAt)}</Badge>
                ) : item.status !== 'CONFIRMED' ? (
                  <Badge variant="secondary">{enumLabel(item.status)}</Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onCheckIn({ registrationId: item.registrationId })}
                    disabled={busy}
                  >
                    Check in
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
