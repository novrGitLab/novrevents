'use client'

import { useQuery } from '@tanstack/react-query'
import { Bookmark } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EventCard } from '@/components/events/event-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

export default function SavedEventsPage() {
  const [page, setPage] = React.useState(1)
  const query = useQuery({
    queryKey: keys.savedEvents({ page }),
    queryFn: () => unwrap(api.GET('/api/v1/me/saved-events', { params: { query: { page, pageSize: 12 } } })),
  })
  return (
    <>
      <PageHeader title="Saved events" description="Events you bookmarked. Saving does not register you." />
      {query.isPending ? (
        <LoadingState rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No saved events"
          action={
            <Button asChild variant="outline">
              <Link href="/explore">Explore events</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((event) => (
              <EventCard key={event.id} event={event} saved />
            ))}
          </div>
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />
        </>
      )}
    </>
  )
}
