'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader, Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatDate } from '@/lib/format'

type Moderation = 'CLEAR' | 'FLAGGED' | 'REMOVED'
const MODERATION_VARIANT = { CLEAR: 'outline', FLAGGED: 'warning', REMOVED: 'destructive' } as const

export default function AdminEventsPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [moderation, setModeration] = React.useState<Moderation | ''>('')
  const [page, setPage] = React.useState(1)
  const params = { page, pageSize: 25, q: search || undefined, moderation: moderation || undefined }
  const query = useQuery({
    queryKey: keys.admin('events', params),
    queryFn: () => unwrap(api.GET('/api/v1/admin/events', { params: { query: params } })),
    placeholderData: (previous) => previous,
  })

  const moderate = (eventId: string, title: string, status: Moderation) =>
    confirm(
      {
        title:
          status === 'REMOVED'
            ? `Remove “${title}”?`
            : status === 'FLAGGED'
              ? `Flag “${title}” for review?`
              : `Clear “${title}”?`,
        description:
          status === 'REMOVED'
            ? 'The event is hidden from every public page, its open reports are resolved, and the organiser is notified. They cannot republish it.'
            : status === 'CLEAR'
              ? 'The event becomes visible again and its open reports are dismissed.'
              : 'The event stays visible but is marked for moderator review.',
        confirmLabel: status === 'REMOVED' ? 'Remove event' : 'Confirm',
        destructive: status === 'REMOVED',
        reasonLabel: 'Moderator note (shown to the organiser for removals)',
        reasonRequired: status === 'REMOVED',
      },
      async (note) => {
        try {
          await unwrap(
            api.POST('/api/v1/admin/events/{id}/moderation', {
              params: { path: { id: eventId } },
              body: { status, note: note || null },
            }),
          )
          toast.success('Moderation updated')
          await queryClient.invalidateQueries({ queryKey: ['admin'] })
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    )

  return (
    <>
      <PageHeader
        title="Events"
        description="All events on the platform, including drafts. Removing an event hides it everywhere."
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
          <Input
            aria-label="Search events"
            placeholder="Title or organiser"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <NativeSelect
          aria-label="Moderation status"
          className="sm:w-44"
          value={moderation}
          onChange={(event) => {
            setModeration(event.target.value as Moderation | '')
            setPage(1)
          }}
        >
          <option value="">Any moderation status</option>
          <option value="FLAGGED">Flagged</option>
          <option value="REMOVED">Removed</option>
          <option value="CLEAR">Clear</option>
        </NativeSelect>
      </div>
      {query.isPending ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="No events found" />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border">
            {query.data.items.map((event) => (
              <li key={event.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <Link href={`/events/${event.slug}`} className="font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {event.organizerName} · {event.owner.email} · {formatDate(event.startsAt)} ·{' '}
                    {event.registrations} registrations
                  </p>
                  {event.moderationNote && (
                    <p className="text-muted-foreground text-xs">Note: {event.moderationNote}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{enumLabel(event.status)}</Badge>
                  <Badge variant="outline">{enumLabel(event.visibility)}</Badge>
                  <Badge variant={MODERATION_VARIANT[event.moderationStatus]}>
                    {enumLabel(event.moderationStatus)}
                  </Badge>
                  {event.openReports > 0 && (
                    <Badge variant="destructive">{event.openReports} open reports</Badge>
                  )}
                  {event.moderationStatus !== 'REMOVED' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => moderate(event.id, event.title, 'REMOVED')}
                    >
                      Remove
                    </Button>
                  )}
                  {event.moderationStatus === 'CLEAR' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moderate(event.id, event.title, 'FLAGGED')}
                    >
                      Flag
                    </Button>
                  )}
                  {event.moderationStatus !== 'CLEAR' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => moderate(event.id, event.title, 'CLEAR')}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPage={setPage}
          />
        </>
      )}
      {dialog}
    </>
  )
}
