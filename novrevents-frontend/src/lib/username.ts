/**
 * Suggests a username from a display name, e.g. "Tunde Bakare" → "tunde-bakare". The result is only a starting
 * point: the person can edit it, and the server still enforces the rules and uniqueness. Returns '' when no
 * valid suggestion can be made.
 */
export function suggestUsername(displayName: string): string {
  const cleaned = displayName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '')
  return cleaned.length >= 3 ? cleaned : ''
}
