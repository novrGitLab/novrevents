import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.ComponentProps<'span'> {
  variant?:
    | 'default'
    | 'primary'
    | 'brand'
    | 'secondary'
    | 'success'
    | 'warning'
    | 'destructive'
    | 'outline'
    | 'security'
}

const variants: Record<NonNullable<BadgeProps['variant']>, string> = {
  /** Purple tint: published, selected, metadata chips. */
  default: 'bg-brand-soft text-brand-text',
  primary: 'bg-brand-soft text-brand-text',
  /** Solid purple: roles such as Owner and Admin. */
  brand: 'bg-primary text-primary-foreground',
  /** Neutral hairline chip: drafts, archived, secondary metadata. */
  secondary: 'border border-border bg-card text-muted-foreground',
  outline: 'border border-border bg-transparent text-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  /** Classification and access tags: uppercase micro-label on white. */
  security: 'border border-border bg-card text-foreground text-label-sm uppercase',
}

/** Status and metadata chip: 4px radius, sentence case, no pill. */
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'text-label-md inline-flex items-center gap-1 rounded-sm px-2 py-0.5 whitespace-nowrap [&_svg]:size-3',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
