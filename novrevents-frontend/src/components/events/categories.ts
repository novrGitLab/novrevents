import type { components } from '@/lib/api/schema'

export type EventCategory = components['schemas']['EventCategory']

/** Discovery modes. "all" is the default; "cybersecurity" lists only cybersecurity categories. */
export type DiscoveryMode = 'all' | 'cybersecurity'

export const DISCOVERY_MODE_STORAGE_KEY = 'novr.discover.mode'

/** The URL value for cybersecurity mode, e.g. /explore?mode=cybersecurity. */
export const CYBERSECURITY_MODE = 'cybersecurity'

export function readStoredMode(): DiscoveryMode | null {
  try {
    const stored = window.localStorage.getItem(DISCOVERY_MODE_STORAGE_KEY)
    return stored === 'all' || stored === 'cybersecurity' ? stored : null
  } catch {
    return null
  }
}

export function storeMode(mode: DiscoveryMode) {
  try {
    window.localStorage.setItem(DISCOVERY_MODE_STORAGE_KEY, mode)
  } catch {
    // Storage can be unavailable (private windows, blocked site data); the URL still carries the mode.
  }
}

export function splitCategories(categories: readonly EventCategory[] | undefined) {
  const items = categories ?? []
  return {
    cybersecurity: items.filter((category) => category.group === 'cybersecurity'),
    general: items.filter((category) => category.group === 'general'),
  }
}
