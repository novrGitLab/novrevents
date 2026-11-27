'use client'

import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field, fieldAria } from '@/components/common'
import { LoadingState, Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { useAuthProviders } from '@/lib/auth-providers'

const resendSchema = z.object({ email: z.email('Enter the email address you signed up with.') })
type ResendValues = z.infer<typeof resendSchema>

export default function VerifyEmailPage() {
  return (
    <React.Suspense>
      <VerifyEmail />
    </React.Suspense>
  )
}

function VerifyEmail() {
  const token = useSearchParams().get('token') ?? ''
  const router = useRouter()
  const queryClient = useQueryClient()
  const [state, setState] = React.useState<'working' | 'done' | 'error'>(token ? 'working' : 'error')
  const [message, setMessage] = React.useState('This verification link is incomplete.')
  const started = React.useRef(false)

  React.useEffect(() => {
    if (!token || started.current) return
    started.current = true
    ensureCsrfToken()
      .then(() => unwrap(api.POST('/api/v1/auth/verify-email', { body: { token } })))
      .then(async () => {
        setState('done')
        await queryClient.invalidateQueries({ queryKey: keys.session })
        // New accounts see the one-time welcome next. The welcome page sends signed-out visitors to sign in
        // first, and sends people who have already completed it to the dashboard.
        router.replace('/auth/welcome')
      })
      .catch((error: unknown) => {
        setMessage(errorMessage(error))
        setState('error')
      })
  }, [token, queryClient, router])

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-headline-lg">
          {state === 'error' ? 'This link can’t be used' : 'Verifying your email'}
        </h1>
        {state === 'working' && (
          <CardDescription className="text-body-lg mt-2">This only takes a moment.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-6 px-0">
        {state === 'working' && <LoadingState rows={1} label="Verifying" />}
        {state === 'done' && (
          <Notice tone="success" title="Your email address is verified">
            Taking you to your welcome…
          </Notice>
        )}
        {state === 'error' && (
          <>
            <Notice tone="error">
              {message} Links expire after 24 hours and can be used once. Enter your email to request another link.
            </Notice>
            <ResendForm />
          </>
        )}
        <p className="text-muted-foreground text-center text-sm">
          Already verified?{' '}
          <Link href="/auth/login" className="text-brand-text font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}

/** Available without signing in, so an expired link can always be replaced. */
function ResendForm() {
  const emailDeliveryEnabled = useAuthProviders().data?.emailDelivery === true
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<ResendValues>({ resolver: zodResolver(resendSchema), defaultValues: { email: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await ensureCsrfToken()
      await unwrap(api.POST('/api/v1/auth/resend-verification-by-email', { body: values }))
      // Identical whether or not the address has an unverified account.
      setSent(true)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  })

  if (sent) {
    return (
      <Notice
        tone={emailDeliveryEnabled ? 'success' : 'info'}
        title={emailDeliveryEnabled ? 'Check your inbox' : 'Request recorded'}
      >
        {emailDeliveryEnabled
          ? 'If this address still needs verifying, a new link is on its way.'
          : 'Email verification is unavailable, so no message will arrive.'}
      </Notice>
    )
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Email" htmlFor="resend-email" error={errors.email?.message}>
        <Input
          {...fieldAria('resend-email', errors.email?.message)}
          type="email"
          autoComplete="email"
          {...form.register('email')}
        />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send a new verification link
      </Button>
    </form>
  )
}
