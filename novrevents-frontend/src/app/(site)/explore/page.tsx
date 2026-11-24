'use client'

import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { Pagination } from '@/components/common'
import { EventCard, EventRow, useSavedEventIds } from '@/components/events/event-card'
import { EVENT_MODE_LABELS, EVENT_TYPE_LABELS } from '@/components/events/labels'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'

const FILTER_KEYS = [
  'q',
  'category',
  'type',
  'mode',
  'price',
  'location',
  'organizer',
  'registration',
  'timeframe',
  'from',
  'to',
  'sort',
  'view',
] as const
type FilterKey = (typeof FILTER_KEYS)[number]

export default function ExplorePage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
          <LoadingState />
        </div>
      }
    >
      <Explore />
    </React.Suspense>
  )
}

function Explore() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = React.useState(false)

  const value = (key: FilterKey) => searchParams.get(key) ?? ''
  const page = Number(searchParams.get('page') ?? '1') || 1

  const setParams = (changes: Partial<Record<FilterKey | 'page', string>>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, change] of Object.entries(changes)) {
      if (change) next.set(key, change)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const query = {
    page,
    pageSize: 12,
    q: value('q') || undefined,
    category: value('category') || undefined,
    type: (value('type') || undefined) as keyof typeof EVENT_TYPE_LABELS | undefined,
    mode: (value('mode') || undefined) as keyof typeof EVENT_MODE_LABELS | undefined,
    price: (value('price') || undefined) as 'free' | 'paid' | undefined,
    location: value('location') || undefined,
    organizer: value('organizer') || undefined,
    registration: (value('registration') || undefined) as 'open' | undefined,
    timeframe: (value('timeframe') || 'upcoming') as 'upcoming' | 'past' | 'all',
    from: value('from') || undefined,
    to: value('to') || undefined,
    sort: (value('sort') || 'soonest') as 'soonest' | 'latest' | 'newest' | 'popular',
  }

  const events = useQuery({
    queryKey: keys.publicEvents(query),
    queryFn: () => unwrap(api.GET('/api/v1/public/events', { params: { query } })),
    placeholderData: (previous) => previous,
  })
  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: () => unwrap(api.GET('/api/v1/public/categories')),
    staleTime: 10 * 60_000,
  })

  const saved = useSavedEventIds()
  const [search, setSearch] = React.useState(value('q'))
  const [location, setLocation] = React.useState(value('location'))
  // Keep the text inputs in step with the URL (back/forward navigation, "clear all").
  const paramsKey = searchParams.toString()
  const [syncedKey, setSyncedKey] = React.useState(paramsKey)
  if (syncedKey !== paramsKey) {
    setSyncedKey(paramsKey)
    setSearch(value('q'))
    setLocation(value('location'))
  }

  const activeFilters = FILTER_KEYS.filter(
    (key) => key !== 'sort' && key !== 'view' && key !== 'timeframe' && key !== 'q' && value(key),
  )

  const filters = (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <div className="space-y-1.5">
        <Label htmlFor="f-category">Topic</Label>
        <NativeSelect
          id="f-category"
          value={value('category')}
          onChange={(event) => setParams({ category: event.target.value })}
        >
          <option value="">All topics</option>
          {categories.data?.items.map((category) => (
            <option key={category.id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-type">Event type</Label>
        <NativeSelect
          id="f-type"
          value={value('type')}
          onChange={(event) => setParams({ type: event.target.value })}
        >
          <option value="">All types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-mode">Format</Label>
        <NativeSelect
          id="f-mode"
          value={value('mode')}
          onChange={(event) => setParams({ mode: event.target.value })}
        >
          <option value="">Any format</option>
          {Object.entries(EVENT_MODE_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-price">Price</Label>
        <NativeSelect
          id="f-price"
          value={value('price')}
          onChange={(event) => setParams({ price: event.target.value })}
        >
          <option value="">Free and paid</option>
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </NativeSelect>
      </div>
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          setParams({ location: location.trim() })
        }}
      >
        <Label htmlFor="f-location">Location</Label>
        <Input
          id="f-location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          onBlur={() => setParams({ location: location.trim() })}
          placeholder="City or country"
        />
      </form>
      <div className="space-y-1.5">
        <Label htmlFor="f-when">When</Label>
        <NativeSelect
          id="f-when"
          value={value('timeframe') || 'upcoming'}
          onChange={(event) =>
            setParams({ timeframe: event.target.value === 'upcoming' ? '' : event.target.value })
          }
        >
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="all">All dates</option>
        </NativeSelect>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="f-from">From</Label>
          <Input
            id="f-from"
            type="date"
            value={value('from')}
            onChange={(event) => setParams({ from: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to">To</Label>
          <Input
            id="f-to"
            type="date"
            value={value('to')}
            onChange={(event) => setParams({ to: event.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={value('registration') === 'open'}
          onChange={(event) => setParams({ registration: event.target.checked ? 'open' : '' })}
        />
        Registration open now
      </label>
      {value('organizer') && (
        <p className="text-muted-foreground text-sm">
          Organiser: <span className="text-foreground font-medium">@{value('organizer')}</span>
        </p>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="page-title">Explore cybersecurity events</h1>
      <form
        role="search"
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setParams({ q: search.trim() })
        }}
      >
        <label htmlFor="explore-search" className="sr-only">
          Search
        </label>
        <Input
          id="explore-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by title, organiser or city"
        />
        <Button type="submit">Search</Button>
        <Button
          type="button"
          variant="outline"
          className="lg:hidden"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
        >
          <SlidersHorizontal /> <span className="sr-only sm:not-sr-only">Filters</span>
        </Button>
      </form>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside aria-label="Filters" className={showFilters ? 'block' : 'hidden lg:block'}>
          {filters}
          {(activeFilters.length > 0 || value('q')) && (
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => router.replace(pathname)}>
              <X /> Clear all filters
            </Button>
          )}
        </aside>

        <section aria-live="polite">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              {events.data ? `${events.data.total} event${events.data.total === 1 ? '' : 's'}` : 'Searching…'}
            </p>
            <div className="flex items-center gap-2">
              <div
                role="group"
                aria-label="Result layout"
                className="bg-secondary mr-1 flex rounded-md p-0.5"
              >
                {[
                  { value: 'grid', label: 'Grid view', icon: LayoutGrid },
                  { value: 'list', label: 'List view', icon: List },
                ].map((option) => {
                  const active = (value('view') || 'grid') === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={option.label}
                      aria-pressed={active}
                      onClick={() => setParams({ view: option.value === 'grid' ? '' : option.value })}
                      className={`text-muted-foreground hover:text-foreground inline-flex h-7 w-8 items-center justify-center rounded-[5px] ${active ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : ''}`}
                    >
                      <option.icon className="size-4" aria-hidden />
                    </button>
                  )
                })}
              </div>
              <Label htmlFor="sort" className="text-muted-foreground text-sm">
                Sort
              </Label>
              <NativeSelect
                id="sort"
                className="h-9 w-auto"
                value={value('sort') || 'soonest'}
                onChange={(event) =>
                  setParams({ sort: event.target.value === 'soonest' ? '' : event.target.value })
                }
              >
                <option value="soonest">Soonest first</option>
                <option value="latest">Latest first</option>
                <option value="newest">Recently published</option>
                <option value="popular">Most registrations</option>
              </NativeSelect>
            </div>
          </div>
          {events.isPending ? (
            <LoadingState rows={3} />
          ) : events.isError ? (
            <ErrorState error={events.error} retry={() => void events.refetch()} />
          ) : events.data.items.length === 0 ? (
            <EmptyState
              title="No events match these filters"
              description="Try widening the dates or removing a filter."
            />
          ) : (
            <>
              {value('view') === 'list' ? (
                <ul className="divide-y" aria-label="Events">
                  {events.data.items.map((event) => (
                    <li key={event.id}>
                      <EventRow event={event} saved={saved.has(event.id)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
                  {events.data.items.map((event) => (
                    <EventCard key={event.id} event={event} saved={saved.has(event.id)} />
                  ))}
                </div>
              )}
              <Pagination
                page={events.data.page}
                totalPages={events.data.totalPages}
                onPage={(next) => setParams({ page: String(next) })}
              />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
