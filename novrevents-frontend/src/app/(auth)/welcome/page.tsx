'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarPlus, Compass, LayoutDashboard, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { LoadingState, Notice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

const choices: Array<{ href: string; title: string; text: string; icon: LucideIcon }> = [
  {
    href: '/explore',
    title: 'Explore events',
    text: 'Find cybersecurity conferences, workshops, CTFs and meetups.',
    icon: Compass,
  },
  {
    href: '/dashboard/events/new',
    title: 'Host an event',
    text: 'Publish an event, then manage registration, forms, tickets and check-in.',
    icon: CalendarPlus,
  },
  {
    href: '/dashboard',
    title: 'Go to your dashboard',
    text: 'See your tickets, registrations and events in one place.',
    icon: LayoutDashboard,
  },
]

/**
 * The one-time welcome after email verification. Signed-out visitors are sent to sign in first; anyone who has
 * already completed or skipped it goes straight to the dashboard. Choosing a destination (or skipping) records
 * completion on the server, so it is never shown again on any device.
 */
export default function WelcomePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, isAuthenticated, isLoading } = useSession()
  const [pending, setPending] = React.useState<string | null>(null)
  // Set once a destination is chosen: the completed session must not redirect us away first.
  const leaving = React.useRef(false)

  React.useEffect(() => {
    if (isLoading || leaving.current) return
    if (!isAuthenticated) router.replace('/login?next=%2Fwelcome')
    else if (user?.onboarded) router.replace('/dashboard')
  }, [isLoading, isAuthenticated, user, router])

  const finish = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/me/onboarding')),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.session })
    },
  })

  const go = async (href: string) => {
    leaving.current = true
    setPending(href)
    try {
      await finish.mutateAsync()
      router.replace(href)
    } catch {
      leaving.current = false
      setPending(null)
    }
  }

  if (isLoading || !isAuthenticated || !user || user.onboarded) {
    return <LoadingState rows={2} label="Loading" />
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-muted-foreground text-[13px]">Account ready</p>
        <h1 className="text-headline-lg">
          Welcome to NOVR Events, {user.profile.displayName.split(' ')[0]}.
        </h1>
        <p className="text-muted-foreground text-[15px] leading-6">
          Where would you like to start? You can attend and organise events from this same account, so nothing
          needs changing later.
        </p>
      </header>

      {!user.emailVerified && (
        <Notice tone="warning">
          Verify your email address before you publish events or forms. You can still explore events now.
        </Notice>
      )}

      {finish.isError && <Notice tone="error">{errorMessage(finish.error)}</Notice>}

      <ul className="bg-card divide-y rounded-lg border">
        {choices.map((choice) => (
          <li key={choice.href}>
            <button
              type="button"
              onClick={() => void go(choice.href)}
              disabled={pending !== null}
              className="hover:bg-brand-soft/60 flex w-full items-center gap-3.5 px-4 py-3.5 text-left disabled:opacity-60"
            >
              <choice.icon className="text-muted-foreground size-[18px] shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{choice.title}</span>
                <span className="text-muted-foreground block text-[13px] leading-5">{choice.text}</span>
              </span>
              <ArrowRight className="text-subtle-foreground size-4 shrink-0" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void go('/dashboard')}
          loading={pending === '/dashboard' && finish.isPending}
        >
          Skip for now
        </Button>
      </div>
    </div>
  )
}
