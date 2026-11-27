import { Bookmark, Search } from '@/components/ui/icons'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SAMPLE_LISTINGS } from './sample'
import { Section, SectionIntro } from './section-intro'

/** The directory's real filters, in the order /explore shows them. */
const FILTERS = ['Category', 'Type', 'Format', 'Price', 'Location', 'Registration open', 'Date'] as const

const TYPES = ['Conference', 'Workshop', 'CTF', 'Meetup', 'Training', 'Hackathon', 'Webinar'] as const

export function Discover() {
  return (
    <Section id="discover" labelledBy="discover-title" className="border-b">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div>
          <SectionIntro id="discover-title" title="Find events worth your time.">
            <p>
              The directory lists public events from communities, companies, universities and training
              providers. Search by keyword, then narrow the list by category, type, format, price, location and
              date. Switch to Cybersecurity to see only security events.
            </p>
            <p>
              Save events to come back to, and follow organisers to see what they publish next. Each listing
              shows the date and time in the event’s own timezone.
            </p>
          </SectionIntro>
          <dl className="mt-8 border-t">
            <div className="flex flex-col gap-1 border-b py-4 sm:flex-row sm:gap-6">
              <dt className="w-28 shrink-0 text-[14px] font-medium">Event types</dt>
              <dd className="text-muted-foreground text-[14px]">{TYPES.join(', ')} and more.</dd>
            </div>
            <div className="flex flex-col gap-1 border-b py-4 sm:flex-row sm:gap-6">
              <dt className="w-28 shrink-0 text-[14px] font-medium">Formats</dt>
              <dd className="text-muted-foreground text-[14px]">In person, online and hybrid.</dd>
            </div>
          </dl>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/events">Browse the directory</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/events?mode=cybersecurity">Explore cybersecurity events</Link>
            </Button>
          </div>
        </div>

        <figure>
          <div aria-hidden className="bg-card overflow-hidden rounded-lg border select-none">
            <div className="border-b p-4">
              <div className="border-input text-muted-foreground flex h-9 items-center gap-2 rounded-md border px-3 text-[13px]">
                <Search className="text-subtle-foreground size-4" />
                Search events
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {FILTERS.map((filter) => (
                  <span
                    key={filter}
                    className={
                      filter === 'Type'
                        ? 'border-brand/40 bg-brand-soft text-brand-text rounded-md border px-2 py-1 text-[12px] font-medium'
                        : 'text-muted-foreground rounded-md border px-2 py-1 text-[12px]'
                    }
                  >
                    {filter === 'Type' ? 'Type: CTF, Workshop' : filter}
                  </span>
                ))}
              </div>
            </div>
            <ul className="divide-y">
              {SAMPLE_LISTINGS.map((listing) => (
                <li key={listing.title} className="flex items-center gap-4 p-4">
                  <div className="bg-brand-soft text-brand-text flex aspect-[4/3] w-20 shrink-0 items-end rounded-md p-2 text-[10px] font-medium sm:w-24">
                    {listing.type}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-text text-[12px] font-medium">{listing.when}</p>
                    <p className="truncate text-[14px] font-semibold">{listing.title}</p>
                    <p className="text-muted-foreground text-[12px]">
                      {listing.where} · {listing.price}
                    </p>
                  </div>
                  <Bookmark className="text-subtle-foreground size-4 shrink-0" />
                </li>
              ))}
            </ul>
          </div>
          <figcaption className="text-muted-foreground mt-4 text-[13px] leading-5">
            Illustration with sample listings. Events without cover artwork show a plain placeholder like
            these.
          </figcaption>
        </figure>
      </div>
    </Section>
  )
}
