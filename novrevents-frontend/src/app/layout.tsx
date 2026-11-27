import { connection } from 'next/server'
import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/dm-sans/wght.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import { CookieNotice } from '@/components/layout/cookie-notice'
import './globals.css'
import './editorial.css'
import './home.css'
import './workspace.css'
import { ScrollActivity } from '@/components/layout/scroll-activity'
import { siteUrl } from '@/lib/site'
import { Providers } from './providers'

const description =
  'Find live music, workshops, conferences and celebrations. Discover events, reserve tickets or host a gathering with NovrEvents by Cybernovr.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'NovrEvents — Discover and organise events', template: '%s · NovrEvents' },
  description,
  applicationName: 'NovrEvents',
  creator: 'Cybernovr',
  publisher: 'Cybernovr',
  openGraph: {
    siteName: 'NovrEvents',
    type: 'website',
    locale: 'en_GB',
    title: 'NovrEvents — Discover and organise events',
    description,
  },
  twitter: { card: 'summary', title: 'NovrEvents — Discover and organise events', description },
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
        <ScrollActivity />
        <Providers>
          {children}
          <CookieNotice />
        </Providers>
      </body>
    </html>
  )
}
