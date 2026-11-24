import { randomBytes } from 'node:crypto'

const SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/** URL-safe slug: ASCII letters, digits and hyphens. Falls back to "item" for empty input. */
export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '')
  return slug || 'item'
}

export function randomSuffix(length = 5): string {
  return Array.from(
    randomBytes(length),
    (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length],
  ).join('')
}

/** `<slug>-<random>`: readable, and unique without a lookup in practice. */
export function slugWithSuffix(input: string, maxLength = 60): string {
  return `${slugify(input, maxLength)}-${randomSuffix()}`
}
