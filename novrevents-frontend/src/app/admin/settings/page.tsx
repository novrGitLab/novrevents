'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
      <div className="grid gap-6 lg:grid-cols-2">
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
      <CardHeader>
        <CardTitle>Platform settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
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
          <Button type="submit" loading={save.isPending}>
            Save configuration
          </Button>
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
        <CardTitle>Event categories</CardTitle>
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
          <Button type="submit" variant="outline" loading={create.isPending}>
            Add
          </Button>
        </form>
        {query.isPending ? (
          <LoadingState rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {query.data.items.map((category) => (
              <li key={category.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="flex-1">{category.name}</span>
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
