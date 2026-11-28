'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { useManagedEvent } from '@/components/events/event-context'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { useAuthProviders } from '@/lib/auth-providers'
import { enumLabel, formatDateTime } from '@/lib/format'

const inProgress = (status: string) => status === 'QUEUED' || status === 'SENDING'

export function TicketDelivery({ registrationId, valid }: { registrationId: string; valid: boolean }) {
  const { event } = useManagedEvent()
  const path = { id: event.id, registrationId }
  const providers = useAuthProviders()
  const history = useQuery({
    queryKey: keys.eventPart(event.id, 'ticket-delivery', { registrationId }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/events/{id}/registrations/{registrationId}/ticket-delivery', { params: { path } }),
      ),
    refetchInterval: ({ state }) => {
      if (state.data?.items.some((item) => inProgress(item.status))) return 5000
      return state.data?.retryAfterMs ? state.data.retryAfterMs + 100 : false
    },
  })
  const resend = useMutation({
    mutationFn: async () => {
      await ensureCsrfToken()
      return unwrap(
        api.POST('/api/v1/events/{id}/registrations/{registrationId}/resend-ticket', { params: { path } }),
      )
    },
    onSettled: () => history.refetch(),
  })
  if (history.isPending) return <LoadingState rows={1} label="Loading ticket emails" />
  if (history.isError) return <ErrorState error={history.error} retry={() => void history.refetch()} />
  const { items, retryAfterMs } = history.data
  const pending = items.some((item) => inProgress(item.status))
  const active = ['PUBLISHED', 'ONGOING'].includes(event.status)
  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="ticket-email-heading">
      <h3 id="ticket-email-heading" className="font-semibold">
        Ticket emails
      </h3>
      {items.length ? (
        <ol aria-label="Five most recent ticket emails" className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0 text-sm">
                <p>{item.resend ? 'Ticket copy' : 'Registration confirmation'}</p>
                <time className="text-muted-foreground text-xs" dateTime={item.updatedAt}>
                  {formatDateTime(item.updatedAt, event.timezone)}
                </time>
              </div>
              <Badge
                variant={item.status === 'FAILED' || item.status === 'BOUNCED' ? 'destructive' : 'outline'}
              >
                {item.loggedOnly ? 'Recorded only' : enumLabel(item.status)}
              </Badge>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">No ticket email has been recorded.</p>
      )}
      {valid && active && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            loading={resend.isPending}
            disabled={!providers.data?.emailDelivery || pending || retryAfterMs > 0}
            onClick={() => resend.mutate()}
          >
            Resend ticket
          </Button>
          <p className="text-muted-foreground text-xs" role="status">
            {providers.data?.emailDelivery === false
              ? 'Email delivery is temporarily unavailable.'
              : pending
                ? 'A ticket email is awaiting delivery.'
                : retryAfterMs > 0
                  ? 'Another copy can be requested one minute after the last request.'
                  : 'Sends the same ticket and QR code to the registered email address.'}
          </p>
        </div>
      )}
      {resend.isError && <Notice tone="error">{errorMessage(resend.error)}</Notice>}
    </section>
  )
}
