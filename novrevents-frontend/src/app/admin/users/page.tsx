'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader, Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatDate, relativeTime } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

export default function AdminUsersPage() {
  const { user: me } = useSession()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [q, setQ] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<'' | 'ACTIVE' | 'SUSPENDED'>('')
  const [page, setPage] = React.useState(1)
  const params = { page, pageSize: 25, q: search || undefined, status: status || undefined }
  const query = useQuery({
    queryKey: keys.admin('users', params),
    queryFn: () => unwrap(api.GET('/api/v1/admin/users', { params: { query: params } })),
    placeholderData: (previous) => previous,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })

  return (
    <>
      <PageHeader title="Users" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(q.trim())
            setPage(1)
          }}
        >
          <Input
            aria-label="Search users"
            placeholder="Email, username or name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <NativeSelect
          aria-label="Status"
          className="sm:w-40"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as typeof status)
            setPage(1)
          }}
        >
          <option value="">All users</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </NativeSelect>
      </div>
      {query.isPending ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border">
            {query.data.items.map((user) => (
              <li key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Avatar src={user.avatarUrl} name={user.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {user.displayName}{' '}
                    <Link
                      href={`/u/${user.username}`}
                      className="text-muted-foreground text-sm font-normal hover:underline"
                    >
                      @{user.username}
                    </Link>
                  </p>
                  <p className="text-muted-foreground text-sm">{user.email}</p>
                  <p className="text-muted-foreground text-xs">
                    Joined {formatDate(user.createdAt)} ·{' '}
                    {user.lastLoginAt ? `last seen ${relativeTime(user.lastLoginAt)}` : 'never signed in'} ·{' '}
                    {user.eventCount} events · {user.registrationCount} registrations
                  </p>
                  {user.suspendedReason && (
                    <p className="text-destructive text-xs">Suspended: {user.suspendedReason}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {user.role === 'ADMIN' && <Badge variant="brand">Admin</Badge>}
                  {!user.emailVerified && <Badge variant="warning">Unverified</Badge>}
                  {user.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
                  {user.id !== me?.id && (
                    <>
                      {user.status === 'ACTIVE' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            confirm(
                              {
                                title: `Suspend ${user.displayName}?`,
                                description: `They are signed out everywhere, cannot sign in, and their public events are hidden.${emailDeliveryEnabled ? ' They are emailed the reason.' : ''}`,
                                confirmLabel: 'Suspend',
                                destructive: true,
                                reasonLabel: 'Reason',
                                reasonRequired: true,
                              },
                              async (reason) => {
                                try {
                                  await unwrap(
                                    api.POST('/api/v1/admin/users/{id}/status', {
                                      params: { path: { id: user.id } },
                                      body: { status: 'SUSPENDED', reason },
                                    }),
                                  )
                                  toast.success('User suspended')
                                  await refresh()
                                } catch (error) {
                                  toast.error(errorMessage(error))
                                  throw error
                                }
                              },
                            )
                          }
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await unwrap(
                                api.POST('/api/v1/admin/users/{id}/status', {
                                  params: { path: { id: user.id } },
                                  body: { status: 'ACTIVE', reason: null },
                                }),
                              )
                              toast.success('User reinstated')
                              await refresh()
                            } catch (error) {
                              toast.error(errorMessage(error))
                            }
                          }}
                        >
                          Reinstate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          confirm(
                            {
                              title:
                                user.role === 'ADMIN'
                                  ? `Remove admin access from ${user.displayName}?`
                                  : `Make ${user.displayName} an administrator?`,
                              description:
                                'Administrators can moderate events, suspend users and change platform settings.',
                              confirmLabel: user.role === 'ADMIN' ? 'Remove admin' : 'Make admin',
                            },
                            async () => {
                              try {
                                await unwrap(
                                  api.POST('/api/v1/admin/users/{id}/role', {
                                    params: { path: { id: user.id } },
                                    body: { role: user.role === 'ADMIN' ? 'USER' : 'ADMIN' },
                                  }),
                                )
                                await refresh()
                              } catch (error) {
                                toast.error(errorMessage(error))
                                throw error
                              }
                            },
                          )
                        }
                      >
                        {user.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                      </Button>
                    </>
                  )}
                </div>
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
