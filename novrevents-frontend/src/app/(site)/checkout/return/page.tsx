'use client'
import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { safeNextPath } from '@/lib/utils'

function Result() {
  const reference = useSearchParams().get('reference') ?? ''
  const valid = /^nev-[0-9a-f-]{36}$/.test(reference)
  const query = useQuery({
    queryKey: ['payment', reference],
    enabled: valid,
    retry: 1,
    queryFn: async () => {
      await ensureCsrfToken()
      return unwrap(api.POST('/api/v1/payments/{reference}/verify', { params: { path: { reference } } }))
    },
  })
  const paid = query.data?.outcome === 'PAID'
  const review = query.data?.outcome === 'RECONCILE'
  const href =
    typeof window === 'undefined'
      ? '/dashboard/tickets'
      : safeNextPath(sessionStorage.getItem('ticket:' + reference), '/dashboard/tickets')
  return (
    <main className="mx-auto max-w-xl px-5 py-20">
      <h1 className="page-title">
        {paid ? 'Payment received' : review ? 'Payment needs attention' : 'Ticket payment'}
      </h1>
      <p role="status" className="my-6">
        {!valid
          ? 'Open your registration to check your ticket.'
          : paid
            ? 'Your ticket is ready. Open the registration for the QR code and ticket download.'
            : review
              ? 'Your charge was received. Contact the organiser with the payment reference below.'
              : query.isFetching
                ? 'Checking the payment with Paystack…'
                : 'Confirmation is pending. Check again before making another payment.'}
      </p>
      {valid && <p className="mb-5 text-sm break-all">{reference}</p>}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={href}>Open registration</Link>
        </Button>
        {valid && !paid && !review && (
          <Button variant="outline" loading={query.isFetching} onClick={() => void query.refetch()}>
            Check payment
          </Button>
        )}
      </div>
    </main>
  )
}
export default function PaymentReturn() {
  return (
    <Suspense>
      <Result />
    </Suspense>
  )
}
