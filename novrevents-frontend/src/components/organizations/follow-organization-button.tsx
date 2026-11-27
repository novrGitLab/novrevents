'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

/**
 * Follow or stop following a public organisation. Signed-out visitors are sent to sign in and brought back to
 * this organisation's page afterwards. The server decides everything that matters; this only shows the state.
 */
export function FollowOrganizationButton({
  slug,
  following,
  className,
}: {
  slug: string
  following: boolean
  className?: string
}) {
  const { isAuthenticated, isLoading } = useSession()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? unwrap(api.POST('/api/v1/public/organizations/{slug}/follow', { params: { path: { slug } } }))
        : unwrap(api.DELETE('/api/v1/public/organizations/{slug}/follow', { params: { path: { slug } } })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['public-organization', slug] })
      await queryClient.invalidateQueries({ queryKey: keys.followedOrganizations })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (isLoading) return null
  if (!isAuthenticated) {
    return (
      <Button asChild size="sm" variant="outline" className={className}>
        <Link href={`/auth/login?next=${encodeURIComponent(`/o/${slug}`)}`}>Sign in to follow</Link>
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      variant={following ? 'outline' : 'primary'}
      className={className}
      loading={mutation.isPending}
      aria-pressed={following}
      onClick={() => mutation.mutate(!following)}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
