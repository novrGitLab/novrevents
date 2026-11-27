import { cn } from '@/lib/utils'
export function TicketMascot({ small = false, className }: { small?: boolean; className?: string }) {
  return (
    <img
      className={cn('ticket-mascot', className)}
      src={'/brand/ticket-' + (small ? '144' : '480') + '.webp'}
      srcSet={small ? undefined : '/brand/ticket-480.webp 480w, /brand/ticket-768.webp 768w'}
      sizes={small ? undefined : '(max-width: 800px) 100px, 340px'}
      width={480}
      height={590}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
