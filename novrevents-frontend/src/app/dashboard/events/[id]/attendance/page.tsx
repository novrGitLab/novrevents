'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { BarsChart, TrendChart } from '@/components/charts'
import { StatCard } from '@/components/common'
import { canManage, useManagedEvent } from '@/components/events/event-context'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatPercent, formatTime } from '@/lib/format'

export default function AttendancePage() {
  const { event } = useManagedEvent()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.eventPart(event.id, 'attendance'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/attendance', { params: { path: { id: event.id } } })),
    refetchInterval: 20_000,
  })
  const undo = useMutation({
    mutationFn: (registrationId: string) =>
      unwrap(
        api.DELETE('/api/v1/events/{id}/check-in/{registrationId}', {
          params: { path: { id: event.id, registrationId } },
        }),
      ),
    onSuccess: async () => {
      toast.success('Check-in undone')
      await queryClient.invalidateQueries({ queryKey: keys.event(event.id) })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (query.isPending) return <LoadingState rows={4} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const data = query.data
  const perHour = data.perHour.map((row) => ({
    hour: formatTime(row.hour, event.timezone),
    count: row.count,
  }))
  const scans = ['ACCEPTED', 'DUPLICATE', 'INVALID', 'WRONG_EVENT', 'VOID'].map((result) => ({
    result: result.replace('_', ' ').toLowerCase(),
    count: data.scans[result] ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {canManage(event) && (
          <Button asChild variant="outline" size="sm">
            <a href={`/api/v1/events/${event.id}/registrations/export?status=CONFIRMED`}>
              <FileDown /> Export attendance
            </a>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Expected" value={data.expected} hint="Confirmed registrations" />
        <StatCard label="Checked in" value={data.checkedIn} hint={`${data.remaining} still to arrive`} />
        <StatCard
          label="Attendance rate"
          value={formatPercent(data.attendanceRate)}
          hint="Checked in ÷ confirmed"
        />
        <StatCard
          label="No-shows"
          value={data.noShows ?? '—'}
          hint={
            data.eventEnded
              ? `${formatPercent(data.noShowRate)} of confirmed`
              : 'Reported after the event ends'
          }
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Arrivals per hour</CardTitle>
            <CardDescription>In the event’s timezone ({event.timezone}).</CardDescription>
          </CardHeader>
          <CardContent>
            <BarsChart
              data={perHour}
              xKey="hour"
              series={[{ key: 'count', label: 'Check-ins', color: 'var(--chart-1)' }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By ticket type</CardTitle>
          </CardHeader>
          <CardContent>
            <BarsChart
              data={data.byTicketType}
              xKey="name"
              series={[
                { key: 'expected', label: 'Expected', color: 'var(--chart-3)' },
                { key: 'checkedIn', label: 'Checked in', color: 'var(--chart-1)' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scan outcomes</CardTitle>
            <CardDescription>Every scan attempt at the door, including rejected ones.</CardDescription>
          </CardHeader>
          <CardContent>
            {scans.every((row) => row.count === 0) ? (
              <EmptyState title="No scans yet" />
            ) : (
              <BarsChart
                horizontal
                data={scans}
                xKey="result"
                series={[{ key: 'count', label: 'Scans', color: 'var(--chart-2)' }]}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent check-ins</CardTitle>
            <CardDescription>The last ten check-ins saved on the server, from every device.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <EmptyState title="Nobody checked in yet" />
            ) : (
              <ul className="divide-y text-sm">
                {data.recent.map((item) => (
                  <li key={item.registrationId} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {item.ticketType} · {formatTime(item.checkedInAt, event.timezone)} ·{' '}
                        {item.method === 'QR' ? 'QR scan' : 'manual'}
                      </p>
                    </div>
                    {canManage(event) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => undo.mutate(item.registrationId)}
                        disabled={undo.isPending}
                      >
                        <Undo2 /> Undo
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {perHour.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Arrival trend</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={perHour}
              xKey="hour"
              series={[{ key: 'count', label: 'Check-ins', color: 'var(--chart-1)' }]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
