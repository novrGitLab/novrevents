/**
 * Category groups. An event has one category; a category belongs to one discovery group.
 * Cybersecurity mode in discovery lists events whose category is in the cybersecurity group, so
 * classification always comes from the organiser's chosen category, never from title or text.
 *
 * The cybersecurity group is the reference set seeded with the platform (init migration). Any
 * other category, including ones added by administrators, is general. A durable per-row group
 * column would let administrators manage this themselves; see UI_REDESIGN_PROGRESS.md.
 */
export const CATEGORY_GROUPS = ['cybersecurity', 'general'] as const
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]

export const CYBERSECURITY_CATEGORY_SLUGS: readonly string[] = [
  'general-cybersecurity',
  'application-security',
  'cloud-security',
  'network-security',
  'offensive-security',
  'defensive-security',
  'incident-response',
  'threat-intelligence',
  'malware-analysis',
  'identity-access',
  'cryptography',
  'ot-iot-security',
  'governance-risk-compliance',
  'privacy-data-protection',
  'awareness-education',
  'careers-community',
]

const cyberSlugs = new Set(CYBERSECURITY_CATEGORY_SLUGS)

export function categoryGroup(slug: string): CategoryGroup {
  return cyberSlugs.has(slug) ? 'cybersecurity' : 'general'
}
