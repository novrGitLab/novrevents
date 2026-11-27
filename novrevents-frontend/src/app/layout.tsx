import { connection } from 'next/server'
import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import { CookieNotice } from '@/components/layout/cookie-notice'
import './globals.css'
import './editorial.css'
import { siteUrl } from '@/lib/site'
import { Providers } from './providers'


const description =
  'Discover conferences, workshops, webinars and meetups across technology, business, education and more, with a dedicated cybersecurity experience. Organisers create events, build registration forms, issue QR tickets and check attendees in. NOVR Events by Cybernovr.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'NOVR Events — Discover and organise events', template: '%s · NOVR Events' },
  description,
  applicationName: 'NOVR Events',
  creator: 'Cybernovr',
  publisher: 'Cybernovr',
  openGraph: {
    siteName: 'NOVR Events',
    type: 'website',
    locale: 'en_GB',
    title: 'NOVR Events — Discover and organise events',
    description,
  },
  twitter: { card: 'summary', title: 'NOVR Events — Discover and organise events', description },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // One light theme: the browser chrome and form controls stay light whatever the OS prefers.
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="bg-card sr-only z-50 rounded-md border px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}<CookieNotice /></Providers>
      </body>
    </html>
  )
}
