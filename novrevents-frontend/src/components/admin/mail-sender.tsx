'use client'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { GoogleButton } from '@/components/auth/google-button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { api, unwrap } from '@/lib/api/client'
const senderErrors = new Map([
  ['declined', 'Google authorization was cancelled. Start again when you are ready to connect the mailbox.'],
  [
    'wrong-account',
    'The selected Google account does not match the sender address shown above. Choose that mailbox and try again.',
  ],
  [
    'missing-permission',
    'Allow NovrEvents to send email on your behalf when Google asks which permissions to grant.',
  ],
  [
    'missing-offline-access',
    'Google did not grant ongoing access. Reconnect the mailbox and complete the consent screen.',
  ],
  [
    'failed',
    'The mailbox connection could not be confirmed. Check the Gmail API in the Events Google Cloud project, then try again.',
  ],
])

export function MailSender() {
  const params = useSearchParams()
  const senderError = senderErrors.get(params.get('sender') ?? '')
  const query = useQuery({
    queryKey: ['admin', 'mail-sender'],
    queryFn: () => unwrap(api.GET('/api/v1/admin/mail-sender')),
  })
  return (
    <section id="email-sender" className="mb-6 scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>Transactional email</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <LoadingState rows={1} />
          ) : query.isError ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : (
            <div className="sender-panel">
              <div>
                <strong>{query.data.address}</strong>
                <p className="text-muted-foreground mt-2 text-sm">
                  {query.data.connected
                    ? 'Connected for ticket delivery, verification codes and password resets.'
                    : query.data.needsConsent
                      ? 'Google authorization has expired. Reconnect this mailbox to resume delivery.'
                      : 'Connect this mailbox to send tickets, verification codes and password resets.'}
                </p>
                {senderError && <Notice tone="error">{senderError}</Notice>}
                {!query.data.connected && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium">Google Cloud setup</summary>
                    <p className="text-muted-foreground mt-2">
                      Open the project that owns the Events OAuth client and enable the Gmail API. While the
                      app is in Testing, add {query.data.address} under Google Auth Platform → Audience → Test
                      users. Then authorize sending here with that address.
                    </p>
                  </details>
                )}
                {params.get('sender') === 'connected' && query.data.connected && (
                  <p role="status">Google accepted the confirmation email.</p>
                )}
              </div>
              <GoogleButton mode="sender" />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
