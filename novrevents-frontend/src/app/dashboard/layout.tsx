'use client'

import {
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  ClipboardList,
  Compass,
  LayoutDashboard,
  ListChecks,
  Settings,
  Ticket,
  User,
  Users,
} from '@/components/ui/icons'
import { AppShell, type NavGroup, type NavItem } from '@/components/layout/app-shell'

const groups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/dashboard/discover', label: 'Discover', icon: Compass },
    ],
  },
  {
    label: 'Attending',
    items: [
      { href: '/dashboard/tickets', label: 'My tickets', icon: Ticket },
      { href: '/dashboard/registrations', label: 'My registrations', icon: ListChecks },
      { href: '/dashboard/saved', label: 'Saved events', icon: Bookmark },
      { href: '/dashboard/following', label: 'Following', icon: Users },
    ],
  },
  {
    label: 'Organizing',
    items: [
      { href: '/dashboard/events', label: 'My events', icon: CalendarDays },
      { href: '/dashboard/forms', label: 'Forms', icon: ClipboardList },
      { href: '/dashboard/organizations', label: 'Organizations', icon: Building2 },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/dashboard/profile', label: 'Profile', icon: User },
      { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
]

const mobileTabs: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/discover', label: 'Discover', icon: Compass },
  { href: '/dashboard/tickets', label: 'Tickets', icon: Ticket },
  { href: '/dashboard/events', label: 'My events', icon: CalendarDays },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell groups={groups} mobileTabs={mobileTabs}>
      {children}
    </AppShell>
  )
}
