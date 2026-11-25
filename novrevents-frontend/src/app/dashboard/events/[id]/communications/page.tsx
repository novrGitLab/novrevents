'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Send } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, Pagination } from '@/components/common'
import { useManagedEvent, type ManagedEvent } from '@/components/events/event-context'
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatDateTime, fromLocalInput } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

type Campaign = Schema<'Campaign'>
type CampaignType = 'ANNOUNCEMENT' | 'UPDATE' | 'REMINDER' | 'SPEAKER_INVITATION' | 'VOLUNTEER_INVITATION'
type Audience = 'CONFIRMED' | 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'CUSTOM'

const TYPE_LABEL: Record<Campaign['type'], string> = {
  ANNOUNCEMENT: 'Announcement',
  UPDATE: 'Event update',
  REMINDER: 'Reminder',
  CANCELLATION: 'Cancellation notice',
  SPEAKER_INVITATION: 'Speaker invitation',
  VOLUNTEER_INVITATION: 'Volunteer invitation',
}
const STATUS_VARIANT = {
  DRAFT: 'secondary',
  SCHEDULED: 'default',
  SENDING: 'warning',
  SENT: 'success',
  CANCELLED: 'secondary',
} as const

export default function CommunicationsPage() {
  const { event } = useManagedEvent()
  const live = event.status === 'PUBLISHED' || event.status === 'ONGOING' || event.status === 'COMPLETED'
  return (
    <Tabs defaultValue="compose">
      {!emailDeliveryEnabled && (
        <Notice tone="warning" title="Email delivery is not switched on yet" className="mb-4">
          Messages and reminders are recorded in the log below, but they are not delivered to inboxes until
          email delivery is enabled for NOVR Events.
        </Notice>
      )}
      <TabsList>
        <TabsTrigger value="compose">Compose</TabsTrigger>
        <TabsTrigger value="sent">Sent and scheduled</TabsTrigger>
        <TabsTrigger value="log">Message log</TabsTrigger>
      </TabsList>
      <TabsContent value="compose" className="mt-6">
        {live ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Composer event={event} />
            <ReminderSettings event={event} />
          </div>
        ) : (
          <Notice tone="warning">Messages can be sent once the event is published.</Notice>
        )}
      </TabsContent>
      <TabsContent value="sent" className="mt-6">
        <CampaignList eventId={event.id} />
      </TabsContent>
      <TabsContent value="log" className="mt-6">
        <MessageLog eventId={event.id} />
      </TabsContent>
    </Tabs>
  )
}

function Composer({ event }: { event: ManagedEvent }) {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [type, setType] = React.useState<CampaignType>('ANNOUNCEMENT')
  const [audience, setAudience] = React.useState<Audience>('CONFIRMED')
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [recipients, setRecipients] = React.useState('')
  const [formId, setFormId] = React.useState('')
  const [schedule, setSchedule] = React.useState('')
  const invitation = type === 'SPEAKER_INVITATION' || type === 'VOLUNTEER_INVITATION'
  const purpose = type === 'SPEAKER_INVITATION' ? 'SPEAKER' : 'VOLUNTEER'
  const forms = useQuery({
    queryKey: keys.forms({ eventId: event.id, purpose }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/forms', {
          params: { query: { eventId: event.id, purpose, page: 1, pageSize: 50 } },
        }),
      ),
    enabled: invitation,
  })
  const publishedForms = forms.data?.items.filter((form) => form.status === 'PUBLISHED') ?? []
  // Default to the first published form of the right kind until the organiser picks one.
  const selectedFormId = publishedForms.some((form) => form.id === formId)
    ? formId
    : (publishedForms[0]?.id ?? '')

  const emails = recipients
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/events/{id}/campaigns', {
          params: { path: { id: event.id } },
          body: {
            type,
            subject,
            body,
            audience: invitation ? 'CUSTOM' : audience,
            customRecipients: invitation ? emails : [],
            formId: invitation ? selectedFormId || null : null,
            scheduledAt: schedule ? fromLocalInput(schedule, event.timezone) : null,
          },
        }),
      ),
    onSuccess: async (campaign) => {
      toast.success(
        campaign.status === 'SCHEDULED'
          ? 'Message scheduled'
          : `Message queued for ${campaign.recipientCount} recipient${campaign.recipientCount === 1 ? '' : 's'}`,
      )
      setSubject('')
      setBody('')
      setRecipients('')
      setSchedule('')
      await queryClient.invalidateQueries({ queryKey: keys.eventPart(event.id, 'campaigns') })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>New message</CardTitle>
        <CardDescription>
          Announcements go only to people registered for this event. Invitations go to the addresses you list
          and link to an application form.
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t pt-5">
        {!user?.emailVerified && (
          <Notice tone="warning" className="mb-4">
            Verify your email address before sending messages.
          </Notice>
        )}
        <form
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            send.mutate()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="c-type">
              <NativeSelect
                id="c-type"
                value={type}
                onChange={(changeEvent) => setType(changeEvent.target.value as CampaignType)}
              >
                <option value="ANNOUNCEMENT">Announcement</option>
                <option value="UPDATE">Event update</option>
                <option value="REMINDER">Reminder</option>
                <option value="SPEAKER_INVITATION">Speaker invitation</option>
                <option value="VOLUNTEER_INVITATION">Volunteer invitation</option>
              </NativeSelect>
            </Field>
            {!invitation && (
              <Field label="Send to" htmlFor="c-audience">
                <NativeSelect
                  id="c-audience"
                  value={audience}
                  onChange={(changeEvent) => setAudience(changeEvent.target.value as Audience)}
                >
                  <option value="CONFIRMED">All confirmed attendees</option>
                  <option value="CHECKED_IN">Attendees who checked in</option>
                  <option value="NOT_CHECKED_IN">Attendees who have not checked in</option>
                </NativeSelect>
              </Field>
            )}
          </div>
          {invitation && (
            <>
              <Field
                label="Application form"
                htmlFor="c-form"
                description={`A published ${purpose.toLowerCase()} application form of this event.`}
              >
                {publishedForms.length > 0 ? (
                  <NativeSelect
                    id="c-form"
                    value={selectedFormId}
                    onChange={(changeEvent) => setFormId(changeEvent.target.value)}
                  >
                    {publishedForms.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.title}
                      </option>
                    ))}
                  </NativeSelect>
                ) : (
                  <Notice tone="warning">
                    Create and publish a {purpose.toLowerCase()} application form in Forms first.
                  </Notice>
                )}
              </Field>
              <Field
                label="Recipients"
                htmlFor="c-recipients"
                description={`Email addresses separated by commas or new lines (${emails.length}/200).`}
              >
                <Textarea
                  id="c-recipients"
                  value={recipients}
                  onChange={(changeEvent) => setRecipients(changeEvent.target.value)}
                  placeholder="speaker@example.com, other@example.com"
                />
              </Field>
            </>
          )}
          <Field label="Subject" htmlFor="c-subject" required>
            <Input
              id="c-subject"
              value={subject}
              onChange={(changeEvent) => setSubject(changeEvent.target.value)}
              required
              minLength={3}
              maxLength={150}
            />
          </Field>
          <Field
            label="Message"
            htmlFor="c-body"
            required
            description="Plain text. Event details and a link are added automatically."
          >
            <Textarea
              id="c-body"
              className="min-h-40"
              value={body}
              onChange={(changeEvent) => setBody(changeEvent.target.value)}
              required
              maxLength={10_000}
            />
          </Field>
          <Field
            label={`Schedule (${event.timezone})`}
            htmlFor="c-schedule"
            description="Leave empty to send now."
          >
            <Input
              id="c-schedule"
              type="datetime-local"
              className="max-w-64"
              value={schedule}
              onChange={(changeEvent) => setSchedule(changeEvent.target.value)}
            />
          </Field>
          <div className="-mx-5 -mb-5 flex flex-col-reverse gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-[13px]">
              {invitation
                ? `${emails.length} recipient${emails.length === 1 ? '' : 's'}`
                : 'Recipients who opted out are skipped.'}
            </p>
            <Button
              type="submit"
              loading={send.isPending}
              disabled={!user?.emailVerified || (invitation && (!selectedFormId || emails.length === 0))}
            >
              <Send /> {schedule ? 'Schedule message' : 'Send now'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ReminderSettings({ event }: { event: ManagedEvent }) {
  const queryClient = useQueryClient()
  const campaigns = useQuery({
    queryKey: keys.eventPart(event.id, 'campaigns'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/campaigns', { params: { path: { id: event.id } } })),
  })
  const reminder = campaigns.data?.items.find((campaign) => campaign.isAutomatic)
  const [hours, setHours] = React.useState('24')
  // Show the stored offset once it loads (and after it changes).
  const storedOffset = reminder?.offsetMinutes ?? null
  const [shownOffset, setShownOffset] = React.useState<number | null>(null)
  if (storedOffset !== null && storedOffset !== shownOffset) {
    setShownOffset(storedOffset)
    setHours(String(storedOffset / 60))
  }
  const save = useMutation({
    mutationFn: (offsetMinutes: number | null) =>
      unwrap(
        api.PUT('/api/v1/events/{id}/reminder', {
          params: { path: { id: event.id } },
          body: { offsetMinutes },
        }),
      ),
    onSuccess: async () => {
      toast.success('Reminder updated')
      await queryClient.invalidateQueries({ queryKey: keys.eventPart(event.id, 'campaigns') })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic reminder</CardTitle>
        <CardDescription>
          Sent to confirmed attendees before the event starts. Moves automatically if you change the date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {reminder ? (
          <p>
            <Badge variant={STATUS_VARIANT[reminder.status]}>{enumLabel(reminder.status)}</Badge>{' '}
            {reminder.status === 'SCHEDULED' &&
              reminder.scheduledAt &&
              `for ${formatDateTime(reminder.scheduledAt, event.timezone)}`}
            {reminder.status === 'SENT' &&
              reminder.sentAt &&
              `on ${formatDateTime(reminder.sentAt, event.timezone)} to ${reminder.recipientCount}`}
          </p>
        ) : (
          <p className="text-muted-foreground">No reminder is set.</p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            save.mutate(Math.round(Number(hours) * 60))
          }}
        >
          <Field label="Hours before start" htmlFor="r-hours" className="flex-1">
            <Input
              id="r-hours"
              type="number"
              min={0.25}
              max={336}
              step={0.25}
              value={hours}
              onChange={(changeEvent) => setHours(changeEvent.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="outline"
            loading={save.isPending}
            disabled={reminder?.status === 'SENT'}
          >
            Save
          </Button>
        </form>
        {reminder?.status === 'SCHEDULED' && (
          <Button variant="ghost" size="sm" onClick={() => save.mutate(null)}>
            Turn off reminder
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function CampaignList({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: keys.eventPart(eventId, 'campaigns'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/campaigns', { params: { path: { id: eventId } } })),
  })
  const cancel = useMutation({
    mutationFn: (campaignId: string) =>
      unwrap(
        api.POST('/api/v1/events/{id}/campaigns/{campaignId}/cancel', {
          params: { path: { id: eventId, campaignId } },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.eventPart(eventId, 'campaigns') }),
    onError: (error) => toast.error(errorMessage(error)),
  })
  if (query.isPending) return <LoadingState rows={3} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  if (query.data.items.length === 0)
    return (
      <EmptyState
        compact
        title="No messages yet"
        description="Messages you send or schedule from Compose are listed here."
      />
    )
  return (
    <ul className="bg-card divide-y rounded-lg border shadow-xs">
      {query.data.items.map((campaign) => (
        <li key={campaign.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{TYPE_LABEL[campaign.type]}</Badge>
            <Badge variant={STATUS_VARIANT[campaign.status]}>{enumLabel(campaign.status)}</Badge>
            {campaign.isAutomatic && <Badge variant="secondary">automatic</Badge>}
            <span className="text-muted-foreground ml-auto text-xs">
              {campaign.sentAt
                ? `Sent ${formatDateTime(campaign.sentAt)}`
                : campaign.scheduledAt
                  ? `Scheduled for ${formatDateTime(campaign.scheduledAt)}`
                  : ''}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold">{campaign.subject}</p>
          {campaign.form && <p className="text-muted-foreground text-xs">Links to {campaign.form.title}</p>}
          {campaign.status === 'SENT' && (
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {[
                { label: 'Recipients', value: campaign.recipientCount },
                { label: 'Sent', value: campaign.delivery.sent },
                { label: 'Delivered', value: campaign.delivery.delivered },
                { label: 'Opened', value: campaign.delivery.opened },
                ...(campaign.delivery.bounced > 0 ? [{ label: 'Bounced', value: campaign.delivery.bounced }] : []),
                ...(campaign.delivery.failed > 0 ? [{ label: 'Failed', value: campaign.delivery.failed }] : []),
                ...(campaign.delivery.suppressed > 0
                  ? [{ label: 'Opted out', value: campaign.delivery.suppressed }]
                  : []),
                ...(campaign.delivery.queued > 0 ? [{ label: 'Queued', value: campaign.delivery.queued }] : []),
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="eyebrow">{stat.label}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {campaign.status === 'SCHEDULED' && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => cancel.mutate(campaign.id)}
              loading={cancel.isPending && cancel.variables === campaign.id}
            >
              Cancel
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function MessageLog({ eventId }: { eventId: string }) {
  const [page, setPage] = React.useState(1)
  const [status, setStatus] = React.useState('')
  const [q, setQ] = React.useState('')
  const params = { page, pageSize: 25, status: (status || undefined) as never, q: q || undefined }
  const query = useQuery({
    queryKey: keys.eventPart(eventId, 'messages', params),
    queryFn: () =>
      unwrap(api.GET('/api/v1/events/{id}/messages', { params: { path: { id: eventId }, query: params } })),
    placeholderData: (previous) => previous,
  })
  return (
    <div className="space-y-3">
      {query.data && (
        <dl className="bg-border grid grid-cols-3 gap-px overflow-hidden rounded-lg border shadow-xs sm:grid-cols-6">
          {[
            { label: 'Queued', value: query.data.summary.queued },
            { label: 'Sent', value: query.data.summary.sent },
            { label: 'Delivered', value: query.data.summary.delivered },
            { label: 'Opened', value: query.data.summary.opened },
            { label: 'Bounced', value: query.data.summary.bounced },
            { label: 'Failed', value: query.data.summary.failed },
          ].map((stat) => (
            <div key={stat.label} className="bg-card px-4 py-3">
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="text-headline-sm mt-0.5 tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-muted-foreground text-[13px]">
        Every email for this event. Delivery and open counts appear when the email provider reports them.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Filter by recipient"
            placeholder="Recipient email"
            className="pl-9"
            value={q}
            onChange={(changeEvent) => {
              setQ(changeEvent.target.value)
              setPage(1)
            }}
          />
        </div>
        <NativeSelect
          aria-label="Status"
          className="sm:w-44"
          value={status}
          onChange={(changeEvent) => {
            setStatus(changeEvent.target.value)
            setPage(1)
          }}
        >
          <option value="">Any status</option>
          {['QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED', 'SUPPRESSED'].map(
            (value) => (
              <option key={value} value={value}>
                {enumLabel(value)}
              </option>
            ),
          )}
        </NativeSelect>
      </div>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : query.data.items.length === 0 ? (
        <EmptyState compact title="No messages" description="Nothing matches these filters yet." />
      ) : (
        <>
          <div className="bg-card overflow-x-auto rounded-lg border shadow-xs">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-[0.04em] uppercase">
                <tr>
                  <th className="p-3 font-medium">Recipient</th>
                  <th className="p-3 font-medium">Subject</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.data.items.map((message) => (
                  <tr key={message.id} className="hover:bg-brand-soft/40">
                    <td className="p-3 pl-4">{message.toEmail}</td>
                    <td className="max-w-72 truncate p-3">{message.subject}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          message.status === 'FAILED' || message.status === 'BOUNCED'
                            ? 'destructive'
                            : message.status === 'SUPPRESSED'
                              ? 'secondary'
                              : 'outline'
                        }
                        title={message.errorMessage ?? undefined}
                      >
                        {enumLabel(message.status)}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground p-3 whitespace-nowrap">
                      {formatDateTime(message.sentAt ?? message.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  )
}
