'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { useSession } from '@/hooks/use-session'
import { api, ensureCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { useAuthProviders } from '@/lib/auth-providers'

export default function CheckEmailPage() {
  return (
    <React.Suspense>
      <CheckEmail />
    </React.Suspense>
  )
}

function CheckEmail() {
  const emailDeliveryEnabled = useAuthProviders().data?.emailDelivery === true
  const param = useSearchParams().get('email')?.trim() ?? ''
  const { user } = useSession()
  const email = param || user?.email || ''
  const [sending, setSending] = React.useState(false)
  const [notice, setNotice] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const resend = async () => {
    if (!email) return
    setSending(true)
    setNotice(null)
    try {
      await ensureCsrfToken()
      await unwrap(api.POST('/api/v1/auth/resend-verification-by-email', { body: { email } }))
      // The same message whether or not the address needs verifying, so this page cannot reveal accounts.
      setNotice({
        tone: 'success',
        text: emailDeliveryEnabled
          ? 'If this address still needs verifying, a new link is on its way. Check your inbox and spam folder.'
          : 'Request recorded. Email verification is unavailable, so no message will arrive.',
      })
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) })
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardHeader className="px-0 pt-0 pb-6">
        <h1 className="text-headline-lg">Check your email</h1>
        <CardDescription className="text-body-lg mt-2">
          {!emailDeliveryEnabled ? (
            <>{email && <span className="block font-medium">{email}</span>}Your account is ready. Verification is required to publish events and forms.</>
          ) : email ? (
            <>
              A verification link was requested for <span className="text-foreground font-medium">{email}</span>.
              Open it to activate your account.
            </>
          ) : (
            'Open the verification link in your inbox to activate your account.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0">
        {!emailDeliveryEnabled && (
          <Notice tone="warning" title="Email verification is unavailable">
            You can sign in, browse events and reserve tickets. Publishing requires a verified address.
          </Notice>
        )}
        {notice && <Notice tone={notice.tone === 'success' ? 'success' : 'error'}>{notice.text}</Notice>}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void resend()}
          loading={sending}
          disabled={!email}
        >
          Resend verification email
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Wrong address?{' '}
          <Link href="/auth/register" className="text-brand-text font-medium hover:underline">
            Use a different email address
          </Link>
        </p>
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
