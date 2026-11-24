'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader, Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel, formatDateTime } from '@/lib/format'

type Status = 'OPEN' | 'RESOLVED' | 'DISMISSED'

export default function AdminReportsPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [status, setStatus] = React.useState<Status>('OPEN')
  const [page, setPage] = React.useState(1)
  const params = { page, pageSize: 25, status }
  const query = useQuery({
    queryKey: keys.admin('reports', params),
    queryFn: () => unwrap(api.GET('/api/v1/admin/reports', { params: { query: params } })),
  })

  const resolve = (reportId: string, next: 'RESOLVED' | 'DISMISSED') =>
    confirm(
      {
        title: next === 'RESOLVED' ? 'Mark this report as resolved?' : 'Dismiss this report?',
        confirmLabel: next === 'RESOLVED' ? 'Resolve' : 'Dismiss',
        reasonLabel: 'Note (optional)',
      },
      async (note) => {
        try {
          await unwrap(
            api.POST('/api/v1/admin/reports/{id}/resolve', {
              params: { path: { id: reportId } },
              body: { status: next, note: note || null },
            }),
          )
          await queryClient.invalidateQueries({ queryKey: ['admin'] })
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    )

  return (
    <>
      <PageHeader
        title="Reports"
        description="Abuse reports from users and visitors. To remove an event, use the Events page."
      />
      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value as Status)
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="OPEN">Open</TabsTrigger>
          <TabsTrigger value="RESOLVED">Resolved</TabsTrigger>
          <TabsTrigger value="DISMISSED">Dismissed</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-4">
        {query.isPending ? (
          <LoadingState rows={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={Flag} title={status === 'OPEN' ? 'No open reports' : 'Nothing here'} />
        ) : (
          <>
            <ul className="space-y-3">
              {query.data.items.map((report) => (
                <li key={report.id} className="bg-card rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{enumLabel(report.reason)}</Badge>
                    <Link href={`/events/${report.event.slug}`} className="font-medium hover:underline">
                      {report.event.title}
                    </Link>
                    <Badge variant="outline">Event {report.event.moderationStatus.toLowerCase()}</Badge>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDateTime(report.createdAt)}
                    </span>
                  </div>
                  {report.details && <p className="mt-2 text-sm whitespace-pre-line">{report.details}</p>}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {report.isAnonymous ? 'Anonymous visitor' : 'Signed-in user'}
                    {report.reporterEmail && ` · contact: ${report.reporterEmail}`}
                  </p>
                  {report.resolutionNote && <p className="mt-1 text-xs">Note: {report.resolutionNote}</p>}
                  {report.status === 'OPEN' && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => resolve(report.id, 'RESOLVED')}>
                        Resolve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolve(report.id, 'DISMISSED')}>
                        Dismiss
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/events?q=${encodeURIComponent(report.event.title)}`}>
                          Moderate event
                        </Link>
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              onPage={setPage}
            />
          </>
        )}
      </div>
      {dialog}
    </>
  )
}
