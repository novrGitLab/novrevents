'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FileDown, Plus, Search, Trash2, X } from '@/components/ui/icons'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, Pagination, useConfirm } from '@/components/common'
import { canManage, useManagedEvent } from '@/components/events/event-context'
import { REGISTRATION_STATUS_VARIANT } from '@/components/events/labels'
import { AttendeeDrawer, type AttendeeAction } from '@/components/registrations/attendee-drawer'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Avatar, Switch } from '@/components/ui/primitives'
import { api, toQuery, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatDateTime, formatNumber } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

type Status = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED'

export default function RegistrationsPage() {
  const { event } = useManagedEvent()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const manage = canManage(event)
  const [status, setStatus] = React.useState<Status | ''>('')
  const [checkedIn, setCheckedIn] = React.useState<'' | 'yes' | 'no'>('')
  const [ticketTypeId, setTicketTypeId] = React.useState('')
  const [sort, setSort] = React.useState<'newest' | 'oldest' | 'name'>('newest')
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [openId, setOpenId] = React.useState<string | null>(null)

  const filters = {
    status: status || undefined,
    checkedIn: checkedIn || undefined,
    ticketTypeId: ticketTypeId || undefined,
    q: search || undefined,
    sort,
  }
  const list = useQuery({
    queryKey: keys.eventPart(event.id, 'registrations', { ...filters, page }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/events/{id}/registrations', {
          params: { path: { id: event.id }, query: { ...filters, page, pageSize: 25 } },
        }),
      ),
    placeholderData: (previous) => previous,
  })
  const ticketTypes = useQuery({
    queryKey: keys.eventPart(event.id, 'ticket-types'),
    queryFn: () =>
      unwrap(api.GET('/api/v1/events/{id}/ticket-types', { params: { path: { id: event.id } } })),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.event(event.id) })
  const act = useMutation({
    mutationFn: async ({
      registrationId,
      action,
      reason,
    }: {
      registrationId: string
      action: 'approve' | 'decline' | 'cancel'
      reason?: string
    }) => {
      const params = { params: { path: { id: event.id, registrationId } } }
      if (action === 'approve')
        return unwrap(api.POST('/api/v1/events/{id}/registrations/{registrationId}/approve', params))
      if (action === 'decline')
        return unwrap(api.POST('/api/v1/events/{id}/registrations/{registrationId}/decline', params))
      return unwrap(
        api.POST('/api/v1/events/{id}/registrations/{registrationId}/cancel', {
          ...params,
          body: { reason: reason || null },
        }),
      )
    },
    onSuccess: async (_result, variables) => {
      toast.success(
        {
          approve: emailDeliveryEnabled ? 'Approved — ticket emailed' : 'Approved — ticket issued',
          decline: 'Registration declined',
          cancel: 'Registration cancelled',
        }[variables.action],
      )
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const requestCancel = (registration: { id: string; attendeeName: string }) =>
    confirm(
      {
        title: `Cancel ${registration.attendeeName}’s registration?`,
        description: emailDeliveryEnabled
          ? 'Their ticket stops working, the place is released, and they are emailed.'
          : 'Their ticket stops working and the place is released.',
        confirmLabel: 'Cancel registration',
        destructive: true,
        reasonLabel: emailDeliveryEnabled ? 'Reason (included in the email, optional)' : 'Reason (optional)',
      },
      (reason) => act.mutateAsync({ registrationId: registration.id, action: 'cancel', reason }),
    )

  const onDrawerAction = (action: AttendeeAction, registration: { id: string; name: string }) => {
    if (action === 'cancel') {
      requestCancel({ id: registration.id, attendeeName: registration.name })
      return
    }
    act.mutate({ registrationId: registration.id, action })
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="attendees-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="attendees-heading" className="section-title">
              Attendees
            </h2>
            <p className="text-muted-foreground text-sm">
              Registrations come from the event’s registration form, for guests and signed-in users alike.
            </p>
          </div>
          {manage && (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/v1/events/${event.id}/registrations/export${toQuery(filters)}`}>
                <FileDown /> Export CSV
              </a>
            </Button>
          )}
        </div>
        <dl className="bg-card grid grid-cols-3 divide-x rounded-lg border shadow-xs">
          {[
            { label: 'Confirmed', value: event.counts.confirmed, hint: event.capacity ? `of ${formatNumber(event.capacity)}` : null },
            { label: 'Awaiting review', value: event.counts.pending, hint: event.counts.pending > 0 ? 'Needs a decision' : null },
            { label: 'Checked in', value: event.counts.checkedIn, hint: null },
          ].map((stat) => (
            <div key={stat.label} className="min-w-0 px-4 py-3 sm:px-5 sm:py-4">
              <dt className="eyebrow truncate">{stat.label}</dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span
                  className={
                    stat.label === 'Awaiting review' && stat.value > 0
                      ? 'text-headline-md text-primary tabular-nums'
                      : 'text-headline-md tabular-nums'
                  }
                >
                  {formatNumber(stat.value)}
                </span>
                {stat.hint && <span className="text-muted-foreground text-xs">{stat.hint}</span>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(formEvent) => {
                formEvent.preventDefault()
                setSearch(q.trim())
                setPage(1)
              }}
            >
              <label htmlFor="attendee-search" className="sr-only">
                Search attendees
              </label>
              <div className="relative min-w-0 flex-1">
                <Search
                  className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden
                />
                <Input
                  id="attendee-search"
                  type="search"
                  placeholder="Name, email or ticket code"
                  value={q}
                  onChange={(changeEvent) => setQ(changeEvent.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <NativeSelect
                aria-label="Status"
                className="w-36"
                value={status}
                onChange={(changeEvent) => {
                  setStatus(changeEvent.target.value as Status | '')
                  setPage(1)
                }}
              >
                <option value="">Any status</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING">Pending</option>
                <option value="DECLINED">Declined</option>
                <option value="CANCELLED">Cancelled</option>
              </NativeSelect>
              <NativeSelect
                aria-label="Check-in"
                className="w-44"
                value={checkedIn}
                onChange={(changeEvent) => {
                  setCheckedIn(changeEvent.target.value as '' | 'yes' | 'no')
                  setPage(1)
                }}
              >
                <option value="">Checked in or not</option>
                <option value="yes">Checked in</option>
                <option value="no">Not checked in</option>
              </NativeSelect>
              {(ticketTypes.data?.items.length ?? 0) > 1 && (
                <NativeSelect
                  aria-label="Ticket type"
                  className="w-40"
                  value={ticketTypeId}
                  onChange={(changeEvent) => {
                    setTicketTypeId(changeEvent.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All ticket types</option>
                  {ticketTypes.data?.items.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
              <NativeSelect
                aria-label="Sort"
                className="w-32"
                value={sort}
                onChange={(changeEvent) => setSort(changeEvent.target.value as typeof sort)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
              </NativeSelect>
            </div>
          </div>
          {list.isPending ? (
            <LoadingState rows={4} />
          ) : list.isError ? (
            <ErrorState error={list.error} retry={() => void list.refetch()} />
          ) : list.data.items.length === 0 ? (
            <EmptyState
              title={search || status || checkedIn ? 'No attendees match' : 'No registrations yet'}
              description={
                !event.registrationFormId
                  ? 'Create and publish a registration form to start taking registrations.'
                  : undefined
              }
            />
          ) : (
            <>
              <div className="bg-card overflow-x-auto rounded-lg border shadow-xs">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-[0.04em] uppercase">
                    <tr>
                      <th className="p-3 pl-4 font-semibold">Attendee</th>
                      <th className="p-3 font-semibold">Ticket</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold">Registered</th>
                      {manage && <th className="p-3 pr-4 text-right font-semibold">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.data.items.map((registration) => (
                      <tr key={registration.id} className="hover:bg-brand-soft/50">
                        <td className="p-3 pl-4">
                          <div className="flex items-center gap-3">
                          <Avatar name={registration.attendeeName} className="size-9 rounded-sm" />
                          <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setOpenId(registration.id)}
                            className="hover:text-brand-text rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                          >
                            {registration.attendeeName}
                          </button>
                          <p className="text-muted-foreground text-xs">
                            {registration.attendeeEmail}
                            {registration.isGuest ? ' · guest' : ''}
                          </p>
                          </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <p>{registration.ticketType.name}</p>
                          {registration.ticket && (
                            <p className="text-muted-foreground font-mono text-xs">
                              {registration.ticket.code}
                            </p>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={REGISTRATION_STATUS_VARIANT[registration.status]}>
                              {enumLabel(registration.status)}
                            </Badge>
                            {registration.checkedInAt && (
                              <Badge
                                variant="success"
                                title={formatDateTime(registration.checkedInAt, event.timezone)}
                              >
                                Checked in
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-muted-foreground p-3 whitespace-nowrap">
                          {formatDateTime(registration.createdAt, event.timezone)}
                        </td>
                        {manage && (
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              {registration.status === 'PENDING' && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      act.mutate({ registrationId: registration.id, action: 'approve' })
                                    }
                                    disabled={act.isPending}
                                  >
                                    <Check /> Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      act.mutate({ registrationId: registration.id, action: 'decline' })
                                    }
                                    disabled={act.isPending}
                                  >
                                    <X /> Decline
                                  </Button>
                                </>
                              )}
                              {(registration.status === 'PENDING' || registration.status === 'CONFIRMED') &&
                                !registration.checkedInAt && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => requestCancel(registration)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={list.data.page}
                totalPages={list.data.totalPages}
                total={list.data.total}
                onPage={setPage}
              />
            </>
          )}
        </div>
      </section>
      <AttendeeDrawer
        eventId={event.id}
        timezone={event.timezone}
        registrationFormId={event.registrationFormId}
        registrationId={openId}
        manage={manage}
        onClose={() => setOpenId(null)}
        onAction={onDrawerAction}
        busy={act.isPending}
      />
      {manage && <TicketTypes eventId={event.id} />}
      {dialog}
    </div>
  )
}

function TicketTypes({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')
  const [capacity, setCapacity] = React.useState('')
  const [price,setPrice] = React.useState('')
  const [description, setDescription] = React.useState('')
  const queryKey = keys.eventPart(eventId, 'ticket-types')
  const query = useQuery({
    queryKey,
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/ticket-types', { params: { path: { id: eventId } } })),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.event(eventId) })
  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/events/{id}/ticket-types', {
          params: { path: { id: eventId } },
          body: { name, priceKobo: Math.round(Number(price || 0)*100), description: description || null, capacity: capacity ? Number(capacity) : null },
        }),
      ),
    onSuccess: async () => {
      setName('')
      setCapacity('')
      setPrice('')
      setDescription('')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const patch = async (ticketTypeId: string, body: { isActive?: boolean; capacity?: number | null }) => {
    try {
      await unwrap(
        api.PATCH('/api/v1/events/{id}/ticket-types/{ticketTypeId}', {
          params: { path: { id: eventId, ticketTypeId } },
          body,
        }),
      )
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticket types</CardTitle>
        <CardDescription>
          Each ticket type can have its own capacity inside the event capacity. Attendees choose one on the
          registration form when there is more than one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <LoadingState rows={1} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {query.data.items.map((type) => (
              <li key={type.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{type.name}</p>{type.priceKobo>0 && <span>{new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(type.priceKobo/100)}</span>}
                  {type.description && <p className="text-muted-foreground text-xs">{type.description}</p>}
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {type.registeredCount}
                  {type.capacity ? ` / ${type.capacity}` : ''} taken
                </span>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={type.isActive}
                    onCheckedChange={(isActive) => void patch(type.id, { isActive })}
                    aria-label={`${type.name} available`}
                  />{' '}
                  Available
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${type.name}`}
                  disabled={type.registeredCount > 0 || query.data.items.length <= 1}
                  onClick={async () => {
                    try {
                      await unwrap(
                        api.DELETE('/api/v1/events/{id}/ticket-types/{ticketTypeId}', {
                          params: { path: { id: eventId, ticketTypeId: type.id } },
                        }),
                      )
                      await refresh()
                    } catch (error) {
                      toast.error(errorMessage(error))
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_110px_100px_auto] sm:items-end"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Name" htmlFor="tt-name">
            <Input
              id="tt-name"
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              required
              maxLength={80}
              placeholder="e.g. Student"
            />
          </Field>
          <Field label="Description" htmlFor="tt-description">
            <Input
              id="tt-description"
              value={description}
              onChange={(changeEvent) => setDescription(changeEvent.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label="Online price (NGN)" htmlFor="tt-price"><Input id="tt-price" type="number" min="0" max="20000000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} /></Field>
          <Field label="Capacity" htmlFor="tt-capacity">
            <Input
              id="tt-capacity"
              inputMode="numeric"
              value={capacity}
              onChange={(changeEvent) => setCapacity(changeEvent.target.value.replace(/\D/g, ''))}
              placeholder="No limit"
            />
          </Field>
          <Button type="submit" loading={create.isPending}>
            <Plus /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
