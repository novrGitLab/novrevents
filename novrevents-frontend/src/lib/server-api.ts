// Server-side only: imported by server components, metadata routes and the sitemap.
import type { Schema } from './api/client'

/** Origin of the API for server-side requests (metadata, sitemap). Never exposed to the browser. */
export const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')

export type PublicEvent = Schema<'EventDetail'>

/** Public event detail as an anonymous visitor sees it, or null. Cached for five minutes. */
export async function fetchPublicEvent(slug: string): Promise<PublicEvent | null> {
  try {
    const response = await fetch(`${apiUrl}/api/v1/public/events/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    })
    return response.ok ? ((await response.json()) as PublicEvent) : null
  } catch {
    return null
  }
}
