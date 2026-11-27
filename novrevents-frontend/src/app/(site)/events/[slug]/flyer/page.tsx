import { notFound } from 'next/navigation'
import { EventFlyer, type FlyerData } from '@/components/events/flyer'
import { apiUrl } from '@/lib/server-api'

export const metadata = { title: 'Event flyer', robots: { index: false, follow: false } }
export default async function FlyerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const response = await fetch(apiUrl + '/api/v1/public/events/' + encodeURIComponent(slug) + '/flyer', {
    cache: 'no-store',
  })
  if (response.status === 404 || response.status === 403) notFound()
  if (!response.ok) throw new Error('Flyer temporarily unavailable')
  const data: FlyerData = await response.json()
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <EventFlyer data={data} />
    </div>
  )
}
