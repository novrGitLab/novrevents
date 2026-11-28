'use client'

import { ArrowRight, ClipboardList, QrCode, Users } from '@/components/ui/icons'
import Link from 'next/link'
import { CopyField, StatCard } from '@/components/common'
import { canManage, useManagedEvent } from '@/components/events/event-context'
import { EventSetup } from '@/components/events/event-setup'
import { CLOSED_REASON_TEXT } from '@/components/events/labels'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function Panel({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('bg-card rounded-lg border shadow-xs', className)}>
      <h2 className="text-headline-sm border-b px-5 py-4">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default function EventOverviewPage() {
  const { event } = useManagedEvent()
  const manage = canManage(event)
  const base = `/dashboard/events/${event.id}`
  const capacityShare = event.capacity ? Math.min(1, event.counts.confirmed / event.capacity) : null

  return (
    <div className="space-y-6">
      {event.moderationStatus === 'REMOVED' && (
        <Notice tone="error" title="Removed by NOVR Events moderators">
          {event.moderationNote ?? 'This event is hidden from the public and cannot be republished.'}
        </Notice>
      )}

      {event.status === 'DRAFT' && manage && <EventSetup event={event} />}

      <section aria-label="Event summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Confirmed"
          value={formatNumber(event.counts.confirmed)}
          hint={event.capacity ? `of ${formatNumber(event.capacity)} places` : 'No capacity limit'}
        />
        <StatCard
          label="Awaiting review"
          value={formatNumber(event.counts.pending)}
          hint="Pending approval"
        />
        <StatCard
          label="Checked in"
          value={formatNumber(event.counts.checkedIn)}
          hint={
            event.counts.confirmed > 0
              ? `${Math.round((event.counts.checkedIn / event.counts.confirmed) * 100)}% of confirmed`
              : 'No confirmed attendees yet'
          }
        />
        <StatCard
          label="Forms"
          value={formatNumber(event.counts.forms)}
          hint="Registration and other forms"
        />
      </section>

      <section aria-label="Quick actions" className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`${base}/registrations`}>
            <ClipboardList />
            {event.counts.pending > 0
              ? `Review ${formatNumber(event.counts.pending)} registration${event.counts.pending === 1 ? '' : 's'}`
              : 'Registrations'}
          </Link>
        </Button>
        {manage && (
          <Button asChild variant="outline">
            <Link href={`${base}/forms`}>Edit registration form</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`${base}/scanner`}>
            <QrCode /> Open check-in scanner
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`${base}/team`}>
            <Users /> Team
          </Link>
        </Button>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Registration">
          <div className="space-y-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden
                  className={cn('size-2 rounded-full', event.registration.open ? 'bg-success' : 'bg-warning')}
                />
                {event.registration.open ? 'Open' : 'Closed'}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[13px]">
                {event.registration.open
                  ? [
                      event.registration.spotsLeft !== null
                        ? `${event.registration.spotsLeft} places left`
                        : 'No capacity limit',
                      event.registration.requiresApproval ? 'registrations wait for your approval' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : event.registration.reason === 'NOT_PUBLISHED'
                    ? 'Publish the event to open registration.'
                    : event.registration.reason === 'NO_FORM'
                      ? 'Create and publish a registration form.'
                      : CLOSED_REASON_TEXT[event.registration.reason]}
              </p>
              {capacityShare !== null && (
                <div className="bg-muted mt-3 h-1.5 rounded-full" aria-hidden>
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${Math.max(1, capacityShare * 100)}%` }}
                  />
                </div>
              )}
            </div>
            <ul className="divide-y border-t text-sm">
              {[
                { href: `${base}/registrations`, label: 'Review registrations' },
                { href: `${base}/scanner`, label: 'Open the check-in scanner' },
                { href: `${base}/tasks`, label: 'Preparation checklist' },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-primary flex items-center justify-between py-2.5 font-medium"
                  >
                    {link.label}
                    <ArrowRight className="text-subtle-foreground size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title="Share">
          <p className="text-muted-foreground mb-3 text-[13px]">
            {event.visibility === 'PRIVATE'
              ? 'Private: only people with the private link can open this event.'
              : event.visibility === 'UNLISTED'
                ? 'Unlisted: not in the directory, but anyone with the link can view it.'
                : 'Public: listed in the NOVR Events directory.'}
          </p>
          <div className="space-y-3">
            <CopyField label="Event link" value={event.publicUrl} />
            {event.visibility === 'PRIVATE' && event.privateLink && (
              <CopyField label="Private link" value={event.privateLink} />
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
