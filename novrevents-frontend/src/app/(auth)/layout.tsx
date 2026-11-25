import { ArrowLeft, CheckCircle2, Lock, QrCode, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { Wordmark } from '@/components/brand'
import { QrGlyph } from '@/components/marketing/qr-glyph'

/** What an account adds, stated as product behaviour. */
const ACCOUNT_POINTS = [
  { icon: QrCode, text: 'Every ticket in one place, with its QR code ready for check-in.' },
  { icon: CheckCircle2, text: 'Registrations you can track, including ones awaiting the organiser’s review.' },
  { icon: ShieldCheck, text: 'Your answers go only to the organiser of each event, never to a public page.' },
] as const

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between">
          <Wordmark />
          <span className="text-muted-foreground hidden items-center gap-1.5 text-[13px] sm:inline-flex">
            <Lock className="size-3.5" aria-hidden /> Secure sign-in
          </span>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto grid w-full max-w-[1280px] flex-1 items-start gap-16 px-4 pt-8 pb-16 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:px-10 lg:pt-16"
      >
        <div className="w-full max-w-[30rem]">
          <Link
            href="/explore"
            className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1.5 text-[13px] font-medium"
          >
            <ArrowLeft className="size-4" aria-hidden /> Browse events
          </Link>
          {children}
        </div>

        <aside aria-label="About NOVR Events accounts" className="hidden lg:block">
          <div className="bg-card ml-auto max-w-md rounded-xl border p-6 shadow-xs">
            <p className="eyebrow flex items-center gap-2">
              <span aria-hidden className="bg-primary size-1.5 rounded-full" /> Your NOVR Events account
            </p>
            <figure aria-hidden className="bg-brand-soft/50 mt-5 flex items-center gap-4 rounded-lg border p-4">
              <QrGlyph seed={5} className="size-20 shrink-0" />
              <div className="min-w-0">
                <p className="text-success text-xs font-medium">Ticket valid</p>
                <p className="mt-1 text-sm font-semibold">General admission</p>
                <p className="text-muted-foreground mt-0.5 font-mono text-[11px] tracking-wide">K7QM-4XRT-92HP</p>
              </div>
            </figure>
            <p className="text-subtle-foreground mt-2 text-[11px]">Illustration of a ticket, with sample content.</p>
            <ul className="mt-6 space-y-4 border-t pt-5">
              {ACCOUNT_POINTS.map((point) => (
                <li key={point.text} className="flex gap-3 text-sm">
                  <span className="bg-brand-soft text-primary flex size-7 shrink-0 items-center justify-center rounded-sm">
                    <point.icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-muted-foreground pt-0.5">{point.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-6 border-t pt-4 text-[13px]">
              You can register for most events without an account. An account keeps your tickets together.
            </p>
          </div>
        </aside>
      </main>
      <footer className="text-subtle-foreground flex justify-center gap-5 border-t px-4 py-5 text-xs">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <span>© {new Date().getFullYear()} Cybernovr</span>
      </footer>
    </div>
  )
}
