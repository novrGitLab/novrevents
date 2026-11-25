'use client'

import { useQuery } from '@tanstack/react-query'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { formatDateTime } from '@/lib/format'

export default function AuditLogsPage() {
  const [action, setAction] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [applied, setApplied] = React.useState({ action: '', from: '', to: '' })
  const [page, setPage] = React.useState(1)
  const params = {
    page,
    pageSize: 50,
    action: applied.action || undefined,
    from: applied.from || undefined,
    to: applied.to || undefined,
  }
  const query = useQuery({
    queryKey: keys.admin('audit', params),
    queryFn: () => unwrap(api.GET('/api/v1/admin/audit-logs', { params: { query: params } })),
    placeholderData: (previous) => previous,
  })

  return (
    <>
      <PageHeader title="Audit log" description="Sensitive operations across the platform, newest first." />
      <form
        className="bg-card mb-4 flex flex-col gap-2 rounded-lg border p-3 shadow-xs lg:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          setApplied({ action: action.trim(), from, to })
          setPage(1)
        }}
      >
        <Input
          aria-label="Action prefix"
          placeholder="Action prefix, e.g. admin. or event.publish"
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
        <Input
          aria-label="From date"
          type="date"
          className="sm:w-44"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          aria-label="To date"
          type="date"
          className="sm:w-44"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
        <Button type="submit">Apply filters</Button>
        {(applied.action || applied.from || applied.to) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAction('')
              setFrom('')
              setTo('')
              setApplied({ action: '', from: '', to: '' })
              setPage(1)
            }}
          >
            Reset
          </Button>
        )}
      </form>
      {query.isPending ? (
        <LoadingState rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState compact title="No entries" description="Nothing matches these filters." />
      ) : (
        <>
          <div className="bg-card overflow-x-auto rounded-lg border shadow-xs">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-[0.04em] uppercase">
                <tr>
                  <th className="p-3 font-medium">Time (UTC)</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">Actor</th>
                  <th className="p-3 font-medium">Target</th>
                  <th className="p-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {query.data.items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-brand-soft/40 align-top">
                    <td className="text-muted-foreground p-3 whitespace-nowrap">
                      {formatDateTime(entry.createdAt, 'UTC')}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={entry.action.startsWith('admin.') ? 'default' : 'secondary'}
                        className="font-mono"
                      >
                        {entry.action}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <p>{entry.actorUsername ? `@${entry.actorUsername}` : entry.actorRole.toLowerCase()}</p>
                      {entry.actorEmail && (
                        <p className="text-muted-foreground text-xs">{entry.actorEmail}</p>
                      )}
                      {entry.ipAddress && <p className="text-muted-foreground text-xs">{entry.ipAddress}</p>}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {entry.targetType && <p>{entry.targetType}</p>}
                      {entry.targetId && <p className="text-muted-foreground">{entry.targetId}</p>}
                    </td>
                    <td className="max-w-80 p-3">
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <details className="group">
                          <summary className="text-primary cursor-pointer text-xs font-medium">Show details</summary>
                          <pre className="bg-muted mt-2 overflow-x-auto rounded-sm border p-2 font-mono text-xs whitespace-pre-wrap">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-subtle-foreground text-xs">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPage={setPage}
          />
        </>
      )}
    </>
  )
}
