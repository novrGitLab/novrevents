import type { Metadata } from 'next'
import { apiUrl } from '@/lib/server-api'

/** Organisation pages are public; the title and description come from the organisation itself. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  try {
    const response = await fetch(`${apiUrl}/api/v1/public/organizations/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    })
    if (!response.ok) return { title: 'Organizer', robots: { index: false, follow: false } }
    const org = (await response.json()) as { name: string; description?: string | null }
    const description = org.description?.slice(0, 200) || `Cybersecurity events organised by ${org.name}.`
    return {
      title: org.name,
      description,
      alternates: { canonical: `/o/${slug}` },
      openGraph: { title: org.name, description, url: `/o/${slug}` },
    }
  } catch {
    return { title: 'Organizer' }
  }
}

export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return children
}
