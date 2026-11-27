'use client'
import { useEffect, useRef, useState } from 'react'
export function HumanCheck({ onChange }: { onChange: (payload: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const node = host.current
    if (!node) return
    let mounted = true
    const widget = document.createElement('altcha-widget')
    const state = (event: Event) => {
      const detail = (event as CustomEvent<{ state: string; payload?: string }>).detail
      onChange(detail.state === 'verified' ? (detail.payload ?? '') : '')
    }
    widget.setAttribute('type', 'native')
    widget.setAttribute('challenge', '/api/v1/auth/human-challenge')
    widget.addEventListener('statechange', state)
    import('altcha')
      .then(() => {
        if (mounted) node.replaceChildren(widget)
      })
      .catch(() => {
        if (mounted) setFailed(true)
      })
    return () => {
      mounted = false
      widget.removeEventListener('statechange', state)
      widget.remove()
    }
  }, [onChange])
  return (
    <div>
      <div ref={host} />
      {failed && <p role="alert">The human check could not load. Refresh the page to try again.</p>}
    </div>
  )
}
