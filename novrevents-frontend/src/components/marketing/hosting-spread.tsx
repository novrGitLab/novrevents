import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { EditorialPhoto } from './photo'

export function HostingSpread() {
  return (
    <section id="organisers" className="host-band">
      <div className="spread host-spread">
        <EditorialPhoto
          name="planning"
          alt="Two event organizers reviewing a venue floor plan"
          sizes="(max-width: 720px) 100vw, 55vw"
        />
        <div>
          <h2 className="spread-heading">
            Bring everyone <em>together.</em>
          </h2>
          <p>Set the date, open registration and give guests a ticket they can bring to the door.</p>
          <Link className="ink-link" href="/hosting">
            Explore hosting <ArrowRight />
          </Link>
          <Link className="ink-link" href="/planning">
            Request an event planner <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  )
}
