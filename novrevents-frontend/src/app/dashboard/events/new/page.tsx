'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common'
import { EventForm } from '@/components/events/event-form'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'

export default function NewEventPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useSession()
  return (
    <>
      <PageHeader
        title="Create an event"
        description="Your event is saved as a draft. Nothing is public until you publish it."
      />
      <EventForm
        defaultOrganizerName={user?.profile.displayName}
        submitLabel="Create draft"
        onSubmit={async (payload) => {
          const event = await unwrap(api.POST('/api/v1/events', { body: payload }))
          await queryClient.invalidateQueries({ queryKey: ['my-events'] })
          toast.success('Draft created')
          router.push(`/dashboard/events/${event.id}`)
        }}
      />
    </>
  )
}
