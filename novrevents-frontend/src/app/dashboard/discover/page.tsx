'use client'

import * as React from 'react'
import { DiscoverView } from '@/components/events/discover-view'
import { LoadingState } from '@/components/states'

/** Event discovery inside the signed-in shell. The public directory stays at /explore. */
export default function DashboardDiscoverPage() {
  return (
    <React.Suspense fallback={<LoadingState rows={4} />}>
      <DiscoverView variant="app" />
    </React.Suspense>
  )
}
