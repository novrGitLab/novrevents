'use client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { GoogleButton } from '@/components/auth/google-button'
import { HumanCheck } from '@/components/auth/human-check'
import { Field } from '@/components/common'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/states'
import { useApplySession } from '@/hooks/use-session'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { POLICY_VERSION } from '@/lib/policy'
import { safeNextPath } from '@/lib/utils'
type Step = 'email' | 'human' | 'code' | 'create' | 'password'
export default function LoginPage() {
  return (
    <Suspense>
      <AccountEntry />
    </Suspense>
  )
}
function AccountEntry() {
  const admin = usePathname() === '/admin/auth/login'
  const router = useRouter(),
    params = useSearchParams(),
    apply = useApplySession()
  const next = safeNextPath(params.get('next'))
  const [step, setStep] = useState<Step>(admin ? 'password' : 'email')
  const [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState(''),
    [proof, setProof] = useState(''),
    [captcha, setCaptcha] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      params.get('google') === 'failed'
        ? 'Google sign-in could not finish. Try again or continue with email.'
        : '',
    )
  const [humanKey, setHumanKey] = useState(0)
  function move(to: Step) {
    setStep(to)
    setError('')
    setCode('')
    setPassword('')
    setCaptcha('')
  }
  async function go(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await ensureCsrfToken()
      if (step === 'email') {
        move('human')
        return
      }
      if (step === 'human') {
        const sent = await unwrap(api.POST('/api/v1/auth/entry', { body: { email: email.trim(), captcha } }))
        setChallenge(sent.challengeId)
        move('code')
        return
      }
      if (step === 'code') {
        const verified = await unwrap(
          api.POST('/api/v1/auth/entry/verify', { body: { challengeId: challenge, code } }),
        )
        if (verified.step === 'password') {
          setProof(verified.proof)
          move('create')
          return
        }
        await apply(verified.session)
        router.replace(next)
        return
      }
      if (step === 'create') {
        const session = await unwrap(
          api.POST('/api/v1/auth/entry/finish', {
            body: { email: email.trim(), proof, password, acceptTerms: true, policyVersion: POLICY_VERSION },
          }),
        )
        await apply(session)
        router.replace(next === '/dashboard' ? '/auth/welcome' : next)
        return
      }
      const session = await unwrap(
        api.POST(admin ? '/api/v1/auth/admin/login' : '/api/v1/auth/login', {
          body: { identifier: email.trim(), password },
        }),
      )
      await apply(session)
      router.replace(admin ? (next.startsWith('/admin/') ? next : '/admin') : next)
    } catch (cause) {
      setError(errorMessage(cause))
      if (step === 'human') {
        setCaptcha('')
        setHumanKey((k) => k + 1)
      }
    } finally {
      setBusy(false)
    }
  }
  const title = admin
    ? 'Administrator sign in'
    : {
        email: 'Continue to NovrEvents',
        human: 'One quick check',
        code: 'Check your email',
        create: 'Set your password',
        password: 'Use your password',
      }[step]
  return (
    <div className="identity-flow">
      <h1>{title}</h1>
      <p className="entry-intro">
        {admin
          ? 'Use your administrator account.'
          : step === 'email'
            ? 'Enter your email to sign in or create an account.'
            : step === 'human'
              ? 'Complete the human check to receive your code.'
              : step === 'code'
                ? 'Enter the six-digit code sent to ' + email + '.'
                : step === 'create'
                  ? 'Your email is verified. Choose a password of at least 10 characters.'
                  : 'Enter your email or username and password.'}
      </p>
      <form onSubmit={go} className="entry-fields">
        {error && <Notice tone="error">{error}</Notice>}
        {(step === 'email' || step === 'password') && (
          <Field label={step === 'email' ? 'Email address' : 'Email or username'} htmlFor="entry-email">
            <Input
              id="entry-email"
              type={step === 'email' ? 'email' : 'text'}
              required
              maxLength={254}
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        )}
        {step === 'human' && <HumanCheck key={humanKey} onChange={setCaptcha} />}
        {step === 'code' && (
          <Field htmlFor="entry-code" label="Verification code">
            <Input
              id="entry-code"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
        )}
        {(step === 'password' || step === 'create') && (
          <Field htmlFor="entry-password" label={step === 'create' ? 'New password' : 'Password'}>
            <Input
              id="entry-password"
              type="password"
              autoComplete={step === 'create' ? 'new-password' : 'current-password'}
              minLength={step === 'create' ? 10 : 1}
              maxLength={200}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
        {(step === 'email' || step === 'create') && (
          <p className="entry-legal">
            By continuing, you agree to the <Link href="/legal/terms-of-use">Terms of use</Link> and
            acknowledge the <Link href="/legal/privacy-policy">Privacy policy</Link>.
          </p>
        )}
        <Button type="submit" size="lg" loading={busy} disabled={step === 'human' && !captcha}>
          {step === 'human'
            ? 'Send code'
            : step === 'code'
              ? 'Verify code'
              : step === 'create'
                ? 'Save password and continue'
                : step === 'password'
                  ? 'Sign in'
                  : 'Continue'}
        </Button>
      </form>
      {(step === 'email' || admin) && (
        <>
          <GoogleButton divider mode={admin ? 'admin' : 'continue'} consent next={next} />
        </>
      )}
      <div className="entry-options">
        {step === 'code' && (
          <Button variant="link" onClick={() => move('human')}>
            Request another code
          </Button>
        )}
        {step === 'password' && <Link href="/auth/forgot-password">Forgot your password?</Link>}
        {!admin && step !== 'password' && (
          <Button variant="link" onClick={() => move('password')}>
            Use a password instead
          </Button>
        )}
        {!admin && step !== 'email' && (
          <Button variant="link" onClick={() => move('email')}>
            Change email
          </Button>
        )}
      </div>
    </div>
  )
}
