'use client'

import { Check, ChevronDown } from 'lucide-react'
import {
  Avatar as AvatarPrimitive,
  Checkbox as CheckboxPrimitive,
  DropdownMenu as MenuPrimitive,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
} from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

// ─── Checkbox ────────────────────────────────────────────────────────────────

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer border-input bg-card focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground size-4 shrink-0 rounded-[3px] border focus-visible:ring-2 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

// ─── Switch ──────────────────────────────────────────────────────────────────

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-card block size-4 rounded-full shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'text-muted-foreground inline-flex h-10 max-w-full items-stretch gap-5 overflow-x-auto border-b border-border [scrollbar-width:none]',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-primary -mb-px inline-flex items-center justify-center gap-1.5 border-b-2 border-transparent text-[13px] font-medium whitespace-nowrap [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

export function Avatar({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <AvatarPrimitive.Root
      className={cn('bg-brand-soft relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
    >
      {src && <AvatarPrimitive.Image src={src} alt="" className="aspect-square size-full object-cover" />}
      <AvatarPrimitive.Fallback className="text-secondary-foreground flex size-full items-center justify-center text-xs font-semibold">
        {initials || '?'}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

// ─── Dropdown menu ───────────────────────────────────────────────────────────

export const DropdownMenu = MenuPrimitive.Root
export const DropdownMenuTrigger = MenuPrimitive.Trigger

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        sideOffset={6}
        align="end"
        className={cn(
          'bg-popover text-popover-foreground z-50 min-w-52 overflow-hidden rounded-lg border p-1 shadow-md',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand-text [&_svg]:text-muted-foreground relative flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2 text-[13px] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        destructive && 'text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return (
    <MenuPrimitive.Label
      className={cn('text-muted-foreground px-2 py-1.5 text-xs font-medium', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('bg-border h-px w-full', className)} />
}

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('bg-muted animate-pulse rounded-sm', className)} {...props} />
}

export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group bg-card rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t px-4 py-3">{children}</div>
    </details>
  )
}
