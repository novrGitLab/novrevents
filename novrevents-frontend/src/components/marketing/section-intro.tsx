import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Heading and lede for a homepage section. The heading id labels the section. */
export function SectionIntro({
  id,
  title,
  children,
  className,
}: {
  id: string
  title: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('max-w-[40rem]', className)}>
      <h2 id={id} className="marketing-heading text-balance">
        {title}
      </h2>
      {children && (
        <div className="text-muted-foreground mt-4 space-y-4 text-base leading-7 sm:text-[16px]">
          {children}
        </div>
      )}
    </div>
  )
}

/** Shared section frame: container and vertical rhythm. */
export function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string
  labelledBy: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={className}>
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 lg:px-8 lg:py-24">{children}</div>
    </section>
  )
}
