import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { ManagedEvent } from './event-context'

export function EventSetup({ event }: { event: ManagedEvent }) {
  const base = '/dashboard/events/' + event.id
  const issues = event.publicationIssues
  return (
    <section
      aria-labelledby="event-setup-title"
      className="bg-brand-soft/60 border-brand-soft space-y-4 rounded-lg border p-5"
    >
      <h2 id="event-setup-title" className="text-headline-sm">
        {issues.length ? 'Before you publish' : 'Listing details complete'}
      </h2>
      {issues.length > 0 && (
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {issues.map((issue) => (
            <li key={issue.path}>
              <Link
                className="text-brand-text font-medium underline underline-offset-4"
                href={base + '/edit#' + issue.path}
              >
                {issue.message}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {!event.registration.formSlug && (
          <Button asChild size="sm" variant="outline">
            <Link
              href={
                event.registrationFormId ? '/dashboard/forms/' + event.registrationFormId : base + '/forms'
              }
            >
              {event.registrationFormId ? 'Finish the registration form' : 'Create a registration form'}
            </Link>
          </Button>
        )}
        {!event.bannerUrl && (
          <Button asChild size="sm" variant="ghost">
            <Link href={base + '/edit#event-artwork'}>Add optional cover artwork</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
