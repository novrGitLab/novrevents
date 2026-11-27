import Link from 'next/link'
import { CybernovrLogo } from '@/components/brand'
import { Section, SectionIntro } from './section-intro'

/** Each statement describes behaviour the product enforces today (see docs/SECURITY.md). */
const FACTS = [
  {
    title: 'Responses stay with the organisers',
    text: 'Form answers are visible only to the people running that event. They never appear on public pages.',
  },
  {
    title: 'Exclusions stay private',
    text: 'Applicants excluded by a rule see the same neutral confirmation as everyone else, and never see the reason.',
  },
  {
    title: 'Uploads are checked and kept private',
    text: 'Files attached to forms are validated by their content, not just their name, and are not publicly reachable.',
  },
  {
    title: 'Access follows the role',
    text: 'Check-in staff see only the operational pages of an event. Managers and owners see the rest.',
  },
  {
    title: 'Profiles are yours to control',
    text: 'Profiles can be private. On a public profile you choose which fields show, and the events you register for stay private unless you share them.',
  },
  {
    title: 'You control your sessions',
    text: 'See every device signed in to your account and sign any of them out.',
  },
]

export function Trust() {
  return (
    <Section id="trust" labelledBy="trust-title" className="border-b">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] lg:gap-20">
        <div>
          <SectionIntro id="trust-title" title="Built by Cybernovr. Private by default.">
            <p>
              Registration data is personal data. These protections are part of NOVR Events, not settings each
              organiser has to remember.
            </p>
          </SectionIntro>
          <div className="mt-8 space-y-3 text-[14px]">
            <a
              href="https://cybernovr.com"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-sm"
            >
              Built and operated by <CybernovrLogo height={13} />
              <span className="sr-only">(opens cybernovr.com in a new tab)</span>
            </a>
            <p className="text-muted-foreground">
              Read the{' '}
              <Link href="/legal/privacy-policy" className="text-brand-text font-medium hover:underline">
                privacy policy
              </Link>{' '}
              and{' '}
              <Link href="/legal/terms-of-use" className="text-brand-text font-medium hover:underline">
                terms of use
              </Link>
              .
            </p>
          </div>
        </div>

        <dl className="grid gap-x-10 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.title} className="border-t py-5">
              <dt className="text-[15px] font-semibold">{fact.title}</dt>
              <dd className="text-muted-foreground mt-1.5 text-[14px] leading-6">{fact.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  )
}
