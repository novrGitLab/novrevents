import Link from 'next/link'
import { EditorialPhoto } from '@/components/marketing/photo'
import { ArrowRight } from '@/components/ui/icons'

export const metadata = {
  title: 'Host an event',
  description:
    'Create an event page, collect registrations, coordinate your team and check guests in with NovrEvents.',
  alternates: { canonical: '/hosting' },
}
export default function HostingPage() {
  return (
    <article className="spread guide-article">
      <header className="guide-lead">
        <div>
          <h1 className="spread-heading">
            Open the <em>doors.</em>
          </h1>
          <p>
            Bring a community together for an afternoon or build a programme across several days. Start with
            an event page and decide how guests get in.
          </p>
          <Link className="ink-link" href="/dashboard/events/new">
            Create an event <ArrowRight />
          </Link>
        </div>
        <EditorialPhoto
          name="planning"
          alt="An event production team planning the layout of a gallery"
          priority
          sizes="(max-width: 720px) 100vw, 55vw"
        />
      </header>
      <div className="guide-body">
        <section>
          <h2>Build the invitation</h2>
          <p>
            Choose a title, add a cover image and set the date, time zone and venue. Publish a public event
            for discovery, share an unlisted link, or limit access to an invited group.
          </p>
        </section>
        <section>
          <h2>Decide who gets a place</h2>
          <p>
            Set capacity and ticket types. Collect the details your team needs, from workshop choices to
            dietary requirements. Use approval when guests need confirmation before receiving a ticket.
          </p>
        </section>
        <section>
          <h2>Run the room</h2>
          <p>
            Give the door team check-in access. Scan QR tickets or look up guests on the registration list.
            Keep the programme, speakers and team tasks together as the day unfolds.
          </p>
        </section>
        <section>
          <h2>Bring in a planner</h2>
          <p>
            Share your venue, date and expected guest count with the planning team. Include the parts of the
            event you want help organizing.
          </p>
          <Link className="ink-link" href="/planning">
            Send a planning brief <ArrowRight />
          </Link>
        </section>
      </div>
    </article>
  )
}
