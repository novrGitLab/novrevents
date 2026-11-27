import { ArrowLeft } from '@/components/ui/icons'
import Link from 'next/link'
import { Wordmark } from '@/components/brand'
import { EditorialPhoto } from '@/components/marketing/photo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-spread">
      <header>
        <Wordmark />
        <Link className="ink-link" href="/events">
          <ArrowLeft aria-hidden /> Browse events
        </Link>
      </header>
      <main id="main">
        <div className="auth-form">{children}</div>
        <figure className="auth-picture">
          <EditorialPhoto
            name="community"
            alt="Friends catching up at a long table over lunch"
            priority
            sizes="(min-width: 900px) 50vw, 0px"
          />
          <figcaption>
            Your events,
            <br />
            <em>tickets and invitations.</em>
          </figcaption>
        </figure>
      </main>
      <footer>
        <Link href="/legal/privacy-policy">Privacy policy</Link>
        <Link href="/legal/terms-of-use">Terms of use</Link>
      </footer>
    </div>
  )
}
