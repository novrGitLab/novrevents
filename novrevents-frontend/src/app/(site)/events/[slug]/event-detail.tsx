'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Flag,
  Globe,
  Mail,
  MapPin,
  QrCode,
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
import { Badge } from '@/components/ui/badge'
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
import { formatDate, formatEventRange, formatTime } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'
import { cn } from '@/lib/utils'

type EventDetailData = Schema<'EventDetail'>

/**
 * Public event page. With `inApp` it renders inside the signed-in shell (from /dashboard/discover):
 * no page frame of its own, and breadcrumbs and related events stay in the app.
 */
export function EventDetail({ slug, inApp = false }: { slug: string; inApp?: boolean }) {
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
      <div className={inApp ? undefined : 'mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10'}>
        <LoadingState rows={4} />
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className={inApp ? 'py-10' : 'mx-auto max-w-3xl px-4 py-16'}>
        {isApiError(query.error) && query.error.status === 404 ? (
          <div className="text-center">
            <h1 className="page-title">Event not found</h1>
            <p className="text-muted-foreground mt-2">
              It may be private, unpublished, or the link may be incomplete.
            </p>
            <Button asChild className="mt-6">
              <Link href={inApp ? '/dashboard/discover' : '/explore'}>Explore events</Link>
            </Button>
          </div>
        ) : (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        )}
      </div>
    )
  }
  return <EventView event={query.data} accessKey={key} inApp={inApp} />
}

/** Section heading with the Stitch purple rule. */
function SectionHeading({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-headline-sm border-primary border-l-[3px] pl-3 sm:text-headline-md">
        {children}
      </h2>
      {aside}
    </div>
  )
}

function MetaItem({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="bg-brand-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-sm">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="eyebrow">{label}</dt>
        <dd className="mt-0.5 text-sm">{children}</dd>
      </div>
    </div>
  )
}

function EventView({
  event,
  accessKey,
  inApp,
}: {
  event: EventDetailData
  accessKey?: string
  inApp: boolean
}) {
  const discoverHref = inApp ? '/dashboard/discover' : '/explore'
  const speakersById = new Map(event.speakers.map((speaker) => [speaker.id, speaker]))
  const sessionsByDay = groupSessions(event)
  const venueLine = [event.venueName, event.address].filter(Boolean).join(', ')
  const placeLine = [event.city, event.region, event.country].filter(Boolean).join(', ')
  const range = formatEventRange(event.startsAt, event.endsAt, event.timezone)
  const sameDay = range.includes(' · ')
  const organizerLabel = event.organizer.organization?.name ?? event.organizer.name

  return (
    <article className={inApp ? undefined : 'mx-auto max-w-[1280px] px-4 pt-5 pb-4 sm:px-6 lg:px-10 lg:pt-6'}>
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 text-[13px]">
        <ol className="flex min-w-0 items-center gap-1.5">
          <li>
            <Link href={discoverHref} className="hover:text-foreground">
              Discover
            </Link>
          </li>
          {event.category && (
            <>
              <li aria-hidden>/</li>
              <li>
                <Link href={`${discoverHref}?category=${event.category.slug}`} className="hover:text-foreground">
                  {event.category.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-foreground truncate font-medium">
            {event.title}
          </li>
        </ol>
      </nav>

      <div
        className={
          inApp
            ? 'grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-10'
            : 'grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12'
        }
      >
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{EVENT_TYPE_LABELS[event.eventType]}</Badge>
            <Badge variant="secondary">{EVENT_MODE_LABELS[event.mode]}</Badge>
            {event.category && <Badge variant="secondary">{event.category.name}</Badge>}
          </div>
          <h1 className="text-headline-lg sm:text-display mt-3 text-balance">{event.title}</h1>
          {event.summary && (
            <p className="text-muted-foreground mt-3 max-w-[68ch] text-base leading-7">{event.summary}</p>
          )}

          <dl className="mt-6 grid gap-5 border-y py-5 sm:grid-cols-3">
            <MetaItem icon={CalendarPlus} label="Date and time">
              <span className="block font-medium">
                {sameDay ? formatDate(event.startsAt, event.timezone) : range.split(' – ')[0]}
              </span>
              <span className="text-muted-foreground block text-[13px]">
                {sameDay ? range.split(' · ')[1] : `until ${range.split(' – ')[1]}`}
              </span>
            </MetaItem>
            <MetaItem icon={event.mode === 'VIRTUAL' ? Globe : MapPin} label="Location">
              <span className="block font-medium">
                {event.mode === 'VIRTUAL' ? 'Online' : venueLine || eventPlace(event)}
              </span>
              <span className="text-muted-foreground block text-[13px]">
                {event.mode === 'VIRTUAL'
                  ? 'Link shared with registered attendees'
                  : [placeLine, event.mode === 'HYBRID' ? 'also online' : null].filter(Boolean).join(' · ')}
              </span>
            </MetaItem>
            <MetaItem icon={Users} label="Hosted by">
              <span className="block truncate font-medium">{organizerLabel}</span>
              {event.capacity && (
                <span className="text-muted-foreground block text-[13px]">{event.capacity} places</span>
              )}
            </MetaItem>
          </dl>

          <EventCover
            event={event}
            sizes="(min-width: 1024px) 820px, 100vw"
            className="mt-6 aspect-[16/9] rounded-xl border"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <EventActions event={event} accessKey={accessKey} />
            <RegistrationStatus registration={event.registration} status={event.status} />
          </div>

          {event.status === 'CANCELLED' && (
            <Notice tone="error" title="This event has been cancelled" className="mt-6">
              {event.cancellationReason ?? 'The organiser cancelled this event.'}
            </Notice>
          )}

          <div className={inApp ? "mt-8 xl:hidden" : "mt-8 lg:hidden"}>
            <RegistrationPanel event={event} />
          </div>

          <section aria-labelledby="about" className="mt-12">
            <SectionHeading id="about">About this event</SectionHeading>
            <div className="text-foreground/90 mt-5 max-w-[68ch] text-[15px] leading-7 whitespace-pre-line">
              {event.description || 'No description yet.'}
            </div>
          </section>

          {sessionsByDay.length > 0 && (
            <section aria-labelledby="agenda" className="mt-12">
              <SectionHeading
                id="agenda"
                aside={<p className="eyebrow shrink-0">Times in {event.timezone}</p>}
              >
                Agenda
              </SectionHeading>
              <div className="mt-5 space-y-6">
                {sessionsByDay.map(([day, sessions]) => (
                  <div key={day}>
                    <h3 className="text-[13px] font-semibold">{day}</h3>
                    <ol className="bg-card mt-2 divide-y rounded-lg border">
                      {sessions.map((session) => (
                        <li key={session.id} className="grid gap-1 px-4 py-4 sm:grid-cols-[120px_1fr] sm:gap-4">
                          <span className="text-primary text-[13px] font-medium tabular-nums">
                            {formatTime(session.startsAt, event.timezone)}–
                            {formatTime(session.endsAt, event.timezone)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[15px] font-medium">{session.title}</p>
                              {session.track && <Badge variant="secondary">{session.track}</Badge>}
                            </div>
                            {(session.speakerIds.length > 0 || session.location) && (
                              <p className="text-muted-foreground mt-0.5 text-[13px]">
                                {[
                                  session.speakerIds
                                    .map((speakerId) => speakersById.get(speakerId)?.name)
                                    .filter(Boolean)
                                    .join(', '),
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
            <section aria-labelledby="speakers" className="mt-12">
              <SectionHeading id="speakers">Speakers</SectionHeading>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                {event.speakers.map((speaker) => (
                  <li key={speaker.id} className="bg-card flex gap-3 rounded-lg border p-4">
                    <Avatar src={speaker.photoUrl} name={speaker.name} className="size-12 rounded-sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{speaker.name}</p>
                      <p className="text-primary text-[13px]">
                        {[speaker.title, speaker.organization].filter(Boolean).join(', ')}
                      </p>
                      {speaker.bio && (
                        <p className="text-muted-foreground mt-1.5 line-clamp-3 text-[13px]">{speaker.bio}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <RelatedEvents event={event} inApp={inApp} />
        </div>

        <aside
          className={inApp ? 'space-y-5 xl:sticky xl:top-20 xl:self-start' : 'space-y-5 lg:sticky lg:top-20 lg:self-start'}
          aria-label="Registration and organiser"
        >
          <div className={inApp ? "hidden xl:block" : "hidden lg:block"}>
            <RegistrationPanel event={event} />
          </div>
          <OrganizerPanel event={event} />
        </aside>
      </div>
    </article>
  )
}

function RegistrationPanel({ event }: { event: EventDetailData }) {
  const { registration, viewer } = event
  return (
    <div className="bg-card rounded-lg border shadow-xs">
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-headline-sm">Registration</h2>
          <p className="text-muted-foreground mt-0.5 text-[13px]">
            {registration.requiresApproval ? 'Reviewed by the organiser' : 'Confirmed straight away'}
          </p>
        </div>
        <span className="bg-brand-soft text-brand-text rounded-sm px-2 py-0.5 text-xs font-medium">
          {event.isPaid ? (event.priceInfo ?? 'Paid') : 'Free'}
        </span>
      </div>
      <div className="space-y-4 p-5">
        {event.ticketTypes.length > 0 && (
          <ul className="space-y-2" aria-label="Ticket types">
            {event.ticketTypes.map((ticketType) => (
              <li
                key={ticketType.id}
                className={cn('rounded-sm border px-3 py-2.5', !ticketType.available && 'bg-muted')}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{ticketType.name}</p>
                  {!ticketType.available && <span className="text-muted-foreground text-xs">Unavailable</span>}
                </div>
                {ticketType.description && (
                  <p className="text-muted-foreground mt-0.5 text-[13px]">{ticketType.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {viewer.registrationStatus === 'CONFIRMED' ? (
          <div className="space-y-3">
            <Notice tone="success" title="You’re registered">
              {emailDeliveryEnabled
                ? 'Your ticket is in your account and was emailed to you.'
                : 'Your ticket is in your account.'}
            </Notice>
            <Button asChild className="w-full">
              <Link href="/dashboard/tickets">
                <Ticket /> View my ticket
              </Link>
            </Button>
            {viewer.onlineUrl && (
              <Button asChild variant="outline" className="w-full">
                <a href={viewer.onlineUrl} target="_blank" rel="noopener noreferrer">
                  <Globe /> Join online
                </a>
              </Button>
            )}
          </div>
        ) : viewer.registrationStatus === 'PENDING' ? (
          <Notice tone="info" title="Registration received">
            {emailDeliveryEnabled
              ? 'The organiser is reviewing registrations. You’ll get an email with your ticket if approved.'
              : 'The organiser is reviewing registrations. If approved, your ticket appears in My tickets.'}
          </Notice>
        ) : registration.open && registration.formSlug ? (
          <div className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link href={`/f/${registration.formSlug}`}>
                {registration.requiresApproval ? 'Request a place' : 'Register'} <ArrowRight />
              </Link>
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              {[
                'No account needed',
                registration.spotsLeft !== null ? `${registration.spotsLeft} places left` : null,
                event.registrationDeadline ? `Closes ${formatDate(event.registrationDeadline, event.timezone)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ) : (
          <p className="bg-muted rounded-sm px-3 py-2.5 text-sm font-medium">
            {CLOSED_REASON_TEXT[registration.reason] ?? 'Registration is closed.'}
          </p>
        )}

        <div className="flex gap-3 border-t pt-4">
          <QrCode className="text-primary size-5 shrink-0" aria-hidden />
          <p className="text-muted-foreground text-[13px]">
            Confirmed attendees get a signed QR ticket to show at check-in.
          </p>
        </div>

        {viewer.canManage && (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={`/dashboard/events/${event.id}`}>
              <Settings /> Manage event
            </Link>
          </Button>
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
    <section aria-labelledby="hosted-by" className="bg-card rounded-lg border p-5">
      <h2 id="hosted-by" className="eyebrow">
        Organiser
      </h2>
      <div className="mt-3 flex items-center gap-3">
        <Avatar
          src={organizer.organization?.logoUrl ?? organizer.avatarUrl}
          name={organizer.name}
          className="size-10 rounded-sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{organizer.organization?.name ?? organizer.name}</p>
          {organizer.organization && organizer.username && (
            <Link href={`/u/${organizer.username}`} className="text-muted-foreground text-[13px] hover:underline">
              {organizer.name === organizer.organization.name ? `@${organizer.username}` : organizer.name}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2 text-[13px]">
        {event.organizerEmail && (
          <a
            href={`mailto:${event.organizerEmail}`}
            className="text-muted-foreground hover:text-primary flex items-center gap-2"
          >
            <Mail className="size-4" aria-hidden /> Contact the organiser
          </a>
        )}
        {event.organizerWebsite && (
          <a
            href={event.organizerWebsite}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-muted-foreground hover:text-primary flex items-center gap-2"
          >
            <Globe className="size-4" aria-hidden /> Website
          </a>
        )}
      </div>
      {profileHref && (
        <Button asChild variant="outline" size="sm" className="mt-4 w-full">
          <Link href={profileHref}>View organiser</Link>
        </Button>
      )}
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
    const url = `${window.location.origin}/events/${event.slug}${accessKey ? `?key=${encodeURIComponent(accessKey)}` : ''}`
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
function RelatedEvents({ event, inApp }: { event: EventDetailData; inApp: boolean }) {
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
    <section aria-labelledby="related-events" className="mt-12">
      <SectionHeading id="related-events">More {category.name} events</SectionHeading>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <EventCard
            key={item.id}
            event={item}
            href={inApp ? `/dashboard/discover/events/${item.slug}` : undefined}
          />
        ))}
      </div>
    </section>
  )
}
