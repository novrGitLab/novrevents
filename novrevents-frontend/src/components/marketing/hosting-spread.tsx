import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { EditorialPhoto } from './photo'

export function HostingSpread() {
  return (
    <section id="organisers" className="host-band">
      <div className="spread hosting-feature">
        <div className="hosting-copy">
          <h2 className="spread-heading">
            On the other
            <br />
            side of <em>the door.</em>
          </h2>
          <p>
            Hosting a listening party, a summit or a family celebration? Open registration, design the flyer
            and welcome guests with a scan at the door.
          </p>
          <Link className="host-primary" href="/hosting">
            Explore hosting <ArrowRight />
          </Link>
          <Link className="host-secondary" href="/planning">
            Find an event planner <ArrowRight />
          </Link>
        </div>
        <figure className="hosting-photo">
          <EditorialPhoto
            name="anniversary"
            alt="A couple sharing a quiet moment at their wedding anniversary lunch"
            sizes="(max-width: 720px) 92vw, 48vw"
          />
        </figure>
      </div>
    </section>
  )
}
