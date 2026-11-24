import type { Metadata } from 'next'
import { Closing } from '@/components/marketing/closing'
import { Discover } from '@/components/marketing/discover'
import { Hero } from '@/components/marketing/hero'
import { Organisers } from '@/components/marketing/organisers'
import { Trust } from '@/components/marketing/trust'

export const metadata: Metadata = {
  title: { absolute: 'NOVR Events — Discover and manage cybersecurity events' },
  description:
    'The event platform for the security community. Find cybersecurity conferences, workshops, CTF competitions and meetups, and run registration, QR tickets and check-in for your own events. By Cybernovr.',
  alternates: { canonical: '/' },
}

/**
 * The marketing homepage. Event discovery lives at /explore; this page explains the product.
 * Every illustration uses the product's real labels and is captioned as sample content.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <div id="product">
        <Discover />
        <Organisers />
      </div>
      <Trust />
      <Closing />
    </>
  )
}
