import Link from 'next/link'
import { Wordmark } from '@/components/brand'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 sm:px-6">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between">
          <Wordmark />
          <Link
            href="/explore"
            className="text-muted-foreground hover:text-foreground text-[13px] font-medium"
          >
            Browse events
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pt-10 pb-16 sm:pt-[12vh]">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="text-subtle-foreground flex justify-center gap-5 px-4 pb-6 text-xs">
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
