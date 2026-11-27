'use client'
import { useEffect } from 'react'
export function ScrollActivity() {
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>()
    const mark = (event: Event) => {
      const el = event.target instanceof Element ? event.target : document.documentElement
      const previous = timers.get(el)
      if (previous) clearTimeout(previous)
      el.setAttribute('data-scrolling', '')
      timers.set(
        el,
        setTimeout(() => {
          el.removeAttribute('data-scrolling')
          timers.delete(el)
        }, 850),
      )
    }
    document.addEventListener('scroll', mark, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', mark, true)
      for (const [el, id] of timers) {
        clearTimeout(id)
        el.removeAttribute('data-scrolling')
      }
    }
  }, [])
  return null
}
