'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { Pagination } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

/** Organisations the signed-in person follows, with a way to stop following each one. */
/** `limit` shows a short preview without pagination (used on the dashboard). */
export function FollowedOrganizations({ limit }: { limit?: number } = {}) {
  const [page, setPage] = React.useState(1)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [...keys.followedOrganizations, page],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/me/followed-organizations', { params: { query: { page, pageSize: limit ?? 12 } } }),
      ),
  })
  const unfollow = useMutation({
    mutationFn: (slug: string) =>
      unwrap(api.DELETE('/api/v1/public/organizations/{slug}/follow', { params: { path: { slug } } })),
    onSuccess: async (_result, slug) => {
      toast.success('Stopped following')
      await queryClient.invalidateQueries({ queryKey: keys.followedOrganizations })
      await queryClient.invalidateQueries({ queryKey: ['public-organization', slug] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (query.isPending) return <LoadingState rows={2} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  if (query.data.items.length === 0) {
    return (
      <EmptyState
        title="You aren’t following any organisations"
        description="Open an organisation’s page and choose Follow to see its new events in your feed."
      />
    )
  }
  return (
    <>
      <ul className="bg-card divide-y rounded-lg border">
        {query.data.items.map((org) => (
          <li key={org.slug} className="flex items-center gap-3 px-4 py-3">
            <Avatar src={org.logoUrl} name={org.name} className="size-10 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Link href={`/o/${org.slug}`} className="block truncate text-sm font-medium hover:underline">
                {org.name}
              </Link>
              <p className="text-muted-foreground text-[13px] tabular-nums">
                {org.publicEventCount} public {org.publicEventCount === 1 ? 'event' : 'events'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              loading={unfollow.isPending && unfollow.variables === org.slug}
              onClick={() => unfollow.mutate(org.slug)}
              aria-label={`Stop following ${org.name}`}
            >
              Following
            </Button>
          </li>
        ))}
      </ul>
      {!limit && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
    </>
  )
}
