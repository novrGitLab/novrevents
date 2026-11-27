'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { POLICY_VERSION } from '@/lib/policy'

export function GoogleButton({
  mode,
  consent = false,
}: {
  mode: 'login' | 'register' | 'link'
  consent?: boolean
}) {
  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => unwrap(api.GET('/api/v1/auth/providers')),
    staleTime: 300000,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!providers.data?.google) return null
  async function begin() {
    if (mode === 'register' && !consent) {
      setError('Accept the terms above to register with Google.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await ensureCsrfToken()
      const body =
        mode === 'register' ? ({ mode, acceptTerms: true, policyVersion: POLICY_VERSION } as const) : { mode }
      const { url } = await unwrap(api.POST('/api/v1/auth/google/start', { body }))
      window.location.assign(url)
    } catch (cause) {
      setError(errorMessage(cause))
      setBusy(false)
    }
  }
  return (
    <div className="my-4">
      <Button type="button" className="w-full" variant="outline" loading={busy} onClick={begin}>
        {mode === 'link' ? 'Link Google account' : 'Continue with Google'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
