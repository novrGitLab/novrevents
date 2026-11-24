'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  BookmarkCheck,
  Flag,
  Globe,
  Mail,
  MapPin,
  Settings,
  Share2,
  Ticket,
  CalendarPlus,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/common'
import { EventCard, EventCover, eventPlace, RegistrationStatus } from '@/components/events/event-card'
import { CLOSED_REASON_TEXT, EVENT_MODE_LABELS, EVENT_TYPE_LABELS } from '@/components/events/labels'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage, isApiError } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { dateBadge, formatDate, formatEventRange, formatTime } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

type EventDetailData = Schema<'EventDetail'>

export function EventDetail({ slug }: { slug: string }) {
  const searchParams = useSearchParams()
  const key = searchParams.get('key') ?? undefined
  const query = useQuery({
    queryKey: keys.publicEvent(slug, key),
    queryFn: () =>
      unwrap(api.GET('/api/v1/public/events/{slug}', { params: { path: { slug }, query: { key } } })),
  })

  // Count one page view per visit (the API de-duplicates and ignores the event team).
  React.useEffect(() => {
    if (!query.data) return
    void api.POST('/api/v1/public/events/{slug}/view', {
      params: { path: { slug }, query: { key } },
      body: { referrer: document.referrer || undefined },
    })
  }, [query.data, slug, key])

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <LoadingState rows={4} />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        {isApiError(query.error) && query.error.status === 404 ? (
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Event not found</h1>
            <p className="text-muted-foreground mt-2">
              It may be private, unpublished, or the link may be incomplete.
            </p>
            <Button asChild className="mt-6">
              <Link href="/explore">Explore events</Link>
            </Button>
          </div>
        ) : (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        )}
      </div>
    )
  }
  return <EventView event={query.data} accessKey={key} />
}

function EventView({ event, accessKey }: { event: EventDetailData; accessKey?: string }) {
  const speakersById = new Map(event.speakers.map((speaker) => [speaker.id, speaker]))
  const sessionsByDay = groupSessions(event)
  const badge = dateBadge(event.startsAt, event.timezone)
  const venueLine = [event.venueName, event.address].filter(Boolean).join(', ')
  const placeLine = [event.city, event.region, event.country].filter(Boolean).join(', ')
  const range = formatEventRange(event.startsAt, event.endsAt, event.timezone)
  const sameDay = range.includes(' · ')

  return (
    <article className="mx-auto max-w-[1080px] px-4 pt-6 sm:px-6 lg:pt-10">
      <div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <EventCover
            event={event}
            sizes="(min-width: 1024px) 340px, 100vw"
            className="aspect-[16/9] rounded-lg border"
          />
          <div className="hidden space-y-6 lg:block">
            <OrganizerPanel event={event} />
            <EventActions event={event} accessKey={accessKey} />
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-muted-foreground text-[13px]">
            {EVENT_TYPE_LABELS[event.eventType]}
            {event.category && <> · {event.category.name}</>}
          </p>
          <h1 className="display-title mt-1.5 text-balance">{event.title}</h1>
          {event.summary && (
            <p className="text-muted-foreground mt-2 text-[15px] leading-6">{event.summary}</p>
          )}

          <dl className="mt-6 space-y-4">
            <div className="flex items-center gap-3.5">
              <div
                aria-hidden
                className="flex size-11 shrink-0 flex-col overflow-hidden rounded-lg border text-center"
              >
                <span className="bg-muted text-muted-foreground text-[10px] leading-4 font-semibold">
                  {badge.month}
                </span>
                <span className="flex-1 text-base leading-6 font-semibold tabular-nums">{badge.day}</span>
              </div>
              <div>
                <dt className="sr-only">When</dt>
                <dd className="text-[15px] font-medium">
                  {sameDay ? formatDate(event.startsAt, event.timezone) : range.split(' – ')[0]}
                </dd>
                <dd className="text-muted-foreground text-[13px]">
                  {sameDay ? range.split(' · ')[1] : `until ${range.split(' – ')[1]}`}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <div
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-lg border"
              >
                {event.mode === 'VIRTUAL' ? (
                  <Globe className="size-[18px]" />
                ) : (
                  <MapPin className="size-[18px]" />
                )}
              </div>
              <div className="min-w-0">
                <dt className="sr-only">Where</dt>
                <dd className="text-[15px] font-medium">
                  {event.mode === 'VIRTUAL' ? 'Online' : venueLine || eventPlace(event)}
                </dd>
                <dd className="text-muted-foreground text-[13px]">
                  {event.mode === 'VIRTUAL'
                    ? 'The joining link is shared with registered attendees'
                    : [placeLine, event.mode === 'HYBRID' ? 'also online' : null].filter(Boolean).join(' · ')}
                  <span className="sr-only"> ({EVENT_MODE_LABELS[event.mode]})</span>
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-7">
            <RegistrationPanel event={event} />
          </div>

          {event.status === 'CANCELLED' && (
            <Notice tone="error" title="This event has been cancelled" className="mt-6">
              {event.cancellationReason ?? 'The organiser cancelled this event.'}
            </Notice>
          )}

          <section aria-labelledby="about" className="mt-10">
            <h2 id="about" className="section-title border-b pb-2">
              About
            </h2>
            <div className="text-foreground/90 mt-4 max-w-[68ch] text-[15px] leading-7 whitespace-pre-line">
              {event.description || 'No description yet.'}
            </div>
          </section>

          {sessionsByDay.length > 0 && (
            <section aria-labelledby="agenda" className="mt-10">
              <div className="flex items-baseline justify-between gap-3 border-b pb-2">
                <h2 id="agenda" className="section-title">
                  Agenda
                </h2>
                <p className="text-muted-foreground text-xs">Times in {event.timezone}</p>
              </div>
              <div className="mt-4 space-y-6">
                {sessionsByDay.map(([day, sessions]) => (
                  <div key={day}>
                    <h3 className="text-[13px] font-semibold">{day}</h3>
                    <ol className="mt-1 divide-y">
                      {sessions.map((session) => (
                        <li key={session.id} className="grid gap-1 py-3 sm:grid-cols-[112px_1fr]">
                          <span className="text-muted-foreground text-[13px] tabular-nums">
                            {formatTime(session.startsAt, event.timezone)}–
                            {formatTime(session.endsAt, event.timezone)}
                          </span>
                          <div>
                            <p className="text-[15px] font-medium">{session.title}</p>
                            {(session.speakerIds.length > 0 || session.track || session.location) && (
                              <p className="text-muted-foreground mt-0.5 text-[13px]">
                                {[
                                  session.speakerIds
                                    .map((speakerId) => speakersById.get(speakerId)?.name)
                                    .filter(Boolean)
                                    .join(', '),
                                  session.track,
                                  session.location,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            )}
                            {session.description && (
                              <p className="text-muted-foreground mt-1 text-[13px]">{session.description}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          {event.speakers.length > 0 && (
            <section aria-labelledby="speakers" className="mt-10">
              <h2 id="speakers" className="section-title border-b pb-2">
                Speakers
              </h2>
              <ul className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {event.speakers.map((speaker) => (
                  <li key={speaker.id} className="flex gap-3">
                    <Avatar src={speaker.photoUrl} name={speaker.name} className="size-10" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{speaker.name}</p>
                      <p className="text-muted-foreground text-[13px]">
                        {[speaker.title, speaker.organization].filter(Boolean).join(', ')}
                      </p>
                      {speaker.bio && (
                        <p className="text-muted-foreground mt-1 line-clamp-3 text-[13px]">{speaker.bio}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <RelatedEvents event={event} />

          <div className="mt-10 space-y-6 border-t pt-6 lg:hidden">
            <OrganizerPanel event={event} />
            <EventActions event={event} accessKey={accessKey} />
          </div>
        </div>
      </div>
    </article>
  )
}

function RegistrationPanel({ event }: { event: EventDetailData }) {
  const { registration, viewer } = event
  return (
    <div className="bg-card rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Registration</h2>
        <span className="text-muted-foreground text-[13px]">
          {event.isPaid ? (event.priceInfo ?? 'Paid event') : 'Free'}
        </span>
      </div>
      <div className="p-4">
        {viewer.registrationStatus === 'CONFIRMED' ? (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">You’re registered.</span>{' '}
              <span className="text-muted-foreground">
                {emailDeliveryEnabled
                  ? 'Your ticket is in your account and was emailed to you.'
                  : 'Your ticket is in your account.'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/dashboard/tickets">
                  <Ticket /> View my ticket
                </Link>
              </Button>
              {viewer.onlineUrl && (
                <Button asChild variant="outline">
                  <a href={viewer.onlineUrl} target="_blank" rel="noopener noreferrer">
                    <Globe /> Join online
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : viewer.registrationStatus === 'PENDING' ? (
          <p className="text-sm">
            <span className="font-medium">Registration received.</span>{' '}
            <span className="text-muted-foreground">
              {emailDeliveryEnabled
                ? 'The organiser is reviewing registrations. You’ll get an email with your ticket if approved.'
                : 'The organiser is reviewing registrations. If approved, your ticket appears in My tickets.'}
            </span>
          </p>
        ) : registration.open && registration.formSlug ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <RegistrationStatus registration={registration} status={event.status} />
              <p className="text-muted-foreground text-[13px]">
                {[
                  registration.requiresApproval
                    ? 'Registrations are reviewed by the organiser'
                    : 'No account needed',
                  event.registrationDeadline
                    ? `Closes ${formatDate(event.registrationDeadline, event.timezone)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button asChild size="lg" className="sm:min-w-40">
              <Link href={`/f/${registration.formSlug}`}>
                {registration.requiresApproval ? 'Request a place' : 'Register'}
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium">
            {CLOSED_REASON_TEXT[registration.reason] ?? 'Registration is closed.'}
          </p>
        )}
        {viewer.canManage && (
          <div className="mt-3 border-t pt-3">
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/events/${event.id}`}>
                <Settings /> Manage event
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function OrganizerPanel({ event }: { event: EventDetailData }) {
  const { organizer } = event
  const profileHref = organizer.organization
    ? `/o/${organizer.organization.slug}`
    : organizer.username
      ? `/u/${organizer.username}`
      : null
  return (
    <section aria-labelledby="hosted-by">
      <h2 id="hosted-by" className="text-muted-foreground border-b pb-2 text-[13px] font-medium">
        Hosted by
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar src={organizer.organization?.logoUrl ?? organizer.avatarUrl} name={organizer.name} />
        <div className="min-w-0">
          {profileHref ? (
            <Link href={profileHref} className="block truncate text-sm font-medium hover:underline">
              {organizer.organization?.name ?? organizer.name}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium">{organizer.name}</p>
          )}
          {organizer.organization && organizer.username && (
            <Link
              href={`/u/${organizer.username}`}
              className="text-muted-foreground text-[13px] hover:underline"
            >
              {organizer.name === organizer.organization.name ? `@${organizer.username}` : organizer.name}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px]">
        {event.organizerEmail && (
          <a
            href={`mailto:${event.organizerEmail}`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-2"
          >
            <Mail className="size-4" aria-hidden /> Contact the organiser
          </a>
        )}
        {event.organizerWebsite && (
          <a
            href={event.organizerWebsite}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-muted-foreground hover:text-foreground flex items-center gap-2"
          >
            <Globe className="size-4" aria-hidden /> Website
          </a>
        )}
        {event.capacity && (
          <p className="text-muted-foreground flex items-center gap-2">
            <Users className="size-4" aria-hidden /> {event.capacity} places
          </p>
        )}
      </div>
    </section>
  )
}

function groupSessions(event: EventDetailData) {
  const groups = new Map<string, EventDetailData['sessions']>()
  for (const session of event.sessions) {
    const day = formatDate(session.startsAt, event.timezone)
    groups.set(day, [...(groups.get(day) ?? []), session])
  }
  return [...groups.entries()]
}

function EventActions({ event, accessKey }: { event: EventDetailData; accessKey?: string }) {
  const { isAuthenticated } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [reportOpen, setReportOpen] = React.useState(false)

  const save = useMutation({
    mutationFn: async (saved: boolean) =>
      saved
        ? unwrap(api.DELETE('/api/v1/public/events/{slug}/save', { params: { path: { slug: event.slug } } }))
        : unwrap(
            api.PUT('/api/v1/public/events/{slug}/save', {
              params: { path: { slug: event.slug }, query: { key: accessKey } },
            }),
          ),
    onSuccess: async (result) => {
      toast.success(result.saved ? 'Saved to your events' : 'Removed from saved events')
      await queryClient.invalidateQueries({ queryKey: ['public-event', event.slug] })
      await queryClient.invalidateQueries({ queryKey: ['saved-events'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: event.title, url }).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          isAuthenticated
            ? save.mutate(event.viewer.isSaved)
            : router.push(`/login?next=/events/${event.slug}`)
        }
        loading={save.isPending}
        aria-pressed={event.viewer.isSaved}
      >
        {event.viewer.isSaved ? <BookmarkCheck /> : <Bookmark />} {event.viewer.isSaved ? 'Saved' : 'Save'}
      </Button>
      <Button variant="outline" size="sm" onClick={() => void share()}>
        <Share2 /> Share
      </Button>
      <Button asChild variant="outline" size="sm">
        <a
          href={`/api/v1/public/events/${event.slug}/calendar.ics${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ''}`}
          download
        >
          <CalendarPlus /> Add to calendar
        </a>
      </Button>
      {!event.viewer.canManage && (
        <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)}>
          <Flag /> Report
        </Button>
      )}
      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} slug={event.slug} accessKey={accessKey} />
    </div>
  )
}

const REPORT_REASONS = {
  SPAM: 'Spam',
  SCAM: 'Scam or fraud',
  MISLEADING: 'Misleading information',
  MALICIOUS: 'Malicious links or content',
  INAPPROPRIATE: 'Inappropriate content',
  OTHER: 'Something else',
} as const

function ReportDialog({
  open,
  onOpenChange,
  slug,
  accessKey,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  accessKey?: string
}) {
  const { isAuthenticated } = useSession()
  const [reason, setReason] = React.useState<keyof typeof REPORT_REASONS>('SPAM')
  const [details, setDetails] = React.useState('')
  const [email, setEmail] = React.useState('')
  const report = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/public/events/{slug}/report', {
          params: { path: { slug }, query: { key: accessKey } },
          body: { reason, details: details || null, email: isAuthenticated ? null : email || null },
        }),
      ),
    onSuccess: () => {
      toast.success('Thank you. Our moderators will review this event.')
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this event</DialogTitle>
          <DialogDescription>
            Reports are reviewed by NOVR Events moderators. The organiser does not see who reported.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            report.mutate()
          }}
        >
          <Field label="Reason" htmlFor="report-reason" required>
            <NativeSelect
              id="report-reason"
              value={reason}
              onChange={(changeEvent) => setReason(changeEvent.target.value as keyof typeof REPORT_REASONS)}
            >
              {Object.entries(REPORT_REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Details"
            htmlFor="report-details"
            description="Optional. What is wrong with this event?"
          >
            <Textarea
              id="report-details"
              value={details}
              onChange={(changeEvent) => setDetails(changeEvent.target.value)}
              maxLength={1000}
            />
          </Field>
          {!isAuthenticated && (
            <Field
              label="Your email"
              htmlFor="report-email"
              description="Optional, in case moderators need to follow up."
            >
              <Input
                id="report-email"
                type="email"
                value={email}
                onChange={(changeEvent) => setEmail(changeEvent.target.value)}
              />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={report.isPending}>
              Send report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Other upcoming public events in the same category. Real data only: the section is omitted when the event has
 * no category or no other upcoming event shares it.
 */
function RelatedEvents({ event }: { event: EventDetailData }) {
  const category = event.category
  const related = useQuery({
    queryKey: keys.publicEvents({ related: category?.slug, pageSize: 4 }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/public/events', {
          params: {
            query: { category: category?.slug, timeframe: 'upcoming', sort: 'soonest', page: 1, pageSize: 4 },
          },
        }),
      ),
    enabled: Boolean(category),
  })
  const items = (related.data?.items ?? []).filter((item) => item.id !== event.id).slice(0, 3)
  if (!category || items.length === 0) return null
  return (
    <section aria-labelledby="related-events" className="mt-10">
      <h2 id="related-events" className="section-title border-b pb-2">
        More {category.name} events
      </h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        {items.map((item) => (
          <EventCard key={item.id} event={item} />
        ))}
      </div>
    </section>
  )
}
