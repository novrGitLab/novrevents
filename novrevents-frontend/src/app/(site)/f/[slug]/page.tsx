'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, CheckCircle2, Lock, MapPin } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import * as React from 'react'
import { FormRenderer, type RendererSubmit } from '@/components/forms/form-renderer'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { api, unwrap, upload, type Schema } from '@/lib/api/client'
import { errorMessage, isApiError } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import type { FieldError, FormDefinition } from '@/lib/form-engine'
import { formatEventRange } from '@/lib/format'
import { uuid } from '@/lib/utils'
import { emailDeliveryEnabled } from '@/lib/site'

type Result = Schema<'SubmissionResult'>

const CLOSED_TEXT: Record<string, string> = {
  NOT_PUBLISHED: 'This form is not accepting responses right now.',
  NO_FORM: 'This form is not accepting responses right now.',
  CLOSED: 'This form is no longer accepting responses.',
  FORM_CLOSED: 'This form is no longer accepting responses.',
  FULL: 'This form has reached its response limit.',
  EVENT_FULL: 'This event is full.',
  EVENT_CANCELLED: 'This event has been cancelled.',
  EVENT_ENDED: 'This event has ended.',
  DEADLINE_PASSED: 'The registration deadline has passed.',
}

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>()
  // One key per page load: a retried or double-clicked submission returns the original result.
  const [idempotencyKey] = React.useState(uuid)
  const [result, setResult] = React.useState<Result | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [serverErrors, setServerErrors] = React.useState<FieldError[]>([])
  const startedRef = React.useRef(false)

  const query = useQuery({
    queryKey: keys.publicForm(slug),
    queryFn: () => unwrap(api.GET('/api/v1/public/forms/{slug}', { params: { path: { slug } } })),
  })
  const form = query.data

  React.useEffect(() => {
    if (form?.open) {
      void api.POST('/api/v1/public/forms/{slug}/events', {
        params: { path: { slug } },
        body: { type: 'view', sessionKey: idempotencyKey },
      })
    }
  }, [form?.open, slug, idempotencyKey])

  const markStarted = () => {
    if (startedRef.current || !form?.open) return
    startedRef.current = true
    void api.POST('/api/v1/public/forms/{slug}/events', {
      params: { path: { slug } },
      body: { type: 'start', sessionKey: idempotencyKey },
    })
  }

  const submit = async (payload: RendererSubmit) => {
    if (!form) return
    setSubmitting(true)
    setFormError(null)
    setServerErrors([])
    const body = {
      answers: payload.answers,
      idempotencyKey,
      versionId: form.versionId ?? undefined,
      ticketTypeId: payload.ticketTypeId,
    }
    try {
      let response: Result
      if (payload.files.length > 0) {
        const data = new FormData()
        data.append('payload', JSON.stringify(body))
        for (const item of payload.files) data.append(`file:${item.fieldKey}`, item.file, item.file.name)
        response = await upload<Result>(
          `/api/v1/public/forms/${encodeURIComponent(slug)}/submissions/upload`,
          data,
        )
      } else {
        response = await unwrap(
          api.POST('/api/v1/public/forms/{slug}/submissions', { params: { path: { slug } }, body }),
        )
      }
      setResult(response)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
        setServerErrors(
          error.details
            .filter((detail) => detail.path.startsWith('answers.'))
            .map((detail) => ({ fieldKey: detail.path.slice('answers.'.length), message: detail.message })),
        )
      }
      setFormError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <LoadingState rows={5} />
      </div>
    )
  }
  if (query.isError || !form) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        {isApiError(query.error) && query.error.status === 404 ? (
          <div className="text-center">
            <h1 className="page-title">Form not found</h1>
            <p className="text-muted-foreground mt-2">Check the link you were given.</p>
          </div>
        ) : (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        )}
      </div>
    )
  }

  const accent = form.branding.accentColor ?? undefined

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:py-12">
      {form.event && (
        <Link
          href={`/events/${form.event.slug}`}
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to event
        </Link>
      )}
      {form.event && (
        <div className="bg-card mb-6 flex items-center gap-4 rounded-lg border p-4 shadow-xs">
          {form.branding.bannerUrl ? (
            <img
              src={form.branding.bannerUrl}
              alt=""
              className="hidden aspect-[16/10] w-28 shrink-0 rounded-sm border object-cover sm:block"
            />
          ) : null}
          <div className="min-w-0 text-[13px]">
            <p className="eyebrow">Registering for</p>
            <p className="mt-1 text-[15px] leading-5 font-semibold">{form.event.title}</p>
            <p className="text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {formatEventRange(form.event.startsAt, form.event.endsAt, form.event.timezone)}
              </span>
            </p>
            {form.event.mode !== 'VIRTUAL' && (form.event.venueName || form.event.city) && (
              <p className="text-muted-foreground flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {[form.event.venueName, form.event.city, form.event.country].filter(Boolean).join(', ')}
                </span>
              </p>
            )}
          </div>
        </div>
      )}
      <div className="bg-card overflow-hidden rounded-lg border shadow-xs">
        {accent && <div className="h-1" style={{ background: accent }} aria-hidden />}
        <div className="space-y-6 p-5 sm:p-8">
          <header className="space-y-2 border-b pb-6">
            {form.branding.logoUrl && <img src={form.branding.logoUrl} alt="" className="h-10 w-auto" />}
            <h1 className="page-title">{form.title}</h1>
            {form.description && (
              <p className="text-muted-foreground text-[15px] whitespace-pre-line">{form.description}</p>
            )}
          </header>

          {result ? (
            <SubmissionDone
              result={result}
              calendarHref={form.event ? `/api/v1/public/events/${form.event.slug}/calendar.ics` : null}
            />
          ) : !form.open || !form.definition ? (
            <Notice tone="warning" title="Not accepting responses">
              {CLOSED_TEXT[form.reason] ?? 'This form is not accepting responses right now.'}
            </Notice>
          ) : (
            <div onInput={markStarted} onChange={markStarted}>
              {form.requiresApproval && (
                <Notice tone="info" className="mb-6">
                  The organiser reviews registrations before confirming them.
                </Notice>
              )}
              {formError && serverErrors.length === 0 && (
                <Notice tone="error" className="mb-6">
                  {formError}
                </Notice>
              )}
              <FormRenderer
                definition={form.definition as FormDefinition}
                prefill={form.prefill}
                ticketTypes={form.isRegistrationForm ? form.ticketTypes : []}
                submitLabel={form.isRegistrationForm ? 'Register' : 'Submit'}
                submitting={submitting}
                serverErrors={serverErrors}
                onSubmit={(payload) => void submit(payload)}
              />
              <p className="text-muted-foreground mt-6 flex gap-2 border-t pt-4 text-xs">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  No account needed. Your answers are shared only with the organiser of this form. See our{' '}
                  <Link href="/privacy" className="underline">
                    privacy policy
                  </Link>
                  .
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SubmissionDone({ result, calendarHref }: { result: Result; calendarHref: string | null }) {
  return (
    <div className="space-y-4 text-center" role="status">
      <CheckCircle2 className="text-success mx-auto size-12" aria-hidden />
      <p className="text-lg font-medium">{result.message}</p>
      {result.registration && (
        <div className="space-y-2">
          {result.registration.status === 'CONFIRMED' && (
            <p className="text-muted-foreground text-sm">
              {emailDeliveryEnabled
                ? 'We’ve emailed your ticket. You can also open it now.'
                : 'Open your ticket now and keep the link: it is how you return to this registration.'}
            </p>
          )}
          <Button asChild>
            <a href={result.registration.manageUrl}>
              {result.registration.status === 'CONFIRMED' ? 'View my ticket' : 'View registration'}
            </a>
          </Button>
          {calendarHref && result.registration.status === 'CONFIRMED' && (
            <Button asChild variant="outline" className="ml-2">
              <a href={calendarHref} download>
                Add to calendar
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
