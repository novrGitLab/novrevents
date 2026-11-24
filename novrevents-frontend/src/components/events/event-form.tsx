'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field, fieldAria } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { applyFieldErrors, errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { browserTimeZone, fromLocalInput, TIMEZONES, toLocalInput } from '@/lib/format'
import { EVENT_MODE_LABELS, EVENT_TYPE_LABELS, VISIBILITY_LABELS } from './labels'

type ManagedEvent = Schema<'EventManage'>

const optionalUrl = z.union([z.literal(''), z.url('Enter a full URL starting with https://')])
const schema = z
  .object({
    title: z.string().trim().min(3, 'Use at least 3 characters.').max(140),
    summary: z.string().max(240),
    description: z.string().max(20_000),
    categoryId: z.string(),
    eventType: z.enum(Object.keys(EVENT_TYPE_LABELS) as [keyof typeof EVENT_TYPE_LABELS]),
    mode: z.enum(['IN_PERSON', 'VIRTUAL', 'HYBRID']),
    timezone: z.string().min(1),
    startsAt: z.string().min(1, 'Choose a start time.'),
    endsAt: z.string().min(1, 'Choose an end time.'),
    venueName: z.string().max(160),
    address: z.string().max(300),
    city: z.string().max(100),
    region: z.string().max(100),
    country: z.string().max(100),
    onlineUrl: optionalUrl,
    organizerName: z.string().trim().min(2, 'Enter the organiser name.').max(120),
    organizerEmail: z.union([z.literal(''), z.email('Enter a valid email.')]),
    organizerEmailPublic: z.boolean(),
    organizerWebsite: optionalUrl,
    capacity: z.string().regex(/^\d*$/, 'Use a whole number.'),
    registrationDeadline: z.string(),
    isPaid: z.boolean(),
    priceInfo: z.string().max(200),
    visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']),
    organizationId: z.string(),
    accentColor: z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/)]),
  })
  .refine((values) => !values.startsAt || !values.endsAt || values.endsAt > values.startsAt, {
    path: ['endsAt'],
    message: 'The end must be after the start.',
  })

type Values = z.infer<typeof schema>

function defaults(event?: ManagedEvent): Values {
  const timezone = event?.timezone ?? browserTimeZone()
  return {
    title: event?.title ?? '',
    summary: event?.summary ?? '',
    description: event?.description ?? '',
    categoryId: event?.categoryId ?? '',
    eventType: event?.eventType ?? 'CONFERENCE',
    mode: event?.mode ?? 'IN_PERSON',
    timezone,
    startsAt: toLocalInput(event?.startsAt, timezone),
    endsAt: toLocalInput(event?.endsAt, timezone),
    venueName: event?.venueName ?? '',
    address: event?.address ?? '',
    city: event?.city ?? '',
    region: event?.region ?? '',
    country: event?.country ?? '',
    onlineUrl: event?.onlineUrl ?? '',
    organizerName: event?.organizerName ?? '',
    organizerEmail: event?.organizerEmail ?? '',
    organizerEmailPublic: event?.organizerEmailPublic ?? false,
    organizerWebsite: event?.organizerWebsite ?? '',
    capacity: event?.capacity ? String(event.capacity) : '',
    registrationDeadline: toLocalInput(event?.registrationDeadline, timezone),
    isPaid: event?.isPaid ?? false,
    priceInfo: event?.priceInfo ?? '',
    visibility: event?.visibility ?? 'PUBLIC',
    organizationId: event?.organizationId ?? '',
    accentColor: event?.accentColor ?? '',
  }
}

/** Converts the form values into the API payload: times become UTC instants in the chosen zone. */
function toPayload(values: Values) {
  const tz = values.timezone
  return {
    title: values.title,
    summary: values.summary || null,
    description: values.description,
    categoryId: values.categoryId || null,
    eventType: values.eventType,
    mode: values.mode,
    timezone: tz,
    startsAt: fromLocalInput(values.startsAt, tz),
    endsAt: fromLocalInput(values.endsAt, tz),
    venueName: values.venueName || null,
    address: values.address || null,
    city: values.city || null,
    region: values.region || null,
    country: values.country || null,
    onlineUrl: values.onlineUrl || null,
    organizerName: values.organizerName,
    organizerEmail: values.organizerEmail || null,
    // Hidden on public pages unless the organiser designates it as public contact information.
    organizerEmailPublic: values.organizerEmail ? values.organizerEmailPublic : false,
    organizerWebsite: values.organizerWebsite || null,
    capacity: values.capacity ? Number(values.capacity) : null,
    registrationDeadline: values.registrationDeadline
      ? fromLocalInput(values.registrationDeadline, tz)
      : null,
    isPaid: values.isPaid,
    priceInfo: values.isPaid ? values.priceInfo || null : null,
    visibility: values.visibility,
    organizationId: values.organizationId || null,
    accentColor: values.accentColor || null,
  }
}

export type EventPayload = ReturnType<typeof toPayload>

export function EventForm({
  event,
  defaultOrganizerName,
  submitLabel,
  onSubmit,
}: {
  event?: ManagedEvent
  defaultOrganizerName?: string
  submitLabel: string
  onSubmit: (payload: EventPayload) => Promise<void>
}) {
  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: () => unwrap(api.GET('/api/v1/public/categories')),
    staleTime: 600_000,
  })
  const organizations = useQuery({
    queryKey: keys.organizations,
    queryFn: () => unwrap(api.GET('/api/v1/organizations')),
  })
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaults(event), organizerName: event?.organizerName ?? defaultOrganizerName ?? '' },
  })
  const { errors, isSubmitting } = form.formState
  const mode = form.watch('mode')
  const isPaid = form.watch('isPaid')
  const timezone = form.watch('timezone')
  const accent = form.watch('accentColor')
  const readOnly = event?.status === 'CANCELLED' || event?.status === 'ARCHIVED'

  const submit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await onSubmit(toPayload(values))
    } catch (error) {
      if (!applyFieldErrors(error, form.setError)) setFormError(errorMessage(error))
      else setFormError('Some fields need attention.')
    }
  })

  const err = (name: keyof Values) => errors[name]?.message
  const reg = (name: keyof Values, description = false) => ({
    ...fieldAria(name, err(name), description),
    ...form.register(name),
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {readOnly && (
        <Notice tone="warning">
          This event is {event?.status.toLowerCase()} and can no longer be edited.
        </Notice>
      )}
      {formError && <Notice tone="error">{formError}</Notice>}
      <fieldset disabled={readOnly || isSubmitting} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title" htmlFor="title" required error={err('title')}>
              <Input {...reg('title')} />
            </Field>
            <Field
              label="Summary"
              htmlFor="summary"
              description="One sentence shown on event cards."
              error={err('summary')}
            >
              <Input {...reg('summary', true)} maxLength={240} />
            </Field>
            <Field
              label="Description"
              htmlFor="description"
              description="Required to publish (at least 20 characters). Plain text; line breaks are kept."
              error={err('description')}
            >
              <Textarea {...reg('description', true)} className="min-h-40" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category" htmlFor="categoryId" error={err('categoryId')}>
                <NativeSelect key={categories.data ? 'loaded' : 'loading'} {...reg('categoryId')}>
                  <option value="">Choose…</option>
                  {categories.data?.items.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Event type" htmlFor="eventType">
                <NativeSelect {...reg('eventType')}>
                  {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Format" htmlFor="mode">
                <NativeSelect {...reg('mode')}>
                  {Object.entries(EVENT_MODE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date and time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Timezone"
              htmlFor="timezone"
              description="Times below are in this timezone, and attendees see them in it too."
            >
              <NativeSelect {...reg('timezone', true)}>
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Starts (${timezone})`} htmlFor="startsAt" required error={err('startsAt')}>
                <Input type="datetime-local" {...reg('startsAt')} />
              </Field>
              <Field label={`Ends (${timezone})`} htmlFor="endsAt" required error={err('endsAt')}>
                <Input type="datetime-local" {...reg('endsAt')} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode !== 'VIRTUAL' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Venue name" htmlFor="venueName" error={err('venueName')}>
                    <Input {...reg('venueName')} />
                  </Field>
                  <Field label="Address" htmlFor="address" error={err('address')}>
                    <Input {...reg('address')} autoComplete="street-address" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="City" htmlFor="city" error={err('city')}>
                    <Input {...reg('city')} />
                  </Field>
                  <Field label="State / region" htmlFor="region" error={err('region')}>
                    <Input {...reg('region')} />
                  </Field>
                  <Field label="Country" htmlFor="country" error={err('country')}>
                    <Input {...reg('country')} />
                  </Field>
                </div>
              </>
            )}
            {mode !== 'IN_PERSON' && (
              <Field
                label="Online join link"
                htmlFor="onlineUrl"
                description="Only confirmed attendees and your team can see it."
                error={err('onlineUrl')}
              >
                <Input type="url" placeholder="https://" {...reg('onlineUrl', true)} />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Capacity"
                htmlFor="capacity"
                description="Leave empty for no limit."
                error={err('capacity')}
              >
                <Input inputMode="numeric" {...reg('capacity', true)} />
              </Field>
              <Field
                label={`Registration deadline (${timezone})`}
                htmlFor="registrationDeadline"
                description="Optional."
                error={err('registrationDeadline')}
              >
                <Input type="datetime-local" {...reg('registrationDeadline', true)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary size-4" {...form.register('isPaid')} /> This is
              a paid event
            </label>
            {isPaid && (
              <Field
                label="Price information"
                htmlFor="priceInfo"
                description="Shown to attendees. NOVR Events does not process payments."
                error={err('priceInfo')}
              >
                <Input placeholder="e.g. ₦15,000 — pay at the door" {...reg('priceInfo', true)} />
              </Field>
            )}
            <Field label="Visibility" htmlFor="visibility">
              <NativeSelect {...reg('visibility')}>
                {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organiser and branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organiser name" htmlFor="organizerName" required error={err('organizerName')}>
                <Input {...reg('organizerName')} />
              </Field>
              <Field
                label="Organization workspace"
                htmlFor="organizationId"
                description="Optional. Share management with a team."
              >
                <NativeSelect
                  {...reg('organizationId', true)}
                  disabled={event !== undefined && event.role !== 'OWNER' && event.role !== 'ORG_ADMIN'}
                >
                  <option value="">None — just me</option>
                  {organizations.data?.items.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="space-y-2 sm:col-span-2">
                <Field
                  label="Contact email"
                  htmlFor="organizerEmail"
                  description="Used for enquiries about this event. Not shown to visitors unless you tick the box below."
                  error={err('organizerEmail')}
                >
                  <Input type="email" {...reg('organizerEmail')} />
                </Field>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" className="accent-brand size-4" {...reg('organizerEmailPublic')} />
                  Show this email on the public event page
                </label>
              </div>
              <Field label="Organiser website" htmlFor="organizerWebsite" error={err('organizerWebsite')}>
                <Input type="url" placeholder="https://" {...reg('organizerWebsite')} />
              </Field>
            </div>
            <Field
              label="Accent colour"
              htmlFor="accentColor"
              description="Used on the event page, registration form, tickets and emails."
              error={err('accentColor')}
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={accent || '#0b7285'}
                  onChange={(changeEvent) =>
                    form.setValue('accentColor', changeEvent.target.value, { shouldDirty: true })
                  }
                  className="bg-card h-10 w-12 cursor-pointer rounded-md border p-1"
                />
                <Input className="max-w-32 font-mono" placeholder="#0b7285" {...reg('accentColor', true)} />
                {accent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => form.setValue('accentColor', '', { shouldDirty: true })}
                  >
                    Use default
                  </Button>
                )}
              </div>
            </Field>
          </CardContent>
        </Card>
      </fieldset>
      {!readOnly && (
        <div className="bg-background/95 sticky bottom-0 -mx-4 flex justify-end gap-2 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  )
}
