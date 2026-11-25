import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Closing() {
  return (
    <section aria-labelledby="closing-title">
      <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
        <div className="bg-brand-soft/60 border-brand-soft rounded-xl border px-6 py-12 text-center sm:px-10 lg:py-16">
          <h2 id="closing-title" className="marketing-heading mx-auto max-w-[24ch] text-balance">
            List your next event.
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-[52ch] text-base leading-7">
            Create an account, set up your event as a draft and publish it when the details are ready. Attendees
            can browse and register without an account.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard/events/new">Host an event</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/explore">Discover events</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
