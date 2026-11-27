'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api/client'
import { PageHeader, Pagination } from '@/components/common'
import { LoadingState, ErrorState } from '@/components/states'
import { NativeSelect } from '@/components/ui/input'

export default function PaymentsPage() {
  const [page, setPage] = useState(1)
  const [outcome, setOutcome] = useState<'RECONCILE' | 'PAID'>('RECONCILE')
  const query = useQuery({
    queryKey: ['admin', 'payments', outcome, page],
    queryFn: () =>
      unwrap(api.GET('/api/v1/admin/payments', { params: { query: { page, pageSize: 20, outcome } } })),
  })
  return (
    <>
      <PageHeader
        title="Ticket payments"
        description="Verified charges and payments that need a settlement decision."
      />
      <NativeSelect
        aria-label="Payment status"
        value={outcome}
        onChange={(e) => {
          setOutcome(e.target.value as typeof outcome)
          setPage(1)
        }}
      >
        <option value="RECONCILE">Needs reconciliation</option>
        <option value="PAID">Ticket issued</option>
      </NativeSelect>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <ul className="divide-y">
            {query.data.items.map((row) => (
              <li className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]" key={row.reference}>
                <div>
                  <strong>{row.title}</strong>
                  <p className="text-sm break-all">{row.reference}</p>
                </div>
                <p>
                  {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
                    row.amountKobo / 100,
                  )}
                </p>
              </li>
            ))}
          </ul>
          {!query.data.total && <p className="py-5">No charges with this status.</p>}
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
