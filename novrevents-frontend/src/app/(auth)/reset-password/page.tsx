'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Field } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetPassword />
    </React.Suspense>
  )
}

function ResetPassword() {
  const token = useSearchParams().get('token') ?? ''
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  return (
    <Card className="border-0 bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">Choose a new password</h1>
      </CardHeader>
      <CardContent className="px-0">
        {!token ? (
          <Notice tone="error">This reset link is incomplete. Request a new one.</Notice>
        ) : done ? (
          <div className="space-y-4">
            <Notice tone="success" title="Password updated">
              All devices have been signed out. Sign in with your new password.
            </Notice>
            <Button asChild className="w-full">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setError(null)
              if (password.length < 10) return setError('Use at least 10 characters.')
              if (password !== confirm) return setError('The passwords do not match.')
              setLoading(true)
              try {
                await unwrap(api.POST('/api/v1/auth/reset-password', { body: { token, password } }))
                setDone(true)
              } catch (caught) {
                setError(errorMessage(caught))
              } finally {
                setLoading(false)
              }
            }}
          >
            {error && <Notice tone="error">{error}</Notice>}
            <Field label="New password" htmlFor="password" description="At least 10 characters.">
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Field label="Confirm password" htmlFor="confirm">
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </Field>
            <Button type="submit" className="w-full" loading={loading}>
              Update password
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/forgot-password" className="text-brand-text font-medium hover:underline">
            Request a new link
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
