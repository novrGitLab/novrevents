'use client'

import { ChevronLeft, ChevronRight } from '@/components/ui/icons'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Label, Textarea } from './ui/input'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="page-title text-balance">{title}</h1>
        {description && <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number
  totalPages: number
  total?: number
  onPage: (page: number) => void
}) {
  if (totalPages <= 1)
    return total !== undefined ? <p className="text-muted-foreground mt-4 text-sm">{total} total</p> : null
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-2">
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages}
        {total !== undefined && ` · ${total} total`}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft /> Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}

/** Label + control + description + error, wired for accessibility. */
export function Field({
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  className,
}: {
  label: React.ReactNode
  htmlFor: string
  description?: React.ReactNode
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden>
            *
          </span>
        )}
      </Label>
      {description && (
        <p id={`${htmlFor}-description`} className="text-muted-foreground text-xs">
          {description}
        </p>
      )}
      {children}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className="text-destructive text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  )
}

/** aria props for an input rendered inside <Field>. */
export function fieldAria(id: string, error?: string, description?: boolean) {
  const describedBy = [description ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')
  return { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy || undefined }
}

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  destructive?: boolean
  /** Ask for an optional free-text reason; it is passed to onConfirm. */
  reasonLabel?: string
  reasonRequired?: boolean
}

/** Confirmation dialog for consequential actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  options,
  onConfirm,
  loading,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ConfirmOptions
  onConfirm: (reason: string) => void
  loading?: boolean
}) {
  const [reason, setReason] = React.useState('')
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setReason('')
  }
  const blocked = options.reasonRequired && !reason.trim()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{options.title}</DialogTitle>
          {options.description && <DialogDescription>{options.description}</DialogDescription>}
        </DialogHeader>
        {options.reasonLabel && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">{options.reasonLabel}</Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Back
          </Button>
          <Button
            variant={options.destructive ? 'destructive' : 'default'}
            onClick={() => onConfirm(reason.trim())}
            loading={loading}
            disabled={blocked}
          >
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Hook for imperative confirmations: `const confirm = useConfirm(); confirm({...}, action)`. */
export function useConfirm() {
  const [state, setState] = React.useState<{
    options: ConfirmOptions
    action: (reason: string) => Promise<unknown>
  } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const ask = React.useCallback((options: ConfirmOptions, action: (reason: string) => Promise<unknown>) => {
    setState({ options, action })
  }, [])
  const dialog = state ? (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && !loading && setState(null)}
      options={state.options}
      loading={loading}
      onConfirm={async (reason) => {
        setLoading(true)
        try {
          await state.action(reason)
          setState(null)
        } catch {
          // The action reports its own error; keep the dialog open so the user can retry.
        } finally {
          setLoading(false)
        }
      }}
    />
  ) : null
  return { confirm: ask, dialog }
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-lg border px-5 py-4 shadow-xs">
      <p className="eyebrow">{label}</p>
      <p className="text-headline-md mt-2 tabular-nums">{value}</p>
      {hint && <p className="text-subtle-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  )
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        className="bg-muted h-9 min-w-0 flex-1 rounded-sm border px-3 font-mono text-xs"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}
