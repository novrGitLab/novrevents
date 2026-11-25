import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { EventCard, type EventSummary } from '@/components/events/event-card'
import { apiUrl } from '@/lib/server-api'

/** The next three public events from the live directory. Refreshed every five minutes. */
async function fetchUpcoming(): Promise<EventSummary[]> {
  try {
    const response = await fetch(
      `${apiUrl}/api/v1/public/events?page=1&pageSize=3&timeframe=upcoming&sort=soonest`,
      { next: { revalidate: 300 } },
    )
    if (!response.ok) return []
    const body = (await response.json()) as { items?: EventSummary[] }
    return body.items ?? []
  } catch {
    return []
  }
}

/**
 * Real upcoming events from the directory. When there are none (or the API is unreachable) the
 * section is left out rather than filled with sample listings.
 */
export async function Upcoming() {
  const events = await fetchUpcoming()
  if (events.length === 0) return null
  return (
    <section aria-labelledby="upcoming-title" className="border-b">
      <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">From the directory</p>
            <h2 id="upcoming-title" className="marketing-heading mt-2">
              Upcoming in the community
            </h2>
          </div>
          <Link
            href="/explore"
            className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-sm font-medium"
          >
            Explore all events <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    </section>
  )
}
