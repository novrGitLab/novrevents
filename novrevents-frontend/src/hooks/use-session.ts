'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, setCsrfToken, unwrap, type Schema } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

export type SessionUser = Schema<'SessionUser'>

/** Current session. The CSRF token it returns is handed to the API client for mutations. */
export function useSession() {
  const query = useQuery({
    queryKey: keys.session,
    queryFn: async () => {
      const session = await unwrap(api.GET('/api/v1/auth/session'))
      setCsrfToken(session.csrfToken)
      return session
    },
    staleTime: 60_000,
  })
  return {
    ...query,
    user: query.data?.user ?? null,
    isAuthenticated: query.data?.authenticated === true,
  }
}

/** Use after login, logout or registration: stores the new token and refreshes everything. */
export function useApplySession() {
  const queryClient = useQueryClient()
  return async (session: { csrfToken: string | null } & Record<string, unknown>) => {
    setCsrfToken(session.csrfToken)
    queryClient.setQueryData(keys.session, session)
    await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'session' })
  }
}
