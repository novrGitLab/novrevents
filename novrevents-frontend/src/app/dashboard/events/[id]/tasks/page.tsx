'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Plus, Trash2 } from '@/components/ui/icons'
import * as React from 'react'
import { toast } from 'sonner'
import { canManage, useManagedEvent } from '@/components/events/event-context'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  const [now, setNow] = React.useState(Date.now)
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
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
      <li key={task.id} className="hover:bg-brand-soft/40 flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
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
            {task.dueAt && (
              <span
                className={cn(
                  task.status !== 'DONE' && new Date(task.dueAt).getTime() < now && 'text-destructive font-medium',
                )}
              >
                {' '}
                · due {formatDate(task.dueAt, event.timezone)}
              </span>
            )}
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

  const openTasks = taskItems.filter((task) => task.status !== 'DONE')
  const overdue = items.filter(
    (task) => task.status !== 'DONE' && task.dueAt && new Date(task.dueAt).getTime() < now,
  ).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Show" className="flex gap-2">
          {[
            { value: false, label: 'All tasks' },
            { value: true, label: 'Assigned to me' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={mine === option.value}
              onClick={() => setMine(option.value)}
              className={cn(
                'h-8 rounded-sm border px-3 text-[13px] font-medium',
                mine === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-primary hover:text-brand-text',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground text-[13px] tabular-nums">
          {openTasks.length} open {openTasks.length === 1 ? 'task' : 'tasks'}
          {overdue > 0 && <span className="text-destructive font-medium"> · {overdue} overdue</span>}
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="tasks-heading" className="bg-card overflow-hidden rounded-lg border shadow-xs">
          <div className="border-b px-5 py-4">
            <h2 id="tasks-heading" className="text-headline-sm">
              Tasks
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[13px]">Assign work to members of the event team.</p>
          </div>
          {taskItems.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-center text-[13px]">
              {mine ? 'No tasks are assigned to you.' : 'No tasks yet.'}
            </p>
          ) : (
            <ul className="divide-y">{taskItems.map(row)}</ul>
          )}
          {manage && (
            <div className="bg-muted/50 border-t px-5 py-4">
              <NewTask eventId={event.id} kind="TASK" team={team.data?.items ?? []} timezone={event.timezone} />
            </div>
          )}
        </section>

        <section
          aria-labelledby="checklist-heading"
          className="bg-card overflow-hidden rounded-lg border shadow-xs"
        >
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 id="checklist-heading" className="text-headline-sm">
                Preparation checklist
              </h2>
              <p className="text-muted-foreground mt-0.5 text-[13px] tabular-nums">
                {checklistItems.length > 0
                  ? `${done} of ${checklistItems.length} done`
                  : 'A standard list of things to get ready.'}
              </p>
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
          </div>
          {checklistItems.length > 0 && (
            <div
              className="bg-muted h-1"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={checklistItems.length}
              aria-valuenow={done}
              aria-label="Checklist progress"
            >
              <div className="bg-primary h-full" style={{ width: `${(done / checklistItems.length) * 100}%` }} />
            </div>
          )}
          {checklistItems.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-center text-[13px]">No checklist items yet.</p>
          ) : (
            <ul className="divide-y">{checklistItems.map(row)}</ul>
          )}
          {manage && (
            <div className="bg-muted/50 border-t px-5 py-4">
              <NewTask
                eventId={event.id}
                kind="CHECKLIST"
                team={team.data?.items ?? []}
                timezone={event.timezone}
              />
            </div>
          )}
        </section>
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
      <Button type="submit" variant="outline" className="shrink-0" loading={create.isPending}>
        <Plus /> Add
      </Button>
    </form>
  )
}
