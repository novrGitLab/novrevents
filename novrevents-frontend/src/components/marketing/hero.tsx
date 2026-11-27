import Link from 'next/link'
import { ArrowRight, Search } from '@/components/ui/icons'
import { EditorialPhoto } from './photo'

export function Hero() {
  return (
    <section className="event-poster" aria-labelledby="hero-title">
      <EditorialPhoto name="opening" alt="" priority />
      <div className="poster-copy spread">
        <h1 id="hero-title">Find your<br /><em>people.</em></h1>
        <p>Conferences, workshops and nights out.<br />Discover what’s happening near you.</p>
        <form action="/events" className="poster-search" role="search">
          <Search aria-hidden /><input aria-label="Search events by name or interest" name="q" type="search" maxLength={120} placeholder="Search events or interests" />
          <button type="submit" aria-label="Search events"><ArrowRight /></button>
        </form>
        <Link className="poster-link" href="/events">Browse all events <ArrowRight /></Link>
      </div>
    </section>
  )
}
