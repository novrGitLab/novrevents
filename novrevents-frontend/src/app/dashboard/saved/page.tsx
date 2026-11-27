'use client'

import { useQuery } from '@tanstack/react-query'
import { Bookmark, Compass, LayoutGrid, List } from '@/components/ui/icons'
import Link from 'next/link'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EventCard, EventRow } from '@/components/events/event-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { cn } from '@/lib/utils'

export default function SavedEventsPage() {
  const [page, setPage] = React.useState(1)
  const [view, setView] = React.useState<'grid' | 'list'>('grid')
  const query = useQuery({
    queryKey: keys.savedEvents({ page }),
    queryFn: () => unwrap(api.GET('/api/v1/me/saved-events', { params: { query: { page, pageSize: 12 } } })),
  })
  const total = query.data?.total ?? 0

  return (
    <>
      <PageHeader
        title="Saved events"
        description="Events you bookmarked to come back to. Saving does not register you."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard/discover">
              <Compass /> Discover events
            </Link>
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No saved events"
          description="Use the bookmark on any event to keep it here."
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/discover">Explore events</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-[13px] tabular-nums">
              {total} saved event{total === 1 ? '' : 's'}
            </p>
            <div role="group" aria-label="Layout" className="flex overflow-hidden rounded-sm border">
              {(
                [
                  { value: 'grid', label: 'Grid view', icon: LayoutGrid },
                  { value: 'list', label: 'List view', icon: List },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={view === option.value}
                  onClick={() => setView(option.value)}
                  className={cn(
                    'inline-flex size-9 items-center justify-center',
                    view === option.value
                      ? 'bg-brand-soft text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <option.icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          </div>
          {view === 'grid' ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {query.data.items.map((event) => (
                <EventCard key={event.id} event={event} saved href={`/dashboard/discover/events/${event.slug}`} />
              ))}
            </div>
          ) : (
            <ul className="bg-card divide-y rounded-lg border px-4">
              {query.data.items.map((event) => (
                <li key={event.id}>
                  <EventRow event={event} saved href={`/dashboard/discover/events/${event.slug}`} />
                </li>
              ))}
            </ul>
          )}
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />
        </>
      )}
    </>
  )
}
