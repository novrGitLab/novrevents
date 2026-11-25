'use client'

import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Plus } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EVENT_STATUS_LABELS, EVENT_STATUS_VARIANT } from '@/components/events/labels'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatEventRange } from '@/lib/format'

type Status = keyof typeof EVENT_STATUS_LABELS

export default function MyEventsPage() {
  return (
    <React.Suspense fallback={<LoadingState />}>
      <MyEvents />
    </React.Suspense>
  )
}

function MyEvents() {
  const organizationId = useSearchParams().get('organizationId') ?? undefined
  const [status, setStatus] = React.useState<Status | ''>('')
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const params = { page, pageSize: 20, status: status || undefined, q: search || undefined, organizationId }
  const query = useQuery({
    queryKey: keys.myEvents(params),
    queryFn: () => unwrap(api.GET('/api/v1/events', { params: { query: params } })),
    placeholderData: (previous) => previous,
  })

  return (
    <>
      <PageHeader
        title="My events"
        description="Events you own, help run, or manage through an organization."
        actions={
          <Button asChild>
            <Link href="/dashboard/events/new">
              <Plus /> Create event
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(q.trim())
            setPage(1)
          }}
        >
          <label htmlFor="event-search" className="sr-only">
            Search your events
          </label>
          <Input
            id="event-search"
            placeholder="Search by title"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <label htmlFor="event-status" className="sr-only">
          Status
        </label>
        <NativeSelect
          id="event-status"
          className="sm:w-56"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as Status | '')
            setPage(1)
          }}
        >
          <option value="">All (except archived)</option>
          {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={search || status ? 'No events match' : 'No events yet'}
          description={
            search || status
              ? undefined
              : 'Create your first event — it stays a private draft until you publish it.'
          }
          action={
            !search && !status ? (
              <Button asChild>
                <Link href="/dashboard/events/new">Create event</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Visibility</th>
                  <th className="text-right">Registered</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((event) => (
                  <tr key={event.id} className="hover:bg-brand-soft/50">
                    <td className="max-w-[320px]">
                      <Link
                        href={`/dashboard/events/${event.id}`}
                        className="hover:text-brand-text block truncate font-medium"
                      >
                        {event.title}
                      </Link>
                      <p className="text-muted-foreground truncate text-xs">
                        {[
                          event.organization?.name,
                          event.role !== 'OWNER'
                            ? event.role === 'ORG_ADMIN'
                              ? 'Org admin'
                              : event.role === 'STAFF'
                                ? 'Check-in staff'
                                : 'Manager'
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Owner'}
                      </p>
                    </td>
                    <td className="text-muted-foreground">
                      {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant={EVENT_STATUS_VARIANT[event.effectiveStatus]}>
                          {EVENT_STATUS_LABELS[event.effectiveStatus]}
                        </Badge>
                        {event.moderationStatus !== 'CLEAR' && (
                          <Badge variant="destructive">
                            {event.moderationStatus === 'REMOVED' ? 'Removed' : 'Under review'}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-muted-foreground">
                      {event.visibility.charAt(0) + event.visibility.slice(1).toLowerCase()}
                    </td>
                    <td className="text-right tabular-nums">
                      {event.registeredCount}
                      {event.capacity ? (
                        <span className="text-muted-foreground"> / {event.capacity}</span>
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPage={setPage}
          />
        </>
      )}
    </>
  )
}
