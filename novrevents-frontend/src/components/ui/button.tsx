import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from '@/components/ui/icons'
import { Slot } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'text-label-lg inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--control-radius)] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        /** Aliases of primary kept for existing call sites. */
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        brand: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        outline:
          'border border-border bg-card text-foreground hover:border-primary hover:bg-brand-soft hover:text-brand-text',
        secondary:
          'border border-border bg-card text-foreground hover:border-primary hover:bg-brand-soft hover:text-brand-text',
        ghost: 'text-muted-foreground hover:bg-brand-soft hover:text-primary',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-12 px-5 py-3',
        sm: 'text-label-md min-h-10 px-3',
        lg: 'min-h-12 px-6 py-3',
        icon: 'size-12',
        'icon-sm': 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
)

export interface ButtonProps extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Shows a spinner, disables the button and announces the busy state. */
  loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}
