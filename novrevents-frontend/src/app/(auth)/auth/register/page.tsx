'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { GoogleButton } from '@/components/auth/google-button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Field, fieldAria } from '@/components/common'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { applyFieldErrors, errorMessage, hasCode } from '@/lib/api/errors'
import { POLICY_VERSION } from '@/lib/policy'
import { suggestUsername } from '@/lib/username'

// Mirrors the API's rules (src/modules/auth/auth.schemas.ts). The server remains the authority.
const schema = z.object({
  displayName: z.string().trim().min(2, 'Use at least 2 characters.').max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/, 'Use 3–30 letters, numbers, hyphens or underscores.'),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
  // Never pre-ticked: the person must choose to agree.
  acceptTerms: z.boolean().refine((value) => value === true, {
    message: 'Tick the box to agree to the Terms of use and Privacy policy.',
  }),
})
type Values = z.infer<typeof schema>

export default function RegisterPage() {
  return <RegisterForm />
}

function RegisterForm() {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  // Once the person edits the username themselves, stop overwriting it from the name.
  const usernameEdited = React.useRef(false)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', username: '', email: '', password: '', acceptTerms: false },
  })
  const { errors, isSubmitting } = form.formState
  const consent = useWatch({ control: form.control, name: 'acceptTerms' })
  const displayField = form.register('displayName')
  const usernameField = form.register('username')

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await ensureCsrfToken()
      await unwrap(
        api.POST('/api/v1/auth/register', {
          body: {
            displayName: values.displayName,
            username: values.username,
            email: values.email,
            password: values.password,
            acceptTerms: true,
            policyVersion: POLICY_VERSION,
          },
        }),
      )
      // The account exists but is unverified: the next step is the emailed link.
      router.replace(`/auth/check-email?email=${encodeURIComponent(values.email)}`)
    } catch (caught) {
      if (hasCode(caught, 'USERNAME_TAKEN')) form.setError('username', { message: errorMessage(caught) })
      else if (hasCode(caught, 'EMAIL_TAKEN')) form.setError('email', { message: errorMessage(caught) })
      else if (hasCode(caught, 'WEAK_PASSWORD')) form.setError('password', { message: errorMessage(caught) })
      else if (!applyFieldErrors(caught, form.setError)) setError(errorMessage(caught))
    }
  })

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-headline-lg">Create your account</h1>
        <CardDescription className="text-body-lg mt-2">
          Register for events, host your own, and keep your tickets in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Full name" htmlFor="displayName" error={errors.displayName?.message}>
            <Input
              {...fieldAria('displayName', errors.displayName?.message)}
              autoComplete="name"
              {...displayField}
              onChange={(event) => {
                void displayField.onChange(event)
                if (!usernameEdited.current) {
                  form.setValue('username', suggestUsername(event.target.value), { shouldDirty: false })
                }
              }}
            />
          </Field>
          <Field
            label="Username"
            htmlFor="username"
            description="Your public profile address (/u/username). We suggest one from your name; you can change it."
            error={errors.username?.message}
          >
            <Input
              {...fieldAria('username', errors.username?.message, true)}
              autoComplete="username"
              autoCapitalize="none"
              {...usernameField}
              onChange={(event) => {
                usernameEdited.current = true
                void usernameField.onChange(event)
              }}
            />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              {...fieldAria('email', errors.email?.message)}
              type="email"
              autoComplete="email"
              {...form.register('email')}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="password"
            description="At least 10 characters. Avoid common passwords, and don’t reuse your email or username."
            error={errors.password?.message}
          >
            <Input
              {...fieldAria('password', errors.password?.message, true)}
              type="password"
              autoComplete="new-password"
              {...form.register('password')}
            />
          </Field>

          <div className="space-y-1.5">
            <label className="flex items-start gap-2.5 text-[13px] leading-5">
              <input
                type="checkbox"
                id="acceptTerms"
                aria-invalid={errors.acceptTerms ? true : undefined}
                aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
                className="accent-brand mt-0.5 size-4 shrink-0"
                {...form.register('acceptTerms')}
              />
              <span>
                I agree to the{' '}
                <Link href="/legal/terms-of-use" className="text-brand-text font-medium underline">
                  Terms of use
                </Link>{' '}
                and the{' '}
                <Link href="/legal/privacy-policy" className="text-brand-text font-medium underline">
                  Privacy policy
                </Link>{' '}
                <span className="text-muted-foreground">(version {POLICY_VERSION})</span>.
              </span>
            </label>
            {errors.acceptTerms && (
              <p id="acceptTerms-error" role="alert" className="text-destructive text-[13px]">
                {errors.acceptTerms.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={isSubmitting}>
            Create account
          </Button>
        </form>
        <GoogleButton mode="register" consent={consent} />
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already registered?{' '}
          <Link href="/auth/login" className="text-brand-text font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
