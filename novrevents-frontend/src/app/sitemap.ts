import type { MetadataRoute } from 'next'
import { apiUrl } from '@/lib/server-api'
import { siteUrl } from '@/lib/site'

export const revalidate = 3600

type Listing = {
  items: { slug: string; startsAt: string; organizer: { organization: { slug: string } | null } }[]
  totalPages: number
}

/** Public events only: the public list returns published, public, non-removed events. */
async function publicEvents(): Promise<Listing['items']> {
  const items: Listing['items'] = []
  try {
    for (let page = 1; page <= 20; page += 1) {
      const response = await fetch(
        `${apiUrl}/api/v1/public/events?timeframe=all&sort=newest&pageSize=100&page=${page}`,
        { next: { revalidate } },
      )
      if (!response.ok) break
      const data = (await response.json()) as Listing
      items.push(...data.items)
      if (page >= data.totalPages) break
    }
  } catch {
    // The API is unreachable during the build: publish the static pages only.
  }
  return items
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await publicEvents()
  const organizations = [
    ...new Set(events.map((event) => event.organizer.organization?.slug).filter(Boolean)),
  ] as string[]
  return [
    { url: `${siteUrl}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/explore`, changeFrequency: 'daily', priority: 0.9 },
    ...events.map((event) => ({
      url: `${siteUrl}/events/${event.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
    ...organizations.map((slug) => ({ url: `${siteUrl}/o/${slug}`, changeFrequency: 'weekly' as const })),
    { url: `${siteUrl}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
