'use client'

import { ChevronRight, Menu, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { CybernovrLogo } from '@/components/brand'
import { LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { NotificationBell, UserMenu } from './user-menu'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Match only the exact path (for index pages). */
  exact?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

function isActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function findActive(groups: NavGroup[], pathname: string) {
  let best: { group: NavGroup; item: NavItem } | null = null
  for (const group of groups)
    for (const item of group.items)
      if (isActive(item, pathname) && (!best || item.href.length > best.item.href.length))
        best = { group, item }
  return best
}

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = findActive(groups, pathname)
  return (
    <nav aria-label="Main" className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-subtle-foreground mb-1.5 px-3 text-xs font-medium">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const current = active?.item.href === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'flex h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors',
                      current
                        ? 'bg-brand-soft text-brand-text'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <item.icon
                      className={cn('size-4 shrink-0', current ? 'text-brand' : 'text-subtle-foreground')}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Product identity at the top of the sidebar. Not a link inside a link: the name is the only link. */
function SidebarBrand({ admin }: { admin: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Link
        href={admin ? '/admin' : '/dashboard'}
        className="text-foreground w-fit rounded-sm text-[15px] leading-none font-semibold tracking-[-0.01em]"
      >
        NOVR <span className="font-normal">Events</span>
        <span className="sr-only">{admin ? ', administration' : ', dashboard'}</span>
      </Link>
      <span className="text-subtle-foreground inline-flex items-center gap-1.5 text-[11px] leading-none">
        {admin ? 'Administration · by' : 'by'} <CybernovrLogo height={9} />
      </span>
    </div>
  )
}

function VerifyBanner() {
  const [sending, setSending] = React.useState(false)
  return (
    <div className="border-warning/25 bg-warning/6 border-b px-4 py-2.5 text-[13px] sm:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">Verify your email address</span>
          <span className="text-muted-foreground"> to publish events and forms and to send messages.</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          loading={sending}
          onClick={async () => {
            setSending(true)
            try {
              await unwrap(api.POST('/api/v1/auth/resend-verification'))
              // The API accepts the request; whether an email leaves depends on the server's email setup.
              toast.success('Verification email requested.')
            } catch (error) {
              toast.error(errorMessage(error))
            } finally {
              setSending(false)
            }
          }}
        >
          Resend email
        </Button>
      </div>
    </div>
  )
}

/** Paths whose page uses the full content width (editors with side panels). */
const WIDE = [/^\/dashboard\/forms\/[^/]+$/, /^\/dashboard\/events\/[^/]+\/forms$/]

/** Authenticated layout: redirects anonymous visitors to sign in; optionally requires ADMIN. */
export function AppShell({
  groups,
  children,
  requireAdmin = false,
}: {
  groups: NavGroup[]
  children: React.ReactNode
  requireAdmin?: boolean
}) {
  const { user, isLoading, isAuthenticated } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    else if (requireAdmin && user?.role !== 'ADMIN') router.replace('/dashboard')
  }, [isLoading, isAuthenticated, requireAdmin, user, router, pathname])

  if (isLoading || !isAuthenticated || (requireAdmin && user?.role !== 'ADMIN')) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <LoadingState rows={4} />
      </div>
    )
  }

  const active = findActive(groups, pathname)
  const wide = WIDE.some((pattern) => pattern.test(pathname))

  return (
    <div className="bg-background min-h-dvh">
      <aside className="bg-card fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b px-5">
          <SidebarBrand admin={requireAdmin} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <NavLinks groups={groups} />
        </div>
        <div className="border-t p-3">
          <UserMenu variant="card" />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col lg:pl-[240px]">
        <header className="bg-card sticky top-0 z-20 border-b">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-8">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" aria-label="Open navigation">
                  <Menu />
                </Button>
              </DialogTrigger>
              <DialogContent side="left" className="gap-6 p-0">
                <DialogTitle className="sr-only">Navigation</DialogTitle>
                <div className="flex h-16 shrink-0 items-center border-b px-5">
                  <SidebarBrand admin={requireAdmin} />
                </div>
                <div className="px-3 pb-6">
                  <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
                </div>
              </DialogContent>
            </Dialog>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
                {active && (
                  <>
                    <li className="text-muted-foreground hidden sm:block">{active.group.label}</li>
                    <li aria-hidden className="text-subtle-foreground hidden sm:block">
                      <ChevronRight className="size-3.5" />
                    </li>
                    <li className="truncate font-medium">
                      {pathname === active.item.href ? (
                        <span aria-current="page">{active.item.label}</span>
                      ) : (
                        <Link href={active.item.href} className="hover:text-brand-text">
                          {active.item.label}
                        </Link>
                      )}
                    </li>
                  </>
                )}
              </ol>
            </nav>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <div className="lg:hidden">
                <UserMenu />
              </div>
            </div>
          </div>
        </header>
        {user && !user.emailVerified && <VerifyBanner />}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className={cn('mx-auto', wide ? 'max-w-[1440px]' : 'max-w-[1200px]')}>{children}</div>
        </main>
      </div>
    </div>
  )
}
