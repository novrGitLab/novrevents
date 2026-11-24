'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader, Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatDate } from '@/lib/format'

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const params = { page, pageSize: 25, q: search || undefined }
  const query = useQuery({
    queryKey: keys.admin('organizations', params),
    queryFn: () => unwrap(api.GET('/api/v1/admin/organizations', { params: { query: params } })),
  })

  const setStatus = (id: string, name: string, status: 'ACTIVE' | 'SUSPENDED') =>
    confirm(
      {
        title: status === 'SUSPENDED' ? `Suspend ${name}?` : `Reinstate ${name}?`,
        description:
          status === 'SUSPENDED'
            ? 'Its events disappear from public listings and members cannot publish under it.'
            : undefined,
        confirmLabel: status === 'SUSPENDED' ? 'Suspend' : 'Reinstate',
        destructive: status === 'SUSPENDED',
      },
      async () => {
        try {
          await unwrap(
            api.POST('/api/v1/admin/organizations/{id}/status', {
              params: { path: { id } },
              body: { status },
            }),
          )
          await queryClient.invalidateQueries({ queryKey: ['admin', 'organizations'] })
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    )

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every organization on the platform, with its members and events."
      />
      <form
        className="mb-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(q.trim())
          setPage(1)
        }}
      >
        <Input
          aria-label="Search organizations"
          placeholder="Name"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {query.isPending ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="No organizations" />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border">
            {query.data.items.map((org) => (
              <li key={org.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/o/${org.slug}`} className="font-medium hover:underline">
                    {org.name}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {org.memberCount} members · {org.eventCount} events · created {formatDate(org.createdAt)}
                  </p>
                </div>
                {org.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setStatus(org.id, org.name, org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
                  }
                >
                  {org.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                </Button>
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
      {dialog}
    </>
  )
}
