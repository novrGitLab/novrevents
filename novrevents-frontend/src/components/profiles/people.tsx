'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Pagination } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

export function FollowButton({
  username,
  following,
  size,
}: {
  username: string
  following: boolean
  size?: 'sm' | 'default'
}) {
  const { isAuthenticated } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        following
          ? api.DELETE('/api/v1/profiles/{username}/follow', { params: { path: { username } } })
          : api.POST('/api/v1/profiles/{username}/follow', { params: { path: { username } } }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
      await queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Button
      variant={following ? 'outline' : 'primary'}
      size={size}
      loading={mutation.isPending}
      onClick={() => (isAuthenticated ? mutation.mutate() : router.push(`/auth/login?next=/u/${username}`))}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}

/** `limit` shows a short preview without pagination (used on the dashboard). */
export function PeopleList({
  username,
  list,
  limit,
}: {
  username: string
  list: 'followers' | 'following'
  limit?: number
}) {
  const [page, setPage] = React.useState(1)
  const query = useQuery({
    queryKey: keys.profileList(username, list, { page }),
    queryFn: () =>
      unwrap(
        list === 'followers'
          ? api.GET('/api/v1/profiles/{username}/followers', {
              params: { path: { username }, query: { page, pageSize: limit ?? 24 } },
            })
          : api.GET('/api/v1/profiles/{username}/following', {
              params: { path: { username }, query: { page, pageSize: limit ?? 24 } },
            }),
      ),
  })
  if (query.isPending) return <LoadingState rows={2} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  if (query.data.items.length === 0)
    return (
      <EmptyState
        compact
        title={list === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
        description={
          list === 'followers'
            ? 'People who follow your public profile appear here.'
            : 'Follow people from their profile to see their new events.'
        }
      />
    )
  return (
    <>
      <ul className="bg-card divide-y rounded-lg border">
        {query.data.items.map((person) => (
          <li key={person.username} className="flex items-center gap-3 px-4 py-3">
            <Avatar src={person.avatarUrl} name={person.displayName} className="size-9" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/u/${person.username}`}
                className="hover:text-brand-text block truncate text-sm font-medium"
              >
                {person.displayName}
              </Link>
              <p className="text-muted-foreground truncate text-[13px]">
                {person.headline ?? `@${person.username}`}
              </p>
            </div>
            {!person.isSelf && (
              <FollowButton username={person.username} following={person.isFollowing} size="sm" />
            )}
          </li>
        ))}
      </ul>
      {!limit && <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />}
    </>
  )
}
