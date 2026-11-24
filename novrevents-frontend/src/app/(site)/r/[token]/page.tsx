'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { useConfirm } from '@/components/common'
import { ErrorState, LoadingState } from '@/components/states'
import { TicketView } from '@/components/tickets/ticket-view'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage, isApiError } from '@/lib/api/errors'

/** Guest self-service: reached from the link in the confirmation email. No account needed. */
export default function GuestRegistrationPage() {
  const { token } = useParams<{ token: string }>()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const queryKey = ['guest-registration', token]
  const query = useQuery({
    queryKey,
    queryFn: () => unwrap(api.GET('/api/v1/public/registrations/{token}', { params: { path: { token } } })),
  })
  const cancel = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/public/registrations/{token}/cancel', { params: { path: { token } } })),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data)
      toast.success('Your registration has been cancelled.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Your registration</h1>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        isApiError(query.error) && query.error.status === 404 ? (
          <p className="text-muted-foreground">
            This link is not valid. Use the most recent link from your confirmation email.
          </p>
        ) : (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        )
      ) : (
        <>
          <TicketView
            registration={query.data}
            ticketBase={`/api/v1/public/registrations/${token}/ticket`}
            cancelling={cancel.isPending}
            onCancel={() =>
              confirm(
                {
                  title: 'Cancel your registration?',
                  description:
                    'Your ticket will stop working and your place will be released. You can register again later if places remain.',
                  confirmLabel: 'Cancel registration',
                  destructive: true,
                },
                () => cancel.mutateAsync(),
              )
            }
          />
          <p className="text-muted-foreground mt-4 text-xs">
            Keep this page’s link private — anyone who has it can view this ticket.
          </p>
        </>
      )}
      {dialog}
    </div>
  )
}
