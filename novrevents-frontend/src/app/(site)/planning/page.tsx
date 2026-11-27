import { EditorialPhoto } from '@/components/marketing/photo'
import { PlannerForm } from './planner-form'
export const metadata = {
  title: 'Event planning enquiries',
  description:
    'Request help planning a wedding, anniversary, conference or community event. Send the NovrEvents planning team a private event brief.',
  alternates: { canonical: '/planning' },
}
export default function PlanningPage() {
  return (
    <article className="spread guide-article">
      <header className="guide-lead">
        <div>
          <h1 className="spread-heading">
            Plan the <em>occasion.</em>
          </h1>
          <p>
            Whether it’s a conference for two hundred or an anniversary lunch for twenty, tell the planning
            team who’s coming, where you’re gathering and what you need a hand with.
          </p>
          <a className="ink-link" href="#planning-brief">
            Send an event brief ↓
          </a>
        </div>
        <EditorialPhoto
          name="anniversary"
          alt="A couple at their anniversary lunch, surrounded by family"
          priority
          sizes="(max-width: 720px) 100vw, 55vw"
        />
      </header>
      <section className="guide-body" id="planning-brief">
        <div className="grid gap-8 border-t py-10 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold">Your event brief</h2>
            <p>
              A date estimate is fine. Include any venue you have in mind, accessibility needs and the parts
              you want to coordinate yourself.
            </p>
            <p>
              Only the planning team receives your contact details. Sending a brief does not reserve a venue
              or commit you to a fee.
            </p>
          </div>
          <PlannerForm />
        </div>
      </section>
    </article>
  )
}
