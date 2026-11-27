import { AlertTriangle, Inbox, type EventIcon } from '@/components/ui/icons'
import type * as React from 'react'
import { errorMessage } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Skeleton } from './ui/primitives'

export function LoadingState({
  rows = 3,
  className,
  label = 'Loading',
}: {
  rows?: number
  className?: string
  label?: string
}) {
  return (
    <div role="status" aria-label={label} className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  )
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: EventIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
  /** Inline version for panels and sidebars: no icon, small padding. */
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className={cn('rounded-lg border border-dashed px-4 py-5 text-center', className)}>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-muted-foreground mt-0.5 text-[13px]">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    )
  }
  return (
    <div
      className={cn(
        'bg-card flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <span className="text-primary mb-3 flex size-10 items-center justify-center rounded-lg">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-headline-sm">{title}</p>
      {description && <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  retry,
  className,
}: {
  error: unknown
  retry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/25 bg-destructive/5 flex flex-col items-center rounded-lg border px-6 py-8 text-center',
        className,
      )}
    >
      <AlertTriangle className="text-destructive mb-2 size-5" aria-hidden />
      <p className="font-medium">We couldn’t load this.</p>
      <p className="text-muted-foreground mt-1 text-sm">{errorMessage(error)}</p>
      {retry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Inline message shown above a form or inside a panel. */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  const styles = {
    info: 'border-brand-soft bg-brand-soft/60 text-foreground',
    success: 'border-success/25 bg-success/8 text-foreground',
    warning: 'border-warning/30 bg-warning/8 text-foreground',
    error: 'border-destructive/25 bg-destructive/8 text-foreground',
  }[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-sm border px-3.5 py-2.5 text-sm', styles, className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
    </div>
  )
}
