'use client'

import { useQuery } from '@tanstack/react-query'
import { Compass } from '@/components/ui/icons'
import Link from 'next/link'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EventCard, useSavedEventIds } from '@/components/events/event-card'
import { FollowedOrganizations } from '@/components/organizations/followed-organizations'
import { PeopleList } from '@/components/profiles/people'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

function SideHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="eyebrow mb-2">
      {children}
    </h2>
  )
}

export default function FollowingPage() {
  const { user } = useSession()
  const [page, setPage] = React.useState(1)
  const saved = useSavedEventIds()
  const feed = useQuery({
    queryKey: keys.feed({ page }),
    queryFn: () => unwrap(api.GET('/api/v1/me/feed', { params: { query: { page, pageSize: 12 } } })),
  })
  if (!user) return null
  const username = user.profile.username

  return (
    <>
      <PageHeader
        title="Following"
        description="New events from the organisations and people you follow, and who follows you."
      />
      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">New events</TabsTrigger>
          <TabsTrigger value="organisations">Organisations</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="followers">Followers</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-6">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
            <section aria-label="New events" className="min-w-0">
              {feed.isPending ? (
                <LoadingState rows={3} />
              ) : feed.isError ? (
                <ErrorState error={feed.error} retry={() => void feed.refetch()} />
              ) : feed.data.items.length === 0 ? (
                <EmptyState
                  icon={Compass}
                  title="No new events yet"
                  description="When organisations and people you follow publish an event, it appears here."
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard/discover">Find organisers on Discover</Link>
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="grid gap-5 sm:grid-cols-2">
                    {feed.data.items.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        saved={saved.has(event.id)}
                        href={`/dashboard/discover/events/${event.slug}`}
                      />
                    ))}
                  </div>
                  <Pagination page={feed.data.page} totalPages={feed.data.totalPages} onPage={setPage} />
                </>
              )}
            </section>
            <aside className="space-y-6" aria-label="Who you follow">
              <section aria-labelledby="side-orgs">
                <SideHeading id="side-orgs">Organisations</SideHeading>
                <FollowedOrganizations limit={5} />
              </section>
              <section aria-labelledby="side-people">
                <SideHeading id="side-people">People</SideHeading>
                <PeopleList username={username} list="following" limit={5} />
              </section>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="organisations" className="mt-6 max-w-3xl">
          <FollowedOrganizations />
        </TabsContent>
        <TabsContent value="people" className="mt-6 max-w-3xl">
          <PeopleList username={username} list="following" />
        </TabsContent>
        <TabsContent value="followers" className="mt-6 max-w-3xl">
          <PeopleList username={username} list="followers" />
        </TabsContent>
      </Tabs>
    </>
  )
}
