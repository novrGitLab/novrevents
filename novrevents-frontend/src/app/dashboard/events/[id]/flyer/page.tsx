'use client'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { useManagedEvent } from '@/components/events/event-context'
import { EventFlyer, flyerStyles, type FlyerData } from '@/components/events/flyer'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

export default function FlyerStudio() {
  const { event } = useManagedEvent()
  const query = useQuery({
    queryKey: ['flyer', event.id],
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/flyer', { params: { path: { id: event.id } } })),
  })
  if (!query.data) return <p role="status">{query.error ? errorMessage(query.error) : 'Loading flyer…'}</p>
  return <Editor key={event.id} initial={query.data} />
}
function Editor({ initial }: { initial: FlyerData }) {
  const { event } = useManagedEvent()
  const [draft, setDraft] = useState(initial)
  const [shared, setShared] = useState(initial.shared)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const canShare = event.visibility === 'PUBLIC' && ['PUBLISHED', 'ONGOING'].includes(event.status)
  async function save() {
    setBusy(true)
    setMessage('')
    try {
      await ensureCsrfToken()
      const { style, photograph, headline, note } = draft
      const saved = await unwrap(
        api.PUT('/api/v1/events/{id}/flyer', {
          params: { path: { id: event.id } },
          body: { style, photograph, headline, note, shared: canShare && draft.shared },
        }),
      )
      setShared(saved.shared)
      setMessage('Flyer saved.')
    } catch (e) {
      setMessage(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section>
      <h2 className="text-2xl font-semibold">Flyer studio</h2>
      <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)]">
        <EventFlyer data={draft} />
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <Field label="Template" htmlFor="template">
            <NativeSelect
              id="template"
              value={draft.style}
              onChange={(e) => setDraft({ ...draft, style: e.target.value as FlyerData['style'] })}
            >
              {Object.entries(flyerStyles).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Photography" htmlFor="flyer-photo"><NativeSelect id="flyer-photo" value={draft.photograph} onChange={(e)=>setDraft({...draft,photograph:e.target.value as FlyerData['photograph']})}>
            {Object.entries({none:'Type only',opening:'Live music',culture:'Gallery opening',workshop:'Print workshop',cyber:'Conference',wedding:'Wedding reception',anniversary:'Anniversary lunch',community:'Community lunch'}).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </NativeSelect></Field>
          <Field label="Headline" htmlFor="headline">
            <Input
              id="headline"
              maxLength={110}
              required
              value={draft.headline}
              onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
            />
          </Field>
          <Field label="Additional line" htmlFor="note">
            <Textarea
              id="note"
              value={draft.note}
              maxLength={160}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </Field>
          {canShare ? (
            <label>
              <input
                type="checkbox"
                checked={draft.shared}
                onChange={(e) => setDraft({ ...draft, shared: e.target.checked })}
              />{' '}
              Enable public flyer link
            </label>
          ) : (
            <p>Publish a public event to enable its shareable flyer.</p>
          )}
          <Button loading={busy} type="submit">
            Save design
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print or save PDF
          </Button>
          {shared && canShare && (
            <Link className="underline" href={'/events/' + event.slug + '/flyer'}>
              Open public flyer
            </Link>
          )}
          <p role="status">{message}</p>
        </form>
      </div>
    </section>
  )
}
