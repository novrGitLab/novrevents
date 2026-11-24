'use client'

import { Switch } from '@/components/ui/primitives'

export interface Preferences {
  reminders: boolean
  announcements: boolean
  invitations: boolean
  unsubscribedAll: boolean
}

const OPTIONS: Array<{
  key: keyof Omit<Preferences, 'unsubscribedAll'>
  label: string
  description: string
}> = [
  { key: 'reminders', label: 'Event reminders', description: 'A reminder before events you registered for.' },
  {
    key: 'announcements',
    label: 'Organiser announcements',
    description: 'Updates from organisers of events you registered for.',
  },
  {
    key: 'invitations',
    label: 'Speaker and volunteer invitations',
    description: 'Invitations from organisers to apply to take part.',
  },
]

/**
 * Optional-mail switches. Service messages (account security, receipts, tickets, cancellations)
 * are always sent because they concern something the person already did.
 */
export function EmailPreferenceSwitches({
  value,
  onChange,
  disabled,
}: {
  value: Preferences
  onChange: (patch: Partial<Preferences>) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-4">
      {OPTIONS.map((option) => (
        <div key={option.key} className="flex items-start justify-between gap-4">
          <div>
            <label htmlFor={`pref-${option.key}`} className="text-sm font-medium">
              {option.label}
            </label>
            <p className="text-muted-foreground text-xs">{option.description}</p>
          </div>
          <Switch
            id={`pref-${option.key}`}
            checked={value[option.key] && !value.unsubscribedAll}
            disabled={disabled || value.unsubscribedAll}
            onCheckedChange={(checked) => onChange({ [option.key]: checked })}
          />
        </div>
      ))}
      <div className="flex items-start justify-between gap-4 border-t pt-4">
        <div>
          <label htmlFor="pref-all" className="text-sm font-medium">
            Unsubscribe from all optional email
          </label>
          <p className="text-muted-foreground text-xs">
            Tickets, receipts and account security messages are still sent.
          </p>
        </div>
        <Switch
          id="pref-all"
          checked={value.unsubscribedAll}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ unsubscribedAll: checked })}
        />
      </div>
    </div>
  )
}
