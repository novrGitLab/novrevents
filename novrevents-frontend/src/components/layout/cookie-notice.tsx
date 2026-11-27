'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'

function subscribe(listener: () => void) {
  window.addEventListener('novr-cookie-choice', listener)
  return () => window.removeEventListener('novr-cookie-choice', listener)
}
function needsConsent() {
  return !document.cookie.split('; ').some((cookie) => cookie.startsWith('novr_cookie_choice='))
}
export function CookieNotice() {
  const visible = useSyncExternalStore(subscribe, needsConsent, () => false)
  function save(value: 'essential' | 'accepted') {
    document.cookie =
      'novr_cookie_choice=' +
      value +
      '; Path=/; Max-Age=15552000; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '')
    window.dispatchEvent(new Event('novr-cookie-choice'))
  }
  if (!visible) return null
  return (
    <aside className="cookie-notice" aria-label="Cookie choices">
      <p>
        NovrEvents uses essential cookies for sign-in and to remember your cookie choice.{' '}
        <Link className="underline" href="/legal/privacy-policy">
          Privacy policy
        </Link>
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save('accepted')}>
          Accept cookies
        </Button>
        <Button variant="outline" size="sm" onClick={() => save('essential')}>
          Essential only
        </Button>
      </div>
    </aside>
  )
}
