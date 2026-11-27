'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Trash2, UserPlus } from '@/components/ui/icons'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, PageHeader, useConfirm } from '@/components/common'
import { ImageUpload } from '@/components/image-upload'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel } from '@/lib/format'

type Organization = Schema<'Organization'>

export default function OrganizationPage() {
  const { id } = useParams<{ id: string }>()
  const query = useQuery({
    queryKey: keys.organization(id),
    queryFn: () => unwrap(api.GET('/api/v1/organizations/{id}', { params: { path: { id } } })),
  })

  if (query.isPending) return <LoadingState rows={4} />
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const org = query.data
  const isAdmin = org.role === 'OWNER' || org.role === 'ADMIN'

  return (
    <>
      <Link
        href="/dashboard/organizations"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium"
      >
        <ArrowLeft className="size-4" aria-hidden /> Organizations
      </Link>
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-3">
            <Avatar src={org.logoUrl} name={org.name} className="size-11 shrink-0 rounded-sm border" />
            <span className="truncate">{org.name}</span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={org.role === 'OWNER' ? 'default' : 'secondary'}>{enumLabel(org.role)}</Badge>
            {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'} · {org.eventCount}{' '}
            {org.eventCount === 1 ? 'event' : 'events'}
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/o/${org.slug}`}>
                Public page <ExternalLink />
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/dashboard/events?organizationId=${org.id}`}>Events</Link>
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Members org={org} />
        {isAdmin ? (
          <OrganizationSettings org={org} />
        ) : (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-[13px]">
            Owners and admins manage this organization’s profile and members.
          </p>
        )}
      </div>
    </>
  )
}

function Members({ org }: { org: Organization }) {
  const { user } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [username, setUsername] = React.useState('')
  const [role, setRole] = React.useState<'MEMBER' | 'ADMIN'>('MEMBER')
  const membersKey = ['organization', org.id, 'members']
  const members = useQuery({
    queryKey: membersKey,
    queryFn: () =>
      unwrap(api.GET('/api/v1/organizations/{id}/members', { params: { path: { id: org.id } } })),
  })
  const isAdmin = org.role === 'OWNER' || org.role === 'ADMIN'
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey }),
      queryClient.invalidateQueries({ queryKey: keys.organization(org.id) }),
    ])

  const add = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/organizations/{id}/members', {
          params: { path: { id: org.id } },
          body: { username: username.replace(/^@/, ''), role },
        }),
      ),
    onSuccess: async () => {
      setUsername('')
      toast.success('Member added')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const changeRole = async (userId: string, nextRole: 'OWNER' | 'ADMIN' | 'MEMBER') => {
    try {
      await unwrap(
        api.PATCH('/api/v1/organizations/{id}/members/{userId}', {
          params: { path: { id: org.id, userId } },
          body: { role: nextRole },
        }),
      )
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Members{' '}
          {members.data && (
            <span className="text-muted-foreground text-sm font-normal tabular-nums">
              ({members.data.items.length})
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Owners and admins can manage every event and form in this organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <form
            className="bg-muted/60 flex flex-col gap-2 rounded-sm border p-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              add.mutate()
            }}
          >
            <label htmlFor="member-username" className="sr-only">
              Username
            </label>
            <Input
              id="member-username"
              placeholder="Add by username, e.g. ada"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <label htmlFor="member-role" className="sr-only">
              Role
            </label>
            <NativeSelect
              id="member-role"
              className="sm:w-36"
              value={role}
              onChange={(event) => setRole(event.target.value as 'MEMBER' | 'ADMIN')}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </NativeSelect>
            <Button type="submit" loading={add.isPending}>
              <UserPlus /> Add
            </Button>
          </form>
        )}
        {members.isPending ? (
          <LoadingState rows={2} />
        ) : members.isError ? (
          <ErrorState error={members.error} />
        ) : members.data.items.length === 0 ? (
          <EmptyState compact title="No members" />
        ) : (
          <ul className="-mx-5 divide-y border-t">
            {members.data.items.map((member) => {
              const isMe = member.userId === user?.id
              return (
                <li key={member.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Avatar src={member.avatarUrl} name={member.displayName} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.displayName} {isMe && <span className="text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">@{member.username}</p>
                  </div>
                  {isAdmin && !isMe ? (
                    <NativeSelect
                      aria-label={`Role for ${member.displayName}`}
                      className="h-9 w-32"
                      value={member.role}
                      onChange={(event) =>
                        void changeRole(member.userId, event.target.value as 'OWNER' | 'ADMIN' | 'MEMBER')
                      }
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                      {org.role === 'OWNER' && <option value="OWNER">Owner</option>}
                    </NativeSelect>
                  ) : (
                    <Badge variant={member.role === 'OWNER' ? 'default' : 'secondary'}>
                      {enumLabel(member.role)}
                    </Badge>
                  )}
                  {(isAdmin || isMe) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isMe ? 'Leave organization' : `Remove ${member.displayName}`}
                      onClick={() =>
                        confirm(
                          {
                            title: isMe ? 'Leave this organization?' : `Remove ${member.displayName}?`,
                            description: isMe
                              ? 'You will lose access to its events and forms.'
                              : 'They will lose access to this organization’s events and forms.',
                            confirmLabel: isMe ? 'Leave' : 'Remove',
                            destructive: true,
                          },
                          async () => {
                            try {
                              await unwrap(
                                api.DELETE('/api/v1/organizations/{id}/members/{userId}', {
                                  params: { path: { id: org.id, userId: member.userId } },
                                }),
                              )
                              if (isMe) router.push('/dashboard/organizations')
                              else await refresh()
                            } catch (error) {
                              toast.error(errorMessage(error))
                              throw error
                            }
                          },
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      {dialog}
    </Card>
  )
}

function OrganizationSettings({ org }: { org: Organization }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const [name, setName] = React.useState(org.name)
  const [description, setDescription] = React.useState(org.description ?? '')
  const [websiteUrl, setWebsite] = React.useState(org.websiteUrl ?? '')
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH('/api/v1/organizations/{id}', {
          params: { path: { id: org.id } },
          body: { name, description, websiteUrl },
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.organization(org.id), updated)
      toast.success('Organization saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="border-b pb-4">
        <CardTitle>Organization profile</CardTitle>
        <CardDescription>Shown on the public organization page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <ImageUpload<Organization>
          label="Logo"
          currentUrl={org.logoUrl}
          endpoint={`/api/v1/organizations/${org.id}/logo`}
          onUploaded={(updated) => queryClient.setQueryData(keys.organization(org.id), updated)}
        />
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Name" htmlFor="org-name">
            <Input id="org-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Description" htmlFor="org-description">
            <Textarea
              id="org-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field label="Website" htmlFor="org-website">
            <Input
              id="org-website"
              type="url"
              value={websiteUrl}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={save.isPending}>
            Save changes
          </Button>
        </form>
        {org.role === 'OWNER' && (
          <div className="border-destructive/25 bg-destructive/5 rounded-sm border p-4">
            <p className="text-sm font-semibold">Danger zone</p>
            <p className="text-muted-foreground mt-0.5 mb-3 text-[13px]">
              Deleting is only possible when the organization has no events or forms.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() =>
                confirm(
                  {
                    title: 'Delete this organization?',
                    description: 'Only possible when it has no events or forms. This cannot be undone.',
                    confirmLabel: 'Delete',
                    destructive: true,
                  },
                  async () => {
                    try {
                      await unwrap(
                        api.DELETE('/api/v1/organizations/{id}', { params: { path: { id: org.id } } }),
                      )
                      await queryClient.invalidateQueries({ queryKey: keys.organizations })
                      router.push('/dashboard/organizations')
                    } catch (error) {
                      toast.error(errorMessage(error))
                      throw error
                    }
                  },
                )
              }
            >
              <Trash2 /> Delete organization
            </Button>
          </div>
        )}
      </CardContent>
      {dialog}
    </Card>
  )
}
