import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Brand assets live in /public/brand. The Cybernovr logo is the official artwork from the
 * cybernovr.com source (transparent PNG, trimmed only — proportions and colours unchanged,
 * 972 × 98 px). The NovrEvents signature pairs its ticket mark with the product name.
 */
export const CYBERNOVR_LOGO = { src: '/brand/cybernovr-logo.png', width: 972, height: 98 } as const

export function CybernovrLogo({ height = 12, className }: { height?: number; className?: string }) {
  const width = Math.round((CYBERNOVR_LOGO.width / CYBERNOVR_LOGO.height) * height)
  return (
    <span className={cn('inline-flex items-center', className)}>
      <img src={CYBERNOVR_LOGO.src} width={width} height={height} alt="Cybernovr" className="block" />
    </span>
  )
}

export function ProductSignature() {
  return (
    <span className="event-wordmark" aria-hidden="true">
      <svg className="event-brand-mark" viewBox="0 0 32 32" fill="none" focusable="false">
        <path
          d="M4 8.5A3.5 3.5 0 0 1 7.5 5H24a3 3 0 0 1 3 3v4.2a4.1 4.1 0 0 0 0 8.1v3.2a3.5 3.5 0 0 1-3.5 3.5H7.5A3.5 3.5 0 0 1 4 23.5v-3.2a4.1 4.1 0 0 0 0-8.1z"
          fill="currentColor"
        />
        <path
          d="m10.2 19.7 4-8.2 1.6 8.1 4.3-8.3"
          stroke="var(--brand-mark-stroke)"
          strokeWidth="2.1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span>
        novr<em>events</em>
      </span>
    </span>
  )
}

/** Product identity: "NOVR Events" dominant, "by Cybernovr" endorsement smaller. */
export function Wordmark({
  className,
  href = '/',
  endorsement = true,
}: {
  className?: string
  href?: string
  endorsement?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5 rounded-sm', className)}
      aria-label="NOVR Events by Cybernovr, home"
    >
      <ProductSignature />
      {endorsement && (
        <span className="text-muted-foreground hidden items-center gap-1.5 text-[11px] leading-none sm:inline-flex">
          <span aria-hidden className="bg-border h-3.5 w-px" />
          by
          <CybernovrLogo height={9} />
        </span>
      )}
    </Link>
  )
}

export function PoweredBy({ className }: { className?: string }) {
  return (
    <span className={cn('text-muted-foreground inline-flex items-center gap-1.5 text-xs', className)}>
      NOVR Events by <CybernovrLogo height={10} />
    </span>
  )
}
