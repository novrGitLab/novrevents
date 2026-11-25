'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, FileDown, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { BarsChart, TrendChart } from '@/components/charts'
import { Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState, Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, NativeSelect } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { api, toQuery, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatBytes, formatDateTime } from '@/lib/format'

type Submission = Schema<'Submission'>
type Qualification = 'ALL' | 'QUALIFYING' | 'EXCLUDED'

const DECISION_VARIANT = { PENDING: 'warning', ACCEPTED: 'success', DECLINED: 'destructive' } as const

export default function ResponsesPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [qualification, setQualification] = React.useState<Qualification>('ALL')
  const [decision, setDecision] = React.useState<'' | 'PENDING' | 'ACCEPTED' | 'DECLINED'>('')
  const [sort, setSort] = React.useState<'newest' | 'oldest' | 'name'>('newest')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [answerFilter, setAnswerFilter] = React.useState<{ fieldKey: string; fieldValue: string } | null>(
    null,
  )
  const [page, setPage] = React.useState(1)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [open, setOpen] = React.useState<Submission | null>(null)

  const filters = {
    qualification,
    decision: decision || undefined,
    q: search || undefined,
    from: from || undefined,
    to: to || undefined,
    sort,
    fieldKey: answerFilter?.fieldKey,
    fieldValue: answerFilter?.fieldValue,
  }
  const form = useQuery({
    queryKey: keys.form(id),
    queryFn: () => unwrap(api.GET('/api/v1/forms/{id}', { params: { path: { id } } })),
  })
  const list = useQuery({
    queryKey: keys.formPart(id, 'submissions', { ...filters, page }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/forms/{id}/submissions', {
          params: { path: { id }, query: { ...filters, page, pageSize: 25 } },
        }),
      ),
    placeholderData: (previous) => previous,
  })
  const stats = useQuery({
    queryKey: keys.formPart(id, 'stats'),
    queryFn: () => unwrap(api.GET('/api/v1/forms/{id}/submissions/stats', { params: { path: { id } } })),
  })

  const refresh = async () => {
    setSelected(new Set())
    await queryClient.invalidateQueries({ queryKey: keys.form(id) })
  }
  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      unwrap(api.POST('/api/v1/forms/{id}/submissions/delete', { params: { path: { id } }, body: { ids } })),
    onSuccess: async (result) => {
      toast.success(`${result.deleted} response${result.deleted === 1 ? '' : 's'} deleted`)
      setOpen(null)
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const decide = useMutation({
    mutationFn: ({
      submissionId,
      value,
    }: {
      submissionId: string
      value: 'ACCEPTED' | 'DECLINED' | 'PENDING'
    }) =>
      unwrap(
        api.POST('/api/v1/forms/{id}/submissions/{submissionId}/decision', {
          params: { path: { id, submissionId } },
          body: { decision: value },
        }),
      ),
    onSuccess: async (updated) => {
      setOpen(updated)
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const exportUrl = `/api/v1/forms/${id}/submissions/export${toQuery(filters)}`
  const fields = list.data?.fields ?? []
  const columns = fields.slice(0, 3)
  const choiceFields = stats.data?.choices ?? []

  const askDelete = (ids: string[]) =>
    confirm(
      {
        title: `Delete ${ids.length} response${ids.length === 1 ? '' : 's'}?`,
        description:
          'Responses and their uploaded files are deleted permanently. Responses behind active registrations cannot be deleted.',
        confirmLabel: 'Delete',
        destructive: true,
      },
      () => remove.mutateAsync(ids),
    )

  return (
    <>
      <Link
        href={`/dashboard/forms/${id}`}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Form builder
      </Link>
      <div className="mb-6 flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Responses</h1>
          {form.data && <p className="text-muted-foreground mt-1 truncate text-sm">{form.data.title}</p>}
        </div>
        <Button asChild variant="outline">
          <a href={exportUrl}>
            <FileDown /> Export CSV
          </a>
        </Button>
      </div>

      {stats.data && (
        <>
          <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border shadow-xs sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Received', value: stats.data.received, hint: 'All submissions' },
              { label: 'Qualifying', value: stats.data.qualifying, hint: 'Matched no exclusion rule' },
              { label: 'Excluded', value: stats.data.excluded, hint: 'Stored, not counted' },
              { label: 'Accepted', value: stats.data.accepted, hint: `${stats.data.pending} awaiting a decision` },
              {
                label: 'Places left',
                value: stats.data.remaining ?? '∞',
                hint: stats.data.responseLimit ? `Limit ${stats.data.responseLimit}` : 'No limit',
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-card px-5 py-4">
                <dt className="eyebrow">{stat.label}</dt>
                <dd className="text-headline-md mt-1 tabular-nums">{stat.value}</dd>
                <dd className="text-subtle-foreground mt-0.5 text-xs">{stat.hint}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Responses per day (UTC)</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendChart
                  data={stats.data.perDay}
                  xKey="date"
                  series={[
                    { key: 'received', label: 'Received', color: 'var(--chart-3)' },
                    { key: 'qualifying', label: 'Qualifying', color: 'var(--chart-1)' },
                  ]}
                />
              </CardContent>
            </Card>
            {choiceFields[0] && (
              <ChoiceStats
                choices={choiceFields}
                onFilter={(fieldKey, fieldValue) => {
                  setAnswerFilter({ fieldKey, fieldValue })
                  setPage(1)
                }}
              />
            )}
          </div>
        </>
      )}

      <div className="mt-10 space-y-4">
        <Tabs
          value={qualification}
          onValueChange={(value) => {
            setQualification(value as Qualification)
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value="ALL">All received</TabsTrigger>
            <TabsTrigger value="QUALIFYING">Qualifying</TabsTrigger>
            <TabsTrigger value="EXCLUDED">Excluded</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-2 xl:flex-row">
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setSearch(q.trim())
              setPage(1)
            }}
          >
            <label htmlFor="response-search" className="sr-only">
              Search responses
            </label>
            <div className="relative min-w-0 flex-1">
              <Search
                className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                id="response-search"
                type="search"
                placeholder="Search names, emails and answers"
                className="pl-9"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <NativeSelect
              aria-label="Decision"
              className="sm:w-40"
              value={decision}
              onChange={(event) => {
                setDecision(event.target.value as typeof decision)
                setPage(1)
              }}
            >
              <option value="">Any decision</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="DECLINED">Declined</option>
            </NativeSelect>
            <Input
              aria-label="Submitted from"
              type="date"
              className="sm:w-40"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setPage(1)
              }}
            />
            <Input
              aria-label="Submitted to"
              type="date"
              className="sm:w-40"
              value={to}
              onChange={(event) => {
                setTo(event.target.value)
                setPage(1)
              }}
            />
            <NativeSelect
              aria-label="Sort"
              className="sm:w-36"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
            </NativeSelect>
          </div>
        </div>
        {answerFilter && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground text-[13px]">Filtered by answer</span>
            <Badge variant="default">
              {fields.find((field) => field.key === answerFilter.fieldKey)?.label}:{' '}
              {fields
                .find((field) => field.key === answerFilter.fieldKey)
                ?.options.find((option) => option.value === answerFilter.fieldValue)?.label ??
                answerFilter.fieldValue}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => setAnswerFilter(null)}>
              Clear
            </Button>
          </div>
        )}
        {selected.size > 0 && (
          <div className="bg-brand-soft/60 border-brand-soft flex items-center justify-between gap-3 rounded-sm border px-4 py-2 text-sm font-medium tabular-nums">
            {selected.size} selected
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => askDelete([...selected])}
            >
              <Trash2 /> Delete selected
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {list.isPending ? (
          <LoadingState rows={5} />
        ) : list.isError ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            compact
            title="No responses match"
            description={
              qualification === 'EXCLUDED' ? 'Responses that match an exclusion rule appear here.' : undefined
            }
          />
        ) : (
          <>
            <div className="bg-card overflow-x-auto rounded-lg border shadow-xs">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-[0.04em] uppercase">
                  <tr>
                    <th className="w-10 p-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        className="accent-primary size-4"
                        checked={list.data.items.every((item) => selected.has(item.id))}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? new Set(list.data.items.map((item) => item.id))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th className="p-3 font-medium">Respondent</th>
                    {columns.map((field) => (
                      <th key={field.key} className="p-3 font-medium">
                        {field.label}
                      </th>
                    ))}
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.items.map((item) => (
                    <tr key={item.id} className="hover:bg-brand-soft/50">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Select response from ${item.respondentName ?? 'anonymous'}`}
                          className="accent-primary size-4"
                          checked={selected.has(item.id)}
                          onChange={(event) => {
                            const next = new Set(selected)
                            if (event.target.checked) next.add(item.id)
                            else next.delete(item.id)
                            setSelected(next)
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <button
                          className="text-left font-medium hover:underline"
                          onClick={() => setOpen(item)}
                        >
                          {item.respondentName ?? 'Anonymous'}
                        </button>
                        <p className="text-muted-foreground text-xs">
                          {item.respondentEmail ?? (item.isGuest ? 'Guest' : '')}
                        </p>
                      </td>
                      {columns.map((field) => (
                        <td key={field.key} className="max-w-48 truncate p-3">
                          {item.answers.find((answer) => answer.fieldKey === field.key)?.text ?? '—'}
                        </td>
                      ))}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {item.qualification === 'EXCLUDED' ? (
                            <Badge variant="destructive">Excluded</Badge>
                          ) : (
                            <Badge variant={DECISION_VARIANT[item.decision]}>
                              {enumLabel(item.decision)}
                            </Badge>
                          )}
                          {item.registration && <Badge variant="outline">Registration</Badge>}
                        </div>
                      </td>
                      <td className="text-muted-foreground p-3 whitespace-nowrap">
                        {formatDateTime(item.submittedAt)}
                      </td>
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

      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <SubmissionDetail
              formId={id}
              submission={open}
              fields={fields}
              deciding={decide.isPending}
              onDecide={(value) => decide.mutate({ submissionId: open.id, value })}
              onDelete={() => askDelete([open.id])}
            />
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}

function ChoiceStats({
  choices,
  onFilter,
}: {
  choices: Schema<'SubmissionStats'>['choices']
  onFilter: (fieldKey: string, value: string) => void
}) {
  const [key, setKey] = React.useState(choices[0]?.fieldKey ?? '')
  const current = choices.find((choice) => choice.fieldKey === key) ?? choices[0]
  if (!current) return null
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Answers</CardTitle>
        <NativeSelect
          aria-label="Question"
          className="h-8 w-48"
          value={current.fieldKey}
          onChange={(event) => setKey(event.target.value)}
        >
          {choices.map((choice) => (
            <option key={choice.fieldKey} value={choice.fieldKey}>
              {choice.label}
            </option>
          ))}
        </NativeSelect>
      </CardHeader>
      <CardContent>
        <BarsChart
          horizontal
          data={current.options}
          xKey="label"
          series={[{ key: 'count', label: 'Responses', color: 'var(--chart-1)' }]}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {current.options.map((option) => (
            <Button
              key={option.value}
              variant="ghost"
              size="sm"
              onClick={() => onFilter(current.fieldKey, option.value)}
            >
              Show “{option.label}” ({option.count})
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SubmissionDetail({
  formId,
  submission,
  fields,
  deciding,
  onDecide,
  onDelete,
}: {
  formId: string
  submission: Submission
  fields: Array<{ key: string; label: string }>
  deciding: boolean
  onDecide: (value: 'ACCEPTED' | 'DECLINED' | 'PENDING') => void
  onDelete: () => void
}) {
  const labelFor = (key: string) => fields.find((field) => field.key === key)?.label ?? key
  return (
    <>
      <DialogHeader>
        <DialogTitle>{submission.respondentName ?? 'Anonymous response'}</DialogTitle>
        <DialogDescription>
          {submission.respondentEmail ?? 'No email'} · submitted {formatDateTime(submission.submittedAt)} ·
          version {submission.formVersion}
          {submission.isGuest ? ' · guest' : ''}
        </DialogDescription>
      </DialogHeader>
      {submission.qualification === 'EXCLUDED' && (
        <Notice tone="warning" title="Excluded by rules">
          {submission.exclusionReasons.map((reason) => reason.name ?? reason.key).join(', ')}. The respondent
          saw a neutral “received” message.
        </Notice>
      )}
      <dl className="space-y-3">
        {submission.answers.map((answer) => (
          <div key={answer.fieldKey} className="rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs font-medium">{labelFor(answer.fieldKey)}</dt>
            <dd className="mt-1 text-sm whitespace-pre-line">
              {answer.files ? (
                <ul className="space-y-1">
                  {answer.files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/v1/forms/${formId}/submissions/${submission.id}/files/${file.id}`}
                        className="text-primary inline-flex items-center gap-1.5 hover:underline"
                      >
                        <Download className="size-4" /> {file.name}
                      </a>{' '}
                      <span className="text-muted-foreground text-xs">{formatBytes(file.size)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                answer.text
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {submission.registration ? (
          <p className="text-muted-foreground text-sm">
            This response created a registration ({submission.registration.status.toLowerCase()}). Manage it
            from the event’s registrations.
          </p>
        ) : submission.qualification === 'QUALIFYING' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => onDecide('ACCEPTED')}
              disabled={deciding || submission.decision === 'ACCEPTED'}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDecide('DECLINED')}
              disabled={deciding || submission.decision === 'DECLINED'}
            >
              Decline
            </Button>
            {submission.decision !== 'PENDING' && (
              <Button size="sm" variant="ghost" onClick={() => onDecide('PENDING')} disabled={deciding}>
                Reset to pending
              </Button>
            )}
          </div>
        ) : (
          <span />
        )}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </div>
    </>
  )
}
