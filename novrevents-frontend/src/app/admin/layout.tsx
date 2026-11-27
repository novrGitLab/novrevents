'use client'

import { ClipboardList, Building2, CalendarDays, Flag, LayoutDashboard, ScrollText, Settings, Users } from '@/components/ui/icons'
import { AppShell, type NavGroup, type NavItem } from '@/components/layout/app-shell'

const groups: NavGroup[] = [
  {
    label: 'Administration',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/events', label: 'Events', icon: CalendarDays },
      { href: '/admin/reports', label: 'Reports', icon: Flag },
      { href: '/admin/organizations', label: 'Organizations', icon: Building2 },
      { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
      { href: '/admin/payments', label: 'Ticket payments', icon: ClipboardList },
      { href: '/admin/planning', label: 'Planning requests', icon: ScrollText },
      { href: '/admin/settings', label: 'Configuration', icon: Settings },
    ],
  },
  {
    label: 'Workspace',
    items: [{ href: '/dashboard', label: 'My dashboard', icon: LayoutDashboard, exact: true }],
  },
]

const mobileTabs: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/events', label: 'Events', icon: CalendarDays },
  { href: '/admin/reports', label: 'Reports', icon: Flag },
]

/** Visible only to platform administrators; the API enforces the same rule on every /admin endpoint. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell groups={groups} requireAdmin mobileTabs={mobileTabs}>
      {children}
    </AppShell>
  )
}
