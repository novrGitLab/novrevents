'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatDateTime, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function NotificationsPage() {
  const [page, setPage] = React.useState(1)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.notifications({ page }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/notifications', { params: { query: { page, pageSize: 20, unreadOnly: 'false' } } }),
      ),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const readAll = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all')),
    onSuccess: refresh,
  })
  const markRead = (id: string) =>
    void unwrap(api.POST('/api/v1/notifications/{id}/read', { params: { path: { id } } })).then(refresh)

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          query.data && query.data.unreadCount > 0 ? (
            <Button variant="outline" onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="You’ll hear about new followers, registrations and events from people you follow."
        />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border">
            {query.data.items.map((item) => {
              const content = (
                <>
                  <p className={cn('text-sm', !item.readAt && 'font-semibold')}>{item.title}</p>
                  {item.body && <p className="text-muted-foreground text-sm">{item.body}</p>}
                  <p className="text-muted-foreground mt-1 text-xs" title={formatDateTime(item.createdAt)}>
                    {relativeTime(item.createdAt)}
                  </p>
                </>
              )
              return (
                <li key={item.id} className={cn('flex gap-3 px-4 py-3', !item.readAt && 'bg-accent/40')}>
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      item.readAt ? 'bg-transparent' : 'bg-primary',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    {item.linkPath ? (
                      <Link
                        href={item.linkPath}
                        onClick={() => !item.readAt && markRead(item.id)}
                        className="block hover:underline"
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </div>
                  {!item.readAt && (
                    <Button variant="ghost" size="sm" onClick={() => markRead(item.id)}>
                      Mark read
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />
        </>
      )}
    </>
  )
}
