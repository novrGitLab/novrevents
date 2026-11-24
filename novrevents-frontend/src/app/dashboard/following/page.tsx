'use client'

import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EventCard } from '@/components/events/event-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { PeopleList } from '@/components/profiles/people'
import { FollowedOrganizations } from '@/components/organizations/followed-organizations'

export default function FollowingPage() {
  const { user } = useSession()
  const [page, setPage] = React.useState(1)
  const feed = useQuery({
    queryKey: keys.feed({ page }),
    queryFn: () => unwrap(api.GET('/api/v1/me/feed', { params: { query: { page, pageSize: 12 } } })),
  })
  if (!user) return null
  return (
    <>
      <PageHeader
        title="Following"
        description="New events from people and organisations you follow, and your connections."
      />
      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Events</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
          <TabsTrigger value="followers">Followers</TabsTrigger>
        </TabsList>
        <TabsContent value="feed">
          {feed.isPending ? (
            <LoadingState rows={2} />
          ) : feed.isError ? (
            <ErrorState error={feed.error} retry={() => void feed.refetch()} />
          ) : feed.data.items.length === 0 ? (
            <EmptyState
              title="No events from people you follow"
              description="Follow organisations and people to see their new public events here."
            />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {feed.data.items.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
              <Pagination page={feed.data.page} totalPages={feed.data.totalPages} onPage={setPage} />
            </>
          )}
        </TabsContent>
        <TabsContent value="following" className="space-y-10">
          <section aria-labelledby="following-orgs">
            <h2 id="following-orgs" className="section-title mb-3">
              Organisations
            </h2>
            <FollowedOrganizations />
          </section>
          <section aria-labelledby="following-people">
            <h2 id="following-people" className="section-title mb-3">
              People
            </h2>
            <PeopleList username={user.profile.username} list="following" />
          </section>
        </TabsContent>
        <TabsContent value="followers">
          <PeopleList username={user.profile.username} list="followers" />
        </TabsContent>
      </Tabs>
    </>
  )
}
