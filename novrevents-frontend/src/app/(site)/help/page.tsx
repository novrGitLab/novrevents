import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { EditorialPhoto } from '@/components/marketing/photo'

export const metadata = {
  title: 'Tickets and attendee help',
  description:
    'Find a NovrEvents ticket, check a payment, manage a registration and prepare for entry on the day.',
  alternates: { canonical: '/help' },
}
const answers = [
  [
    'Where is the ticket?',
    'Sign in with the account used to register and open My tickets. For a guest booking, open the private registration link shown after submitting the form or included in the confirmation email. Keep that link private.',
  ],
  [
    'Why is a registration awaiting review?',
    'Some hosts review requests before admitting guests. The registration page shows the current decision. A request alone does not admit someone to the event. Once confirmed, the ticket and its QR code appear on the registration.',
  ],
  [
    'How does paid entry work?',
    'A ticket with an online price is charged in Nigerian naira through Paystack. Open the registration, check the amount and complete checkout before the displayed hold expires. If Paystack has already charged the payment, return to the confirmation page and check its status before trying another payment.',
  ],
  [
    'What should guests bring?',
    'Save the ticket PDF or open the QR code before reaching the door. Check the event listing for the entrance, access requirements and any identification the host asks for. Every ticket has its own code. Keep it with the person attending.',
  ],
  [
    'Can a guest cancel?',
    'Open the private registration page or the registration in the account. If cancellation is available, cancelling releases the place and invalidates the ticket. Contact the organizer about any refund for a paid order and include the payment reference.',
  ],
  [
    'Where are online joining details?',
    'For a virtual or hybrid event, an organizer can make a joining link available to confirmed registrants. Open the ticket at the scheduled time and check the event time zone. Contact the organizer through the listing if joining instructions are missing.',
  ],
] as const
export default function HelpPage() {
  return (
    <article className="spread guide-article">
      <header className="guide-lead">
        <div>
          <h1 className="spread-heading">
            Ticket <em>help.</em>
          </h1>
          <p>
            From finding the confirmation to getting through the door, keep the details for the day close at
            hand.
          </p>
          <Link href="/dashboard/tickets" className="ink-link">
            Open My tickets <ArrowRight />
          </Link>
        </div>
        <EditorialPhoto
          name="workshop"
          alt="Participants gathering around a shared printing table"
          sizes="(max-width:720px) 100vw, 50vw"
          priority
        />
      </header>
      <section className="guide-body" aria-label="Ticket questions">
        {answers.map(([title, body]) => (
          <details key={title} className="border-t py-5">
            <summary className="cursor-pointer text-xl font-semibold">{title}</summary>
            <p className="max-w-prose py-3">{body}</p>
          </details>
        ))}
      </section>
    </article>
  )
}
