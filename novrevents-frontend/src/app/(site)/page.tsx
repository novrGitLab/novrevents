import type { Metadata } from 'next'
import { CollectionIndex } from '@/components/marketing/collection-index'
import { Hero } from '@/components/marketing/hero'
import { HostingSpread } from '@/components/marketing/hosting-spread'
import { Upcoming } from '@/components/marketing/upcoming'

export const metadata: Metadata = {
  title: { absolute: 'NovrEvents | Discover events, workshops and conferences' },
  description: 'Find conferences, workshops and cultural events. Explore the programme, reserve a place or bring your own gathering to life with NovrEvents.',
  alternates: { canonical: '/' },
  openGraph: { images: ['/photography/opening-1440.webp'] },
}

export default function HomePage() {
  return <><Hero /><Upcoming /><CollectionIndex /><HostingSpread /></>
}
