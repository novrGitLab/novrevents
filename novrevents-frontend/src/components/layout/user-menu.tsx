'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, ChevronsUpDown, LayoutDashboard, LogOut, Settings, Shield, Ticket, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/primitives'
import { useSession } from '@/hooks/use-session'
import { api, setCsrfToken, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'

export function NotificationBell() {
  const { data } = useQuery({
    queryKey: keys.notifications({ badge: true }),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/notifications', { params: { query: { page: 1, pageSize: 1, unreadOnly: 'true' } } }),
      ),
    refetchInterval: 60_000,
  })
  const unread = data?.unreadCount ?? 0
  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link
        href="/dashboard/notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="text-muted-foreground" />
        {unread > 0 && (
          <span className="bg-destructive text-destructive-foreground ring-background absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ring-2">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}

/** Account menu. `avatar` sits in a header; `card` fills the bottom of the sidebar. */
export function UserMenu({ variant = 'avatar' }: { variant?: 'avatar' | 'card' }) {
  const { user } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  if (!user) return null

  const logout = async () => {
    try {
      await unwrap(api.POST('/api/v1/auth/logout'))
    } catch (error) {
      toast.error(errorMessage(error))
      return
    }
    setCsrfToken(null)
    queryClient.clear()
    router.push('/')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'card' ? (
          <button
            className="hover:bg-muted data-[state=open]:bg-muted flex w-full items-center gap-2.5 rounded-md p-2 text-left"
            aria-label="Account menu"
          >
            <Avatar src={user.profile.avatarUrl} name={user.profile.displayName} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{user.profile.displayName}</span>
              <span className="text-muted-foreground block truncate text-xs">@{user.profile.username}</span>
            </span>
            <ChevronsUpDown className="text-subtle-foreground size-4 shrink-0" aria-hidden />
          </button>
        ) : (
          <button className="ml-1 rounded-full" aria-label="Account menu">
            <Avatar src={user.profile.avatarUrl} name={user.profile.displayName} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        {...(variant === 'card'
          ? { side: 'top' as const, align: 'start' as const, className: 'w-[214px]' }
          : {})}
      >
        <DropdownMenuLabel>
          <span className="text-foreground block truncate text-sm font-semibold">
            {user.profile.displayName}
          </span>
          <span className="block truncate">@{user.profile.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard /> Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/tickets">
            <Ticket /> My tickets
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/u/${user.profile.username}`}>
            <User /> Public profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        {user.role === 'ADMIN' && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield /> Administration
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
