'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useSession } from '@/hooks/use-session'
import { cn } from '@/lib/utils'
import { NotificationBell, UserMenu } from './user-menu'

/**
 * Public navigation. "Product" and "For organisers" are sections of the homepage; "Discover" is the
 * event directory. Organiser routes are real: the dashboard guard sends signed-out visitors to sign in
 * and back again.
 */
const navLinks = [
  { href: '/#product', label: 'Product', match: null },
  { href: '/explore', label: 'Discover', match: ['/explore', '/events', '/o/'] },
  { href: '/#organisers', label: 'For organisers', match: null },
] as const

const HOST_HREF = '/dashboard/events/new'

export function SiteHeader() {
  const pathname = usePathname()
  const { isAuthenticated, isLoading } = useSession()
  const [open, setOpen] = React.useState(false)

  // Close the mobile menu after navigation. In-page anchors do not change the path, so links close it too.
  const [menuPath, setMenuPath] = React.useState(pathname)
  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setOpen(false)
  }
  const close = () => setOpen(false)

  return (
    <header className="bg-card sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Wordmark />

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active = link.match?.some((prefix) => pathname.startsWith(prefix)) ?? false
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-muted-foreground hover:text-foreground relative rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                  active &&
                    'text-foreground after:bg-brand after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isLoading ? (
            <span className="w-24 sm:w-40" aria-hidden />
          ) : isAuthenticated ? (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href={HOST_HREF}>Host an event</Link>
              </Button>
            </>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </DialogTrigger>
            <DialogContent side="right" className="w-80 gap-0 p-0">
              <div className="flex h-16 items-center border-b px-5">
                <DialogTitle className="text-[15px]">Menu</DialogTitle>
              </div>
              <nav aria-label="Mobile" className="flex flex-col px-2 py-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="hover:bg-muted rounded-md px-3 py-3 text-[15px] font-medium"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="flex flex-col gap-2 border-t px-5 py-4">
                {isAuthenticated ? (
                  <Button asChild variant="outline" onClick={close}>
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild onClick={close}>
                      <Link href={HOST_HREF}>Host an event</Link>
                    </Button>
                    <Button asChild variant="outline" onClick={close}>
                      <Link href="/login">Sign in</Link>
                    </Button>
                    <Button asChild variant="ghost" onClick={close}>
                      <Link href="/register">Create an account</Link>
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  )
}
