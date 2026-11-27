import type { ApiData } from '@/lib/api/client'
import { EditorialPhoto } from '@/components/marketing/photo'
export type FlyerData = ApiData<'/api/v1/events/{id}/flyer', 'get'>
export const flyerStyles = {
  marquee: 'Marquee',
  programme: 'Programme',
  invitation: 'Invitation',
  afterhours: 'After hours',
  studio: 'Print studio',
} as const

export function EventFlyer({ data }: { data: FlyerData }) {
  return (
    <article className={'flyer flyer-' + data.style} aria-label="Event flyer">
      {data.photograph !== 'none' && <div className="flyer-art"><EditorialPhoto name={data.photograph} sizes="(max-width: 720px) 90vw, 560px" alt="" /></div>}
      <div className="flyer-signature">NOVR EVENTS</div>
      <div className="flyer-heading">
        <h2>{data.headline}</h2>
        {data.note && <p>{data.note}</p>}
      </div>
      <footer>
        <div>
          <time>{data.date}</time>
          {data.place && <p>{data.place}</p>}
          <a href={data.destination}>Event details &amp; registration ↗</a>
        </div>
        <img src={data.qr} width={98} height={98} alt="QR code linking to event registration" />
      </footer>
    </article>
  )
}
