'use client'

import { X } from '@/components/ui/icons'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  side,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: 'left' | 'right' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101828]/40" />
      <DialogPrimitive.Content
        className={cn(
          'bg-card fixed z-50 flex flex-col gap-4 border shadow-md focus:outline-none',
          side
            ? cn(
                'inset-y-0 h-full w-80 max-w-[88vw] overflow-y-auto p-5',
                side === 'left' ? 'left-0' : 'right-0',
              )
            : 'inset-x-0 bottom-0 max-h-[88dvh] w-full overflow-y-auto rounded-t-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="focus-visible:ring-ring absolute top-4 right-4 rounded-sm p-1 opacity-70 hover:opacity-100 focus-visible:ring-2">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-6', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
  )
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-base font-semibold tracking-[-0.01em]', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
}
