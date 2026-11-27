'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GoogleButton } from '@/components/auth/google-button'
import { Monitor } from '@/components/ui/icons'
import * as React from 'react'
import { toast } from 'sonner'
import { Field, PageHeader, useConfirm } from '@/components/common'
import { EmailPreferenceSwitches } from '@/components/email-preferences'
import { ErrorState, LoadingState, Notice } from '@/components/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession } from '@/hooks/use-session'
import { api, unwrap } from '@/lib/api/client'
import { errorMessage } from '@/lib/api/errors'
import { keys } from '@/lib/api/keys'
import { formatDateTime, relativeTime } from '@/lib/format'
import { emailDeliveryEnabled } from '@/lib/site'

const SECTIONS = [
  { id: 'email', label: 'Email address' },
  { id: 'password', label: 'Password' },
  { id: 'preferences', label: 'Email preferences' },
  { id: 'sessions', label: 'Sessions' },
] as const

/** One settings group: title and explanation on the left, controls in a panel on the right. */
function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
}: {
  id: (typeof SECTIONS)[number]['id']
  title: string
  description: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-24 gap-4 border-t py-8 first:border-t-0 first:pt-2 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10"
    >
      <div>
        <h2 id={`${id}-title`} className="text-headline-sm">
          {title}
        </h2>
        <div className="text-muted-foreground mt-1 text-[13px] leading-5">{description}</div>
        {actions && <div className="mt-4">{actions}</div>}
      </div>
      <div className="bg-card min-w-0 rounded-lg border p-5 shadow-xs">{children}</div>
    </section>
  )
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Account security, sessions and email preferences." />
      <nav aria-label="Settings sections" className="-mt-2 mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="bg-card text-muted-foreground hover:border-primary hover:text-brand-text h-8 shrink-0 rounded-sm border px-3 text-[13px] leading-8 font-medium"
          >
            {section.label}
          </a>
        ))}
      </nav>
      <div>
        <EmailCard />
        <PasswordCard />
        <GoogleButton mode="link" />
        <PreferencesCard />
        <SessionsCard />
      </div>
    </>
  )
}

function EmailCard() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const change = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/auth/change-email', { body: { email, password } })),
    onSuccess: async () => {
      toast.success(
        emailDeliveryEnabled
          ? 'Email updated. Check your new inbox for a verification link.'
          : 'Email updated. It needs verifying before you can publish.',
      )
      setEmail('')
      setPassword('')
      await queryClient.invalidateQueries({ queryKey: keys.session })
    },
    onError: (caught) => setError(errorMessage(caught)),
  })
  return (
    <SettingsSection
      id="email"
      title="Email address"
      description={
        <>
          <p className="text-foreground font-medium break-all">{user?.email}</p>
          <p className="mt-1.5">
            {user?.emailVerified ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="warning">Not verified</Badge>
            )}
          </p>
          <p className="mt-2">Changing it needs your password and a new verification.</p>
        </>
      }
    >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            change.mutate()
          }}
        >
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="New email" htmlFor="new-email">
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field
            label="Current password"
            htmlFor="email-password"
            description="Required to change your email."
          >
            <Input
              id="email-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={change.isPending}>
            Change email
          </Button>
        </form>
    </SettingsSection>
  )
}

function PasswordCard() {
  const [currentPassword, setCurrent] = React.useState('')
  const [newPassword, setNew] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const change = useMutation({
    mutationFn: () =>
      unwrap(api.POST('/api/v1/auth/change-password', { body: { currentPassword, newPassword } })),
    onSuccess: () => {
      toast.success('Password changed. Other devices were signed out.')
      setCurrent('')
      setNew('')
    },
    onError: (caught) => setError(errorMessage(caught)),
  })
  return (
    <SettingsSection
      id="password"
      title="Password"
      description="Changing your password signs out your other devices."
    >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            if (newPassword.length < 10) return setError('Use at least 10 characters.')
            change.mutate()
          }}
        >
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Current password" htmlFor="current-password">
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="new-password" description="At least 10 characters.">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(event) => setNew(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={change.isPending}>
            Change password
          </Button>
        </form>
    </SettingsSection>
  )
}

function PreferencesCard() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['email-preferences'],
    queryFn: () => unwrap(api.GET('/api/v1/me/email-preferences')),
  })
  const update = useMutation({
    mutationFn: (patch: Record<string, boolean>) =>
      unwrap(api.PATCH('/api/v1/me/email-preferences', { body: patch })),
    onSuccess: (data) => {
      queryClient.setQueryData(['email-preferences'], data)
      toast.success('Email preferences saved')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <SettingsSection
      id="preferences"
      title="Email preferences"
      description="Choose which optional emails you receive. Messages about your tickets and account security are not optional."
    >
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <EmailPreferenceSwitches
            value={query.data}
            disabled={update.isPending}
            onChange={(patch) => update.mutate(patch)}
          />
        )}
    </SettingsSection>
  )
}

function SessionsCard() {
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirm()
  const query = useQuery({ queryKey: ['sessions'], queryFn: () => unwrap(api.GET('/api/v1/auth/sessions')) })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sessions'] })

  return (
    <SettingsSection
      id="sessions"
      title="Active sessions"
      description="Devices currently signed in to your account. Sign out any you don’t recognise."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            confirm({ title: 'Sign out all other devices?', confirmLabel: 'Sign out others' }, async () => {
              try {
                const result = await unwrap(api.POST('/api/v1/auth/sessions/revoke-others'))
                toast.success(`${result.revoked} session${result.revoked === 1 ? '' : 's'} signed out`)
                await refresh()
              } catch (error) {
                toast.error(errorMessage(error))
                throw error
              }
            })
          }
        >
          Sign out others
        </Button>
      }
    >
        {query.isPending ? (
          <LoadingState rows={2} />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          <ul className="-my-3 divide-y">
            {query.data.items.map((session) => (
              <li key={session.id} className="flex items-start gap-3 py-3">
                <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-sm">
                  <Monitor className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {describeAgent(session.userAgent)}{' '}
                    {session.current && <Badge variant="success">This device</Badge>}
                  </p>
                  <p className="text-muted-foreground text-xs" title={formatDateTime(session.lastUsedAt)}>
                    {session.ipAddress ?? 'Unknown network'} · active {relativeTime(session.lastUsedAt)}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await unwrap(
                          api.DELETE('/api/v1/auth/sessions/{id}', { params: { path: { id: session.id } } }),
                        )
                        await refresh()
                      } catch (error) {
                        toast.error(errorMessage(error))
                      }
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      {dialog}
    </SettingsSection>
  )
}

function describeAgent(agent: string | null): string {
  if (!agent) return 'Unknown device'
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser'
  const os = /Windows/.test(agent)
    ? 'Windows'
    : /Android/.test(agent)
      ? 'Android'
      : /iPhone|iPad/.test(agent)
        ? 'iOS'
        : /Mac OS/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : ''
  return os ? `${browser} on ${os}` : browser
}
