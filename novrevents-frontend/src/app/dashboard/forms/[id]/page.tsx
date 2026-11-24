'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  EyeOff,
  GitBranch,
  Inbox,
  LayoutList,
  Rocket,
  Save,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { CopyField, useConfirm } from '@/components/common'
import { FORM_PURPOSE_LABELS } from '@/components/events/labels'
import { toDefinition } from '@/components/forms/builder/model'
import { BuildWorkspace } from '@/components/forms/builder/build-workspace'
import { RuleEditor } from '@/components/forms/builder/rule-editor'
import { SettingsPanel } from '@/components/forms/builder/settings-panel'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage, isApiError, type ErrorDetail } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { validateDefinition, type FormDefinition } from '@/lib/form-engine'
import { formatDateTime } from '@/lib/format'

type FormDetail = Schema<'FormDetail'>

export default function FormBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const query = useQuery({
    queryKey: keys.form(id),
    queryFn: () => unwrap(api.GET('/api/v1/forms/{id}', { params: { path: { id } } })),
  })
  if (query.isPending) return <LoadingState rows={5} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  return <Builder key={query.data.id} form={query.data} />
}

function Builder({ form }: { form: FormDetail }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [definition, setDefinition] = React.useState<FormDefinition>(() => toDefinition(form.definition))
  const [dirty, setDirty] = React.useState(false)
  const [tab, setTab] = React.useState('questions')
  const [problems, setProblems] = React.useState<ErrorDetail[]>([])
  // Keys already present in responses stay fixed so answers line up across versions.
  const [lockedKeys] = React.useState(
    () => new Set(form.counts.received > 0 ? form.definition.fields.map((field) => field.key) : []),
  )

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (next: FormDefinition) => {
    setDefinition(next)
    setDirty(true)
  }
  const localIssues = validateDefinition(definition, { mode: 'draft' })
  const setForm = (updated: FormDetail) => queryClient.setQueryData(keys.form(form.id), updated)

  const saveDraft = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/v1/forms/{id}/draft', { params: { path: { id: form.id } }, body: definition as never }),
      ),
    onSuccess: (updated) => {
      setForm(updated)
      setDirty(false)
      setProblems([])
    },
  })

  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await saveDraft.mutateAsync()
      return unwrap(api.POST('/api/v1/forms/{id}/publish', { params: { path: { id: form.id } } }))
    },
    onSuccess: async (updated) => {
      setForm(updated)
      setProblems([])
      toast.success('Form published')
      await queryClient.invalidateQueries({ queryKey: ['forms'] })
      if (updated.eventId) await queryClient.invalidateQueries({ queryKey: keys.event(updated.eventId) })
    },
    onError: (error) => {
      if (isApiError(error) && error.details.length > 0) setProblems(error.details)
      else toast.error(errorMessage(error))
    },
  })

  const unpublish = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/forms/{id}/unpublish', { params: { path: { id: form.id } } })),
    onSuccess: (updated) => {
      setForm(updated)
      toast.success('Form unpublished. Its link now shows that it is unavailable.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const duplicate = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/forms/{id}/duplicate', { params: { path: { id: form.id } } })),
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: ['forms'] })
      toast.success('Copy created')
      router.push(`/dashboard/forms/${copy.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const statusText =
    form.status === 'PUBLISHED'
      ? form.availability.open
        ? 'Live'
        : form.availability.reason === 'FULL'
          ? 'Live — limit reached'
          : 'Live — closed'
      : form.status === 'UNPUBLISHED'
        ? 'Unpublished'
        : 'Draft'

  const excludeRules = definition.rules.filter((rule) => rule.type === 'EXCLUDE' && rule.enabled).length
  const settingsSummary = (
    <dl className="divide-y rounded-md border text-[13px]">
      {[
        {
          label: 'Response limit',
          value: form.responseLimit
            ? `${form.counts.qualifying} of ${form.responseLimit} qualifying`
            : 'No limit',
          tab: 'settings',
        },
        {
          label: 'Duplicate check',
          value: form.duplicateFieldKeys.length
            ? form.duplicateFieldKeys
                .map((key) => definition.fields.find((field) => field.key === key)?.label ?? key)
                .join(', ')
            : 'Off',
          tab: 'settings',
        },
        {
          label: 'Rules',
          value: definition.rules.length
            ? `${definition.rules.length} (${excludeRules} exclusion${excludeRules === 1 ? '' : 's'})`
            : 'None',
          tab: 'logic',
        },
        { label: 'Acceptance', value: form.autoAccept ? 'Automatic' : 'Reviewed by you', tab: 'settings' },
      ].map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{row.value}</span>
            <button
              type="button"
              className="text-brand-text shrink-0 font-medium hover:underline"
              onClick={() => setTab(row.tab)}
            >
              Edit
            </button>
          </dd>
        </div>
      ))}
    </dl>
  )

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-muted-foreground mb-1 text-[13px]">
            {form.event ? (
              <Link
                href={`/dashboard/events/${form.event.id}/forms`}
                className="hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="size-3.5" /> {form.event.title}
              </Link>
            ) : (
              <Link href="/dashboard/forms" className="hover:text-foreground inline-flex items-center gap-1">
                <ArrowLeft className="size-3.5" /> Forms
              </Link>
            )}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.015em]">{form.title}</h1>
            <Badge variant={form.status === 'PUBLISHED' ? 'success' : 'secondary'}>{statusText}</Badge>
            {dirty && <span className="text-warning text-xs font-medium">Unsaved changes</span>}
          </div>
          <p className="text-muted-foreground mt-0.5 text-[13px]">
            {FORM_PURPOSE_LABELS[form.purpose]}
            {form.isRegistrationForm && ' · registration form for the event'} · {form.counts.received}{' '}
            responses ({form.counts.qualifying} qualifying, {form.counts.excluded} excluded)
            {form.publishedVersion && ` · live version ${form.publishedVersion}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/forms/${form.id}/responses`}>
              <Inbox /> Responses
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              saveDraft.mutate(undefined, {
                onSuccess: () => toast.success('Draft saved'),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
            loading={saveDraft.isPending}
            disabled={!dirty || localIssues.length > 0}
          >
            <Save /> Save draft
          </Button>
          <Button
            size="sm"
            onClick={() => publish.mutate()}
            loading={publish.isPending}
            disabled={
              localIssues.length > 0 || (!dirty && form.status === 'PUBLISHED' && !form.hasUnpublishedChanges)
            }
          >
            <Rocket /> {form.status === 'PUBLISHED' ? 'Publish changes' : 'Publish'}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3 empty:hidden">
        {!dirty && form.hasUnpublishedChanges && (
          <Notice tone="info">
            The draft (version {form.draftVersion}) has changes that are not live yet. Respondents still see
            version {form.publishedVersion}.
          </Notice>
        )}
        {localIssues.length > 0 && (
          <Notice tone="warning" title="Fix these before saving">
            <ul className="list-inside list-disc">
              {localIssues.slice(0, 8).map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          </Notice>
        )}
        {problems.length > 0 && (
          <Notice tone="error" title="The form can’t be published yet">
            <ul className="list-inside list-disc">
              {problems.map((problem, index) => (
                <li key={index}>{problem.message}</li>
              ))}
            </ul>
          </Notice>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-5">
        <TabsList>
          <TabsTrigger value="questions">
            <LayoutList /> Build
          </TabsTrigger>
          <TabsTrigger value="logic">
            <GitBranch /> Logic &amp; exclusions{' '}
            {definition.rules.length > 0 && `(${definition.rules.length})`}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SlidersHorizontal /> Limits &amp; settings
          </TabsTrigger>
          <TabsTrigger value="share">
            <Share2 /> Share
          </TabsTrigger>
        </TabsList>
        <TabsContent value="questions">
          <BuildWorkspace
            title={form.title}
            description={form.description}
            definition={definition}
            onChange={update}
            lockedKeys={lockedKeys}
            hasIssues={localIssues.length > 0}
            settingsSummary={settingsSummary}
          />
        </TabsContent>
        <TabsContent value="logic">
          <div className="mx-auto max-w-4xl">
            <RuleEditor definition={definition} onChange={update} />
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <div className="mx-auto max-w-4xl">
            <SettingsPanel key={form.updatedAt} form={form} />
          </div>
        </TabsContent>
        <TabsContent value="share">
          <SharePanel
            form={form}
            onUnpublish={() => unpublish.mutate()}
            unpublishing={unpublish.isPending}
            onDuplicate={() => duplicate.mutate()}
            duplicating={duplicate.isPending}
            onDelete={() =>
              confirm(
                {
                  title: 'Delete this form?',
                  description: `This permanently deletes the form and all ${form.counts.received} responses, including uploaded files.`,
                  confirmLabel: 'Delete form',
                  destructive: true,
                },
                async () => {
                  try {
                    await unwrap(api.DELETE('/api/v1/forms/{id}', { params: { path: { id: form.id } } }))
                    await queryClient.invalidateQueries({ queryKey: ['forms'] })
                    router.push(form.event ? `/dashboard/events/${form.event.id}/forms` : '/dashboard/forms')
                  } catch (error) {
                    toast.error(errorMessage(error))
                    throw error
                  }
                },
              )
            }
          />
        </TabsContent>
      </Tabs>
      {dialog}
    </>
  )
}

function SharePanel({
  form,
  onUnpublish,
  unpublishing,
  onDuplicate,
  duplicating,
  onDelete,
}: {
  form: FormDetail
  onUnpublish: () => void
  unpublishing: boolean
  onDuplicate: () => void
  duplicating: boolean
  onDelete: () => void
}) {
  const versions = useQuery({
    queryKey: keys.formPart(form.id, 'versions'),
    queryFn: () => unwrap(api.GET('/api/v1/forms/{id}/versions', { params: { path: { id: form.id } } })),
  })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Public link</CardTitle>
          <CardDescription>
            This address never changes. Anyone can respond without an account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CopyField label="Form link" value={form.publicUrl} />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={form.publicUrl} target="_blank" rel="noopener noreferrer">
                Open <ExternalLink />
              </a>
            </Button>
            {form.status === 'PUBLISHED' && (
              <Button variant="outline" size="sm" onClick={onUnpublish} loading={unpublishing}>
                <EyeOff /> Unpublish
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onDuplicate} loading={duplicating}>
              <Copy /> Duplicate
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </Button>
          </div>
          {form.status !== 'PUBLISHED' && (
            <p className="text-muted-foreground text-xs">
              The link shows “not accepting responses” until the form is published.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
          <CardDescription>
            Each publish freezes a version. Responses keep the questions they were answered against.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {versions.isPending ? (
            <LoadingState rows={2} />
          ) : versions.isError ? (
            <ErrorState error={versions.error} />
          ) : (
            <ul className="divide-y text-sm">
              {versions.data.items.map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    Version {version.version} {version.isLive && <Badge variant="success">Live</Badge>}{' '}
                    {!version.publishedAt && <Badge variant="secondary">Draft</Badge>}
                  </span>
                  <span className="text-muted-foreground">
                    {version.fieldCount} questions · {version.submissionCount} responses
                    {version.publishedAt && ` · ${formatDateTime(version.publishedAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
