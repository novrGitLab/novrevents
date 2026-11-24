import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Brand assets live in /public/brand. The Cybernovr logo is the official artwork from the
 * cybernovr.com source (transparent PNG, trimmed only — proportions and colours unchanged,
 * 972 × 98 px). NOVR Events itself has no logo mark; the product name is set in type.
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
      <span className="text-foreground text-[15px] leading-none font-semibold tracking-[-0.01em]">
        NOVR <span className="font-normal">Events</span>
      </span>
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
