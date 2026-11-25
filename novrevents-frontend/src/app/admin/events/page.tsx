'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader, Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { cn } from '@/lib/utils'
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
  // "Moderate event" on the Reports page links here with ?q=<title>.
  React.useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q')
    if (initial) {
      setQ(initial)
      setSearch(initial)
    }
  }, [])
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
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(q.trim())
            setPage(1)
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search events"
              placeholder="Title or organiser"
              className="pl-9"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div role="group" aria-label="Moderation status" className="flex flex-wrap gap-2">
          {(
            [
              { value: '', label: 'All' },
              { value: 'FLAGGED', label: 'Flagged' },
              { value: 'REMOVED', label: 'Removed' },
              { value: 'CLEAR', label: 'Clear' },
            ] as const
          ).map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={moderation === option.value}
              onClick={() => {
                setModeration(option.value)
                setPage(1)
              }}
              className={cn(
                'h-8 rounded-sm border px-3 text-[13px] font-medium',
                moderation === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-primary hover:text-brand-text',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {query.isPending ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState compact title="No events found" description="Try another search or filter." />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border shadow-xs">
            {query.data.items.map((event) => (
              <li
                key={event.id}
                className={cn(
                  'flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center',
                  event.moderationStatus === 'REMOVED' && 'bg-destructive/[0.03]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/events/${event.slug}`} className="hover:text-brand-text text-sm font-semibold">
                      {event.title}
                    </Link>
                    {event.moderationStatus !== 'CLEAR' && (
                      <Badge variant={MODERATION_VARIANT[event.moderationStatus]}>
                        {enumLabel(event.moderationStatus)}
                      </Badge>
                    )}
                    {event.openReports > 0 && (
                      <Badge variant="destructive">
                        {event.openReports} open {event.openReports === 1 ? 'report' : 'reports'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[13px]">
                    {event.organizerName} · {event.owner.email}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                    {enumLabel(event.status)} · {enumLabel(event.visibility)} · starts {formatDate(event.startsAt)}{' '}
                    · {event.registrations} registrations
                  </p>
                  {event.moderationNote && (
                    <p className="text-muted-foreground mt-1 text-xs">Moderator note: {event.moderationNote}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
