/**
 * Event times are stored in UTC and always shown in the event's own timezone, with the zone
 * label, so a remote attendee never misreads the start time.
 */

type DateInput = string | Date

const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value))

function zoneLabel(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((item) => item.type === 'timeZoneName')
  return part?.value ?? timeZone
}

const dayKey = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date,
  )

export function formatDate(value: DateInput, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(toDate(value))
}

export function formatTime(value: DateInput, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(toDate(value))
}

export function formatDateTime(value: DateInput, timeZone?: string): string {
  const date = toDate(value)
  const text = `${formatDate(date, timeZone)}, ${formatTime(date, timeZone)}`
  return timeZone ? `${text} ${zoneLabel(date, timeZone)}` : text
}

/** "Sat, 14 Nov 2026 · 09:00–17:00 WAT", or a full range for multi-day events. */
export function formatEventRange(startsAt: DateInput, endsAt: DateInput, timeZone: string): string {
  const start = toDate(startsAt)
  const end = toDate(endsAt)
  const zone = zoneLabel(start, timeZone)
  if (dayKey(start, timeZone) === dayKey(end, timeZone)) {
    return `${formatDate(start, timeZone)} · ${formatTime(start, timeZone)}–${formatTime(end, timeZone)} ${zone}`
  }
  return `${formatDate(start, timeZone)} ${formatTime(start, timeZone)} – ${formatDate(end, timeZone)} ${formatTime(end, timeZone)} ${zone}`
}

/** Compact date badge parts in the event's timezone. */
export function dateBadge(value: DateInput, timeZone: string): { day: string; month: string } {
  const date = toDate(value)
  return {
    day: new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat('en-GB', { timeZone, month: 'short' }).format(date).toUpperCase(),
  }
}

export function relativeTime(value: DateInput): string {
  const seconds = Math.round((toDate(value).getTime() - Date.now()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ]
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export const formatNumber = (value: number) => new Intl.NumberFormat('en-GB').format(value)

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Converts an ISO instant to the value of an <input type="datetime-local"> in a given zone. */
export function toLocalInput(value: DateInput | null | undefined, timeZone: string): string {
  if (!value) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(toDate(value))
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/**
 * Converts a wall-clock time in `timeZone` (from <input type="datetime-local">) to a UTC ISO string.
 * Uses the zone's offset at that moment, so daylight-saving changes are handled.
 */
export function fromLocalInput(local: string, timeZone: string): string {
  const [datePart = '', timePart = '00:00'] = local.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0)
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>
    const asUtc = Date.UTC(
      parts.year ?? 0,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
    )
    return asUtc - instant
  }
  const first = guess - offsetAt(guess)
  const corrected = guess - offsetAt(first)
  return new Date(corrected).toISOString()
}

export const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC', 'Africa/Lagos']

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Calendar day (YYYY-MM-DD) of an instant in a timezone; used to group events by date. */
export function eventDayKey(value: DateInput, timeZone: string): string {
  return dayKey(toDate(value), timeZone)
}

/** Heading parts for a date group: { weekday: "Friday", date: "27 Nov" }. */
export function dayHeading(value: DateInput, timeZone: string): { weekday: string; date: string } {
  const date = toDate(value)
  return {
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(date),
    date: new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short' }).format(date),
  }
}

/** "09:00 WAT" — start time with the event's zone label. */
export function formatTimeWithZone(value: DateInput, timeZone: string): string {
  const date = toDate(value)
  return `${formatTime(date, timeZone)} ${zoneLabel(date, timeZone)}`
}

/** Human label for an API enum value: `PENDING_APPROVAL` → `Pending approval`. */
export function enumLabel(value: string): string {
  const words = value.replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
