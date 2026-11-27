'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from '@/components/ui/icons'
import Link from 'next/link'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader, Pagination, useConfirm } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/input'
import { PayoutAccount } from '@/components/admin/payout-account'
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { cn } from '@/lib/utils'
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
      <PageHeader
        title="Users"
        description={
          query.data
            ? `${query.data.total} account${query.data.total === 1 ? '' : 's'}. Suspended people cannot sign in and their public events are hidden.`
            : 'Every account on NOVR Events.'
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form
          className="flex flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setSearch(q.trim())
            setPage(1)
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search users"
              placeholder="Email, username or name"
              className="pl-9"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>
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
        <EmptyState compact title="No users found" description="Try another search or status." />
      ) : (
        <>
          <ul className="bg-card divide-y rounded-lg border shadow-xs">
            {query.data.items.map((user) => (
              <li
                key={user.id}
                className={cn(
                  'flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center',
                  user.status === 'SUSPENDED' && 'bg-destructive/[0.03]',
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Avatar src={user.avatarUrl} name={user.displayName} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                      {user.displayName}
                      <Link
                        href={`/u/${user.username}`}
                        className="text-muted-foreground hover:text-brand-text text-[13px] font-normal"
                      >
                        @{user.username}
                      </Link>
                      {user.role === 'ADMIN' && <Badge variant="brand">Admin</Badge>}
                      {!user.emailVerified && <Badge variant="warning">Unverified</Badge>}
                      {user.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
                    </p>
                    <p className="text-muted-foreground truncate text-[13px]">{user.email}</p>
                    {user.suspendedReason && (
                      <p className="text-destructive mt-0.5 text-xs">Reason: {user.suspendedReason}</p>
                    )}
                  </div>
                </div>
                <dl className="text-muted-foreground grid grid-cols-2 gap-3 pl-12 text-xs sm:grid-cols-4 sm:gap-4 lg:w-[360px] lg:shrink-0 lg:pl-0">
                  <div>
                    <dt className="eyebrow">Joined</dt>
                    <dd className="text-foreground mt-0.5 whitespace-nowrap">{formatDate(user.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Last seen</dt>
                    <dd className="text-foreground mt-0.5 whitespace-nowrap">
                      {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'Never'}
                    </dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Events</dt>
                    <dd className="text-foreground mt-0.5 tabular-nums">{user.eventCount}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Regs.</dt>
                    <dd className="text-foreground mt-0.5 tabular-nums">{user.registrationCount}</dd>
                  </div>
                </dl>
                <div className="flex flex-wrap items-center gap-2 pl-12 lg:w-[220px] lg:shrink-0 lg:justify-end lg:pl-0">
                  <PayoutAccount id={user.id} name={user.displayName} />
                  {user.id === me?.id && <span className="text-muted-foreground text-xs">This is you</span>}
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
