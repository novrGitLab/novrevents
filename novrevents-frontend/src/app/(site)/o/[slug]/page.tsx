'use client'

import { useQuery } from '@tanstack/react-query'
import { Globe } from 'lucide-react'
import { useParams } from 'next/navigation'
import * as React from 'react'
import { Pagination } from '@/components/common'
import { EventCard } from '@/components/events/event-card'
import { FollowOrganizationButton } from '@/components/organizations/follow-organization-button'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Avatar, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

/** Public organiser page for an organisation workspace. */
export default function OrganizerPage() {
  const { slug } = useParams<{ slug: string }>()
  const [timeframe, setTimeframe] = React.useState<'upcoming' | 'past'>('upcoming')
  const [page, setPage] = React.useState(1)
  const org = useQuery({
    queryKey: ['public-organization', slug],
    queryFn: () => unwrap(api.GET('/api/v1/public/organizations/{slug}', { params: { path: { slug } } })),
  })
  const params = {
    organization: slug,
    timeframe,
    page,
    pageSize: 12,
    sort: timeframe === 'past' ? ('latest' as const) : ('soonest' as const),
  }
  const events = useQuery({
    queryKey: keys.publicEvents(params),
    queryFn: () => unwrap(api.GET('/api/v1/public/events', { params: { query: params } })),
    enabled: org.isSuccess,
  })

  if (org.isPending)
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
        <LoadingState />
      </div>
    )
  if (org.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        {isApiError(org.error) && org.error.status === 404 ? (
          <h1 className="page-title">Organiser not found</h1>
        ) : (
          <ErrorState error={org.error} />
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
      <section className="flex flex-col gap-5 border-b pb-8 sm:flex-row sm:items-start">
        <Avatar src={org.data.logoUrl} name={org.data.name} className="size-24 rounded-lg border text-xl" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Organiser</p>
          <h1 className="page-title mt-1">{org.data.name}</h1>
          {org.data.description && (
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6 whitespace-pre-line">
              {org.data.description}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <dl className="bg-card grid grid-cols-2 divide-x rounded-lg border">
              <div className="px-4 py-2.5">
                <dt className="eyebrow">Public events</dt>
                <dd className="text-lg font-semibold tabular-nums">{org.data.publicEventCount}</dd>
              </div>
              <div className="px-4 py-2.5">
                <dt className="eyebrow">Followers</dt>
                <dd className="text-lg font-semibold tabular-nums">{org.data.followerCount}</dd>
              </div>
            </dl>
            {org.data.websiteUrl && (
              <a
                href={org.data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-muted-foreground hover:border-primary hover:text-brand-text inline-flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] font-medium"
              >
                <Globe className="size-4" aria-hidden /> Website
              </a>
            )}
          </div>
        </div>
        <FollowOrganizationButton slug={slug} following={org.data.following} className="sm:self-start" />
      </section>
      <Tabs
        value={timeframe}
        onValueChange={(value) => {
          setTimeframe(value as 'upcoming' | 'past')
          setPage(1)
        }}
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-4">
        {events.isPending ? (
          <LoadingState rows={2} />
        ) : events.isError ? (
          <ErrorState error={events.error} retry={() => void events.refetch()} />
        ) : events.data.items.length === 0 ? (
          <EmptyState compact title={timeframe === 'upcoming' ? 'No upcoming events' : 'No past events'} />
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.data.items.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <Pagination page={events.data.page} totalPages={events.data.totalPages} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
