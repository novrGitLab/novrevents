'use client'

import { useManagedEvent } from '@/components/events/event-context'
import { FormList } from '@/components/forms/form-list'

export default function EventFormsPage() {
  const { event } = useManagedEvent()
  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm">
        Registration, speaker, volunteer, judge, sponsorship, workshop and feedback forms for this event.
        Invitations sent from Messages link to these forms.
      </p>
      <FormList eventId={event.id} />
    </>
  )
}
