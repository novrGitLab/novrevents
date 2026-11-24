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
} from 'lucide-react'
import { AppShell, type NavGroup } from '@/components/layout/app-shell'

const groups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/explore', label: 'Discover', icon: Compass },
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell groups={groups}>{children}</AppShell>
}
