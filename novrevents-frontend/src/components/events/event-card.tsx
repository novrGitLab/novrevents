'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, BookmarkCheck, Globe, MapPin } from '@/components/ui/icons'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { useSession } from '@/hooks/use-session'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { dateBadge, formatEventRange, formatTimeWithZone } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EVENT_MODE_LABELS, EVENT_TYPE_LABELS } from './labels'

export type EventSummary = Schema<'EventSummary'>

export function eventPlace(event: Pick<EventSummary, 'mode' | 'venueName' | 'city' | 'country'>): string {
  const place = [event.city, event.country].filter(Boolean).join(', ') || event.venueName
  if (event.mode === 'VIRTUAL') return 'Online'
  if (event.mode === 'HYBRID') return place ? `${place} + online` : 'In person + online'
  return place || 'Location to be announced'
}

export function organizerName(event: Pick<EventSummary, 'organizer'>) {
  return event.organizer.organization?.name ?? event.organizer.name
}

// ─── Registration status ─────────────────────────────────────────────────────

type Tone = 'success' | 'warning' | 'muted' | 'destructive'

/** One short phrase describing whether people can register, derived from the API's state. */
export function registrationStatus(
  registration: EventSummary['registration'],
  status: string,
): { label: string; tone: Tone } | null {
  if (status === 'CANCELLED') return { label: 'Cancelled', tone: 'destructive' }
  if (status === 'COMPLETED') return { label: 'Ended', tone: 'muted' }
  if (status === 'ONGOING') return { label: 'Happening now', tone: 'success' }
  if (registration.open) {
    if (registration.spotsLeft !== null && registration.spotsLeft <= 20)
      return { label: `${registration.spotsLeft} spots left`, tone: 'warning' }
    return { label: 'Registration open', tone: 'success' }
  }
  if (registration.reason === 'FULL') return { label: 'Full', tone: 'warning' }
  if (registration.reason === 'DEADLINE_PASSED' || registration.reason === 'FORM_CLOSED')
    return { label: 'Registration closed', tone: 'muted' }
  return null
}

const toneDot: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  muted: 'bg-subtle-foreground',
  destructive: 'bg-destructive',
}

export function RegistrationStatus({
  registration,
  status,
  className,
}: {
  registration: EventSummary['registration']
  status: string
  className?: string
}) {
  const state = registrationStatus(registration, status)
  if (!state) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap', className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', toneDot[state.tone])} />
      <span className={state.tone === 'muted' ? 'text-muted-foreground' : 'text-foreground'}>
        {state.label}
      </span>
    </span>
  )
}

/** Badge form, for places that need a contained label (event header). */
export function RegistrationBadge({
  registration,
  status,
}: {
  registration: EventSummary['registration']
  status: string
}) {
  const state = registrationStatus(registration, status)
  if (!state) return null
  const variant = state.tone === 'muted' ? 'secondary' : state.tone
  return <Badge variant={variant}>{state.label}</Badge>
}

// ─── Cover artwork ───────────────────────────────────────────────────────────

/**
 * Event cover. Uses the organiser's uploaded banner; without one it shows a plain, typographic
 * placeholder on a neutral surface on a pale brand tint rather than invented artwork.
 */
export function EventCover({
  event,
  className,
  sizes,
}: {
  event: Pick<EventSummary, 'bannerUrl' | 'title' | 'eventType'>
  className?: string
  sizes?: string
}) {
  return (
    <div className={cn('bg-brand-soft relative overflow-hidden', className)}>
      {event.bannerUrl ? (
        <img
          src={event.bannerUrl}
          alt=""
          sizes={sizes}
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-end p-3">
          <span className="text-brand-text/80 text-[11px] font-medium">
            {EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] ?? 'Event'}
          </span>
          <span className="text-brand-text line-clamp-2 text-sm leading-snug font-semibold">
            {event.title}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Saving ──────────────────────────────────────────────────────────────────

/** IDs of the viewer's saved events (first 200), for list-level save toggles. */
export function useSavedEventIds() {
  const { isAuthenticated } = useSession()
  const saved = useQuery({
    queryKey: keys.savedEvents({ ids: true }),
    queryFn: () =>
      unwrap(api.GET('/api/v1/me/saved-events', { params: { query: { page: 1, pageSize: 100 } } })),
    enabled: isAuthenticated,
    staleTime: 60_000,
  })
  return new Set(saved.data?.items.map((event) => event.id) ?? [])
}

export function SaveEventButton({
  event,
  saved,
  className,
}: {
  event: Pick<EventSummary, 'slug' | 'title'>
  saved: boolean
  className?: string
}) {
  const { isAuthenticated } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      saved
        ? unwrap(api.DELETE('/api/v1/public/events/{slug}/save', { params: { path: { slug: event.slug } } }))
        : unwrap(api.PUT('/api/v1/public/events/{slug}/save', { params: { path: { slug: event.slug } } })),
    onSuccess: async (result) => {
      toast.success(result.saved ? 'Saved to your events' : 'Removed from saved events')
      await queryClient.invalidateQueries({ queryKey: ['saved-events'] })
      await queryClient.invalidateQueries({ queryKey: ['public-event', event.slug] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const Icon = saved ? BookmarkCheck : Bookmark
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
        if (!isAuthenticated) router.push(`/auth/login?next=${encodeURIComponent(`/events/${event.slug}`)}`)
        else mutation.mutate()
      }}
      disabled={mutation.isPending}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${event.title} from saved events` : `Save ${event.title}`}
      className={cn(
        'text-muted-foreground hover:bg-brand-soft hover:text-primary relative z-10 inline-flex size-8 items-center justify-center rounded-sm disabled:opacity-50',
        saved && 'text-brand-text',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

// ─── List row (discovery) ────────────────────────────────────────────────────

/** Compact row used in date-grouped lists: time, title, organiser, place, availability, cover. */
/** `href` overrides the public event page, e.g. to open the in-app preview from the dashboard. */
export function EventRow({ event, saved, href }: { event: EventSummary; saved: boolean; href?: string }) {
  return (
    <article className="group hover:bg-card relative -mx-3 flex gap-4 rounded-lg px-3 py-3 transition-colors sm:gap-5">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[13px] tabular-nums">
          {formatTimeWithZone(event.startsAt, event.timezone)}
          <span className="text-subtle-foreground"> · </span>
          {EVENT_TYPE_LABELS[event.eventType]}
        </p>
        <h3 className="mt-0.5 text-base leading-snug font-semibold tracking-[-0.01em] text-pretty">
          <Link
            href={href ?? `/events/${event.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {event.title}
          </Link>
        </h3>
        <p className="text-muted-foreground mt-1 truncate text-[13px]">By {organizerName(event)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-[13px]">
            {event.mode === 'VIRTUAL' ? (
              <Globe className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <MapPin className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{eventPlace(event)}</span>
            <span className="sr-only"> ({EVENT_MODE_LABELS[event.mode]})</span>
          </span>
          <RegistrationStatus registration={event.registration} status={event.status} />
          {event.isPaid && <span className="text-muted-foreground text-[13px]">Paid</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <SaveEventButton event={event} saved={saved} className="hidden sm:inline-flex" />
        <EventCover
          event={event}
          sizes="160px"
          className="aspect-[16/10] w-24 rounded-sm border sm:w-[148px]"
        />
      </div>
    </article>
  )
}

// ─── Card (grids) ────────────────────────────────────────────────────────────

export function EventCard({
  event,
  saved,
  className,
  href,
}: {
  event: EventSummary
  saved?: boolean
  className?: string
  /** Overrides the public event page, e.g. to open the in-app preview from the dashboard. */
  href?: string
}) {
  const badge = dateBadge(event.startsAt, event.timezone)
  const price = event.isPaid ? (event.priceInfo ?? 'Paid') : 'Free'
  return (
    <article
      className={cn(
        'group bg-card card-interactive relative flex min-w-0 flex-col overflow-hidden rounded-lg border',
        className,
      )}
    >
      <div className="relative">
        <EventCover event={event} sizes="(min-width: 1024px) 380px, 100vw" className="aspect-[16/9] border-b" />
        <span className="bg-card text-foreground absolute top-3 left-3 rounded-sm border px-2 py-0.5 text-[11px] font-medium">
          {EVENT_TYPE_LABELS[event.eventType]}
        </span>
        {saved !== undefined && (
          <SaveEventButton
            event={event}
            saved={saved}
            className="bg-card absolute top-2.5 right-2.5 border shadow-xs"
          />
        )}
        <div
          aria-hidden
          className="bg-card absolute bottom-3 left-3 flex h-11 min-w-11 flex-col items-center justify-center rounded-sm border px-1.5 shadow-xs"
        >
          <span className="text-primary text-[10px] leading-3 font-semibold uppercase">{badge.month}</span>
          <span className="text-base leading-5 font-semibold tabular-nums">{badge.day}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-[15px] leading-snug font-semibold tracking-[-0.01em] text-pretty">
          <Link
            href={href ?? `/events/${event.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {event.title}
          </Link>
        </h3>
        <p className="text-muted-foreground mt-1 text-[13px]">
          {formatEventRange(event.startsAt, event.endsAt, event.timezone)}
        </p>
        {event.summary && (
          <p className="text-muted-foreground mt-2 line-clamp-2 text-[13px] leading-5">{event.summary}</p>
        )}
        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-[13px]">
              {event.mode === 'VIRTUAL' ? (
                <Globe className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <MapPin className="size-3.5 shrink-0" aria-hidden />
              )}
              <span className="truncate">{eventPlace(event)}</span>
            </span>
            <span className="text-primary shrink-0 text-[13px] font-medium">{price}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-muted-foreground truncate text-[13px]">By {organizerName(event)}</span>
            <RegistrationStatus registration={event.registration} status={event.status} />
          </div>
        </div>
      </div>
    </article>
  )
}
