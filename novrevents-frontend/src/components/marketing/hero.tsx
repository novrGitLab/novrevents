import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Compass,
  FileDown,
  LayoutDashboard,
  MapPin,
  Settings,
  ShieldCheck,
  Ticket,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { QrGlyph } from './qr-glyph'
import { SAMPLE, SAMPLE_REGISTRATIONS } from './sample'

/** What the product covers, stated as plain capabilities rather than claims. */
const HERO_POINTS = ['Free to browse and register', 'Signed QR tickets', 'Check-in from any phone'] as const

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b">
      <div className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pt-14 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:px-10 lg:pt-20 lg:pb-20">
        <div>
          <p className="bg-brand-soft text-brand-text inline-flex items-center gap-2 rounded-sm px-2 py-1 text-xs font-medium">
            <span aria-hidden className="bg-primary size-1.5 rounded-full" />
            Event discovery and management by Cybernovr
          </p>
          <h1 id="hero-title" className="marketing-hero mt-5 max-w-[16ch] text-balance">
            Discover events. Bring communities together.
          </h1>
          <p className="text-muted-foreground mt-5 max-w-[56ch] text-base leading-7 sm:text-[17px]">
            Find conferences, workshops, webinars and meetups across technology, business, education and more,
            with a dedicated space for cybersecurity. Organisers run registration, approvals, QR tickets and
            check-in in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/explore">
                <Compass /> Discover events
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard/events/new">Host an event</Link>
            </Button>
          </div>
          <Link
            href="/explore?mode=cybersecurity"
            className="text-brand-text hover:text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            <ShieldCheck className="size-4" aria-hidden /> Explore cybersecurity events
            <ChevronRight className="size-4" aria-hidden />
          </Link>
          <ul className="mt-8 flex flex-col gap-2 border-t pt-5 text-[13px] sm:flex-row sm:flex-wrap sm:gap-x-6">
            {HERO_POINTS.map((point) => (
              <li key={point} className="text-muted-foreground inline-flex items-center gap-2">
                <CheckCircle2 className="text-primary size-4 shrink-0" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <figure>
          <HeroPass />
          <figcaption className="text-muted-foreground mt-3 text-xs leading-5">
            Illustration with sample content: an event listing, its registration form and the attendee’s ticket.
          </figcaption>
        </figure>
      </div>
    </section>
  )
}

/** Compact composition of listing, form and ticket, drawn from tokens and the product's own labels. */
function HeroPass() {
  return (
    <div aria-hidden className="bg-card rounded-xl border p-4 shadow-xs select-none sm:p-5">
      <div className="flex items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm border px-1.5 py-px text-[10px] font-medium">{SAMPLE.type}</span>
            <span className="bg-success/10 text-success rounded-sm px-1.5 py-px text-[10px] font-medium">
              Registration open
            </span>
          </div>
          <p className="mt-2 text-[15px] leading-5 font-semibold tracking-[-0.01em]">{SAMPLE.event}</p>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[11px]">
            <CalendarDays className="size-3" /> {SAMPLE.dateShort}
            <MapPin className="ml-1 size-3" /> {SAMPLE.place}
          </p>
        </div>
        <Bookmark className="text-subtle-foreground size-4 shrink-0" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="rounded-lg border p-3">
          <p className="eyebrow">Registration form</p>
          <div className="mt-3 space-y-2.5">
            {['Full name', 'Organisation'].map((label) => (
              <div key={label}>
                <p className="text-[10px] font-medium">{label}</p>
                <div className="mt-1 h-6 rounded-sm border" />
              </div>
            ))}
            <div>
              <p className="text-[10px] font-medium">Role</p>
              <div className="border-primary text-brand-text mt-1 flex h-6 items-center rounded-sm border px-2 text-[10px]">
                Student
              </div>
            </div>
            <p className="bg-brand-soft text-brand-text rounded-sm px-2 py-1 text-[10px]">
              Shown because Role is Student: University
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center rounded-lg border p-3">
          <div className="flex w-full items-center justify-between">
            <p className="eyebrow">Ticket</p>
            <span className="text-success text-[10px] font-medium">Valid</span>
          </div>
          <QrGlyph seed={11} className="mt-3 size-24" />
          <p className="text-muted-foreground mt-2 font-mono text-[10px] tracking-wide">{SAMPLE.ticketCode}</p>
          <p className="mt-1 text-[10px] font-medium">{SAMPLE.ticketType}</p>
        </div>
      </div>

      <div className="bg-brand-soft mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5">
        <CheckCircle2 className="text-primary size-4 shrink-0" />
        <p className="text-brand-text text-[11px] font-medium">Checked in at the door · Scan accepted</p>
      </div>
    </div>
  )
}

/* ─── Static product showcase: the organiser workspace, drawn from tokens ──────────────────────── */

const NAV = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Discover', icon: Compass },
  { label: 'My tickets', icon: Ticket },
  { label: 'Saved events', icon: Bookmark },
  { label: 'Following', icon: Users },
  { label: 'My events', icon: CalendarDays, active: true },
  { label: 'Forms', icon: ClipboardList },
  { label: 'Settings', icon: Settings },
] as const

const METRICS = [
  { label: 'Confirmed', value: '86', hint: 'of 120 places' },
  { label: 'Awaiting review', value: '4', hint: 'Pending approval' },
  { label: 'Checked in', value: '0', hint: '0% of confirmed' },
  { label: 'Forms', value: '2', hint: 'Registration and other forms' },
] as const

const STATUS_TONE: Record<string, string> = {
  Confirmed: 'bg-success/10 text-success',
  'Awaiting review': 'bg-warning/12 text-warning',
  Declined: 'bg-destructive/10 text-destructive',
}

const WORKSPACE_TABS = ['Overview', 'Forms', 'Registrations', 'Attendance', 'Check-in', 'Team'] as const

/** The organiser workspace, used on the homepage beside the organiser lifecycle. */
export function WorkspaceShowcase() {
  return (
    <div aria-hidden className="bg-card overflow-hidden rounded-lg border select-none">
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-[200px] shrink-0 flex-col border-r lg:flex">
          <div className="flex h-14 flex-col justify-center border-b px-4">
            <span className="text-[14px] leading-none font-semibold">
              NOVR <span className="font-normal">Events</span>
            </span>
            <span className="text-muted-foreground mt-1 text-[10px] leading-none">by Cybernovr</span>
          </div>
          <div className="space-y-0.5 px-2.5 py-4">
            {NAV.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-[12px] font-medium',
                  'active' in item ? 'bg-brand-soft text-brand-text' : 'text-muted-foreground',
                )}
              >
                <item.icon
                  className={cn('size-3.5', 'active' in item ? 'text-brand' : 'text-subtle-foreground')}
                />
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="flex h-14 items-center gap-1.5 border-b px-4 text-[12px] sm:px-6">
            <span className="text-muted-foreground hidden sm:inline">Organizing</span>
            <ChevronRight className="text-subtle-foreground hidden size-3 sm:block" />
            <span className="font-medium">My events</span>
            <span className="bg-brand-soft text-brand-text ml-auto flex size-7 items-center justify-center rounded-full text-[10px] font-semibold">
              AO
            </span>
          </div>

          <div className="px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">{SAMPLE.event}</p>
                  <span className="bg-brand-soft text-brand-text rounded-[4px] px-1.5 py-px text-[11px] font-medium">
                    Published
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-[12px]">
                  {SAMPLE.dateShort} · {SAMPLE.place}
                </p>
              </div>
              <span className="bg-primary text-primary-foreground inline-flex h-8 w-fit shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium">
                <FileDown className="size-3.5" /> Export CSV
              </span>
            </div>

            <div className="mt-4 flex gap-4 overflow-hidden border-b text-[12px] font-medium">
              {WORKSPACE_TABS.map((tab) => (
                <span
                  key={tab}
                  className={cn(
                    '-mb-px border-b-2 pb-2 whitespace-nowrap',
                    tab === 'Registrations'
                      ? 'border-brand text-foreground'
                      : 'text-muted-foreground border-transparent',
                  )}
                >
                  {tab}
                </span>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {METRICS.map((metric) => (
                <div key={metric.label} className="rounded-lg border px-3.5 py-3">
                  <p className="text-muted-foreground text-[11px]">{metric.label}</p>
                  <p className="mt-0.5 text-[20px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">
                    {metric.value}
                  </p>
                  <p className="text-subtle-foreground truncate text-[10px]">{metric.hint}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-[10px] tracking-[0.04em] uppercase">
                    <th className="px-3.5 py-2 font-medium">Name</th>
                    <th className="hidden px-3.5 py-2 font-medium sm:table-cell">Ticket type</th>
                    <th className="px-3.5 py-2 font-medium">Status</th>
                    <th className="hidden px-3.5 py-2 font-medium md:table-cell">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_REGISTRATIONS.map((row) => (
                    <tr key={row.name} className="border-b last:border-b-0">
                      <td className="px-3.5 py-2.5 font-medium">{row.name}</td>
                      <td className="text-muted-foreground hidden px-3.5 py-2.5 sm:table-cell">
                        {row.ticket}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span
                          className={cn(
                            'rounded-[4px] px-1.5 py-px text-[11px] font-medium whitespace-nowrap',
                            STATUS_TONE[row.status],
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="text-muted-foreground hidden px-3.5 py-2.5 tabular-nums md:table-cell">
                        {row.when}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
