import * as React from 'react'
import { CollectionIndex } from '@/components/marketing/collection-index'
import { DiscoverView } from '@/components/events/discover-view'
import { LoadingState } from '@/components/states'

export default function ExplorePage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-10">
          <LoadingState />
        </div>
      }
    >
      <DiscoverView variant="public" />
      <CollectionIndex />
    </React.Suspense>
  )
}
