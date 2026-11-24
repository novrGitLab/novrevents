import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { siteUrl } from '@/lib/site'
import { Providers } from './providers'

// Self-hosted at build time by next/font: no request to Google from the visitor's browser.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

const description =
  'Discover cybersecurity conferences, workshops, CTF competitions and community meetups. Organisers create events, build registration forms, issue QR tickets and check attendees in. NOVR Events by Cybernovr.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'NOVR Events — Cybersecurity events', template: '%s · NOVR Events' },
  description,
  applicationName: 'NOVR Events',
  creator: 'Cybernovr',
  publisher: 'Cybernovr',
  openGraph: {
    siteName: 'NOVR Events',
    type: 'website',
    locale: 'en_GB',
    title: 'NOVR Events — Cybersecurity events',
    description,
  },
  twitter: { card: 'summary', title: 'NOVR Events — Cybersecurity events', description },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // One light theme: the browser chrome and form controls stay light whatever the OS prefers.
  colorScheme: 'light',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="bg-card sr-only z-50 rounded-md border px-4 py-2 font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
