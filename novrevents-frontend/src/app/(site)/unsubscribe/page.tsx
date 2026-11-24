'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { EmailPreferenceSwitches } from '@/components/email-preferences'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

export default function UnsubscribePage() {
  return (
    <React.Suspense>
      <Unsubscribe />
    </React.Suspense>
  )
}

/** Reached from the link in every optional email. Works without an account. */
function Unsubscribe() {
  const token = useSearchParams().get('token') ?? ''
  const queryClient = useQueryClient()
  const queryKey = ['email-preferences-token', token]
  const query = useQuery({
    queryKey,
    queryFn: () => unwrap(api.GET('/api/v1/public/email-preferences', { params: { query: { token } } })),
    enabled: Boolean(token),
  })
  const update = useMutation({
    mutationFn: (patch: Record<string, boolean>) =>
      unwrap(api.PATCH('/api/v1/public/email-preferences', { params: { query: { token } }, body: patch })),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
      toast.success('Preferences saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Email preferences</CardTitle>
          {query.data && <CardDescription>For {query.data.email}</CardDescription>}
        </CardHeader>
        <CardContent>
          {!token ? (
            <Notice tone="error">
              This link is incomplete. Use the link at the bottom of one of our emails.
            </Notice>
          ) : query.isPending ? (
            <LoadingState rows={2} />
          ) : query.isError ? (
            <ErrorState error={query.error} />
          ) : (
            <EmailPreferenceSwitches
              value={query.data.preferences}
              disabled={update.isPending}
              onChange={(patch) => update.mutate(patch)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
