'use client'

import { Tooltip } from '@/components/ui/tooltip'

import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, List, Search, ShieldCheck, SlidersHorizontal, X } from '@/components/ui/icons'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'
import { PageHeader, Pagination } from '@/components/common'
import {
  CYBERSECURITY_MODE,
  type DiscoveryMode,
  readStoredMode,
  splitCategories,
  storeMode,
} from '@/components/events/categories'
import { EventCard, EventRow, useSavedEventIds } from '@/components/events/event-card'
import { EVENT_MODE_LABELS, EVENT_TYPE_LABELS } from '@/components/events/labels'
import { EditorialPhoto } from '@/components/marketing/photo'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { api, unwrap } from '@/lib/api/client'
import { keys } from '@/lib/api/keys'
import { cn } from '@/lib/utils'

const FILTER_KEYS = [
  'q',
  'category',
  'type',
  'format',
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
type ParamKey = FilterKey | 'mode' | 'page'

const FORMATS = new Set(Object.keys(EVENT_MODE_LABELS))

// The stored mode only changes through this page, which re-renders when it writes it.
const subscribeToNothing = () => () => {}

const COPY: Record<DiscoveryMode, { title: string; description: string; empty: string }> = {
  all: {
    title: 'Discover events',
    description:
      'Conferences, workshops, webinars and meetups across technology, business, education, cybersecurity and more.',
    empty: 'No events match these filters',
  },
  cybersecurity: {
    title: 'Discover cybersecurity events',
    description: 'Conferences, workshops, CTFs and meetups from organisers across the security community.',
    empty: 'No cybersecurity events match these filters',
  },
}

/** The All events / Cybersecurity switch. Shared by the public and in-app pages. */
function ModeToggle({ mode, onChange }: { mode: DiscoveryMode; onChange: (mode: DiscoveryMode) => void }) {
  const options = [
    { value: 'all', label: 'All events' },
    { value: 'cybersecurity', label: 'Cybersecurity' },
  ] as const
  return (
    <div
      role="group"
      aria-label="Discovery mode"
      className="bg-muted grid w-full grid-cols-2 gap-1 rounded-md p-1 sm:inline-grid sm:w-auto"
    >
      {options.map((option) => {
        const active = mode === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-9 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition-colors sm:min-w-36',
              active
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.value === 'cybersecurity' && <ShieldCheck className="size-4" aria-hidden />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The event directory: search, filters, type chips, sorting, grid/list, pagination and bookmarks.
 * `public` renders the standalone /explore page; `app` renders inside the signed-in shell, with a
 * compact heading and event links that open the in-app event preview.
 */
export function DiscoverView({ variant = 'public' }: { variant?: 'public' | 'app' }) {
  const inApp = variant === 'app'
  const eventHref = inApp ? (slug: string) => `/dashboard/discover/events/${slug}` : undefined
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = React.useState(false)

  const rawMode = searchParams.get('mode') ?? ''
  // Links from before the mode switch used ?mode= for the event format (IN_PERSON, VIRTUAL, HYBRID).
  const legacyFormat = FORMATS.has(rawMode) ? rawMode : ''
  const mode: DiscoveryMode = rawMode === CYBERSECURITY_MODE ? 'cybersecurity' : 'all'
  const value = (key: FilterKey) => searchParams.get(key) ?? (key === 'format' ? legacyFormat : '')
  const page = Number(searchParams.get('page') ?? '1') || 1

  const setParams = (changes: Partial<Record<ParamKey, string>>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, change] of Object.entries(changes)) {
      if (change) next.set(key, change)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    if (legacyFormat && !('mode' in changes)) {
      next.delete('mode')
      if (!next.has('format') && !('format' in changes)) next.set('format', legacyFormat)
    }
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false })
  }

  const query = {
    page,
    pageSize: 12,
    q: value('q') || undefined,
    scope: mode === 'cybersecurity' ? ('cybersecurity' as const) : undefined,
    category: value('category') || undefined,
    type: (value('type') || undefined) as keyof typeof EVENT_TYPE_LABELS | undefined,
    mode: (value('format') || undefined) as keyof typeof EVENT_MODE_LABELS | undefined,
    price: (value('price') || undefined) as 'free' | 'paid' | undefined,
    location: value('location') || undefined,
    organizer: value('organizer') || undefined,
    registration: (value('registration') || undefined) as 'open' | undefined,
    timeframe: (value('timeframe') || 'upcoming') as 'upcoming' | 'past' | 'all',
    from: value('from') || undefined,
    to: value('to') || undefined,
    sort: (value('sort') || 'soonest') as 'soonest' | 'latest' | 'newest' | 'popular',
  }

  // A URL without ?mode= falls back to the mode this browser used last. The stored mode is undefined
  // until hydration (the server has no storage); results wait for it so the first request matches.
  const storedMode = React.useSyncExternalStore(subscribeToNothing, readStoredMode, () => undefined)
  // A link with a category decides the mode itself (see the category check below), so the stored
  // mode never combines with a category from the other group.
  const restoreCyberMode = rawMode === '' && storedMode === 'cybersecurity' && !searchParams.has('category')
  const modeResolved = rawMode !== '' || (storedMode !== undefined && !restoreCyberMode)
  React.useEffect(() => {
    if (!restoreCyberMode) return
    const next = new URLSearchParams(window.location.search)
    next.set('mode', CYBERSECURITY_MODE)
    next.delete('page')
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [restoreCyberMode, pathname, router])

  const changeMode = (nextMode: DiscoveryMode) => {
    storeMode(nextMode)
    if (nextMode === mode) return
    // Topics differ between modes, so the category filter starts again.
    setParams({
      mode: nextMode === 'cybersecurity' ? CYBERSECURITY_MODE : '',
      category: '',
      ...(legacyFormat ? { format: legacyFormat } : {}),
    })
  }

  const events = useQuery({
    queryKey: keys.publicEvents(query),
    queryFn: () => unwrap(api.GET('/api/v1/public/events', { params: { query } })),
    placeholderData: (previous) => previous,
    enabled: modeResolved,
  })
  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: () => unwrap(api.GET('/api/v1/public/categories')),
    staleTime: 10 * 60_000,
  })
  const groups = splitCategories(categories.data?.items)
  const selectedCategory = categories.data?.items.find((category) => category.slug === value('category'))

  // Keep category and mode compatible. A cybersecurity topic in All events (for example the topic link
  // on an event page) opens cybersecurity mode with the same results; a general category in
  // cybersecurity mode is dropped, and the page starts again because the results change.
  const categoryConflict =
    selectedCategory !== undefined &&
    (selectedCategory.group === 'cybersecurity') !== (mode === 'cybersecurity')
  React.useEffect(() => {
    if (!categoryConflict) return
    const next = new URLSearchParams(window.location.search)
    if (mode === 'all') {
      next.set('mode', CYBERSECURITY_MODE)
      if (legacyFormat && !next.has('format')) next.set('format', legacyFormat)
    } else {
      next.delete('category')
      next.delete('page')
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [categoryConflict, mode, legacyFormat, pathname, router])

  const copy = COPY[mode]
  // "Clear all" removes filters but keeps the discovery mode.
  const clearAll = () =>
    router.replace(
      rawMode === CYBERSECURITY_MODE || rawMode === 'all' ? `${pathname}?mode=${rawMode}` : pathname,
      { scroll: false },
    )

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

  // Filters that live in the "More filters" sheet; the rest sit in the bar or the type chips.
  const sheetFilters = (['price', 'location', 'from', 'to', 'registration', 'organizer'] as const).filter(
    (key) => value(key),
  )
  const filtered = activeFilters.length > 0 || Boolean(value('q'))
  const chips = [
    { key: '', label: 'All types' },
    ...Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => ({ key, label })),
  ]
  const selectClass = 'h-10 w-full sm:w-auto sm:min-w-40'

  return (
    <div
      className={
        inApp ? undefined : 'directory-spread mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10'
      }
    >
      {inApp ? (
        <PageHeader
          title={mode === 'cybersecurity' ? 'Discover cybersecurity' : 'Discover'}
          description={copy.description}
          className="mb-5 pb-5"
        />
      ) : (
        <header className="directory-masthead">
          <div>
            <h1 className="spread-heading">
              {mode === 'cybersecurity' ? (
                <>
                  Cybersecurity <em>events.</em>
                </>
              ) : (
                <>
                  Discover <em>events.</em>
                </>
              )}
            </h1>
            <p>{copy.description}</p>
          </div>
          <EditorialPhoto
            name={mode === 'cybersecurity' ? 'cyber' : 'community'}
            alt={
              mode === 'cybersecurity'
                ? 'A conference speaker addressing the audience'
                : 'Guests sharing lunch at a community gathering'
            }
            sizes="(max-width:640px) 100vw, 40vw"
            priority
          />
        </header>
      )}

      <div className={inApp ? undefined : 'mt-6'}>
        <ModeToggle mode={mode} onChange={changeMode} />
      </div>

      <div
        className={cn(
          'mt-4 flex flex-col gap-3 xl:flex-row xl:items-center',
          !inApp && 'lg:flex-row lg:items-center',
        )}
      >
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            setParams({ q: search.trim() })
          }}
        >
          <label htmlFor="explore-search" className="sr-only">
            Search events
          </label>
          <Search
            className="text-subtle-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="explore-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              if (search.trim() !== value('q')) setParams({ q: search.trim() })
            }}
            placeholder="Search by title, organiser or city"
            className="pl-9"
          />
        </form>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <label htmlFor="f-category" className="sr-only">
            {mode === 'cybersecurity' ? 'Topic' : 'Category'}
          </label>
          <NativeSelect
            id="f-category"
            className={selectClass}
            value={value('category')}
            onChange={(event) => {
              if (event.target.value === CYBERSECURITY_MODE) changeMode('cybersecurity')
              else setParams({ category: event.target.value })
            }}
          >
            {mode === 'cybersecurity' ? (
              <>
                <option value="">All cybersecurity topics</option>
                {groups.cybersecurity.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </>
            ) : (
              <>
                <option value="">All categories</option>
                <option value={CYBERSECURITY_MODE}>Cybersecurity</option>
                {groups.general.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </>
            )}
          </NativeSelect>
          <label htmlFor="f-format" className="sr-only">
            Format
          </label>
          <NativeSelect
            id="f-format"
            className={selectClass}
            value={value('format')}
            onChange={(event) => setParams({ format: event.target.value })}
          >
            <option value="">Any format</option>
            {Object.entries(EVENT_MODE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label htmlFor="f-when" className="sr-only">
            When
          </label>
          <NativeSelect
            id="f-when"
            className={selectClass}
            value={value('timeframe') || 'upcoming'}
            onChange={(event) =>
              setParams({ timeframe: event.target.value === 'upcoming' ? '' : event.target.value })
            }
          >
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All dates</option>
          </NativeSelect>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowFilters(true)}
            aria-haspopup="dialog"
            className={cn(sheetFilters.length > 0 && 'border-primary text-brand-text')}
          >
            <SlidersHorizontal /> More filters
            {sheetFilters.length > 0 && (
              <span className="bg-primary text-primary-foreground rounded-sm px-1.5 text-[11px] tabular-nums">
                {sheetFilters.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Event type"
        className="-mx-4 mt-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {chips.map((chip) => {
          const active = value('type') === chip.key
          return (
            <button
              key={chip.key || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => setParams({ type: chip.key })}
              className={cn(
                'h-8 shrink-0 rounded-sm border px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:border-primary hover:text-brand-text',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent side="right" className="w-96">
          <DialogTitle className="text-headline-sm">More filters</DialogTitle>
          <DialogDescription className="text-muted-foreground -mt-2 text-[13px]">
            Changes apply to the results straight away.
          </DialogDescription>
          <div className="space-y-4">
            <div>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="f-from">From</Label>
                <Input
                  id="f-from"
                  type="date"
                  value={value('from')}
                  onChange={(event) => setParams({ from: event.target.value })}
                />
              </div>
              <div>
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
              <div className="flex items-center justify-between gap-2 rounded-sm border px-3 py-2 text-sm">
                <span>
                  Organiser <span className="font-medium">@{value('organizer')}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setParams({ organizer: '' })}>
                  Remove
                </Button>
              </div>
            )}
          </div>
          <div className="mt-auto flex gap-2 border-t pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() =>
                setParams({ price: '', location: '', from: '', to: '', registration: '', organizer: '' })
              }
            >
              Reset
            </Button>
            <Button className="flex-1" onClick={() => setShowFilters(false)}>
              Show results
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <section aria-live="polite" aria-label="Results" className={inApp ? 'mt-6' : 'mt-8'}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-headline-sm">
              {value('timeframe') === 'past'
                ? 'Past events'
                : value('timeframe') === 'all'
                  ? 'All events'
                  : 'Upcoming events'}
            </h2>
            <span className="bg-muted text-muted-foreground rounded-sm px-2 py-0.5 text-xs tabular-nums">
              {events.data ? `${events.data.total} event${events.data.total === 1 ? '' : 's'}` : 'Searching…'}
            </span>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X /> Clear all
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="sort" className="text-muted-foreground mb-0 text-[13px] font-normal">
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
            <div role="group" aria-label="Result layout" className="flex overflow-hidden rounded-sm border">
              {[
                { value: 'grid', label: 'Grid view', icon: LayoutGrid },
                { value: 'list', label: 'List view', icon: List },
              ].map((option) => {
                const active = (value('view') || 'grid') === option.value
                return (
                  <Tooltip key={option.value} label={option.label}>
                    <button
                      type="button"
                      aria-label={option.label}
                      aria-pressed={active}
                      onClick={() => setParams({ view: option.value === 'grid' ? '' : option.value })}
                      className={cn(
                        'inline-flex size-9 items-center justify-center',
                        active ? 'bg-brand-soft text-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <option.icon className="size-4" aria-hidden />
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </div>
        {events.isPending ? (
          <LoadingState rows={3} />
        ) : events.isError ? (
          <ErrorState error={events.error} retry={() => void events.refetch()} />
        ) : events.data.items.length === 0 ? (
          <EmptyState
            title={copy.empty}
            description="Try widening the dates or removing a filter."
            action={
              filtered ? (
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {value('view') === 'list' ? (
              <ul className="bg-card divide-y rounded-lg border px-4" aria-label="Events">
                {events.data.items.map((event) => (
                  <li key={event.id}>
                    <EventRow event={event} saved={saved.has(event.id)} href={eventHref?.(event.slug)} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className={cn('grid gap-5 sm:grid-cols-2', inApp ? 'xl:grid-cols-3' : 'lg:grid-cols-3')}>
                {events.data.items.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    saved={saved.has(event.id)}
                    href={eventHref?.(event.slug)}
                  />
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

      {!inApp && (
        <section
          aria-labelledby="host-heading"
          className="mt-16 flex flex-col gap-4 border-t pt-10 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="max-w-xl">
            <h2 id="host-heading" className="text-headline-md">
              Organising an event?
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Publish conferences, workshops, meetups and CTFs on NOVR Events with registration forms,
              approvals, QR tickets and check-in.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="outline">
              <Link href="/">Learn more</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/events/new">Publish an event</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
