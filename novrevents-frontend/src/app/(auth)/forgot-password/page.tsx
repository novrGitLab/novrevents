'use client'

import Link from 'next/link'
import * as React from 'react'
import { Field } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { emailDeliveryEnabled } from '@/lib/site'

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  return (
    <Card className="border-0 bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">Reset your password</h1>
        <CardDescription>We’ll email you a link to choose a new password.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {!emailDeliveryEnabled && (
          <Notice tone="warning" title="Password reset emails are not delivered yet" className="mb-4">
            Email delivery is not switched on for NOVR Events yet, so a reset link cannot reach your inbox.
          </Notice>
        )}
        {sent ? (
          emailDeliveryEnabled ? (
            <Notice tone="success" title="Check your inbox">
              If an account exists for {email}, a reset link is on its way. The link expires in one hour.
            </Notice>
          ) : (
            <Notice tone="info" title="Request recorded">
              No email will arrive while email delivery is switched off.
            </Notice>
          )
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault()
              setError(null)
              setLoading(true)
              try {
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
          <Link href="/login" className="text-brand-text font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
