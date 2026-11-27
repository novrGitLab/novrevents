'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from '@/components/ui/icons'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, PageHeader } from '@/components/common'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

type Settings = {
  allowSignups: boolean
  requireVerifiedEmailToPublish: boolean
  reportFlagThreshold: number
  maxEventsPublishedPerDay: number
  maxInvitationsPerEventPerDay: number
  supportEmail: string
}

export default function AdminSettingsPage() {
  const query = useQuery({
    queryKey: keys.admin('settings'),
    queryFn: () => unwrap(api.GET('/api/v1/admin/settings')),
  })
  return (
    <>
      <PageHeader
        title="Configuration"
        description="Platform-wide settings. Changes apply within seconds and are recorded in the audit log."
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        {query.isPending ? (
          <LoadingState rows={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <SettingsForm settings={query.data} />
        )}
        <Categories />
      </div>
    </>
  )
}

function SettingsForm({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient()
  const [values, setValues] = React.useState(settings)
  const save = useMutation({
    mutationFn: () => unwrap(api.PATCH('/api/v1/admin/settings', { body: values })),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.admin('settings'), updated)
      toast.success('Configuration saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }))
  const number = (
    key: 'reportFlagThreshold' | 'maxEventsPublishedPerDay' | 'maxInvitationsPerEventPerDay',
    label: string,
    description: string,
  ) => (
    <Field label={label} htmlFor={key} description={description}>
      <Input
        id={key}
        type="number"
        min={0}
        className="max-w-32"
        value={values[key]}
        onChange={(event) => set(key, Number(event.target.value))}
      />
    </Field>
  )
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle>Platform settings</CardTitle>
        <CardDescription>Every change is recorded in the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <div className="space-y-5 p-5">
          <h3 className="eyebrow">Access</h3>
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="allowSignups" className="text-sm font-medium">
                Allow new accounts
              </label>
              <p className="text-muted-foreground text-xs">
                Guests can still submit forms and register for events when this is off.
              </p>
            </div>
            <Switch
              id="allowSignups"
              checked={values.allowSignups}
              onCheckedChange={(checked) => set('allowSignups', checked)}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="requireVerified" className="text-sm font-medium">
                Require a verified email to publish
              </label>
              <p className="text-muted-foreground text-xs">
                Applies to events and forms. Recommended as an abuse safeguard.
              </p>
            </div>
            <Switch
              id="requireVerified"
              checked={values.requireVerifiedEmailToPublish}
              onCheckedChange={(checked) => set('requireVerifiedEmailToPublish', checked)}
            />
          </div>
          </div>
          <div className="space-y-5 border-t p-5">
          <h3 className="eyebrow">Limits</h3>
          {number(
            'reportFlagThreshold',
            'Reports before an event is flagged',
            'Open reports from different reporters.',
          )}
          {number(
            'maxEventsPublishedPerDay',
            'Events one account can publish per day',
            'Limits spam bursts.',
          )}
          {number(
            'maxInvitationsPerEventPerDay',
            'Invitation emails per event per day',
            'Speaker and volunteer invitations.',
          )}
          </div>
          <div className="space-y-5 border-t p-5">
          <h3 className="eyebrow">Support</h3>
          <Field
            label="Support email"
            htmlFor="supportEmail"
            description="Shown to users for help and abuse reports. Leave empty to hide."
          >
            <Input
              id="supportEmail"
              type="email"
              value={values.supportEmail}
              onChange={(event) => set('supportEmail', event.target.value)}
            />
          </Field>
          </div>
          <div className="flex justify-end border-t px-5 py-4">
            <Button type="submit" loading={save.isPending}>
              Save configuration
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Categories() {
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')
  const queryKey = keys.admin('categories')
  const query = useQuery({ queryKey, queryFn: () => unwrap(api.GET('/api/v1/admin/categories')) })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey })
    await queryClient.invalidateQueries({ queryKey: keys.categories })
  }
  const create = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/admin/categories', { body: { name, description: null, sortOrder: 500 } })),
    onSuccess: async () => {
      setName('')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Event categories{' '}
          {query.data && (
            <span className="text-muted-foreground text-sm font-normal tabular-nums">({query.data.items.length})</span>
          )}
        </CardTitle>
        <CardDescription>
          Inactive categories are hidden from organisers and filters; existing events keep them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Input
            aria-label="New category"
            placeholder="New category name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
          <Button type="submit" variant="outline" className="shrink-0" loading={create.isPending}>
            <Plus /> Add
          </Button>
        </form>
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <ul className="-mx-5 -mb-5 divide-y border-t">
            {query.data.items.map((category) => (
              <li key={category.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className={category.isActive ? 'flex-1 font-medium' : 'text-muted-foreground flex-1'}>
                  {category.name}
                  {!category.isActive && <span className="text-subtle-foreground ml-2 text-xs">Hidden</span>}
                </span>
                <span className="text-muted-foreground text-xs">{category.eventCount} events</span>
                <Switch
                  aria-label={`${category.name} active`}
                  checked={category.isActive}
                  onCheckedChange={async (isActive) => {
                    try {
                      await unwrap(
                        api.PATCH('/api/v1/admin/categories/{id}', {
                          params: { path: { id: category.id } },
                          body: { isActive },
                        }),
                      )
                      await refresh()
                    } catch (error) {
                      toast.error(errorMessage(error))
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
