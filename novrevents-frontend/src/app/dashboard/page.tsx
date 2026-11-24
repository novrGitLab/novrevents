'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ClipboardList, Plus } from 'lucide-react'
import Link from 'next/link'
import { PageHeader, StatCard } from '@/components/common'
import { EventCard, EventRow, useSavedEventIds } from '@/components/events/event-card'
import { FollowedOrganizations } from '@/components/organizations/followed-organizations'
import { PeopleList } from '@/components/profiles/people'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Avatar, Skeleton } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { dateBadge, formatEventRange, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

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
              <Link href="/explore">Explore events</Link>
            </Button>
          }
        />
      ) : (
        <ul className="bg-card divide-y rounded-lg border">
          {query.data.items.map((event) => (
            <li key={event.id} className="px-4">
              <EventRow event={event} saved />
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
    <section aria-labelledby="profile-heading" className="bg-card rounded-lg border p-5">
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
      <SectionHeading
        id="following-heading"
        title="Following"
        href="/dashboard/following"
        linkLabel="All following"
      />
      <div className="space-y-5">
        <div>
          <h3 className="text-muted-foreground mb-2 text-[13px] font-medium">Organisations</h3>
          <FollowedOrganizations limit={3} />
        </div>
        {username && (
          <div>
            <h3 className="text-muted-foreground mb-2 text-[13px] font-medium">People</h3>
            <PeopleList username={username} list="following" limit={3} />
          </div>
        )}
      </div>
    </section>
  )
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
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[13px]"
        >
          {linkLabel} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
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

  return (
    <>
      <PageHeader
        title={`Welcome back${user ? `, ${user.profile.displayName.split(' ')[0]}` : ''}`}
        description="Your tickets, the events you run, and new events from organisers you follow."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/forms/new">
                <ClipboardList /> New form
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/events/new">
                <Plus /> Create event
              </Link>
            </Button>
          </>
        }
      />

      {overview.isError ? (
        <ErrorState error={overview.error} retry={() => void overview.refetch()} />
      ) : overview.isPending ? (
        <Skeleton className="h-[84px] w-full" />
      ) : organizes ? (
        <section aria-label="Organiser summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Live events"
            value={formatNumber(live)}
            hint={`${data!.events.DRAFT ?? 0} drafts`}
          />
          <StatCard
            label="Confirmed attendees"
            value={formatNumber(data!.confirmedRegistrations)}
            hint="Across all your events"
          />
          <StatCard
            label="Awaiting review"
            value={formatNumber(data!.pendingRegistrations)}
            hint="Registrations to approve"
          />
          <StatCard label="Checked in" value={formatNumber(data!.checkIns)} hint="All time" />
        </section>
      ) : (
        <section className="bg-card flex flex-col gap-3 rounded-lg border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">You aren’t organising anything yet</p>
            <p className="text-muted-foreground text-[13px]">
              Create an event to get a registration form, QR tickets and check-in.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/events/new">Create an event</Link>
          </Button>
        </section>
      )}

      <div className="mt-8 grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="organizing-heading">
          <SectionHeading
            id="organizing-heading"
            title="Events you’re organising"
            href="/dashboard/events"
            linkLabel="All events"
          />
          {overview.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : !data || data.upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming events you organise"
              description="Published and draft events with a future date appear here."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/events/new">Create an event</Link>
                </Button>
              }
            />
          ) : (
            <div className="bg-card overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground border-b text-left text-xs">
                  <tr>
                    <th className="px-4 py-2 font-medium">Event</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Registrations</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.upcoming.map((event) => {
                    const share = event.capacity ? Math.min(1, event.registeredCount / event.capacity) : null
                    return (
                      <tr key={event.id} className="hover:bg-muted/40">
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/events/${event.id}`}
                            className="font-medium hover:underline"
                          >
                            {event.title}
                          </Link>
                          <p className="text-muted-foreground text-[13px]">
                            {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
                          </p>
                          <p className="text-muted-foreground text-[13px] tabular-nums sm:hidden">
                            {event.registeredCount} registered{event.capacity ? ` of ${event.capacity}` : ''}
                          </p>
                        </td>
                        <td className="hidden w-48 px-4 py-3 align-middle sm:table-cell">
                          <p className="tabular-nums">
                            {formatNumber(event.registeredCount)}
                            <span className="text-muted-foreground">
                              {event.capacity ? ` / ${formatNumber(event.capacity)}` : ' registered'}
                            </span>
                          </p>
                          {share !== null && (
                            <div className="bg-muted mt-1.5 h-1 rounded-full" aria-hidden>
                              <div
                                className={cn('h-1 rounded-full', share > 0.9 ? 'bg-warning' : 'bg-brand')}
                                style={{ width: `${Math.max(2, share * 100)}%` }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="tickets-heading">
          <SectionHeading
            id="tickets-heading"
            title="Your next tickets"
            href="/dashboard/tickets"
            linkLabel="All tickets"
          />
          {tickets.isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : tickets.isError ? (
            <ErrorState error={tickets.error} />
          ) : tickets.data.items.length === 0 ? (
            <EmptyState
              title="No upcoming tickets"
              description="Register for an event and your ticket appears here."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/">Discover events</Link>
                </Button>
              }
            />
          ) : (
            <ul className="bg-card divide-y rounded-lg border">
              {tickets.data.items.map((registration) => {
                const badge = dateBadge(registration.event.startsAt, registration.event.timezone)
                return (
                  <li
                    key={registration.id}
                    className="hover:bg-muted/40 relative flex items-center gap-3 px-4 py-3"
                  >
                    <div aria-hidden className="w-9 shrink-0 text-center">
                      <p className="text-brand-text text-[10px] leading-4 font-semibold">{badge.month}</p>
                      <p className="text-base leading-5 font-semibold tabular-nums">{badge.day}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/dashboard/tickets"
                        className="block truncate text-sm font-medium after:absolute after:inset-0"
                      >
                        {registration.event.title}
                      </Link>
                      <p className="text-muted-foreground truncate text-[13px]">
                        {registration.status === 'PENDING'
                          ? 'Awaiting approval'
                          : registration.event.whereText}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-10 grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SavedPanel />
        <div className="min-w-0 space-y-8">
          <ProfilePanel />
          <FollowingPanel username={user?.profile.username ?? ''} />
        </div>
      </div>

      <section className="mt-10" aria-labelledby="feed-heading">
        <SectionHeading
          id="feed-heading"
          title="New from organisers you follow"
          href="/dashboard/following"
          linkLabel="Following"
        />
        {feed.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : feed.isError ? (
          <ErrorState error={feed.error} />
        ) : feed.data.items.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Follow organisers to see their new events here."
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {feed.data.items.map((event) => (
              <EventCard key={event.id} event={event} saved={saved.has(event.id)} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
