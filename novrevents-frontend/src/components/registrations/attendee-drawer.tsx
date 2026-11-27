'use client'

import { useQuery } from '@tanstack/react-query'
import { Check, X } from '@/components/ui/icons'
import * as React from 'react'
import { LoadingState, ErrorState } from '@/components/states'
import { REGISTRATION_STATUS_VARIANT } from '@/components/events/labels'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatDateTime } from '@/lib/format'

export type AttendeeAction = 'approve' | 'decline' | 'cancel'

interface Props {
  eventId: string
  timezone: string
  /** The registration form whose answers are shown to organisers. */
  registrationFormId: string | null
  /** The registration to show, or null when the drawer is closed. */
  registrationId: string | null
  /** Organisers (manage level) see the answers; check-in staff see only the attendee record. */
  manage: boolean
  onClose: () => void
  onAction: (action: AttendeeAction, registration: { id: string; name: string }) => void
  busy: boolean
}

/**
 * Attendee detail, opened from the registrations table. Reads the real registration record. Answers come
 * from the form's own submission endpoint, which the API restricts to managers, so the drawer never shows
 * answers to check-in staff. Exclusion rules are never rendered here.
 */
export function AttendeeDrawer({
  eventId,
  timezone,
  registrationFormId,
  registrationId,
  manage,
  onClose,
  onAction,
  busy,
}: Props) {
  const open = registrationId !== null
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="right" className="w-full gap-5 sm:w-[28rem]">
        {registrationId && (
          <DrawerBody
            eventId={eventId}
            timezone={timezone}
            registrationFormId={registrationFormId}
            registrationId={registrationId}
            manage={manage}
            onAction={onAction}
            busy={busy}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DrawerBody({
  eventId,
  timezone,
  registrationFormId,
  registrationId,
  manage,
  onAction,
  busy,
}: Omit<Props, 'onClose' | 'registrationId'> & { registrationId: string }) {
  const detail = useQuery({
    queryKey: keys.eventPart(eventId, 'registration', { registrationId }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/events/{id}/registrations/{registrationId}', {
          params: { path: { id: eventId, registrationId } },
        }),
      ),
  })

  if (detail.isPending) {
    return (
      <>
        <DialogTitle className="sr-only">Attendee</DialogTitle>
        <LoadingState rows={4} />
      </>
    )
  }
  if (detail.isError) {
    return (
      <>
        <DialogTitle className="sr-only">Attendee</DialogTitle>
        <ErrorState error={detail.error} retry={() => void detail.refetch()} />
      </>
    )
  }

  const registration = detail.data
  const canDecide = manage && registration.status === 'PENDING'
  const canCancel =
    manage &&
    (registration.status === 'PENDING' || registration.status === 'CONFIRMED') &&
    !registration.checkedInAt

  return (
    <>
      <DialogHeader>
        <DialogTitle>{registration.attendeeName}</DialogTitle>
        <DialogDescription>
          {registration.attendeeEmail}
          {registration.isGuest ? ' · guest' : ''}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant={REGISTRATION_STATUS_VARIANT[registration.status]}>
          {enumLabel(registration.status)}
        </Badge>
        {registration.checkedInAt ? (
          <Badge variant="success" title={formatDateTime(registration.checkedInAt, timezone)}>
            Checked in
          </Badge>
        ) : (
          <Badge variant="secondary">Not checked in</Badge>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Ticket type</dt>
        <dd>{registration.ticketType.name}</dd>
        <dt className="text-muted-foreground">Ticket code</dt>
        <dd className="font-mono text-xs break-all">{registration.ticket?.code ?? 'Not issued'}</dd>
        <dt className="text-muted-foreground">Registered</dt>
        <dd>{formatDateTime(registration.createdAt, timezone)}</dd>
        {registration.checkedInAt && (
          <>
            <dt className="text-muted-foreground">Checked in at</dt>
            <dd>{formatDateTime(registration.checkedInAt, timezone)}</dd>
          </>
        )}
        {registration.cancelledAt && (
          <>
            <dt className="text-muted-foreground">Cancelled</dt>
            <dd>
              {formatDateTime(registration.cancelledAt, timezone)}
              {registration.cancellationReason ? ` · ${registration.cancellationReason}` : ''}
            </dd>
          </>
        )}
      </dl>

      {manage && registration.submissionId && registrationFormId && (
        <AnswersSection formId={registrationFormId} submissionId={registration.submissionId} />
      )}

      {(canDecide || canCancel) && (
        <div className="mt-auto flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          {canDecide && (
            <>
              <Button
                onClick={() => onAction('approve', { id: registration.id, name: registration.attendeeName })}
                disabled={busy}
              >
                <Check /> Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => onAction('decline', { id: registration.id, name: registration.attendeeName })}
                disabled={busy}
              >
                <X /> Decline
              </Button>
            </>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => onAction('cancel', { id: registration.id, name: registration.attendeeName })}
              disabled={busy}
            >
              Cancel registration
            </Button>
          )}
        </div>
      )}
    </>
  )
}

/** Answers to the registration form. Only managers reach this; the API refuses everyone else. */
function AnswersSection({ formId, submissionId }: { formId: string; submissionId: string }) {
  const submission = useQuery({
    queryKey: keys.formPart(formId, 'submission', { submissionId }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/forms/{id}/submissions/{submissionId}', {
          params: { path: { id: formId, submissionId } },
        }),
      ),
  })
  const form = useQuery({
    queryKey: keys.form(formId),
    queryFn: () => unwrap(api.GET('/api/v1/forms/{id}', { params: { path: { id: formId } } })),
  })

  if (submission.isPending || form.isPending) return <LoadingState rows={2} />
  if (submission.isError)
    return <ErrorState error={submission.error} retry={() => void submission.refetch()} />
  if (form.isError) return <ErrorState error={form.error} retry={() => void form.refetch()} />

  const labels = new Map(form.data.definition.fields.map((field) => [field.key, field.label]))
  return (
    <section aria-labelledby="attendee-answers" className="space-y-2">
      <h3 id="attendee-answers" className="text-sm font-semibold">
        Answers
      </h3>
      {submission.data.answers.length === 0 ? (
        <p className="text-muted-foreground text-sm">No answers were recorded.</p>
      ) : (
        <dl className="space-y-2">
          {submission.data.answers.map((answer) => (
            <div key={answer.fieldKey} className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs font-medium">
                {labels.get(answer.fieldKey) ?? answer.fieldKey}
              </dt>
              <dd className="mt-1 text-sm break-words whitespace-pre-line">{answerText(answer)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function answerText(answer: {
  text: string | null
  number: number | null
  selected: string[] | null
  files: Array<{ name: string }> | null
}) {
  if (answer.files && answer.files.length > 0) return answer.files.map((file) => file.name).join('\n')
  if (answer.selected && answer.selected.length > 0) return answer.selected.join(', ')
  if (answer.number !== null) return String(answer.number)
  return answer.text && answer.text.length > 0 ? answer.text : '—'
}
