'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PageHeader, Pagination } from '@/components/common'
import { NativeSelect } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

type Status = 'NEW' | 'CONTACTED' | 'CLOSED'
export default function PlanningQueue() {
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const query = useQuery({
    queryKey: ['planning', page],
    queryFn: () =>
      unwrap(api.GET('/api/v1/admin/planning-requests', { params: { query: { page, pageSize: 15 } } })),
  })
  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      await ensureCsrfToken()
      return unwrap(
        api.PATCH('/api/v1/admin/planning-requests/{id}', { params: { path: { id } }, body: { status } }),
      )
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['planning'] }),
  })
  return (
    <>
      <PageHeader
        title="Planning requests"
        description="Event briefs and contact details for the planning team."
      />
      {query.isPending && <p role="status">Loading requests…</p>}
      {(query.error || update.error) && <p role="alert">{errorMessage(query.error || update.error)}</p>}
      {query.data && (
        <>
          <div className="divide-y">
            {query.data.items.map((item) => (
              <article key={item.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_10rem]">
                <div>
                  <h2 className="text-lg font-semibold">{item.occasion}</h2>
                  <p>
                    {item.name} ·{' '}
                    <a className="underline" href={'mailto:' + item.email}>
                      {item.email}
                    </a>
                  </p>
                  <p className="text-muted-foreground">
                    {[item.location, item.date, item.guests && item.guests + ' guests']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-2 break-words whitespace-pre-wrap">{item.details}</p>
                </div>
                <NativeSelect
                  aria-label={'Status for ' + item.occasion}
                  disabled={update.isPending}
                  value={item.status}
                  onChange={(e) => update.mutate({ id: item.id, status: e.target.value as Status })}
                >
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="CLOSED">Closed</option>
                </NativeSelect>
              </article>
            ))}
          </div>
          {!query.data.total && <p>No planning requests yet.</p>}
          <Pagination
            page={page}
            total={query.data.total}
            totalPages={query.data.totalPages}
            onPage={setPage}
          />
        </>
      )}
    </>
  )
}
