import { describe, expect, it } from 'vitest'
import { buildCalendar, foldLine, icsEscape, icsUtc } from '../lib/ics.js'

const base = {
  uid: 'evt-1@novr-events',
  stamp: new Date('2026-11-20T10:00:00Z'),
  startsAt: new Date('2026-11-27T08:00:00Z'),
  endsAt: new Date('2026-11-27T16:30:00Z'),
  summary: 'Summit, 2026; day one',
  description: 'Line one\nLine two',
  location: 'Eko Hotel, Lagos',
  url: 'https://novr.example.test/events/summit',
  cancelled: false,
}

describe('iCalendar export', () => {
  it('writes unambiguous UTC times', () => {
    expect(icsUtc(new Date('2026-11-27T08:00:00.000Z'))).toBe('20261127T080000Z')
    const text = buildCalendar(base)
    expect(text).toContain('DTSTART:20261127T080000Z')
    expect(text).toContain('DTEND:20261127T163000Z')
  })

  it('escapes commas, semicolons, backslashes and line breaks', () => {
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
    const text = buildCalendar(base)
    expect(text).toContain('SUMMARY:Summit\\, 2026\\; day one')
    expect(text).toContain('DESCRIPTION:Line one\\nLine two')
  })

  it('uses CRLF line endings and a well-formed envelope', () => {
    const text = buildCalendar(base)
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text).toContain('STATUS:CONFIRMED')
  })

  it('marks cancelled events as cancelled', () => {
    expect(buildCalendar({ ...base, cancelled: true })).toContain('STATUS:CANCELLED')
  })

  it('folds long lines without splitting a character', () => {
    const long = `SUMMARY:${'é'.repeat(80)}`
    for (const line of foldLine(long).split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    expect(foldLine(long).replace(/\r\n /g, '')).toBe(long)
  })
})
