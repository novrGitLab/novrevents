import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { EditorialPhoto } from '@/components/marketing/photo'
export const metadata = {
  title: 'About NovrEvents',
  description:
    'Explore the Cybernovr events platform for gatherings, conferences, independent hosts and their guests.',
  alternates: { canonical: '/about' },
}
export default function AboutPage() {
  return (
    <article className="spread guide-article">
      <header className="guide-lead">
        <div>
          <h1 className="spread-heading">
            Room for <em>company.</em>
          </h1>
          <p>
            NovrEvents is Cybernovr’s event platform. It brings the invitation, the programme and the ticket
            together for people meeting in person or online.
          </p>
          <Link href="/events" className="ink-link">
            Discover events <ArrowRight />
          </Link>
        </div>
        <EditorialPhoto
          name="culture"
          alt="Guests sharing a viewing space beneath a textile installation"
          sizes="(max-width:720px) 100vw, 50vw"
          priority
        />
      </header>
      <div className="guide-body">
        <section>
          <h2>For the people coming along</h2>
          <p>
            Search by interest, place or date. Open a listing to see who is hosting, when doors open and what
            registration includes. Save a gathering for later or keep the ticket ready for entry.
          </p>
          <Link className="ink-link" href="/help">
            Find ticket help <ArrowRight />
          </Link>
        </section>
        <section>
          <h2>For the people bringing it together</h2>
          <p>
            A public conference and a family celebration need different invitations. Organizers control event
            visibility, build registration questions, set capacities and give their team the information it
            needs on the day.
          </p>
          <Link className="ink-link" href="/hosting">
            Explore hosting <ArrowRight />
          </Link>
        </section>
        <section>
          <h2>A place for the security community</h2>
          <p>
            The cybersecurity directory brings training, talks and meetups into one view. Switch to
            cybersecurity in Discover to narrow the programme, then filter by format or location.
          </p>
          <Link className="ink-link" href="/events?mode=cybersecurity">
            Find cybersecurity events <ArrowRight />
          </Link>
        </section>
      </div>
    </article>
  )
}
