import Link from 'next/link'
import { Wordmark } from '@/components/brand'

type FooterLink = { href: string; label: string; external?: boolean }

const columns: { label: string; links: FooterLink[] }[] = [
  {
    label: 'Product',
    links: [
      { href: '/events', label: 'Discover events' },
      { href: '/hosting', label: 'For organisers' },
      { href: '/help', label: 'Ticket help' },
      { href: '/planning', label: 'Event planning' },
    ],
  },
  {
    label: 'Account',
    links: [
      { href: '/auth/login', label: 'Sign in' },
      { href: '/auth/register', label: 'Create an account' },
      { href: '/dashboard/events/new', label: 'Host an event' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    label: 'Company',
    links: [
      { href: '/about', label: 'About NovrEvents' },
      { href: '/legal/privacy-policy', label: 'Privacy policy' },
      { href: '/legal/terms-of-use', label: 'Terms of use' },
      { href: 'https://cybernovr.com', label: 'Cybernovr', external: true },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="public-footer">
      <div className="mx-auto max-w-[1280px] px-4 pt-14 pb-10 sm:px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div className="max-w-sm">
            <Wordmark />
            <p className="footer-intro">Live music, learning and celebrations. Find an event or bring people together for one of your own.</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.label} aria-label={column.label}>
                <p className="eyebrow">{column.label}</p>
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

        </div>
      </div>
    </footer>
  )
}
