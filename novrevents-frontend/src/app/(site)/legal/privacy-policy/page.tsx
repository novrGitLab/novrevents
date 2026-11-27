import type { Metadata } from 'next'
import { POLICY_VERSION } from '@/lib/policy'

export const metadata: Metadata = { title: 'Privacy policy' }

/*
 * Plain-language description of what the platform actually does with data, written from the
 * implementation. It is not legal advice: Cybernovr should have it reviewed before launch.
 */
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
      <p className="text-muted-foreground mt-2 text-sm">Version {POLICY_VERSION}.</p>
      <p className="text-muted-foreground mt-2 text-sm">
        This summary describes how NOVR Events, a Cybernovr platform, handles personal data.
      </p>
      <div className="mt-8 space-y-8 text-[15px] leading-7 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Information collected</h2>
          <ul>
            <li>
              Account details: email address, name, username, password (stored only as a salted hash) and the
              optional profile details you add.
            </li>
            <li>
              Form answers you submit to an organiser, including files you upload. You do not need an account
              to submit a form.
            </li>
            <li>
              Planning briefs include the contact, occasion, location and guest information you submit to the
              planning team.
            </li>
            <li>Registrations, tickets and check-in times for events you attend.</li>
            <li>
              A record of the emails we send you and, where our email provider reports it, whether they were
              delivered or opened.
            </li>
            <li>
              Security information: active sessions with their browser and network address, and an audit log
              of sensitive actions.
            </li>
          </ul>
        </section>
        <section>
          <h2>Who can see it</h2>
          <ul>
            <li>
              Form answers are visible only to the organiser of that form and the team they authorise. They
              are never published.
            </li>
            <li>
              Your public profile shows only the fields you choose. You can make your profile private at any
              time.
            </li>
            <li>
              The events you register for are private by default. If you turn on sharing, only confirmed
              registrations for public events are shown, and only to your followers.
            </li>
            <li>Event check-in staff see the attendee name and ticket type needed to admit you.</li>
          </ul>
        </section>
        <section>
          <h2>Sign-in and ticket payments</h2>
          <p>
            When you choose Google sign-in, NovrEvents receives a Google account identifier, the verified
            email address and the profile name used to set up the account. Password sign-in remains available.
          </p>
          <p>
            For an online ticket purchase, Paystack receives the attendee email, the amount in naira, a
            payment reference and the organizer’s settlement identifier. Card and bank authorization details
            are entered on Paystack’s checkout. NovrEvents stores payment references and confirmation status
            for tickets and reconciliation.
          </p>
        </section>
        <section>
          <h2>Analytics</h2>
          <p>
            NovrEvents counts event page views and form starts to give organizers attendance and conversion
            figures. Daily visitor counts use a rotating identifier. Event analytics run without advertising
            trackers or analytics cookies.
          </p>
        </section>
        <section>
          <h2>Email</h2>
          <p>
            Ticket and account security emails are transactional. Reminders, announcements and invitations can
            be switched off from the link in any of those emails or in your account settings.
          </p>
        </section>
        <section>
          <h2>Retention and deletion</h2>
          <p>
            Organisers can set how long their form responses are kept, after which they are deleted
            automatically, and can delete responses at any time. To have your account or data removed, contact
            the organiser of the event or Cybernovr support.
          </p>
        </section>
        <section>
          <h2>Cookies</h2>
          <p>
            An essential cookie keeps your session signed in. A separate cookie remembers your cookie choice
            for six months.
          </p>
        </section>
      </div>
    </div>
  )
}
