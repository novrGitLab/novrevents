import {
  Bookmark,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Compass,
  FileDown,
  LayoutDashboard,
  Settings,
  Ticket,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SAMPLE, SAMPLE_REGISTRATIONS } from './sample'

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="border-b">
      <div className="mx-auto max-w-[1200px] px-4 pt-16 pb-16 sm:px-6 lg:px-8 lg:pt-24 lg:pb-20">
        <div className="max-w-[760px]">
          <h1 id="hero-title" className="marketing-hero text-balance">
            Discover and manage cybersecurity events.
          </h1>
          <p className="text-muted-foreground mt-6 max-w-[60ch] text-[17px] leading-7">
            NOVR Events is the event platform for the security community. Professionals, researchers and
            students find conferences, workshops, CTF competitions and meetups. Organisers run registration,
            tickets and check-in in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/explore">Discover events</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard/events/new">Host an event</Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-[13px]">
            Browsing and registering work without an account.
          </p>
        </div>

        <figure className="mt-14 lg:mt-16">
          <Showcase />
          <figcaption className="text-muted-foreground mt-4 text-[13px] leading-5">
            Illustration with sample content, composed from the event workspace overview and registrations
            pages in NOVR Events.
          </figcaption>
        </figure>
      </div>
    </section>
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

function Showcase() {
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
                  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12px] font-medium',
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
                  <tr className="bg-muted text-muted-foreground border-b text-left">
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
