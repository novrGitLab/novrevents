import Link from 'next/link'
import { CybernovrLogo } from '@/components/brand'

type FooterLink = { href: string; label: string; external?: boolean }

const columns: { label: string; links: FooterLink[] }[] = [
  {
    label: 'Product',
    links: [
      { href: '/explore', label: 'Discover events' },
      { href: '/#organisers', label: 'For organisers' },
      { href: '/#trust', label: 'Privacy and security' },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/login', label: 'Sign in' },
      { href: '/register', label: 'Create an account' },
      { href: '/dashboard/events/new', label: 'Host an event' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'Company',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of use' },
      { href: 'https://cybernovr.com', label: 'Cybernovr', external: true },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="bg-card mt-16 border-t">
      <div className="mx-auto max-w-[1200px] px-4 pt-14 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-block rounded-sm" aria-label="NOVR Events home">
              <span className="text-[18px] font-semibold tracking-[-0.01em]">
                NOVR <span className="font-normal">Events</span>
              </span>
            </Link>
            <p className="text-muted-foreground mt-3 text-[14px] leading-6">
              The cybersecurity event platform. Discover conferences, workshops, CTF competitions and meetups,
              or host your own with registration forms, QR tickets and check-in.
            </p>
            <a
              href="https://cybernovr.com"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-2 rounded-sm text-[13px] transition-colors"
            >
              A product of <CybernovrLogo height={12} />
              <span className="sr-only">(opens cybernovr.com in a new tab)</span>
            </a>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.label} aria-label={column.label}>
                <p className="text-[13px] font-semibold">{column.label}</p>
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground text-[14px] transition-colors"
                        >
                          {link.label}
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-muted-foreground hover:text-foreground text-[14px] transition-colors"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="text-subtle-foreground mt-12 flex flex-col gap-2 border-t pt-6 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Cybernovr. All rights reserved.</p>
          <p>NOVR Events is built and operated by Cybernovr.</p>
        </div>
      </div>
    </footer>
  )
}
