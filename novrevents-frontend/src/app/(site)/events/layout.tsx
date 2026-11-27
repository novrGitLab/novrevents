import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Explore events',
  description:
    'Search upcoming conferences, workshops, webinars, hackathons and meetups, or switch to cybersecurity events. Filter by category, type, format, price, location and date.',
  alternates: { canonical: '/events' },
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children
}
