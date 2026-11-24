'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/common'
import { canAdminister, useManagedEvent } from '@/components/events/event-context'
import { ErrorState, LoadingState } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NativeSelect } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

const ROLE_HELP = {
  MANAGER: 'Can edit the event, forms, registrations, messages, analytics and certificates.',
  STAFF: 'Can check attendees in and see the attendee list. Cannot see form responses.',
}

export default function TeamPage() {
  const { event } = useManagedEvent()
  const { user } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const admin = canAdminister(event)
  const [username, setUsername] = React.useState('')
  const [role, setRole] = React.useState<'STAFF' | 'MANAGER'>('STAFF')
  const queryKey = keys.eventPart(event.id, 'team')
  const team = useQuery({
    queryKey,
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}/team', { params: { path: { id: event.id } } })),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  const add = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/events/{id}/team', {
          params: { path: { id: event.id } },
          body: { username: username.replace(/^@/, ''), role },
        }),
      ),
    onSuccess: async () => {
      setUsername('')
      toast.success('Team member added and notified')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event team</CardTitle>
        <CardDescription>
          Add people by their NOVR Events username. Owners of the event’s organization also have full access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {admin && (
          <form
            className="space-y-2"
            onSubmit={(formEvent) => {
              formEvent.preventDefault()
              add.mutate()
            }}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="team-username" className="sr-only">
                Username
              </label>
              <Input
                id="team-username"
                placeholder="Username"
                value={username}
                onChange={(changeEvent) => setUsername(changeEvent.target.value)}
                required
              />
              <label htmlFor="team-role" className="sr-only">
                Role
              </label>
              <NativeSelect
                id="team-role"
                className="sm:w-48"
                value={role}
                onChange={(changeEvent) => setRole(changeEvent.target.value as 'STAFF' | 'MANAGER')}
              >
                <option value="STAFF">Check-in staff</option>
                <option value="MANAGER">Manager</option>
              </NativeSelect>
              <Button type="submit" loading={add.isPending}>
                <UserPlus /> Add
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{ROLE_HELP[role]}</p>
          </form>
        )}
        {team.isPending ? (
          <LoadingState rows={2} />
        ) : team.isError ? (
          <ErrorState error={team.error} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {team.data.items.map((member) => {
              const isMe = member.userId === user?.id
              return (
                <li key={member.userId} className="flex flex-wrap items-center gap-3 p-3">
                  <Avatar src={member.avatarUrl} name={member.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.displayName} {isMe && <span className="text-muted-foreground">(you)</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">@{member.username}</p>
                  </div>
                  {member.role === 'OWNER' ? (
                    <Badge variant="brand">Owner</Badge>
                  ) : admin ? (
                    <NativeSelect
                      aria-label={`Role for ${member.displayName}`}
                      className="h-9 w-40"
                      value={member.role}
                      onChange={async (changeEvent) => {
                        try {
                          await unwrap(
                            api.PATCH('/api/v1/events/{id}/team/{userId}', {
                              params: { path: { id: event.id, userId: member.userId } },
                              body: { role: changeEvent.target.value as 'STAFF' | 'MANAGER' },
                            }),
                          )
                          await refresh()
                        } catch (error) {
                          toast.error(errorMessage(error))
                        }
                      }}
                    >
                      <option value="STAFF">Check-in staff</option>
                      <option value="MANAGER">Manager</option>
                    </NativeSelect>
                  ) : (
                    <Badge variant="secondary">
                      {member.role === 'MANAGER' ? 'Manager' : 'Check-in staff'}
                    </Badge>
                  )}
                  {member.role !== 'OWNER' && (admin || isMe) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isMe ? 'Leave the team' : `Remove ${member.displayName}`}
                      onClick={() =>
                        confirm(
                          {
                            title: isMe ? 'Leave this event team?' : `Remove ${member.displayName}?`,
                            confirmLabel: isMe ? 'Leave' : 'Remove',
                            destructive: true,
                          },
                          async () => {
                            try {
                              await unwrap(
                                api.DELETE('/api/v1/events/{id}/team/{userId}', {
                                  params: { path: { id: event.id, userId: member.userId } },
                                }),
                              )
                              if (isMe) router.push('/dashboard/events')
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
