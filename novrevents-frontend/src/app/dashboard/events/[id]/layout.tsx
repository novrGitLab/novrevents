'use client'

import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { EventHeaderActions } from '@/components/events/event-actions'
import { EventCover, eventPlace } from '@/components/events/event-card'
import {
  canAdminister,
  canManage,
  EventProvider,
  useManagedEventQuery,
  type ManagedEvent,
} from '@/components/events/event-context'
import { EVENT_STATUS_LABELS, EVENT_STATUS_VARIANT } from '@/components/events/labels'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatEventRange } from '@/lib/format'
import { cn } from '@/lib/utils'

type Level = 'checkin' | 'manage'

/** Every workspace page, grouped. Staff (check-in level) see only the operational pages. */
const GROUPS: { label: string; items: { href: string; label: string; level: Level }[] }[] = [
  {
    label: 'Event',
    items: [
      { href: '', label: 'Overview', level: 'checkin' },
      { href: '/edit', label: 'Details & branding', level: 'manage' },
      { href: '/agenda', label: 'Agenda', level: 'manage' },
    ],
  },
  {
    label: 'Audience',
    items: [
      { href: '/forms', label: 'Forms', level: 'manage' },
      { href: '/registrations', label: 'Registrations', level: 'checkin' },
      { href: '/attendance', label: 'Attendance', level: 'checkin' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/scanner', label: 'Check-in', level: 'checkin' },
      { href: '/tasks', label: 'Tasks', level: 'checkin' },
      { href: '/communications', label: 'Communications', level: 'manage' },
      { href: '/team', label: 'Team', level: 'checkin' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics', level: 'manage' },
      { href: '/certificates', label: 'Certificates', level: 'manage' },
    ],
  },
]

function previewHref(event: ManagedEvent) {
  const key =
    event.visibility === 'PRIVATE' && event.privateLink
      ? new URL(event.privateLink).searchParams.get('key')
      : null
  return `/events/${event.slug}${key ? `?key=${key}` : ''}`
}

export default function EventWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const query = useManagedEventQuery(id)

  if (query.isPending) return <LoadingState rows={4} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const event = query.data
  const base = `/dashboard/events/${event.id}`
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.level === 'checkin' || canManage(event)),
  })).filter((group) => group.items.length > 0)
  const isActive = (href: string) => (href === '' ? pathname === base : pathname.startsWith(`${base}${href}`))
  const current = groups.flatMap((group) => group.items).find((item) => isActive(item.href))

  return (
    <EventProvider event={event}>
      <Link
        href="/dashboard/events"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium"
      >
        <ArrowLeft className="size-4" aria-hidden /> My events
      </Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <EventCover
            event={event}
            sizes="112px"
            className="hidden aspect-[16/10] w-[104px] shrink-0 rounded-sm border sm:block"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-headline-md truncate">{event.title}</h1>
              <Badge variant={EVENT_STATUS_VARIANT[event.effectiveStatus]}>
                {EVENT_STATUS_LABELS[event.effectiveStatus]}
              </Badge>
              {event.moderationStatus === 'REMOVED' && (
                <Badge variant="destructive">Removed by moderators</Badge>
              )}
              {event.moderationStatus === 'FLAGGED' && <Badge variant="warning">Under review</Badge>}
            </div>
            <p className="text-muted-foreground mt-0.5 truncate text-[13px]">
              {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
              <span className="text-subtle-foreground"> · </span>
              {eventPlace(event)}
            </p>
            {!canAdminister(event) && (
              <p className="text-muted-foreground mt-0.5 text-xs">
                Your role:{' '}
                {event.role === 'MANAGER'
                  ? 'manager'
                  : event.role === 'STAFF'
                    ? 'check-in staff'
                    : 'organization admin'}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={previewHref(event)} target="_blank">
              {event.status === 'DRAFT' ? 'Preview' : 'Public page'} <ExternalLink />
            </Link>
          </Button>
          <EventHeaderActions event={event} />
        </div>
      </header>

      {/* Desktop: one compact row of grouped links. Phones: a native select. */}
      <nav aria-label="Event sections" className="mt-5 mb-7 border-b">
        <ul className="hidden items-end gap-x-5 overflow-x-auto md:flex">
          {groups.map((group) => (
            <li key={group.label} className="shrink-0">
              <p className="eyebrow text-subtle-foreground px-2">{group.label}</p>
              <ul className="flex">
                {group.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={`${base}${item.href}`}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'text-muted-foreground hover:text-foreground -mb-px inline-flex h-9 items-center border-b-2 border-transparent px-2 text-[13px] font-medium whitespace-nowrap',
                          active && 'border-primary text-primary',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="pb-3 md:hidden">
          <label htmlFor="event-section" className="sr-only">
            Event section
          </label>
          <select
            id="event-section"
            value={current?.href ?? ''}
            onChange={(changeEvent) => router.push(`${base}${changeEvent.target.value}`)}
            className="border-input bg-card focus:border-ring h-10 w-full rounded-sm border px-3 text-base font-medium focus:outline-none sm:text-sm"
          >
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.href} value={item.href}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </nav>
      {children}
    </EventProvider>
  )
}
