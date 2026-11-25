'use client'

import { useParams } from 'next/navigation'
import * as React from 'react'
import { EventDetail } from '@/app/(site)/events/[slug]/event-detail'
import { LoadingState } from '@/components/states'

/**
 * Event preview opened from /dashboard/discover. Same component and API as the public page
 * (/events/[slug]), rendered inside the app shell so navigation stays in place. Registration still
 * goes through the public form at /f/[slug].
 */
export default function DashboardEventPreviewPage() {
  const { slug } = useParams<{ slug: string }>()
  return (
    <React.Suspense fallback={<LoadingState rows={4} />}>
      <EventDetail slug={slug} inApp />
    </React.Suspense>
  )
}
