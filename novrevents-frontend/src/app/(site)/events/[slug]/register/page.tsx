import { redirect } from 'next/navigation'
import { fetchPublicEvent } from '@/lib/server-api'

export const metadata = { robots: { index: false, follow: false } }

export default async function EventRegistration({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params
  const event=await fetchPublicEvent(slug)
  if(event?.visibility === 'PUBLIC' && event.registration.open && event.registration.formSlug) {
    redirect('/f/'+encodeURIComponent(event.registration.formSlug))
  }
  redirect('/events/'+encodeURIComponent(slug)+'#registration')
}
