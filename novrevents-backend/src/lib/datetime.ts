/**
 * Formatting helpers for event times. Timestamps are stored in UTC and always rendered in the
 * event's own IANA timezone so every attendee sees the organiser's local time, clearly labelled.
 */

const dateTimeFormat = (timezone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

const timeFormat = (timezone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

const dateFormat = (timezone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const dayKeyFormat = (timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

/** Short zone label such as "WAT" or "GMT+1". */
export function timezoneLabel(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    timeZoneName: 'short',
  }).formatToParts(date)
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timezone
}

/** `YYYY-MM-DD` for the given instant in the given timezone. */
export function localDayKey(date: Date, timezone: string): string {
  return dayKeyFormat(timezone).format(date)
}

export function formatDateTime(date: Date, timezone: string): string {
  return `${dateTimeFormat(timezone).format(date)} (${timezoneLabel(date, timezone)})`
}

export function formatLongDate(date: Date, timezone: string): string {
  return dateFormat(timezone).format(date)
}

/** "Sat, 14 Nov 2026, 09:00 – 17:00 (WAT)" or a full range when the event spans several days. */
export function formatEventRange(startsAt: Date, endsAt: Date, timezone: string): string {
  const zone = timezoneLabel(startsAt, timezone)
  const start = dateTimeFormat(timezone).format(startsAt)
  if (localDayKey(startsAt, timezone) === localDayKey(endsAt, timezone)) {
    return `${start} – ${timeFormat(timezone).format(endsAt)} (${zone})`
  }
  return `${start} – ${dateTimeFormat(timezone).format(endsAt)} (${zone})`
}

/** Date text printed on certificates: a single day or a day range. */
export function formatEventDates(startsAt: Date, endsAt: Date, timezone: string): string {
  const start = formatLongDate(startsAt, timezone)
  const end = formatLongDate(endsAt, timezone)
  return start === end ? start : `${start} – ${end}`
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}
