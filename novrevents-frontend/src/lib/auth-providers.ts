'use client'

import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '@/lib/api/client'

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => unwrap(api.GET('/api/v1/auth/providers')),
    staleTime: 300000,
  })
}
