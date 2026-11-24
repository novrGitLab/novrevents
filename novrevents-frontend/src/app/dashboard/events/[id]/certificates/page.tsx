'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, ExternalLink, FileText } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, useConfirm } from '@/components/common'
import { useManagedEvent } from '@/components/events/event-context'
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatDate } from '@/lib/format'

type Template = Schema<'CertificateTemplate'>

export default function CertificatesPage() {
  const { event } = useManagedEvent()
  const template = useQuery({
    queryKey: keys.eventPart(event.id, 'certificate-template'),
    queryFn: () =>
      unwrap(api.GET('/api/v1/events/{id}/certificates/template', { params: { path: { id: event.id } } })),
  })
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {template.isPending ? (
        <LoadingState rows={3} />
      ) : template.isError ? (
        <ErrorState error={template.error} />
      ) : (
        <TemplateEditor eventId={event.id} template={template.data} />
      )}
      <Issued eventId={event.id} draft={event.status === 'DRAFT'} />
    </div>
  )
}

function TemplateEditor({ eventId, template }: { eventId: string; template: Template }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState(template.title)
  const [body, setBody] = React.useState(template.body)
  const [issuerName, setIssuer] = React.useState(template.issuerName)
  const [signatoryName, setSignatory] = React.useState(template.signatoryName ?? '')
  const [signatoryTitle, setSignatoryTitle] = React.useState(template.signatoryTitle ?? '')
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/v1/events/{id}/certificates/template', {
          params: { path: { id: eventId } },
          body: {
            title,
            body,
            issuerName: issuerName || null,
            signatoryName: signatoryName || null,
            signatoryTitle: signatoryTitle || null,
          },
        }),
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.eventPart(eventId, 'certificate-template'), saved)
      toast.success('Template saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate template</CardTitle>
        <CardDescription>
          Use <code className="bg-muted rounded px-1">{'{{participant_name}}'}</code>,{' '}
          <code className="bg-muted rounded px-1">{'{{event_name}}'}</code> and{' '}
          <code className="bg-muted rounded px-1">{'{{event_date}}'}</code>. Issued certificates keep the text
          they were issued with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Title" htmlFor="ct-title" required>
            <Input
              id="ct-title"
              value={title}
              onChange={(changeEvent) => setTitle(changeEvent.target.value)}
              required
              minLength={3}
              maxLength={80}
            />
          </Field>
          <Field label="Text" htmlFor="ct-body" required>
            <Textarea
              id="ct-body"
              value={body}
              onChange={(changeEvent) => setBody(changeEvent.target.value)}
              required
              minLength={10}
              maxLength={600}
            />
          </Field>
          <Field label="Issued by" htmlFor="ct-issuer">
            <Input
              id="ct-issuer"
              value={issuerName}
              onChange={(changeEvent) => setIssuer(changeEvent.target.value)}
              maxLength={120}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Signatory name" htmlFor="ct-signatory">
              <Input
                id="ct-signatory"
                value={signatoryName}
                onChange={(changeEvent) => setSignatory(changeEvent.target.value)}
                maxLength={120}
              />
            </Field>
            <Field label="Signatory title" htmlFor="ct-signatory-title">
              <Input
                id="ct-signatory-title"
                value={signatoryTitle}
                onChange={(changeEvent) => setSignatoryTitle(changeEvent.target.value)}
                maxLength={120}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={save.isPending}>
              Save template
            </Button>
            <Button asChild variant="outline">
              <a
                href={`/api/v1/events/${eventId}/certificates/preview`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText /> Preview PDF
              </a>
            </Button>
          </div>
          {!template.isSaved && (
            <p className="text-muted-foreground text-xs">
              Showing the default template. It is used as-is if you issue without saving.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function Issued({ eventId, draft }: { eventId: string; draft: boolean }) {
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [sendEmail, setSendEmail] = React.useState(true)
  const queryKey = keys.eventPart(eventId, 'certificates')
  const list = useQuery({
    queryKey,
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/certificates', { params: { path: { id: eventId } } })),
  })
  const issue = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/events/{id}/certificates/issue', {
          params: { path: { id: eventId } },
          body: { mode: 'attended', registrationIds: [], sendEmail },
        }),
      ),
    onSuccess: async (result) => {
      toast.success(
        result.issued > 0 ? `${result.issued} certificates issued` : 'No new attendees to issue to',
      )
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Issued certificates</CardTitle>
        <CardDescription>
          Issue to everyone who checked in. To authorise someone who did not check in, use the registrations
          list.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft ? (
          <Notice tone="warning">Publish the event before issuing certificates.</Notice>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => issue.mutate()}
              loading={issue.isPending}
              disabled={!list.data || list.data.eligibleAttendees === 0}
            >
              <Award /> Issue to {list.data?.eligibleAttendees ?? 0} checked-in attendees
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={sendEmail}
                onChange={(changeEvent) => setSendEmail(changeEvent.target.checked)}
              />{' '}
              Email each certificate
            </label>
          </div>
        )}
        {!draft && <IssueToSelected eventId={eventId} sendEmail={sendEmail} />}
        {list.isPending ? (
          <LoadingState rows={2} />
        ) : list.isError ? (
          <ErrorState error={list.error} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Award} title="No certificates issued yet" />
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {list.data.items.map((certificate) => (
              <li key={certificate.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{certificate.recipientName}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    {certificate.verificationCode} · {formatDate(certificate.issuedAt)}
                  </p>
                </div>
                {certificate.revokedAt ? (
                  <Badge variant="destructive">Revoked</Badge>
                ) : (
                  <>
                    <Button asChild variant="ghost" size="sm">
                      <a href={certificate.verifyUrl} target="_blank" rel="noopener noreferrer">
                        Verify <ExternalLink />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        confirm(
                          {
                            title: `Revoke ${certificate.recipientName}’s certificate?`,
                            description: 'The verification page will show it as revoked.',
                            confirmLabel: 'Revoke',
                            destructive: true,
                            reasonLabel: 'Reason (optional)',
                          },
                          async (reason) => {
                            try {
                              await unwrap(
                                api.POST('/api/v1/events/{id}/certificates/{certificateId}/revoke', {
                                  params: { path: { id: eventId, certificateId: certificate.id } },
                                  body: { reason: reason || null },
                                }),
                              )
                              await queryClient.invalidateQueries({ queryKey })
                            } catch (error) {
                              toast.error(errorMessage(error))
                              throw error
                            }
                          },
                        )
                      }
                    >
                      Revoke
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {dialog}
    </Card>
  )
}

/** Organiser authorisation: issue to confirmed attendees chosen by name, whether or not they checked in. */
function IssueToSelected({ eventId, sendEmail }: { eventId: string; sendEmail: boolean }) {
  const queryClient = useQueryClient()
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const results = useQuery({
    queryKey: keys.eventPart(eventId, 'registrations', { q: search, status: 'CONFIRMED', cert: true }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/events/{id}/registrations', {
          params: {
            path: { id: eventId },
            query: { q: search, status: 'CONFIRMED', page: 1, pageSize: 20, sort: 'name' },
          },
        }),
      ),
    enabled: search.length >= 2,
  })
  const issue = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/events/{id}/certificates/issue', {
          params: { path: { id: eventId } },
          body: { mode: 'selected', registrationIds: [...picked], sendEmail },
        }),
      ),
    onSuccess: async (result) => {
      toast.success(
        `${result.issued} certificate${result.issued === 1 ? '' : 's'} issued${result.skipped ? ` (${result.skipped} already had one)` : ''}`,
      )
      setPicked(new Set())
      await queryClient.invalidateQueries({ queryKey: keys.eventPart(eventId, 'certificates') })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Issue to specific attendees</summary>
      <div className="mt-3 space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(formEvent) => {
            formEvent.preventDefault()
            setSearch(q.trim())
          }}
        >
          <Input
            aria-label="Find attendee"
            placeholder="Search confirmed attendees"
            value={q}
            onChange={(changeEvent) => setQ(changeEvent.target.value)}
          />
          <Button type="submit" variant="outline">
            Find
          </Button>
        </form>
        {results.data?.items.map((registration) => (
          <label key={registration.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={picked.has(registration.id)}
              onChange={(changeEvent) => {
                const next = new Set(picked)
                if (changeEvent.target.checked) next.add(registration.id)
                else next.delete(registration.id)
                setPicked(next)
              }}
            />
            {registration.attendeeName}{' '}
            <span className="text-muted-foreground">
              {registration.checkedInAt ? '· checked in' : '· not checked in'}
            </span>
          </label>
        ))}
        {picked.size > 0 && (
          <Button size="sm" onClick={() => issue.mutate()} loading={issue.isPending}>
            Issue to {picked.size} selected
          </Button>
        )}
      </div>
    </details>
  )
}
