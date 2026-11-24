/**
 * iCalendar (RFC 5545) builder for public event calendar exports.
 *
 * Times are written in UTC (the `Z` form), which is unambiguous in every calendar application, so the attendee's
 * calendar shows the right moment regardless of their own timezone. The event's own timezone is named in the
 * description so the local time is also clear. Only public fields are included: no organiser email, no attendee
 * data and no online join link.
 */

export interface CalendarEvent {
  uid: string
  stamp: Date
  startsAt: Date
  endsAt: Date
  summary: string
  description: string
  location: string
  url: string
  cancelled: boolean
}

const CRLF = '\r\n'

/** UTC timestamp in iCalendar form, e.g. 20261127T080000Z. */
export function icsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

/** Escapes text values per RFC 5545 section 3.3.11. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** Folds a content line at 75 octets, never splitting a character (RFC 5545 section 3.1). */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  const limit = () => (parts.length === 0 ? 75 : 74)
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > limit()) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join(CRLF)
}

export function buildCalendar(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NOVR Events//Event calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsUtc(event.stamp)}`,
    `DTSTART:${icsUtc(event.startsAt)}`,
    `DTEND:${icsUtc(event.endsAt)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    `LOCATION:${icsEscape(event.location)}`,
    `URL:${event.url}`,
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF) + CRLF
}
