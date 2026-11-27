'use client'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

export function DraftDescription({ apply }: { apply: (description: string) => void }) {
  const [notes, setNotes] = useState('')
  const config = useQuery({
    queryKey: ['writing-availability'],
    queryFn: () => unwrap(api.GET('/api/v1/event-tools/writing')),
    staleTime: 300000,
  })
  const generate = useMutation({
    mutationFn: async () => {
      await ensureCsrfToken()
      return unwrap(api.POST('/api/v1/event-tools/writing', { body: { notes } }))
    },
  })
  if (!config.data?.available) return null
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">Draft a description from notes</summary>
      <div className="space-y-3 pt-3">
        <label htmlFor="draft-notes" className="block text-sm">
          Event notes for NhaAI
        </label>
        <Textarea
          id="draft-notes"
          value={notes}
          maxLength={1800}
          onChange={(e) => setNotes(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={notes.trim().length < 30}
          loading={generate.isPending}
          onClick={() => generate.mutate()}
        >
          Generate draft
        </Button>
        {generate.isError && <p role="alert">{errorMessage(generate.error)}</p>}
        {generate.data && (
          <>
            <p className="whitespace-pre-line">{generate.data.description}</p>
            <Button type="button" onClick={() => apply(generate.data.description)}>
              Use this description
            </Button>
          </>
        )}
      </div>
    </details>
  )
}
