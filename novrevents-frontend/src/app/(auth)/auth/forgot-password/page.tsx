'use client'

import Link from 'next/link'
import * as React from 'react'
import { Field } from '@/components/common'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { useAuthProviders } from '@/lib/auth-providers'

export default function ForgotPasswordPage() {
  const providers = useAuthProviders()
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-headline-lg">Reset your password</h1>
        <CardDescription className="text-body-lg mt-2">
          Use the email address linked to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {sent ? (
          <Notice tone="success" title="Check your inbox">
            If an account exists for {email}, a reset link is on its way. The link expires in one hour.
          </Notice>
        ) : providers.isPending ? (
          <LoadingState rows={1} label="Checking email availability" />
        ) : providers.isError ? (
          <ErrorState error={providers.error} retry={() => void providers.refetch()} />
        ) : !providers.data.accountEmail ? (
          <Notice tone="info" title="Password reset emails are temporarily unavailable">
            Try again later or return to sign in.
          </Notice>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setError(null)
              setLoading(true)
              try {
                await ensureCsrfToken()
                await unwrap(api.POST('/api/v1/auth/forgot-password', { body: { email } }))
                setSent(true)
              } catch (caught) {
                setError(errorMessage(caught))
              } finally {
                setLoading(false)
              }
            }}
          >
            {error && <Notice tone="error">{error}</Notice>}
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/auth/login" className="text-brand-text font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
