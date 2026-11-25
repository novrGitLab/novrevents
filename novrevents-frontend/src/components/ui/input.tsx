import * as React from 'react'
import { cn } from '@/lib/utils'

/* 16px text on phones prevents iOS focus zoom; 14px from the sm breakpoint. */
const fieldBase =
  'w-full min-w-0 rounded-sm border border-input bg-card px-3 text-base text-foreground transition-colors placeholder:text-subtle-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/30 sm:text-sm'

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldBase,
        'h-10 py-2 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldBase, 'min-h-[120px] py-2.5', className)} {...props} />
}

/** Native select: accessible and mobile-friendly by default. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="select" className={cn(fieldBase, 'h-10 py-2 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="label" className={cn('text-label-lg mb-1.5 block font-medium', className)} {...props} />
}
