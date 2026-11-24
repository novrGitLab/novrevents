'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, Pagination } from '@/components/common'
import { FORM_PURPOSE_LABELS } from '@/components/events/labels'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel } from '@/lib/format'

type Purpose = keyof typeof FORM_PURPOSE_LABELS

const STATUS_VARIANT = { DRAFT: 'secondary', PUBLISHED: 'success', UNPUBLISHED: 'warning' } as const
const AVAILABILITY_TEXT = {
  OPEN: 'Accepting responses',
  NOT_PUBLISHED: 'Not published',
  CLOSED: 'Closed',
  FULL: 'Limit reached',
} as const

export function FormList({ eventId, standalone = false }: { eventId?: string; standalone?: boolean }) {
  const [page, setPage] = React.useState(1)
  const [purpose, setPurpose] = React.useState<Purpose | ''>('')
  const [open, setOpen] = React.useState(false)
  const params = {
    page,
    pageSize: 20,
    eventId,
    purpose: purpose || undefined,
    scope: standalone ? ('standalone' as const) : ('all' as const),
  }
  const query = useQuery({
    queryKey: keys.forms(params),
    queryFn: () => unwrap(api.GET('/api/v1/forms', { params: { query: params } })),
    placeholderData: (previous) => previous,
  })
  const hasRegistrationForm = query.data?.items.some((form) => form.isRegistrationForm) ?? false

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="purpose-filter" className="text-muted-foreground text-sm">
            Type
          </label>
          <NativeSelect
            id="purpose-filter"
            className="w-56"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value as Purpose | '')}
          >
            <option value="">All types</option>
            {Object.entries(FORM_PURPOSE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus /> New form
        </Button>
      </div>
      {query.isPending ? (
        <LoadingState rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No forms yet"
          description={
            eventId
              ? 'Add a registration form so people can sign up, or application forms for speakers, volunteers, judges and sponsors.'
              : 'Build a form for registrations, applications, feedback or anything else. Anyone can respond without an account.'
          }
          action={<Button onClick={() => setOpen(true)}>Create a form</Button>}
        />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border">
            {query.data.items.map((form) => (
              <li key={form.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/forms/${form.id}`} className="font-medium hover:underline">
                      {form.title}
                    </Link>
                    {form.isRegistrationForm && <Badge variant="brand">Registration</Badge>}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {FORM_PURPOSE_LABELS[form.purpose]}
                    {form.event && !eventId && <> · {form.event.title}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={STATUS_VARIANT[form.status]}>{enumLabel(form.status)}</Badge>
                  <span className="text-muted-foreground">{AVAILABILITY_TEXT[form.availability.reason]}</span>
                  <span className="tabular-nums">
                    {form.counts.received} responses
                    {form.counts.excluded > 0 && (
                      <span className="text-muted-foreground"> ({form.counts.excluded} excluded)</span>
                    )}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/forms/${form.id}/responses`}>Responses</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPage={setPage}
          />
        </>
      )}
      <CreateFormDialog
        open={open}
        onOpenChange={setOpen}
        eventId={eventId}
        allowRegistration={Boolean(eventId) && !hasRegistrationForm}
      />
    </>
  )
}

export function CreateFormDialog({
  open,
  onOpenChange,
  eventId,
  allowRegistration,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId?: string
  allowRegistration: boolean
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const purposes = (Object.keys(FORM_PURPOSE_LABELS) as Purpose[]).filter(
    (value) => value !== 'REGISTRATION' || allowRegistration,
  )
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [purpose, setPurpose] = React.useState<Purpose>(allowRegistration ? 'REGISTRATION' : 'GENERAL')
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setPurpose(allowRegistration ? 'REGISTRATION' : 'GENERAL')
  }

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/forms', {
          body: { title, description: description || null, purpose, eventId: eventId ?? null },
        }),
      ),
    onSuccess: async (form) => {
      await queryClient.invalidateQueries({ queryKey: ['forms'] })
      if (eventId) await queryClient.invalidateQueries({ queryKey: keys.event(eventId) })
      toast.success('Form created')
      router.push(`/dashboard/forms/${form.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
          <DialogDescription>
            Every form type uses the same builder; the type only chooses the starting questions. You can
            change everything afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Form type" htmlFor="form-purpose">
            <NativeSelect
              id="form-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as Purpose)}
            >
              {purposes.map((value) => (
                <option key={value} value={value}>
                  {FORM_PURPOSE_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {purpose === 'REGISTRATION' && (
            <p className="text-muted-foreground text-xs">
              Responses to this form become registrations with tickets for this event.
            </p>
          )}
          <Field label="Title" htmlFor="form-title" required>
            <Input
              id="form-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </Field>
          <Field
            label="Introduction"
            htmlFor="form-description"
            description="Optional text shown at the top of the form."
          >
            <Textarea
              id="form-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create and open builder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
