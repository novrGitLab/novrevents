'use client'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { GoogleButton } from '@/components/auth/google-button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { api, unwrap } from '@/lib/api/client'
export function MailSender() {
  const params = useSearchParams()
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
                {params.get('sender') === 'failed' && (
                  <Notice tone="error">
                    Google authorization did not finish. Use the sender address above, grant permission to
                    send email, and check that the Gmail API is enabled in the Events Google Cloud project.
                  </Notice>
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
