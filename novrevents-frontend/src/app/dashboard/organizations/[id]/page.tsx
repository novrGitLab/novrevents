'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Trash2, UserPlus } from 'lucide-react'
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
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel } from '@/lib/format'

type Organization = Schema<'Organization'>

export default function OrganizationPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
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
      <PageHeader
        title={org.name}
        description={`You are ${org.role === 'MEMBER' ? 'a member' : `an ${org.role.toLowerCase()}`} of this organization.`}
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
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Members org={org} />
        <div className="space-y-6">
          {isAdmin && (
            <Card>
              <CardContent className="pt-5">
                <ImageUpload<Organization>
                  label="Logo"
                  currentUrl={org.logoUrl}
                  endpoint={`/api/v1/organizations/${org.id}/logo`}
                  onUploaded={(updated) => queryClient.setQueryData(keys.organization(id), updated)}
                />
              </CardContent>
            </Card>
          )}
          {isAdmin && <OrganizationSettings org={org} />}
        </div>
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
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Owners and admins can manage every event and form in this organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdmin && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
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
              placeholder="Username"
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
          <EmptyState title="No members" />
        ) : (
          <ul className="divide-y">
            {members.data.items.map((member) => {
              const isMe = member.userId === user?.id
              return (
                <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar src={member.avatarUrl} name={member.displayName} />
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
                    <span className="text-muted-foreground text-sm capitalize">{enumLabel(member.role)}</span>
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
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent>
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
            Save
          </Button>
        </form>
        {org.role === 'OWNER' && (
          <div className="mt-6 border-t pt-4">
            <Button
              variant="outline"
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
