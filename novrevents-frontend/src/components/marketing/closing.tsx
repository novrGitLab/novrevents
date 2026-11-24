import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Closing() {
  return (
    <section aria-labelledby="closing-title">
      <div className="mx-auto max-w-[1200px] px-4 pt-20 pb-4 sm:px-6 lg:px-8 lg:pt-24 lg:pb-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[40rem]">
            <h2 id="closing-title" className="marketing-heading text-balance">
              List your next security event.
            </h2>
            <p className="text-muted-foreground mt-4 text-[16px] leading-7">
              Create an account, set up your event as a draft and publish it when the details are ready.
              Attendees can browse and register without an account.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
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
