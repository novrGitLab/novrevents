'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { browserTimeZone, fromLocalInput, toLocalInput } from '@/lib/format'

type FormDetail = Schema<'FormDetail'>

export function SettingsPanel({ form }: { form: FormDetail }) {
  const queryClient = useQueryClient()
  const zone = browserTimeZone()
  const [title, setTitle] = React.useState(form.title)
  const [description, setDescription] = React.useState(form.description ?? '')
  const [closesAt, setClosesAt] = React.useState(toLocalInput(form.closesAt, zone))
  const [responseLimit, setLimit] = React.useState(form.responseLimit ? String(form.responseLimit) : '')
  const [duplicateFieldKeys, setDuplicates] = React.useState<string[]>(form.duplicateFieldKeys)
  const [autoAccept, setAutoAccept] = React.useState(form.autoAccept)
  const [confirmationMessage, setConfirmation] = React.useState(form.confirmationMessage ?? '')
  const [sendConfirmationEmail, setSendEmail] = React.useState(form.sendConfirmationEmail)
  const [retentionDays, setRetention] = React.useState(form.retentionDays ? String(form.retentionDays) : '')

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH('/api/v1/forms/{id}', {
          params: { path: { id: form.id } },
          body: {
            title,
            description: description || null,
            closesAt: closesAt ? fromLocalInput(closesAt, zone) : null,
            responseLimit: responseLimit ? Number(responseLimit) : null,
            duplicateFieldKeys,
            autoAccept,
            confirmationMessage: confirmationMessage || null,
            sendConfirmationEmail,
            retentionDays: retentionDays ? Number(retentionDays) : null,
          },
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.form(form.id), updated)
      toast.success('Settings saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const candidateFields = form.definition.fields.filter((field) => field.type !== 'FILE')

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Form details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Title" htmlFor="s-title" required>
            <Input
              id="s-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </Field>
          <Field label="Introduction" htmlFor="s-description">
            <Textarea
              id="s-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits and closing</CardTitle>
          <CardDescription>These apply immediately, without republishing.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Close automatically at (${zone})`}
            htmlFor="s-closes"
            description="Leave empty to keep the form open."
          >
            <Input
              id="s-closes"
              type="datetime-local"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
            />
          </Field>
          <Field
            label="Response limit"
            htmlFor="s-limit"
            description={`Counts qualifying responses only (currently ${form.counts.qualifying}). Excluded responses never use a place. Enforced even under simultaneous submissions.`}
          >
            <Input
              id="s-limit"
              inputMode="numeric"
              value={responseLimit}
              onChange={(event) => setLimit(event.target.value.replace(/\D/g, ''))}
              placeholder="No limit"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Duplicate responses</CardTitle>
          <CardDescription>
            Reject a response when its answers to these questions match an earlier one (case and spacing are
            ignored).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidateFields.length === 0 ? (
            <p className="text-muted-foreground text-sm">Add questions first.</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {candidateFields.map((field) => (
                <label key={field.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={duplicateFieldKeys.includes(field.key)}
                    disabled={!duplicateFieldKeys.includes(field.key) && duplicateFieldKeys.length >= 5}
                    onChange={(event) =>
                      setDuplicates(
                        event.target.checked
                          ? [...duplicateFieldKeys, field.key]
                          : duplicateFieldKeys.filter((key) => key !== field.key),
                      )
                    }
                  />
                  {field.label}
                </label>
              ))}
            </div>
          )}
          {form.hasUnpublishedChanges && (
            <p className="text-muted-foreground mt-2 text-xs">
              Duplicate checks use the questions of the published version.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>After someone responds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <label htmlFor="s-auto" className="text-sm font-medium">
                Accept qualifying responses automatically
              </label>
              <p className="text-muted-foreground text-xs">
                {form.isRegistrationForm
                  ? 'When off, registrations wait for your approval and no ticket is issued until you approve.'
                  : 'When off, responses wait for you to accept or decline them.'}
              </p>
            </div>
            <Switch id="s-auto" checked={autoAccept} onCheckedChange={setAutoAccept} />
          </div>
          <Field
            label="Confirmation message"
            htmlFor="s-confirmation"
            description="Shown only to respondents whose response is accepted. Everyone else sees a neutral “received” message."
          >
            <Textarea
              id="s-confirmation"
              value={confirmationMessage}
              onChange={(event) => setConfirmation(event.target.value)}
              maxLength={1000}
            />
          </Field>
          {!form.isRegistrationForm && (
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor="s-email" className="text-sm font-medium">
                  Email a receipt
                </label>
                <p className="text-muted-foreground text-xs">
                  Sent to the respondent email question, confirming receipt only.
                </p>
              </div>
              <Switch id="s-email" checked={sendConfirmationEmail} onCheckedChange={setSendEmail} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data retention</CardTitle>
          <CardDescription>
            Responses older than this are deleted automatically, including uploaded files. Responses behind
            active registrations are kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Keep responses for (days)" htmlFor="s-retention">
            <Input
              id="s-retention"
              inputMode="numeric"
              className="max-w-40"
              value={retentionDays}
              onChange={(event) => setRetention(event.target.value.replace(/\D/g, ''))}
              placeholder="Forever"
            />
          </Field>
          {retentionDays && (
            <Notice tone="warning" className="mt-3">
              Deletion is permanent. Export anything you need to keep.
            </Notice>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  )
}
