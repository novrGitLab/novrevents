import type { Metadata } from 'next'
import { POLICY_VERSION } from '@/lib/policy'

export const metadata: Metadata = { title: 'Terms of use' }

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of use</h1>
      <p className="text-muted-foreground mt-2 text-sm">Version {POLICY_VERSION}.</p>
      <div className="mt-8 space-y-8 text-[15px] leading-7 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Using NovrEvents</h2>
          <p>
            NovrEvents is operated by Cybernovr. By creating an account or submitting a form you agree to
            these terms.
          </p>
        </section>
        <section>
          <h2>Organisers</h2>
          <ul>
            <li>
              You are responsible for the accuracy of your event listings and for how you use the information
              attendees give you.
            </li>
            <li>
              Collect only what you need, use it only for your event, and respect the retention period you
              set.
            </li>
            <li>
              Messages may only be sent to people who registered for your event, or invitations to people you
              have a reason to invite. Bulk marketing is not permitted.
            </li>
            <li>
              State the ticket price, what it includes and the refund terms before accepting payment. Online NGN tickets use Paystack checkout. Payment at the door follows the terms in the listing.
            </li>
          </ul>
        </section>
        <section>
          <h2>Tickets and payments</h2>
          <p>For online tickets, complete checkout before the reservation expires. A confirmed registration includes a QR ticket. If a charge appears on your statement without a ticket, keep the payment reference and contact the organiser. Direct refund requests to the organiser named on the event page.</p>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <ul>
            <li>
              No scams, phishing, malware distribution, or events that encourage illegal activity against
              systems you are not authorised to test.
            </li>
            <li>No misleading listings or impersonation of other people or organisations.</li>
            <li>Do not attempt to bypass access controls, rate limits or ticket validation.</li>
          </ul>
          <p className="mt-2">
            Anyone can report an event. Moderators may remove events and suspend accounts that break these
            rules.
          </p>
        </section>
        <section>
          <h2>Availability</h2>
          <p>The service may be interrupted for maintenance. Keep your own copies of important exports.</p>
        </section>
      </div>
    </div>
  )
}
