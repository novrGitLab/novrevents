'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { api, unwrap, type Schema } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

export type ManagedEvent = Schema<'EventManage'>

const EventContext = React.createContext<{ event: ManagedEvent; refresh: () => Promise<void> } | null>(null)

/** Loads the managed event once for every page in the event workspace. */
export function useManagedEventQuery(id: string) {
  return useQuery({
    queryKey: keys.event(id),
    queryFn: () => unwrap(api.GET('/api/v1/events/{id}', { params: { path: { id } } })),
  })
}

export function EventProvider({ event, children }: { event: ManagedEvent; children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: keys.event(event.id) })
  }, [queryClient, event.id])
  const value = React.useMemo(() => ({ event, refresh }), [event, refresh])
  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}

export function useManagedEvent() {
  const context = React.useContext(EventContext)
  if (!context) throw new Error('useManagedEvent must be used inside the event workspace')
  return context
}

export const canManage = (event: ManagedEvent) => event.role !== 'STAFF'
export const canAdminister = (event: ManagedEvent) => event.role === 'OWNER' || event.role === 'ORG_ADMIN'
