import { AlertTriangle, Check, CheckCircle2, Circle, Copy, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { QrGlyph } from './qr-glyph'
import { SAMPLE } from './sample'
import { Section, SectionIntro } from './section-intro'

/**
 * The organiser lifecycle, in the order an event is run. Every statement describes behaviour the
 * product has today; the small interface fragments use the product's own labels.
 */
const STAGES: { title: string; text: string; fragment: ReactNode }[] = [
  {
    title: 'Create and publish',
    text: 'Start with a private draft. Add the description, agenda, speakers and cover artwork, then choose who can see the event: listed in the directory, unlisted, or private behind a link. A checklist shows what is still missing before you publish.',
    fragment: <PublishFragment />,
  },
  {
    title: 'Build registration forms',
    text: 'Eleven question types, multi-step pages and file uploads. Rules show or require questions based on earlier answers. Exclusion rules screen out applicants who do not qualify, and those applicants see the same neutral confirmation as everyone else.',
    fragment: <RuleFragment />,
  },
  {
    title: 'Manage registrations and tickets',
    text: 'Set capacity and ticket types, approve or decline applicants, cancel registrations and export the list to CSV. Every confirmed attendee gets a signed QR ticket, in their account or on their registration page.',
    fragment: <TicketFragment />,
  },
  {
    title: 'Coordinate the team',
    text: 'Invite managers and check-in staff. Each role sees only the pages it needs, and the event’s task list keeps preparation in one place.',
    fragment: <TeamFragment />,
  },
  {
    title: 'Check attendees in',
    text: 'Staff scan tickets with a phone camera in the browser, with nothing to install, or find attendees by name, email or ticket code. Each scan gives a clear result, and a mistaken check-in can be undone.',
    fragment: <ScanFragment />,
  },
  {
    title: 'Understand performance',
    text: 'See page views, registrations, conversion, attendance and no-show rates, and where visitors came from. Issue certificates that anyone can verify by code.',
    fragment: <AnalyticsFragment />,
  },
]

export function Organisers() {
  return (
    <Section id="organisers" labelledBy="organisers-title" className="border-b">
      <SectionIntro id="organisers-title" title="Run the whole event, from draft to door.">
        <p>
          Each event has its own workspace for the people running it. These are the stages it covers, in the
          order you use them.
        </p>
      </SectionIntro>

      <ol className="mt-12 border-t">
        {STAGES.map((stage, index) => (
          <li
            key={stage.title}
            className="grid grid-cols-[minmax(0,1fr)] gap-5 border-b py-8 lg:grid-cols-[3rem_minmax(0,1fr)_minmax(0,22rem)] lg:gap-8 lg:py-10"
          >
            <span className="text-brand-text text-[14px] font-semibold tabular-nums">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="max-w-[56ch]">
              <h3 className="text-[19px] leading-7 font-semibold tracking-[-0.012em]">{stage.title}</h3>
              <p className="text-muted-foreground mt-2 text-[15px] leading-6">{stage.text}</p>
            </div>
            <div aria-hidden className="select-none">
              {stage.fragment}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground mt-6 text-[13px]">
        The interface fragments above are illustrations with sample content.
      </p>
    </Section>
  )
}

/* ─── Fragments ─────────────────────────────────────────────────────────────────────────────── */

const FRAME = 'bg-card rounded-lg border p-4 text-[12px]'

function PublishFragment() {
  const steps = [
    { label: 'Describe the event', done: true },
    { label: 'Add cover artwork', done: true },
    { label: 'Create a registration form', done: false },
    { label: 'Publish', done: false },
  ]
  return (
    <div className={FRAME}>
      <p className="font-semibold">Before you publish</p>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2">
            {step.done ? (
              <Check className="text-success size-3.5" />
            ) : (
              <Circle className="text-subtle-foreground size-3.5" />
            )}
            <span className={cn(step.done && 'text-muted-foreground')}>{step.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Token({ children }: { children: ReactNode }) {
  return <span className="bg-muted rounded-[4px] px-1.5 py-0.5 font-medium">{children}</span>
}

function RuleFragment() {
  return (
    <div className={cn(FRAME, 'space-y-3')}>
      <div>
        <p className="text-muted-foreground text-[11px] font-medium">Show questions</p>
        <p className="mt-1.5 leading-6">
          Show <Token>Dietary requirements</Token> when <Token>Attending in person</Token> is{' '}
          <Token>Yes</Token>
        </p>
      </div>
      <div className="border-t pt-3">
        <p className="text-muted-foreground text-[11px] font-medium">Exclude response</p>
        <p className="mt-1.5 leading-6">
          Exclude when <Token>Are you 18 or older?</Token> is <Token>No</Token>
        </p>
      </div>
    </div>
  )
}

function TicketFragment() {
  return (
    <div className={cn(FRAME, 'flex items-center gap-4')}>
      <div className="shrink-0 rounded-sm border bg-white p-1">
        <QrGlyph seed={11} className="size-16" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{SAMPLE.event}</p>
        <p className="text-muted-foreground">{SAMPLE.ticketType}</p>
        <p className="mt-2 font-mono tracking-wide">{SAMPLE.ticketCode}</p>
      </div>
    </div>
  )
}

function TeamFragment() {
  const members = [
    { name: 'Ada Okafor', role: 'Owner' },
    { name: 'Kwame Asante', role: 'Manager' },
    { name: 'Zainab Yusuf', role: 'Check-in staff' },
  ]
  return (
    <div className={cn(FRAME, 'p-0')}>
      <ul className="divide-y">
        {members.map((member) => (
          <li key={member.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="font-medium">{member.name}</span>
            <span className="text-muted-foreground">{member.role}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScanFragment() {
  const outcomes = [
    { title: 'Checked in', icon: CheckCircle2, tone: 'text-success' },
    { title: 'Already used', icon: Copy, tone: 'text-warning' },
    { title: 'Invalid ticket', icon: XCircle, tone: 'text-destructive' },
    { title: 'Wrong event', icon: AlertTriangle, tone: 'text-destructive' },
    { title: 'Not valid', icon: XCircle, tone: 'text-destructive' },
  ]
  return (
    <div className={cn(FRAME, 'p-0')}>
      <p className="text-muted-foreground border-b px-4 py-2.5 text-[11px] font-medium">Scan results</p>
      <ul className="divide-y">
        {outcomes.map((outcome) => (
          <li key={outcome.title} className="flex items-center gap-2.5 px-4 py-2">
            <outcome.icon className={cn('size-3.5', outcome.tone)} />
            {outcome.title}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AnalyticsFragment() {
  const metrics = [
    { label: 'Page views', value: '1,240' },
    { label: 'Registrations', value: '90' },
    { label: 'Conversion', value: '7.3%' },
    { label: 'Attendance rate', value: '81%' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map((metric) => (
        <div key={metric.label} className="bg-card rounded-lg border px-3 py-2.5">
          <p className="text-muted-foreground text-[11px]">{metric.label}</p>
          <p className="mt-0.5 text-[17px] font-semibold tabular-nums">{metric.value}</p>
        </div>
      ))}
    </div>
  )
}
