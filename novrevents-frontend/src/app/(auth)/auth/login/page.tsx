'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { GoogleButton } from '@/components/auth/google-button'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field, fieldAria } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useApplySession } from '@/hooks/use-session'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { safeNextPath } from '@/lib/utils'

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})
type Values = z.infer<typeof schema>

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const admin = usePathname() === '/admin/auth/login'
  const searchParams = useSearchParams()
  const next = safeNextPath(searchParams.get('next'))
  const applySession = useApplySession()
  const [error, setError] = React.useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await ensureCsrfToken()
      const session = await unwrap(api.POST('/api/v1/auth/login', { body: values }))
      await applySession(session)
      // A verified account that has not yet seen the welcome goes there once; everyone else continues as before.
      const needsWelcome = session.user?.emailVerified === true && session.user.onboarded === false
      if (admin && session.user?.role !== 'ADMIN') {
        setError('This account does not have administrator access.')
        return
      }
      router.replace(admin ? '/admin' : needsWelcome ? '/auth/welcome' : next)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  })

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-headline-lg">{admin ? 'Administrator sign in' : 'Sign in'}</h1>
        <CardDescription className="text-body-lg mt-2">Access your NovrEvents account.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {searchParams.get('google') === 'failed' && (
          <Notice tone="error">
            Google sign-in could not be completed. Existing members can sign in with their password and link
            Google in Settings.
          </Notice>
        )}
        {!admin && <GoogleButton mode="login" />}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              {...fieldAria('email', errors.email?.message)}
              type="email"
              autoComplete="email"
              {...form.register('email')}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              {...fieldAria('password', errors.password?.message)}
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
            />
          </Field>
          <div className="text-right text-sm">
            <Link href="/auth/forgot-password" className="text-brand-text font-medium hover:underline">
              Forgot your password?
            </Link>
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            Sign in
          </Button>
        </form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          New here?{' '}
          <Link
            href={`/auth/register${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="text-brand-text font-medium hover:underline"
          >
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
