'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Plus, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { canManage, useManagedEvent } from '@/components/events/event-context'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { useSession } from '@/hooks/use-session'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatDate, fromLocalInput } from '@/lib/format'
import { cn } from '@/lib/utils'

type Task = Schema<'Task'>
type Status = Task['status']

const STATUS_LABEL = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' } as const

export default function TasksPage() {
  const { event } = useManagedEvent()
  const { user } = useSession()
  const queryClient = useQueryClient()
  const manage = canManage(event)
  const [mine, setMine] = React.useState(false)
  const tasks = useQuery({
    queryKey: keys.eventPart(event.id, 'tasks', { mine }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/events/{id}/tasks', {
          params: { path: { id: event.id }, query: { assignedToMe: mine ? 'true' : 'false' } },
        }),
      ),
  })
  const team = useQuery({
    queryKey: keys.eventPart(event.id, 'team'),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/team', { params: { path: { id: event.id } } })),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.eventPart(event.id, 'tasks') })

  const update = useMutation({
    mutationFn: ({
      taskId,
      body,
    }: {
      taskId: string
      body: { status?: Status; assigneeId?: string | null }
    }) =>
      unwrap(
        api.PATCH('/api/v1/events/{id}/tasks/{taskId}', { params: { path: { id: event.id, taskId } }, body }),
      ),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: (taskId: string) =>
      unwrap(
        api.DELETE('/api/v1/events/{id}/tasks/{taskId}', { params: { path: { id: event.id, taskId } } }),
      ),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  })
  const checklist = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/events/{id}/tasks/checklist', { params: { path: { id: event.id } } })),
    onSuccess: async (result) => {
      toast.success(
        result.added > 0 ? `${result.added} checklist items added` : 'The checklist is already complete',
      )
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const items = tasks.data?.items ?? []
  const checklistItems = items.filter((task) => task.kind === 'CHECKLIST')
  const taskItems = items.filter((task) => task.kind === 'TASK')
  const done = checklistItems.filter((task) => task.status === 'DONE').length

  const row = (task: Task) => {
    const editable = manage || task.assignee?.userId === user?.id
    return (
      <li key={task.id} className="flex flex-wrap items-center gap-3 p-3">
        <input
          type="checkbox"
          aria-label={`Mark “${task.title}” done`}
          className="accent-primary size-4"
          checked={task.status === 'DONE'}
          disabled={!editable}
          onChange={(changeEvent) =>
            update.mutate({ taskId: task.id, body: { status: changeEvent.target.checked ? 'DONE' : 'TODO' } })
          }
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm', task.status === 'DONE' && 'text-muted-foreground line-through')}>
            {task.title}
          </p>
          <p className="text-muted-foreground text-xs">
            {task.assignee ? task.assignee.displayName : 'Unassigned'}
            {task.dueAt && ` · due ${formatDate(task.dueAt, event.timezone)}`}
          </p>
        </div>
        {task.kind === 'TASK' && editable && (
          <NativeSelect
            aria-label="Status"
            className="h-8 w-32"
            value={task.status}
            onChange={(changeEvent) =>
              update.mutate({ taskId: task.id, body: { status: changeEvent.target.value as Status } })
            }
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        )}
        {manage && (
          <NativeSelect
            aria-label="Assignee"
            className="h-8 w-40"
            value={task.assignee?.userId ?? ''}
            onChange={(changeEvent) =>
              update.mutate({ taskId: task.id, body: { assigneeId: changeEvent.target.value || null } })
            }
          >
            <option value="">Unassigned</option>
            {team.data?.items.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </NativeSelect>
        )}
        {manage && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete “${task.title}”`}
            onClick={() => remove.mutate(task.id)}
          >
            <Trash2 />
          </Button>
        )}
      </li>
    )
  }

  if (tasks.isPending) return <LoadingState rows={4} />
  if (tasks.isError) return <ErrorState error={tasks.error} retry={() => void tasks.refetch()} />

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={mine}
          onChange={(changeEvent) => setMine(changeEvent.target.checked)}
        />{' '}
        Only tasks assigned to me
      </label>
      <div className="grid gap-6 2xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Preparation checklist</CardTitle>
              <CardDescription>
                {checklistItems.length > 0
                  ? `${done} of ${checklistItems.length} done`
                  : 'A standard list of things to get ready.'}
              </CardDescription>
            </div>
            {manage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => checklist.mutate()}
                loading={checklist.isPending}
              >
                <ListChecks /> Add standard items
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {checklistItems.length > 0 && (
              <div
                className="bg-muted h-2 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={checklistItems.length}
                aria-valuenow={done}
                aria-label="Checklist progress"
              >
                <div
                  className="bg-success h-full"
                  style={{ width: `${(done / checklistItems.length) * 100}%` }}
                />
              </div>
            )}
            {checklistItems.length === 0 ? (
              <EmptyState title="No checklist items" />
            ) : (
              <ul className="divide-y rounded-lg border">{checklistItems.map(row)}</ul>
            )}
            {manage && (
              <NewTask
                eventId={event.id}
                kind="CHECKLIST"
                team={team.data?.items ?? []}
                timezone={event.timezone}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>
              {taskItems.filter((task) => task.status !== 'DONE').length} open · assign to members of the
              event team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {taskItems.length === 0 ? (
              <EmptyState title="No tasks yet" />
            ) : (
              <ul className="divide-y rounded-lg border">{taskItems.map(row)}</ul>
            )}
            {manage && (
              <NewTask
                eventId={event.id}
                kind="TASK"
                team={team.data?.items ?? []}
                timezone={event.timezone}
              />
            )}
          </CardContent>
        </Card>
      </div>
      {!manage && (
        <p className="text-muted-foreground text-sm">
          <Badge variant="secondary">Check-in staff</Badge> You can update tasks assigned to you.
        </p>
      )}
    </div>
  )
}

function NewTask({
  eventId,
  kind,
  team,
  timezone,
}: {
  eventId: string
  kind: 'TASK' | 'CHECKLIST'
  team: Array<{ userId: string; displayName: string }>
  timezone: string
}) {
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [assigneeId, setAssignee] = React.useState('')
  const [due, setDue] = React.useState('')
  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/events/{id}/tasks', {
          params: { path: { id: eventId } },
          body: {
            title,
            kind,
            assigneeId: assigneeId || null,
            dueAt: due ? fromLocalInput(`${due}T17:00`, timezone) : null,
          },
        }),
      ),
    onSuccess: async () => {
      setTitle('')
      setAssignee('')
      setDue('')
      await queryClient.invalidateQueries({ queryKey: keys.eventPart(eventId, 'tasks') })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(formEvent) => {
        formEvent.preventDefault()
        create.mutate()
      }}
    >
      <Input
        aria-label={kind === 'TASK' ? 'New task' : 'New checklist item'}
        placeholder={kind === 'TASK' ? 'New task' : 'New checklist item'}
        value={title}
        onChange={(changeEvent) => setTitle(changeEvent.target.value)}
        required
        minLength={2}
        maxLength={200}
      />
      {kind === 'TASK' && (
        <>
          <NativeSelect
            aria-label="Assign to"
            className="sm:w-40"
            value={assigneeId}
            onChange={(changeEvent) => setAssignee(changeEvent.target.value)}
          >
            <option value="">Unassigned</option>
            {team.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.displayName}
              </option>
            ))}
          </NativeSelect>
          <Input
            aria-label="Due date"
            type="date"
            className="sm:w-40"
            value={due}
            onChange={(changeEvent) => setDue(changeEvent.target.value)}
          />
        </>
      )}
      <Button type="submit" variant="secondary" loading={create.isPending}>
        <Plus /> Add
      </Button>
    </form>
  )
}
