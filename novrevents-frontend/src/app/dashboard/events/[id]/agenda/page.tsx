'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/common'
import { useManagedEvent, type ManagedEvent } from '@/components/events/event-context'
import { ImageUpload } from '@/components/image-upload'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatDate, formatTime, fromLocalInput, toLocalInput } from '@/lib/format'

type Speaker = Schema<'Speaker'>
type Session = Schema<'AgendaSession'>

export default function AgendaPage() {
  const { event } = useManagedEvent()
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Sessions event={event} />
      <Speakers event={event} />
    </div>
  )
}

function useSpeakers(eventId: string) {
  return useQuery({
    queryKey: keys.eventPart(eventId, 'speakers'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/speakers', { params: { path: { id: eventId } } })),
  })
}

/** Sessions grouped by calendar day in the event's timezone, in order. */
function groupByDay(items: Session[], timeZone: string) {
  const groups = new Map<string, Session[]>()
  for (const session of items) {
    const day = formatDate(session.startsAt, timeZone)
    groups.set(day, [...(groups.get(day) ?? []), session])
  }
  return [...groups.entries()]
}

function Sessions({ event }: { event: ManagedEvent }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = React.useState<Session | 'new' | null>(null)
  const sessions = useQuery({
    queryKey: keys.eventPart(event.id, 'sessions'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/sessions', { params: { path: { id: event.id } } })),
  })
  const speakers = useSpeakers(event.id)
  const speakerName = (id: string) => speakers.data?.items.find((speaker) => speaker.id === id)?.name

  const remove = useMutation({
    mutationFn: (sessionId: string) =>
      unwrap(
        api.DELETE('/api/v1/events/{id}/sessions/{sessionId}', {
          params: { path: { id: event.id, sessionId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventPart(event.id, 'sessions') }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>
            Agenda{' '}
            {sessions.data && sessions.data.items.length > 0 && (
              <span className="text-muted-foreground text-sm font-normal tabular-nums">
                ({sessions.data.items.length} sessions)
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Times are in the event’s timezone ({event.timezone}) and must fall within the event.
          </CardDescription>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setEditing('new')}>
          <Plus /> Session
        </Button>
      </CardHeader>
      <CardContent>
        {sessions.isPending ? (
          <LoadingState rows={3} />
        ) : sessions.isError ? (
          <ErrorState error={sessions.error} />
        ) : sessions.data.items.length === 0 ? (
          <EmptyState
            compact
            title="No sessions yet"
            description="Add talks, workshops and breaks to build the agenda shown on the event page."
            action={
              <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                <Plus /> Add the first session
              </Button>
            }
          />
        ) : (
          <div className="-mx-5 -mb-5 border-t">
            {groupByDay(sessions.data.items, event.timezone).map(([day, items]) => (
              <section key={day} aria-label={day}>
                <h3 className="bg-muted/60 eyebrow border-b px-5 py-2">{day}</h3>
                <ol className="divide-y">
                  {items.map((session) => (
                    <li
                      key={session.id}
                      className="hover:bg-brand-soft/40 grid grid-cols-[88px_minmax(0,1fr)_auto] items-start gap-3 px-5 py-3.5 sm:grid-cols-[112px_minmax(0,1fr)_auto]"
                    >
                      <p className="text-primary pt-0.5 text-[13px] font-medium tabular-nums">
                        {formatTime(session.startsAt, event.timezone)}
                        <span className="text-muted-foreground block text-xs font-normal">
                          to {formatTime(session.endsAt, event.timezone)}
                        </span>
                      </p>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{session.title}</p>
                          {session.track && <Badge variant="secondary">{session.track}</Badge>}
                        </div>
                        {session.location && (
                          <p className="text-muted-foreground mt-0.5 text-xs">{session.location}</p>
                        )}
                        {session.speakerIds.length > 0 && (
                          <p className="mt-1 text-[13px]">
                            {session.speakerIds.map(speakerName).filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${session.title}`}
                          onClick={() => setEditing(session)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${session.title}`}
                          onClick={() => remove.mutate(session.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>
      {editing && (
        <SessionDialog
          event={event}
          session={editing === 'new' ? null : editing}
          speakers={speakers.data?.items ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function SessionDialog({
  event,
  session,
  speakers,
  onClose,
}: {
  event: ManagedEvent
  session: Session | null
  speakers: Speaker[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const tz = event.timezone
  const [title, setTitle] = React.useState(session?.title ?? '')
  const [description, setDescription] = React.useState(session?.description ?? '')
  const [startsAt, setStartsAt] = React.useState(toLocalInput(session?.startsAt ?? event.startsAt, tz))
  const [endsAt, setEndsAt] = React.useState(
    toLocalInput(
      session?.endsAt ?? new Date(new Date(event.startsAt).getTime() + 3_600_000).toISOString(),
      tz,
    ),
  )
  const [location, setLocation] = React.useState(session?.location ?? '')
  const [track, setTrack] = React.useState(session?.track ?? '')
  const [speakerIds, setSpeakerIds] = React.useState<string[]>(session?.speakerIds ?? [])
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        description: description || null,
        startsAt: fromLocalInput(startsAt, tz),
        endsAt: fromLocalInput(endsAt, tz),
        location: location || null,
        track: track || null,
        speakerIds,
      }
      return session
        ? unwrap(
            api.PATCH('/api/v1/events/{id}/sessions/{sessionId}', {
              params: { path: { id: event.id, sessionId: session.id } },
              body,
            }),
          )
        : unwrap(api.POST('/api/v1/events/{id}/sessions', { params: { path: { id: event.id } }, body }))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.eventPart(event.id, 'sessions') })
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session ? 'Edit session' : 'New session'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Title" htmlFor="session-title" required>
            <Input
              id="session-title"
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Starts (${tz})`} htmlFor="session-start" required>
              <Input
                id="session-start"
                type="datetime-local"
                value={startsAt}
                onChange={(changeEvent) => setStartsAt(changeEvent.target.value)}
                required
              />
            </Field>
            <Field label={`Ends (${tz})`} htmlFor="session-end" required>
              <Input
                id="session-end"
                type="datetime-local"
                value={endsAt}
                onChange={(changeEvent) => setEndsAt(changeEvent.target.value)}
                required
              />
            </Field>
            <Field label="Room / location" htmlFor="session-location">
              <Input
                id="session-location"
                value={location}
                onChange={(changeEvent) => setLocation(changeEvent.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Track" htmlFor="session-track">
              <Input
                id="session-track"
                value={track}
                onChange={(changeEvent) => setTrack(changeEvent.target.value)}
                maxLength={80}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="session-description">
            <Textarea
              id="session-description"
              value={description}
              onChange={(changeEvent) => setDescription(changeEvent.target.value)}
              maxLength={4000}
            />
          </Field>
          {speakers.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Speakers</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {speakers.map((speaker) => (
                  <label key={speaker.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={speakerIds.includes(speaker.id)}
                      onChange={(changeEvent) =>
                        setSpeakerIds(
                          changeEvent.target.checked
                            ? [...speakerIds, speaker.id]
                            : speakerIds.filter((id) => id !== speaker.id),
                        )
                      }
                    />
                    {speaker.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Speakers({ event }: { event: ManagedEvent }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = React.useState<Speaker | 'new' | null>(null)
  const speakers = useSpeakers(event.id)
  const remove = useMutation({
    mutationFn: (speakerId: string) =>
      unwrap(
        api.DELETE('/api/v1/events/{id}/speakers/{speakerId}', {
          params: { path: { id: event.id, speakerId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.event(event.id) }),
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>
            Speakers{' '}
            {speakers.data && speakers.data.items.length > 0 && (
              <span className="text-muted-foreground text-sm font-normal tabular-nums">
                ({speakers.data.items.length})
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Collect applications with a speaker form; list confirmed speakers here.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setEditing('new')}>
          <Plus /> Speaker
        </Button>
      </CardHeader>
      <CardContent>
        {speakers.isPending ? (
          <LoadingState rows={2} />
        ) : speakers.isError ? (
          <ErrorState error={speakers.error} />
        ) : speakers.data.items.length === 0 ? (
          <EmptyState
            compact
            title="No speakers yet"
            description="Speakers you add can be linked to sessions and appear on the event page."
          />
        ) : (
          <ul className="-mx-5 -mb-5 divide-y border-t">
            {speakers.data.items.map((speaker) => (
              <li key={speaker.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar src={speaker.photoUrl} name={speaker.name} className="size-9 rounded-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{speaker.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[speaker.title, speaker.organization].filter(Boolean).join(', ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${speaker.name}`}
                  onClick={() => setEditing(speaker)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${speaker.name}`}
                  onClick={() => remove.mutate(speaker.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && (
        <SpeakerDialog
          eventId={event.id}
          speaker={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function SpeakerDialog({
  eventId,
  speaker,
  onClose,
}: {
  eventId: string
  speaker: Speaker | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [current, setCurrent] = React.useState(speaker)
  const [name, setName] = React.useState(speaker?.name ?? '')
  const [title, setTitle] = React.useState(speaker?.title ?? '')
  const [organization, setOrganization] = React.useState(speaker?.organization ?? '')
  const [bio, setBio] = React.useState(speaker?.bio ?? '')
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.event(eventId) })
  const save = useMutation({
    mutationFn: () => {
      const body = { name, title: title || null, organization: organization || null, bio: bio || null }
      return current
        ? unwrap(
            api.PATCH('/api/v1/events/{id}/speakers/{speakerId}', {
              params: { path: { id: eventId, speakerId: current.id } },
              body,
            }),
          )
        : unwrap(api.POST('/api/v1/events/{id}/speakers', { params: { path: { id: eventId } }, body }))
    },
    onSuccess: async (saved) => {
      setCurrent(saved)
      await refresh()
      if (current) onClose()
      else toast.success('Speaker added. You can upload a photo now.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{speaker ? 'Edit speaker' : 'New speaker'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Name" htmlFor="speaker-name" required>
            <Input
              id="speaker-name"
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="speaker-title">
              <Input
                id="speaker-title"
                value={title}
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Organisation" htmlFor="speaker-org">
              <Input
                id="speaker-org"
                value={organization}
                onChange={(changeEvent) => setOrganization(changeEvent.target.value)}
                maxLength={120}
              />
            </Field>
          </div>
          <Field label="Bio" htmlFor="speaker-bio">
            <Textarea
              id="speaker-bio"
              value={bio}
              onChange={(changeEvent) => setBio(changeEvent.target.value)}
              maxLength={2000}
            />
          </Field>
          {current && (
            <ImageUpload<Speaker>
              label="Photo"
              currentUrl={current.photoUrl}
              endpoint={`/api/v1/events/${eventId}/speakers/${current.id}/photo`}
              onUploaded={(updated) => {
                setCurrent(updated)
                void refresh()
              }}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={save.isPending}>
              {current ? 'Save' : 'Add speaker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
