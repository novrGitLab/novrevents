'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Ban, Copy, EyeOff, MoreHorizontal, Rocket, Trash2 } from '@/components/ui/icons'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/primitives'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage, isApiError, type ErrorDetail } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { canAdminister, canManage, type ManagedEvent } from './event-context'
import { emailDeliveryEnabled } from '@/lib/site'

const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  categoryId: 'Category',
  city: 'City',
  venueName: 'Venue',
  endsAt: 'Dates',
  priceInfo: 'Price information',
}

type Action = 'publish' | 'unpublish' | 'archive' | 'unarchive' | 'duplicate'

function useLifecycle(event: ManagedEvent) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [problems, setProblems] = React.useState<ErrorDetail[]>([])
  const run = useMutation({
    mutationFn: async (action: Action) => {
      const path = { params: { path: { id: event.id } } }
      if (action === 'publish') return unwrap(api.POST('/api/v1/events/{id}/publish', path))
      if (action === 'unpublish') return unwrap(api.POST('/api/v1/events/{id}/unpublish', path))
      if (action === 'archive') return unwrap(api.POST('/api/v1/events/{id}/archive', path))
      if (action === 'unarchive') return unwrap(api.POST('/api/v1/events/{id}/unarchive', path))
      return unwrap(api.POST('/api/v1/events/{id}/duplicate', path))
    },
    onSuccess: async (result, action) => {
      setProblems([])
      await queryClient.invalidateQueries({ queryKey: ['my-events'] })
      if (action === 'duplicate') {
        toast.success('Copy created as a draft')
        router.push(`/dashboard/events/${result.id}`)
        return
      }
      toast.success(
        {
          publish: 'Event published',
          unpublish: 'Event moved back to draft',
          archive: 'Event archived',
          unarchive: 'Event restored',
        }[action],
      )
      await queryClient.invalidateQueries({ queryKey: keys.event(event.id) })
    },
    onError: (error, action) => {
      if (action === 'publish' && isApiError(error) && error.code === 'EVENT_INCOMPLETE')
        setProblems(error.details)
      else toast.error(errorMessage(error))
    },
  })
  return { run, problems, clearProblems: () => setProblems([]) }
}

/** Publish button (drafts) and the "more actions" menu shown in the event workspace header. */
export function EventHeaderActions({ event }: { event: ManagedEvent }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const { run, problems, clearProblems } = useLifecycle(event)
  const status = event.effectiveStatus
  const manage = canManage(event)
  const admin = canAdminister(event)

  if (!manage) return null

  const cancelEvent = () =>
    confirm(
      {
        title: 'Cancel this event?',
        description: emailDeliveryEnabled
          ? 'All tickets stop working and everyone registered is emailed. This cannot be undone.'
          : 'All tickets stop working. This cannot be undone.',
        confirmLabel: 'Cancel event',
        destructive: true,
        reasonLabel: 'Message to attendees (optional)',
      },
      async (reason) => {
        try {
          await unwrap(
            api.POST('/api/v1/events/{id}/cancel', {
              params: { path: { id: event.id } },
              body: { reason: reason || null, notifyAttendees: true },
            }),
          )
          toast.success('Event cancelled and attendees notified')
          await queryClient.invalidateQueries({ queryKey: keys.event(event.id) })
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    )

  const deleteDraft = () =>
    confirm(
      {
        title: 'Delete this draft?',
        description: 'The event and its agenda are deleted permanently.',
        confirmLabel: 'Delete draft',
        destructive: true,
      },
      async () => {
        try {
          await unwrap(api.DELETE('/api/v1/events/{id}', { params: { path: { id: event.id } } }))
          await queryClient.invalidateQueries({ queryKey: ['my-events'] })
          router.push('/dashboard/events')
        } catch (error) {
          toast.error(errorMessage(error))
          throw error
        }
      },
    )

  const canUnpublish = event.status === 'PUBLISHED' && status === 'PUBLISHED'
  const canCancel = admin && (status === 'PUBLISHED' || status === 'ONGOING')
  const canArchive = admin && (status === 'DRAFT' || status === 'COMPLETED' || status === 'CANCELLED')
  const canRestore = admin && status === 'ARCHIVED'
  const canDelete = admin && event.status === 'DRAFT'

  return (
    <>
      {event.status === 'DRAFT' && event.moderationStatus !== 'REMOVED' && (
        <Button
          size="sm"
          onClick={() => run.mutate('publish')}
          loading={run.isPending && run.variables === 'publish'}
        >
          <Rocket /> Publish
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="More event actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => run.mutate('duplicate')}>
            <Copy /> Duplicate as draft
          </DropdownMenuItem>
          {canUnpublish && (
            <DropdownMenuItem
              onSelect={() =>
                confirm(
                  {
                    title: 'Move this event back to draft?',
                    description:
                      'It will disappear from public pages. This is only possible while nobody has registered.',
                    confirmLabel: 'Unpublish',
                  },
                  () => run.mutateAsync('unpublish'),
                )
              }
            >
              <EyeOff /> Unpublish
            </DropdownMenuItem>
          )}
          {canArchive && (
            <DropdownMenuItem onSelect={() => run.mutate('archive')}>
              <Archive /> Archive
            </DropdownMenuItem>
          )}
          {canRestore && (
            <DropdownMenuItem onSelect={() => run.mutate('unarchive')}>
              <ArchiveRestore /> Restore from archive
            </DropdownMenuItem>
          )}
          {(canCancel || canDelete) && <DropdownMenuSeparator />}
          {canCancel && (
            <DropdownMenuItem destructive onSelect={cancelEvent}>
              <Ban /> Cancel event…
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem destructive onSelect={deleteDraft}>
              <Trash2 /> Delete draft…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={problems.length > 0} onOpenChange={(open) => !open && clearProblems()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete these details to publish</DialogTitle>
            <DialogDescription>
              Publishing makes the event visible, so a few details are required.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-md border text-sm">
            {problems.map((problem) => (
              <li key={problem.path} className="px-3 py-2">
                <span className="font-medium">{FIELD_LABELS[problem.path] ?? problem.path}</span>
                <span className="text-muted-foreground"> — {problem.message}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={clearProblems}>
              Close
            </Button>
            <Button asChild onClick={clearProblems}>
              <Link href={`/dashboard/events/${event.id}/edit`}>Edit details</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  )
}
