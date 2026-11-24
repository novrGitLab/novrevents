import type { Schema } from '@/lib/api/client'
import { eventDayKey } from '@/lib/format'

type EventSummary = Schema<'EventSummary'>

export interface DayGroup {
  /** Calendar day in the event's timezone, or 'now' for events already under way. */
  key: string
  first: EventSummary
  events: EventSummary[]
}

/**
 * Groups events (already in start order) by the day they start in their own timezone. Events that have
 * started are gathered under 'now' at the top instead of a past date. Adjacent events on the same day share a
 * group; the input order is preserved.
 */
export function groupByDay(events: EventSummary[], now: number = Date.now()): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const started = new Date(event.startsAt).getTime() <= now
    const key = started ? 'now' : eventDayKey(event.startsAt, event.timezone)
    const last = groups.at(-1)
    if (last?.key === key) last.events.push(event)
    else groups.push({ key, first: event, events: [event] })
  }
  return groups
}
