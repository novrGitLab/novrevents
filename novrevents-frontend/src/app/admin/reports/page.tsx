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
      <div className="mt-6">
        {query.isPending ? (
          <LoadingState rows={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={Flag}
            compact={status !== 'OPEN'}
            title={status === 'OPEN' ? 'No open reports' : `No ${status.toLowerCase()} reports`}
            description={status === 'OPEN' ? 'Reports from visitors about events appear here.' : undefined}
          />
        ) : (
          <>
            <ul className="bg-card divide-y rounded-lg border shadow-xs">
              {query.data.items.map((report) => (
                <li key={report.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="destructive">{enumLabel(report.reason)}</Badge>
                    <Link href={`/events/${report.event.slug}`} className="hover:text-brand-text text-sm font-semibold">
                      {report.event.title}
                    </Link>
                    {report.event.moderationStatus !== 'CLEAR' && (
                      <Badge variant="secondary">Event {report.event.moderationStatus.toLowerCase()}</Badge>
                    )}
                    <span className="text-muted-foreground ml-auto text-xs whitespace-nowrap">
                      {formatDateTime(report.createdAt)}
                    </span>
                  </div>
                  {report.details && (
                    <blockquote className="border-primary/40 bg-muted/50 mt-3 border-l-2 px-3 py-2 text-sm whitespace-pre-line">
                      {report.details}
                    </blockquote>
                  )}
                  <p className="text-muted-foreground mt-2 text-xs">
                    {report.isAnonymous ? 'Anonymous visitor' : 'Signed-in user'}
                    {report.reporterEmail && ` · contact: ${report.reporterEmail}`}
                  </p>
                  {report.resolutionNote && (
                    <p className="mt-1 text-xs">
                      <span className="font-medium">Moderator note:</span> {report.resolutionNote}
                    </p>
                  )}
                  {report.status === 'OPEN' && (
                    <div className="mt-3 flex flex-wrap gap-2">
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
