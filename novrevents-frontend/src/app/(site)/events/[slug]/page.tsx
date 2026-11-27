import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { fetchPublicEvent, type PublicEvent } from '@/lib/server-api'
import { siteUrl } from '@/lib/site'
import { EventDetail } from './event-detail'

const absolute = (url: string | null) => (url ? new URL(url, siteUrl).toString() : undefined)

/** Only public, published events are indexed. Unlisted and private events (opened with a key) are not. */
function indexable(event: PublicEvent) {
  return event.visibility === 'PUBLIC' && event.status !== 'DRAFT' && event.status !== 'ARCHIVED'
}

/** Server-side metadata so shared links show the event. Private events never reach here without a key. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const event = await fetchPublicEvent(slug)
  if (!event) return { title: 'Event', robots: { index: false, follow: false } }
  const description = event.summary ?? undefined
  const image = absolute(event.bannerUrl)
  return {
    title: event.title,
    description,
    alternates: { canonical: `/events/${event.slug}` },
    robots: indexable(event) ? undefined : { index: false, follow: false },
    openGraph: {
      type: 'website',
      title: event.title,
      description,
      url: `/events/${event.slug}`,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: { card: image ? 'summary_large_image' : 'summary', title: event.title, description },
  }
}

const ATTENDANCE_MODE = {
  IN_PERSON: 'https://schema.org/OfflineEventAttendanceMode',
  VIRTUAL: 'https://schema.org/OnlineEventAttendanceMode',
  HYBRID: 'https://schema.org/MixedEventAttendanceMode',
} as const

/** schema.org Event built only from fields the event actually has. */
function structuredData(event: PublicEvent) {
  const url = `${siteUrl}/events/${event.slug}`
  const place =
    event.mode !== 'VIRTUAL' && (event.venueName || event.address || event.city)
      ? {
          '@type': 'Place',
          name: event.venueName ?? event.city ?? undefined,
          address: {
            '@type': 'PostalAddress',
            streetAddress: event.address ?? undefined,
            addressLocality: event.city ?? undefined,
            addressRegion: event.region ?? undefined,
            addressCountry: event.country ?? undefined,
          },
        }
      : null
  const online = event.mode !== 'IN_PERSON' ? { '@type': 'VirtualLocation', url } : null
  const organization = event.organizer.organization
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.summary ?? undefined,
    url,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus:
      event.status === 'CANCELLED'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode: ATTENDANCE_MODE[event.mode],
    location: [place, online].filter(Boolean),
    image: event.bannerUrl ? [absolute(event.bannerUrl)] : undefined,
    organizer: {
      '@type': organization ? 'Organization' : 'Person',
      name: organization?.name ?? event.organizer.name,
      url: organization ? `${siteUrl}/o/${organization.slug}` : (event.organizerWebsite ?? undefined),
    },
    isAccessibleForFree: event.isPaid ? false : true,
  }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await fetchPublicEvent(slug)
  const nonce=(await headers()).get('x-novr-nonce') ?? undefined
  return (
    <>
      {event && indexable(event) && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData(event)).replace(/</g, '\\u003c'),
          }}
        />
      )}
      <EventDetail slug={slug} initial={event ?? undefined} />
    </>
  )
}
