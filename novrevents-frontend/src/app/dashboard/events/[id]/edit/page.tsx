'use client'

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useManagedEvent, type ManagedEvent } from '@/components/events/event-context'
import { EventForm } from '@/components/events/event-form'
import { ImageUpload } from '@/components/image-upload'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

export default function EditEventPage() {
  const { event } = useManagedEvent()
  const queryClient = useQueryClient()
  const setEvent = (updated: ManagedEvent) => queryClient.setQueryData(keys.event(event.id), updated)
  const removeImage = (kind: 'banner' | 'logo') => async () => {
    setEvent(
      await unwrap(
        api.DELETE('/api/v1/events/{id}/images/{kind}', { params: { path: { id: event.id, kind } } }),
      ),
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <EventForm
        key={event.updatedAt}
        event={event}
        submitLabel="Save changes"
        onSubmit={async (payload) => {
          const updated = await unwrap(
            api.PATCH('/api/v1/events/{id}', { params: { path: { id: event.id } }, body: payload }),
          )
          setEvent(updated)
          await queryClient.invalidateQueries({ queryKey: ['my-events'] })
          toast.success('Event saved')
        }}
      />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>Shown on the event page, registration form and tickets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ImageUpload<ManagedEvent>
              label="Banner"
              aspect="banner"
              currentUrl={event.bannerUrl}
              endpoint={`/api/v1/events/${event.id}/images/banner`}
              onUploaded={setEvent}
              onRemove={removeImage('banner')}
            />
            <ImageUpload<ManagedEvent>
              label="Event logo"
              currentUrl={event.logoUrl}
              endpoint={`/api/v1/events/${event.id}/images/logo`}
              onUploaded={setEvent}
              onRemove={removeImage('logo')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
