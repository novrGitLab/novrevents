import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Explore cybersecurity events',
  description:
    'Search upcoming cybersecurity conferences, workshops, CTF competitions, trainings and meetups. Filter by topic, type, format, price, location and date.',
  alternates: { canonical: '/explore' },
}

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return children
}
