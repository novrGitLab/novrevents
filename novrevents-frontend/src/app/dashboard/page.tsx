'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, Compass, Download, MapPin, Plus, QrCode } from '@/components/ui/icons'
import Link from 'next/link'
import { PageHeader } from '@/components/common'
import { EventCard, EventRow, useSavedEventIds } from '@/components/events/event-card'
import { REGISTRATION_STATUS_VARIANT } from '@/components/events/labels'
import { FollowedOrganizations } from '@/components/organizations/followed-organizations'
import { PeopleList } from '@/components/profiles/people'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import type { MyRegistration } from '@/components/tickets/ticket-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, Skeleton } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { dateBadge, formatEventRange, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS_TEXT = {
  PENDING: 'Awaiting review',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Not approved',
  CANCELLED: 'Cancelled',
} as const

function daysUntil(value: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

function SectionHeading({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string
  title: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-headline-sm">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-primary hover:text-primary-hover inline-flex shrink-0 items-center gap-1 text-[13px] font-medium"
        >
          {linkLabel} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/** Month and day block used in registration and organiser rows. */
function DateTile({ startsAt, timezone, solid }: { startsAt: string; timezone: string; solid?: boolean }) {
  const badge = dateBadge(startsAt, timezone)
  return (
    <div
      aria-hidden
      className={cn(
        'flex size-12 shrink-0 flex-col items-center justify-center rounded-sm',
        solid ? 'bg-primary text-primary-foreground' : 'bg-muted',
      )}
    >
      <p className={cn('text-[10px] leading-3 font-semibold uppercase', !solid && 'text-muted-foreground')}>
        {badge.month}
      </p>
      <p className="text-lg leading-6 font-semibold tabular-nums">{badge.day}</p>
    </div>
  )
}

/** The soonest upcoming registration, shown as a pass with its real QR code when the ticket is valid. */
function NextUpCard({ registration }: { registration: MyRegistration }) {
  const { event, ticket } = registration
  const ticketBase = `/api/v1/me/registrations/${registration.id}/ticket`
  const showTicket = registration.status === 'CONFIRMED' && ticket?.status === 'VALID'
  return (
    <section aria-labelledby="next-up-heading" className="bg-card overflow-hidden rounded-xl border shadow-xs">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={REGISTRATION_STATUS_VARIANT[registration.status]}>
              {STATUS_TEXT[registration.status]}
            </Badge>
            <Badge variant="secondary">{registration.ticketType.name}</Badge>
          </div>
          <p className="eyebrow mt-5">Up next · {daysUntil(event.startsAt)}</p>
          <h2 id="next-up-heading" className="text-headline-md sm:text-headline-lg mt-1.5 text-balance">
            <Link href={`/dashboard/discover/events/${event.slug}`} className="hover:text-brand-text">
              {event.title}
            </Link>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">By {event.organizerName}</p>
          <dl className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <span className="bg-brand-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-sm">
                <CalendarDays className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <dt className="sr-only">When</dt>
                <dd className="text-sm font-medium">{event.whenText}</dd>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-brand-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-sm">
                <MapPin className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <dt className="sr-only">Where</dt>
                <dd className="text-sm font-medium">{event.whereText}</dd>
              </div>
            </div>
          </dl>
          {registration.status === 'PENDING' && (
            <p className="text-muted-foreground mt-5 text-[13px]">
              The organiser is reviewing your registration. Your ticket appears here if it is approved.
            </p>
          )}
        </div>
        <div className="flex flex-col items-center justify-center gap-3 border-t border-dashed p-5 sm:p-6 lg:border-t-0 lg:border-l">
          {showTicket ? (
            <>
              <img
                src={`${ticketBase}?format=svg`}
                alt={`QR code for ticket ${ticket?.code}`}
                className="size-40 rounded-lg border bg-white p-2"
              />
              <p className="text-muted-foreground font-mono text-xs tracking-wide">{ticket?.code}</p>
              <p className="text-muted-foreground text-center text-[13px]">
                Pass holder: <span className="text-foreground font-medium">{registration.attendeeName}</span>
              </p>
              <div className="grid w-full gap-2">
                <Button asChild>
                  <Link href="/dashboard/tickets">
                    <QrCode /> View full ticket
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <a href={`${ticketBase}?format=pdf`} download>
                    <Download /> Download PDF
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <>
              <QrCode className="text-subtle-foreground size-10" aria-hidden />
              <p className="text-muted-foreground max-w-56 text-center text-[13px]">
                Your QR ticket appears here once the registration is confirmed.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/registrations">View registration</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

/** The three most recent saved events. The full list is on the Saved events page. */
function SavedPanel() {
  const query = useQuery({
    queryKey: keys.savedEvents({ preview: true, pageSize: 3 }),
    queryFn: () =>
      unwrap(api.GET('/api/v1/me/saved-events', { params: { query: { page: 1, pageSize: 3 } } })),
  })
  return (
    <section aria-labelledby="saved-heading" className="min-w-0">
      <SectionHeading id="saved-heading" title="Saved events" href="/dashboard/saved" linkLabel="All saved" />
      {query.isPending ? (
        <LoadingState rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="No saved events"
          description="Bookmark an event to keep track of it here. Saving does not register you."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/discover">Explore events</Link>
            </Button>
          }
        />
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {query.data.items.map((event) => (
            <li key={event.id} className="px-4">
              <EventRow event={event} saved href={`/dashboard/discover/events/${event.slug}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The signed-in person's own profile: visibility, what is still missing, and the way to edit and preview it.
 * The checklist is derived from the saved fields, not from any metric.
 */
function ProfilePanel() {
  const profile = useQuery({
    queryKey: keys.ownProfile,
    queryFn: () => unwrap(api.GET('/api/v1/profiles/me')),
  })
  if (profile.isPending) return <Skeleton className="h-56 w-full" />
  if (profile.isError) return <ErrorState error={profile.error} retry={() => void profile.refetch()} />
  const data = profile.data
  const links = Object.values(data.socialLinks).some(Boolean)
  const missing = [
    !data.avatarUrl && 'a profile photo',
    !data.headline && 'a headline',
    !data.bio && 'a short bio',
    !links && 'a link',
  ].filter((item): item is string => Boolean(item))
  return (
    <section aria-labelledby="profile-heading" className="bg-card h-fit rounded-lg border p-5 shadow-xs">
      <div className="flex items-start gap-3">
        <Avatar src={data.avatarUrl} name={data.displayName} className="size-12" />
        <div className="min-w-0">
          <h2 id="profile-heading" className="truncate text-[15px] font-semibold">
            {data.displayName}
          </h2>
          <p className="text-muted-foreground truncate text-[13px]">@{data.username}</p>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-[13px]">
        {data.visibility === 'PUBLIC'
          ? 'Your public profile is visible to everyone.'
          : 'Your profile is private. Only you can see it.'}
      </p>
      {missing.length > 0 && (
        <p className="text-muted-foreground mt-2 text-[13px]">
          Add {missing.join(', ')} to help people recognise you.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/profile">Edit profile</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href={`/u/${data.username}`}>Preview public profile</Link>
        </Button>
      </div>
    </section>
  )
}

/** Organisations and people the viewer follows, previewed here and listed in full on the Following page. */
function FollowingPanel({ username }: { username: string }) {
  return (
    <section aria-labelledby="following-heading" className="min-w-0">
      <SectionHeading id="following-heading" title="Following" href="/dashboard/following" linkLabel="Manage" />
      <div className="space-y-5">
        <div>
          <h3 className="eyebrow mb-2">Organisations</h3>
          <FollowedOrganizations limit={3} />
        </div>
        {username && (
          <div>
            <h3 className="eyebrow mb-2">People</h3>
            <PeopleList username={username} list="following" limit={3} />
          </div>
        )}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const { user } = useSession()
  const overview = useQuery({
    queryKey: keys.overview,
    queryFn: () => unwrap(api.GET('/api/v1/me/organizer-overview')),
  })
  const tickets = useQuery({
    queryKey: keys.myRegistrations({ scope: 'upcoming', page: 1, size: 4 }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/me/registrations', {
          params: { query: { scope: 'upcoming', page: 1, pageSize: 4 } },
        }),
      ),
  })
  const feed = useQuery({
    queryKey: keys.feed({ page: 1, size: 3 }),
    queryFn: () => unwrap(api.GET('/api/v1/me/feed', { params: { query: { page: 1, pageSize: 3 } } })),
  })
  const saved = useSavedEventIds()

  const data = overview.data
  const live = (data?.events.PUBLISHED ?? 0) + (data?.events.ONGOING ?? 0)
  const totalEvents = data ? Object.values(data.events).reduce((sum, count) => sum + count, 0) : 0
  const organizes = totalEvents > 0 || (data?.forms ?? 0) > 0
  const [next, ...rest] = tickets.data?.items ?? []
  const firstName = user?.profile.displayName.split(' ')[0]

  const stats = data
    ? [
        { label: 'Live events', value: live, hint: `${data.events.DRAFT ?? 0} drafts`, alert: false },
        {
          label: 'Confirmed attendees',
          value: data.confirmedRegistrations,
          hint: 'Across all events',
          alert: false,
        },
        {
          label: 'Awaiting review',
          value: data.pendingRegistrations,
          hint: data.pendingRegistrations > 0 ? 'Needs a decision' : 'Nothing waiting',
          alert: data.pendingRegistrations > 0,
        },
        { label: 'Checked in', value: data.checkIns, hint: 'All time', alert: false },
      ]
    : []

  return (
    <>
      <PageHeader
        title="Your events"
        description={`${firstName ? `Welcome back, ${firstName}. ` : ''}Your tickets, the events you run, and new events from organisers you follow.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/events/new">
                <Plus /> Create event
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/discover">
                <Compass /> Discover events
              </Link>
            </Button>
          </>
        }
      />

      {tickets.isPending ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : tickets.isError ? (
        <ErrorState error={tickets.error} retry={() => void tickets.refetch()} />
      ) : next ? (
        <NextUpCard registration={next} />
      ) : (
        <EmptyState
          icon={QrCode}
          title="No upcoming tickets"
          description="Register for an event and your next ticket appears here, ready to show at the door."
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/discover">Discover events</Link>
            </Button>
          }
        />
      )}

      <div className="mt-10 grid min-w-0 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="tickets-heading" className="min-w-0">
          <SectionHeading
            id="tickets-heading"
            title="My registrations and tickets"
            href="/dashboard/registrations"
            linkLabel="View all"
          />
          {tickets.isPending ? (
            <LoadingState rows={2} />
          ) : rest.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-[13px]">
              {next ? 'No other upcoming registrations.' : 'Your registrations will be listed here.'}
            </p>
          ) : (
            <ul className="bg-card divide-y rounded-lg border">
              {rest.map((registration) => (
                <li
                  key={registration.id}
                  className="hover:bg-brand-soft/50 relative flex items-center gap-4 px-4 py-3.5"
                >
                  <DateTile startsAt={registration.event.startsAt} timezone={registration.event.timezone} />
                  <div className="min-w-0 flex-1">
                    <Badge variant={REGISTRATION_STATUS_VARIANT[registration.status]}>
                      {STATUS_TEXT[registration.status]}
                    </Badge>
                    <Link
                      href={registration.status === 'CONFIRMED' ? '/dashboard/tickets' : '/dashboard/registrations'}
                      className="mt-1 block truncate text-sm font-medium after:absolute after:inset-0"
                    >
                      {registration.event.title}
                    </Link>
                    <p className="text-muted-foreground truncate text-[13px]">{registration.event.whereText}</p>
                  </div>
                  {registration.status === 'CONFIRMED' && (
                    <QrCode className="text-primary size-5 shrink-0" aria-label="Ticket available" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <SavedPanel />
      </div>

      <section aria-labelledby="organizing-heading" className="mt-12">
        <SectionHeading
          id="organizing-heading"
          title="Events you organise"
          href="/dashboard/events"
          linkLabel="All events"
        />
        {overview.isError ? (
          <ErrorState error={overview.error} retry={() => void overview.refetch()} />
        ) : overview.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : !organizes || !data ? (
          <EmptyState
            icon={CalendarDays}
            title="You aren’t organising anything yet"
            description="Create an event to get a registration form, QR tickets and check-in."
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/events/new">Create an event</Link>
              </Button>
            }
          />
        ) : (
          <div className="bg-card overflow-hidden rounded-lg border shadow-xs">
            <dl className="grid grid-cols-2 border-b lg:grid-cols-4">
              {stats.map((stat, index) => (
                <div
                  key={stat.label}
                  className={cn(
                    'px-5 py-4',
                    index % 2 === 1 && 'border-l',
                    index >= 2 && 'max-lg:border-t',
                    index === 2 && 'lg:border-l',
                  )}
                >
                  <dt className="eyebrow">{stat.label}</dt>
                  <dd className={cn('text-headline-md mt-1.5 tabular-nums', stat.alert && 'text-warning')}>
                    {formatNumber(stat.value)}
                  </dd>
                  <dd className="text-muted-foreground text-xs">{stat.hint}</dd>
                </div>
              ))}
            </dl>
            {data.upcoming.length === 0 ? (
              <p className="text-muted-foreground px-5 py-6 text-[13px]">
                No upcoming events. Published and draft events with a future date appear here.
              </p>
            ) : (
              <ul className="divide-y">
                {data.upcoming.map((event) => {
                  const share = event.capacity ? Math.min(1, event.registeredCount / event.capacity) : null
                  return (
                    <li key={event.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <DateTile startsAt={event.startsAt} timezone={event.timezone} solid />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{event.title}</p>
                          <p className="text-muted-foreground truncate text-[13px]">
                            {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3">
                            <p className="text-muted-foreground text-[13px] tabular-nums">
                              {formatNumber(event.registeredCount)}
                              {event.capacity ? ` / ${formatNumber(event.capacity)}` : ''} registered
                            </p>
                            {share !== null && (
                              <div className="bg-muted h-1 w-24 rounded-full" aria-hidden>
                                <div
                                  className={cn('h-1 rounded-full', share > 0.9 ? 'bg-warning' : 'bg-primary')}
                                  style={{ width: `${Math.max(2, share * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2 sm:pl-0">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/events/${event.id}/registrations`}>Registrations</Link>
                        </Button>
                        <Button asChild size="sm">
                          <Link href={`/dashboard/events/${event.id}`}>
                            Manage <ArrowRight />
                          </Link>
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="mt-12 grid min-w-0 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <FollowingPanel username={user?.profile.username ?? ''} />
        <ProfilePanel />
      </div>

      <section className="mt-12" aria-labelledby="feed-heading">
        <SectionHeading
          id="feed-heading"
          title="New from organisers you follow"
          href="/dashboard/discover"
          linkLabel="Browse all events"
        />
        {feed.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : feed.isError ? (
          <ErrorState error={feed.error} />
        ) : feed.data.items.length === 0 ? (
          <EmptyState title="Nothing here yet" description="Follow organisers to see their new events here." />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {feed.data.items.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                saved={saved.has(event.id)}
                href={`/dashboard/discover/events/${event.slug}`}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
