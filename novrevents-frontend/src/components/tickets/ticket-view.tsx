'use client'

import { Award, CalendarDays, Download, Globe, MapPin } from 'lucide-react'
import Link from 'next/link'
import { REGISTRATION_STATUS_VARIANT } from '@/components/events/labels'
import { Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Schema } from '@/lib/api/client'
import { formatDateTime } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

export type MyRegistration = Schema<'MyRegistration'>

const STATUS_TEXT = {
  PENDING: 'Awaiting review',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Not approved',
  CANCELLED: 'Cancelled',
} as const

/**
 * A registration with its ticket. `ticketBase` is the URL that serves this ticket's PDF and QR
 * image (the signed-in route or the guest private-link route).
 */
export function TicketView({
  registration,
  ticketBase,
  onCancel,
  cancelling,
}: {
  registration: MyRegistration
  ticketBase: string
  onCancel?: () => void
  cancelling?: boolean
}) {
  const { event, ticket } = registration
  const showTicket = registration.status === 'CONFIRMED' && ticket?.status === 'VALID'
  return (
    <article className="bg-card overflow-hidden rounded-lg border">
      <div className="grid md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            {event.bannerUrl && (
              <img
                src={event.bannerUrl}
                alt=""
                className="hidden aspect-[16/10] w-24 shrink-0 rounded-md border object-cover sm:block"
              />
            )}
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">NOVR Events ticket · {event.organizerName}</p>
              <h2 className="mt-0.5 text-lg leading-snug font-semibold tracking-[-0.01em]">
                <Link href={`/events/${event.slug}`} className="hover:underline">
                  {event.title}
                </Link>
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={REGISTRATION_STATUS_VARIANT[registration.status]}>
                  {STATUS_TEXT[registration.status]}
                </Badge>
                {registration.checkedInAt && <Badge variant="success">Checked in</Badge>}
                {event.status === 'CANCELLED' && <Badge variant="destructive">Event cancelled</Badge>}
              </div>
            </div>
          </div>

          <dl className="mt-5 grid gap-x-6 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Attendee</dt>
              <dd className="font-medium">{registration.attendeeName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Ticket type</dt>
              <dd className="font-medium">{registration.ticketType.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1 text-xs">
                <CalendarDays className="size-3" aria-hidden /> When
              </dt>
              <dd>{event.whenText}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1 text-xs">
                <MapPin className="size-3" aria-hidden /> Where
              </dt>
              <dd>{event.whereText}</dd>
            </div>
            {ticket && (
              <div>
                <dt className="text-muted-foreground text-xs">Ticket code</dt>
                <dd className="font-mono text-[13px] tracking-wide">{ticket.code}</dd>
              </div>
            )}
            {registration.checkedInAt && (
              <div>
                <dt className="text-muted-foreground text-xs">Checked in</dt>
                <dd>{formatDateTime(registration.checkedInAt, event.timezone)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 space-y-3 empty:hidden">
            {registration.status === 'PENDING' && (
              <Notice tone="info">
                {emailDeliveryEnabled
                  ? 'The organiser is reviewing your registration. Your ticket will be emailed if it is approved.'
                  : 'The organiser is reviewing your registration. Your ticket appears here if it is approved.'}
              </Notice>
            )}
            {registration.status === 'CANCELLED' && registration.cancellationReason && (
              <Notice tone="warning" title="Reason">
                {registration.cancellationReason}
              </Notice>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
            {event.onlineUrl && registration.status === 'CONFIRMED' && (
              <Button asChild variant="outline" size="sm">
                <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer">
                  <Globe /> Join online
                </a>
              </Button>
            )}
            {registration.certificateCode && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/certificates/${registration.certificateCode}`}>
                  <Award /> View certificate
                </Link>
              </Button>
            )}
            {registration.canCancel && onCancel && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={onCancel}
                loading={cancelling}
              >
                Cancel registration
              </Button>
            )}
          </div>
        </div>

        {showTicket && (
          <div className="bg-muted/40 relative flex flex-col items-center justify-center gap-3 border-t border-dashed p-5 md:border-t-0 md:border-l">
            {/* QR codes stay black on white in both themes so every scanner can read them. */}
            <img
              src={`${ticketBase}?format=svg`}
              alt={`QR code for ticket ${ticket?.code}`}
              className="size-44 rounded-md border bg-white p-2"
            />
            <p className="text-muted-foreground max-w-48 text-center text-xs">
              Show this code at the door. It works once.
            </p>
            <Button asChild variant="outline" size="sm">
              <a href={`${ticketBase}?format=pdf`} download>
                <Download /> Download PDF
              </a>
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}
