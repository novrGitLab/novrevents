import { describe, expect, it } from 'vitest'
import { groupByDay } from './discovery'
import type { Schema } from './api/client'

type EventSummary = Schema<'EventSummary'>

const event = (id: string, startsAt: string, timezone = 'Africa/Lagos') =>
  ({ id, startsAt, endsAt: startsAt, timezone }) as unknown as EventSummary

describe('groupByDay', () => {
  const now = Date.parse('2026-11-20T10:00:00Z')

  it('gathers events that have already started under "now" at the top', () => {
    const groups = groupByDay(
      [event('live', '2026-11-20T08:00:00Z'), event('soon', '2026-11-21T08:00:00Z')],
      now,
    )
    expect(groups.map((group) => group.key)).toEqual(['now', '2026-11-21'])
    expect(groups[0]?.events.map((item) => item.id)).toEqual(['live'])
  })

  it('groups events that start on the same day, in their own timezone', () => {
    // 23:30 UTC on 21 Nov is already 22 Nov in Lagos (UTC+1) but still 21 Nov in New York.
    const late = '2026-11-21T23:30:00Z'
    const lagos = groupByDay([event('a', late, 'Africa/Lagos'), event('b', late, 'Africa/Lagos')], now)
    expect(lagos).toHaveLength(1)
    expect(lagos[0]?.key).toBe('2026-11-22')
    expect(lagos[0]?.events).toHaveLength(2)

    const newYork = groupByDay([event('c', late, 'America/New_York')], now)
    expect(newYork[0]?.key).toBe('2026-11-21')
  })

  it('keeps the input order and starts a new group when the day changes', () => {
    const groups = groupByDay(
      [
        event('d1', '2026-11-21T08:00:00Z'),
        event('d1b', '2026-11-21T15:00:00Z'),
        event('d2', '2026-11-22T08:00:00Z'),
      ],
      now,
    )
    expect(groups.map((group) => group.events.map((item) => item.id))).toEqual([['d1', 'd1b'], ['d2']])
  })

  it('returns no groups for no events', () => {
    expect(groupByDay([], now)).toEqual([])
  })
})
