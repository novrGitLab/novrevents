'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  Bell,
  Building2,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  ListChecks,
  ShieldAlert,
  Ticket,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatDateTime, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type Notification = Schema<'Notification'>

const TYPE_ICON: Record<string, LucideIcon> = {
  NEW_FOLLOWER: UserPlus,
  FOLLOWED_USER_EVENT: CalendarDays,
  REGISTRATION_CONFIRMED: Ticket,
  REGISTRATION_UPDATE: CheckCircle2,
  EVENT_UPDATED: CalendarDays,
  EVENT_CANCELLED: CalendarX,
  EVENT_MODERATED: ShieldAlert,
  TEAM_ADDED: Users,
  ORGANIZATION_ADDED: Building2,
  TASK_ASSIGNED: ListChecks,
  CERTIFICATE_ISSUED: Award,
}

/** Groups notifications into Today, This week and Earlier, by the viewer's clock. */
function groupByAge(items: Notification[]) {
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Today', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier', items: [] },
  ]
  for (const item of items) {
    const at = new Date(item.createdAt).getTime()
    if (at >= startOfToday.getTime()) groups[0].items.push(item)
    else if (now - at < 7 * 86_400_000) groups[1].items.push(item)
    else groups[2].items.push(item)
  }
  return groups.filter((group) => group.items.length > 0)
}

export default function NotificationsPage() {
  const [page, setPage] = React.useState(1)
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.notifications({ page, unreadOnly }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/notifications', {
          params: { query: { page, pageSize: 20, unreadOnly: unreadOnly ? 'true' : 'false' } },
        }),
      ),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const readAll = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all')),
    onSuccess: refresh,
  })
  const markRead = (id: string) =>
    void unwrap(api.POST('/api/v1/notifications/{id}/read', { params: { path: { id } } })).then(refresh)
  const unread = query.data?.unreadCount ?? 0

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        description="New followers, registration updates and changes to events you are part of."
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={() => readAll.mutate()} loading={readAll.isPending}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      <div role="group" aria-label="Show" className="mb-4 flex gap-2">
        {[
          { value: false, label: 'All' },
          { value: true, label: unread > 0 ? `Unread (${unread})` : 'Unread' },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={unreadOnly === option.value}
            onClick={() => {
              setUnreadOnly(option.value)
              setPage(1)
            }}
            className={cn(
              'h-8 rounded-sm border px-3 text-[13px] font-medium tabular-nums',
              unreadOnly === option.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:border-primary hover:text-brand-text',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          compact={unreadOnly}
          icon={Bell}
          title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}
          description={
            unreadOnly
              ? 'There are no unread notifications.'
              : 'You’ll hear about new followers, registrations and events from people you follow.'
          }
        />
      ) : (
        <>
          <div className="space-y-6">
            {groupByAge(query.data.items).map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="eyebrow mb-2">{group.label}</h2>
                <ul className="bg-card divide-y rounded-lg border">
                  {group.items.map((item) => {
                    const Icon = TYPE_ICON[item.type] ?? Bell
                    const isUnread = !item.readAt
                    const content = (
                      <>
                        <p className={cn('text-sm', isUnread ? 'font-semibold' : 'font-medium')}>{item.title}</p>
                        {item.body && <p className="text-muted-foreground mt-0.5 text-[13px]">{item.body}</p>}
                      </>
                    )
                    return (
                      <li
                        key={item.id}
                        className={cn('relative flex gap-3 px-4 py-3.5', isUnread && 'bg-brand-soft/40')}
                      >
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-sm',
                            isUnread ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                          aria-hidden
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          {item.linkPath ? (
                            <Link
                              href={item.linkPath}
                              onClick={() => isUnread && markRead(item.id)}
                              className="hover:text-brand-text block"
                            >
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                          <p
                            className="text-subtle-foreground mt-1 text-xs"
                            title={formatDateTime(item.createdAt)}
                          >
                            {relativeTime(item.createdAt)}
                            {isUnread && <span className="sr-only"> · unread</span>}
                          </p>
                        </div>
                        {isUnread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={() => markRead(item.id)}
                          >
                            Mark read
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />
        </>
      )}
    </div>
  )
}
