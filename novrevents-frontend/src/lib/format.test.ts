import { describe, expect, it } from 'vitest'
import { formatEventRange, fromLocalInput, toLocalInput } from './format'
import { safeNextPath } from './utils'

describe('event time formatting', () => {
  it('round-trips wall-clock input in the event timezone', () => {
    const iso = fromLocalInput('2026-11-30T09:00', 'Africa/Lagos')
    expect(iso).toBe('2026-11-30T08:00:00.000Z')
    expect(toLocalInput(iso, 'Africa/Lagos')).toBe('2026-11-30T09:00')
  })

  it('handles daylight-saving offsets', () => {
    expect(fromLocalInput('2026-07-01T09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z')
    expect(fromLocalInput('2026-12-01T09:00', 'Europe/London')).toBe('2026-12-01T09:00:00.000Z')
    expect(fromLocalInput('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z')
  })

  it('renders a single-day range in the event zone', () => {
    const text = formatEventRange('2026-11-30T08:00:00Z', '2026-11-30T16:00:00Z', 'Africa/Lagos')
    expect(text).toContain('09:00–17:00')
    expect(text).toMatch(/WAT|GMT\+1/)
  })
})

describe('redirect safety', () => {
  it('only allows same-site relative paths', () => {
    expect(safeNextPath('/dashboard/events')).toBe('/dashboard/events')
    expect(safeNextPath('https://evil.example')).toBe('/dashboard')
    expect(safeNextPath('//evil.example')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard')
    expect(safeNextPath(null)).toBe('/dashboard')
  })
})
