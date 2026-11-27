'use client'
import { useState, type FormEvent } from 'react'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

export function PlannerForm() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    const value = (name: string) => String(fields.get(name) || '').trim()
    setBusy(true)
    setError('')
    try {
      await ensureCsrfToken()
      await unwrap(
        api.POST('/api/v1/public/planning-requests', {
          body: {
            name: value('name'),
            email: value('email'),
            occasion: value('occasion'),
            location: value('location'),
            date: value('date') || undefined,
            guests: value('guests') ? Number(value('guests')) : undefined,
            details: value('details'),
          },
        }),
      )
      setSent(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  if (sent)
    return (
      <p role="status" className="bg-brand-soft rounded-lg p-5">
        Brief received. The planning team can reach you at the email address you supplied.
      </p>
    )
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Contact name" htmlFor="name" required>
        <Input id="name" name="name" autoComplete="name" minLength={2} maxLength={100} required />
      </Field>
      <Field label="Email address" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" maxLength={254} required />
      </Field>
      <Field label="What’s the occasion?" htmlFor="occasion" required>
        <Input id="occasion" name="occasion" minLength={2} maxLength={100} required />
      </Field>
      <Field label="City or venue" htmlFor="location" required>
        <Input id="location" name="location" minLength={2} maxLength={160} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event date (optional)" htmlFor="date">
          <Input id="date" name="date" type="date" />
        </Field>
        <Field label="Guest count (optional)" htmlFor="guests">
          <Input id="guests" name="guests" type="number" min={1} max={100000} />
        </Field>
      </div>
      <Field label="What would you like help with?" htmlFor="details" required>
        <Textarea id="details" name="details" minLength={10} maxLength={2000} required />
      </Field>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy}>
        Send planning brief
      </Button>
    </form>
  )
}
