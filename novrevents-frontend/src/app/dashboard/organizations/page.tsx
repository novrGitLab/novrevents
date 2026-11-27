'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronRight, Plus } from '@/components/ui/icons'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, PageHeader } from '@/components/common'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { enumLabel } from '@/lib/format'

export default function OrganizationsPage() {
  const [open, setOpen] = React.useState(false)
  const query = useQuery({
    queryKey: keys.organizations,
    queryFn: () => unwrap(api.GET('/api/v1/organizations')),
  })
  return (
    <>
      <PageHeader
        title="Organizations"
        description="Optional shared workspaces for teams that run events together. You can organise events on your own without one."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> New organization
          </Button>
        }
      />
      {query.isPending ? (
        <LoadingState rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="You are not in any organization"
          description="Create one to share events, forms and responses with your team. You can also be invited by an existing organization."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus /> New organization
            </Button>
          }
        />
      ) : (
        <ul className="bg-card divide-y rounded-lg border shadow-xs">
          {query.data.items.map((org) => (
            <li key={org.id}>
              <Link
                href={`/dashboard/organizations/${org.id}`}
                className="hover:bg-brand-soft/50 flex items-center gap-4 px-4 py-4 sm:px-5"
              >
                <Avatar src={org.logoUrl} name={org.name} className="size-11 rounded-sm border" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{org.name}</p>
                    {org.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[13px] tabular-nums sm:hidden">
                    {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'} · {org.eventCount}{' '}
                    {org.eventCount === 1 ? 'event' : 'events'}
                  </p>
                </div>
                <dl className="hidden shrink-0 gap-8 text-right sm:flex">
                  <div>
                    <dt className="eyebrow">Members</dt>
                    <dd className="text-sm font-medium tabular-nums">{org.memberCount}</dd>
                  </div>
                  <div>
                    <dt className="eyebrow">Events</dt>
                    <dd className="text-sm font-medium tabular-nums">{org.eventCount}</dd>
                  </div>
                </dl>
                <Badge variant={org.role === 'OWNER' ? 'default' : 'secondary'} className="shrink-0">
                  {enumLabel(org.role)}
                </Badge>
                <ChevronRight className="text-subtle-foreground size-4 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateOrganizationDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function CreateOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [websiteUrl, setWebsite] = React.useState('')
  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/organizations', {
          body: { name, description: description || null, websiteUrl: websiteUrl || null },
        }),
      ),
    onSuccess: async (org) => {
      await queryClient.invalidateQueries({ queryKey: keys.organizations })
      toast.success('Organization created')
      router.push(`/dashboard/organizations/${org.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
          <DialogDescription>You will be its owner. You can invite members afterwards.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Name" htmlFor="org-name" required>
            <Input
              id="org-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              maxLength={100}
            />
          </Field>
          <Field label="Description" htmlFor="org-description">
            <Textarea
              id="org-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <Field label="Website" htmlFor="org-website">
            <Input
              id="org-website"
              type="url"
              placeholder="https://"
              value={websiteUrl}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
