'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ticket } from '@/components/ui/icons'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { TicketView } from './ticket-view'

/**
 * The signed-in user's registrations. `ticketsOnly` shows confirmed registrations with their QR
 * ticket; otherwise every registration and its status is listed.
 */
export function RegistrationList({ ticketsOnly }: { ticketsOnly: boolean }) {
  const [scope, setScope] = React.useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [page, setPage] = React.useState(1)
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const query = useQuery({
    queryKey: keys.myRegistrations({ scope, page }),
    queryFn: () =>
      unwrap(api.GET('/api/v1/me/registrations', { params: { query: { scope, page, pageSize: 10 } } })),
  })
  const cancel = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/api/v1/me/registrations/{id}/cancel', { params: { path: { id } } })),
    onSuccess: async () => {
      toast.success('Registration cancelled')
      await queryClient.invalidateQueries({ queryKey: ['my-registrations'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const items = (query.data?.items ?? []).filter((item) => !ticketsOnly || item.status === 'CONFIRMED')

  return (
    <>
      <Tabs
        value={scope}
        onValueChange={(value) => {
          setScope(value as typeof scope)
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-6 space-y-4">
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={ticketsOnly ? 'No tickets here' : 'No registrations here'}
            description="Registrations made while signed in appear here. Guest registrations are managed from the link in the confirmation email."
            action={
              <Button asChild variant="outline">
                <Link href="/dashboard/discover">Find an event</Link>
              </Button>
            }
          />
        ) : (
          items.map((registration) => (
            <TicketView
              key={registration.id}
              registration={registration}
              ticketBase={`/api/v1/me/registrations/${registration.id}/ticket`}
              cancelling={cancel.isPending && cancel.variables === registration.id}
              onCancel={() =>
                confirm(
                  {
                    title: 'Cancel this registration?',
                    description: `Your ticket for ${registration.event.title} will stop working and your place will be released.`,
                    confirmLabel: 'Cancel registration',
                    destructive: true,
                  },
                  () => cancel.mutateAsync(registration.id),
                )
              }
            />
          ))
        )}
        {query.data && (
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onPage={setPage} />
        )}
      </div>
      {dialog}
    </>
  )
}
