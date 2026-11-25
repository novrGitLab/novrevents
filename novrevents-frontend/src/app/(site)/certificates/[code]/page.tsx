'use client'

import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Download, ShieldX } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { formatDate } from '@/lib/format'

export default function CertificateVerificationPage() {
  const { code } = useParams<{ code: string }>()
  const query = useQuery({
    queryKey: ['certificate', code],
    queryFn: () => unwrap(api.GET('/api/v1/public/certificates/{code}', { params: { path: { code } } })),
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="page-title">Certificate verification</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Verification ID: <span className="font-mono">{decodeURIComponent(code).toUpperCase()}</span>
      </p>
      <div className="mt-6">
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          isApiError(query.error) && query.error.status === 404 ? (
            <div className="border-destructive/30 bg-destructive/5 rounded-lg border p-6">
              <ShieldX className="text-destructive size-8" aria-hidden />
              <p className="mt-3 text-lg font-semibold">No certificate with this ID exists</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Check the ID printed at the bottom of the certificate.
              </p>
            </div>
          ) : (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          )
        ) : (
          <div
            className={`rounded-lg border p-6 ${query.data.valid ? 'border-success/40 bg-success/5' : 'border-destructive/30 bg-destructive/5'}`}
          >
            {query.data.valid ? (
              <BadgeCheck className="text-success size-8" aria-hidden />
            ) : (
              <ShieldX className="text-destructive size-8" aria-hidden />
            )}
            <p className="mt-3 text-lg font-semibold">
              {query.data.valid ? 'This certificate is valid' : 'This certificate has been revoked'}
            </p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Awarded to</dt>
              <dd className="font-medium">{query.data.recipientName}</dd>
              <dt className="text-muted-foreground">Certificate</dt>
              <dd>{query.data.title}</dd>
              <dt className="text-muted-foreground">Event</dt>
              <dd>
                <Link href={`/events/${query.data.eventSlug}`} className="hover:underline">
                  {query.data.eventName}
                </Link>{' '}
                · {query.data.eventDateText}
              </dd>
              <dt className="text-muted-foreground">Issued by</dt>
              <dd>{query.data.issuerName}</dd>
              <dt className="text-muted-foreground">Issued on</dt>
              <dd>{formatDate(query.data.issuedAt)}</dd>
              {query.data.revokedAt && (
                <>
                  <dt className="text-muted-foreground">Revoked on</dt>
                  <dd>{formatDate(query.data.revokedAt)}</dd>
                </>
              )}
            </dl>
            {query.data.valid && (
              <Button asChild variant="outline" className="mt-6">
                <a
                  href={`/api/v1/public/certificates/${encodeURIComponent(query.data.verificationCode)}/pdf`}
                >
                  <Download /> Download PDF
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
