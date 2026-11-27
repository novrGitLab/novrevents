import Link from 'next/link'
import { ArrowLeft } from '@/components/ui/icons'
import { Wordmark } from '@/components/brand'
import { TicketMascot } from '@/components/marketing/ticket-mascot'
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="entry-shell">
      <header>
        <Wordmark />
        <Link href="/events" className="ink-link">
          <ArrowLeft />
          Browse events
        </Link>
      </header>
      <main id="main" className="entry-spread">
        <section className="entry-content">
          <TicketMascot small className="entry-pocket" />
          {children}
        </section>
        <aside className="entry-poster" aria-label="NovrEvents admission ticket">
          <div className="entry-perforations" aria-hidden="true" />
          <div className="entry-stamp">
            <span>NovrEvents</span>
            <strong>
              Admit <em>one.</em>
            </strong>
          </div>
          <TicketMascot />
          <div className="entry-stub" aria-hidden="true">
            <span>General admission</span>
            <i />
          </div>
        </aside>
      </main>
      <footer>
        <Link href="/legal/privacy-policy">Privacy policy</Link>
        <Link href="/legal/terms-of-use">Terms of use</Link>
      </footer>
    </div>
  )
}
