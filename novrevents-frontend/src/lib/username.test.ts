import { describe, expect, it } from 'vitest'
import { suggestUsername } from './username'

describe('suggestUsername', () => {
  it('turns a name into a lowercase, hyphenated username', () => {
    expect(suggestUsername('Tunde Bakare')).toBe('tunde-bakare')
  })

  it('removes accents and punctuation', () => {
    expect(suggestUsername('Adébáyọ̀ O’Neil-Smith')).toBe('adebayo-o-neil-smith')
  })

  it('returns nothing when no valid username can be made', () => {
    expect(suggestUsername('X')).toBe('')
    expect(suggestUsername('!!')).toBe('')
  })

  it('keeps suggestions within the 30-character limit and never ends with a hyphen', () => {
    const long = suggestUsername('Adaeze Chinyere Nwachukwu-Okonkwo Ibekwe Umeh Eze')
    expect(long.length).toBeLessThanOrEqual(30)
    expect(long.endsWith('-')).toBe(false)
  })
})
