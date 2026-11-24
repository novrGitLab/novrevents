'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus } from 'lucide-react'
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
          description="Create one to share events, forms and responses with your team."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {query.data.items.map((org) => (
            <li key={org.id}>
              <Link
                href={`/dashboard/organizations/${org.id}`}
                className="bg-card flex items-center gap-3 rounded-lg border p-4 hover:shadow-sm"
              >
                <Avatar src={org.logoUrl} name={org.name} className="size-12 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{org.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {org.memberCount} {org.memberCount === 1 ? 'member' : 'members'} · {org.eventCount}{' '}
                    {org.eventCount === 1 ? 'event' : 'events'}
                  </p>
                </div>
                <Badge variant="secondary">{enumLabel(org.role)}</Badge>
                {org.status === 'SUSPENDED' && <Badge variant="destructive">Suspended</Badge>}
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
