'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Search } from '@/components/ui/icons'
import { EditorialPhoto } from './photo'

const scenes = [
  {
    image: 'highlife',
    alt: 'A trumpet player surrounded by a singing crowd at dusk',
    title: 'Live & loud',
    caption: 'Live music and nightlife',
    href: '/events?category=music-nightlife',
    action: 'Find music events',
    color: 'apricot',
  },
  {
    image: 'wedding',
    alt: 'Family and friends dancing around a couple at their Nigerian wedding',
    title: 'In celebration',
    caption: 'Weddings and anniversaries',
    href: '/guides/celebrations',
    action: 'Explore celebrations',
    color: 'rose',
  },
  {
    image: 'workshop',
    alt: 'Three printmakers pulling a yellow print together',
    title: 'Made by hand',
    caption: 'Creative workshops',
    href: '/events?type=WORKSHOP',
    action: 'Find workshops',
    color: 'butter',
  },
  {
    image: 'cyber',
    alt: 'A conference attendee asking a question from the audience',
    title: 'Floor is open',
    caption: 'Conferences and talks',
    href: '/events?type=CONFERENCE',
    action: 'Find conferences',
    color: 'blue',
  },
] as const

function CoverDeck() {
  const [index, setIndex] = useState(0)
  const scene = scenes[index]
  const next = scenes[(index + 1) % scenes.length]
  function turn(direction: number) {
    setIndex((current) => (current + direction + scenes.length) % scenes.length)
  }
  return (
    <div
      className="cover-deck"
      role="region"
      aria-label="Explore event scenes"
      aria-roledescription="carousel"
    >
      <div className="cover-stack">
        <div className="cover-under" aria-hidden="true">
          <EditorialPhoto name={next.image} sizes="(max-width:720px) 72vw, 35vw" alt="" />
        </div>
        <Link
          key={scene.image}
          href={scene.href}
          aria-label={scene.action}
          className={'cover-ticket ticket-' + scene.color}
        >
          <div className="cover-image">
            <EditorialPhoto
              name={scene.image}
              alt={scene.alt}
              priority={index === 0}
              sizes="(max-width: 720px) 86vw, (max-width: 1180px) 44vw, 530px"
            />
          </div>
          <div className="cover-stub">
            <span>
              <small>{scene.caption}</small>
              <strong>{scene.title}</strong>
            </span>
            <span className="stub-arrow">
              <ArrowRight />
            </span>
          </div>
        </Link>
      </div>
      <div className="deck-controls">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => turn(-1)}
          aria-label="Previous scene"
        >
          <ChevronLeft />
        </Button>
        <span aria-live="polite" aria-atomic="true">
          <span className="sr-only">{scene.caption}, scene </span>
          {index + 1} <i>/</i> {scenes.length}
        </span>
        <Button type="button" size="icon" variant="ghost" onClick={() => turn(1)} aria-label="Next scene">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="home-opening" aria-labelledby="cover-heading">
      <div className="opening-field">
        <div className="spread opening-grid">
          <div className="opening-type">
            <h1 id="cover-heading">
              <span>The art of</span> <em>going out.</em>
            </h1>
            <p>
              Find a front row, a dance floor or a seat at the table. Discover live events and the people
              behind them.
            </p>
            <Link className="opening-action" href="/events">
              Browse all events <ArrowRight />
            </Link>
          </div>
          <CoverDeck />
        </div>
      </div>
      <div className="finder-wrap spread">
        <form className="event-finder" action="/events" role="search" aria-label="Find an event">
          <label>
            <Search />
            <span>
              <strong>What’s on?</strong>
              <Input
                type="search"
                name="q"
                autoComplete="off"
                maxLength={120}
                placeholder="Music, art, workshops…"
                aria-label="Event or interest"
              />
            </span>
          </label>
          <label>
            <MapPin />
            <span>
              <strong>Where?</strong>
              <Input
                name="location"
                autoComplete="address-level2"
                maxLength={100}
                placeholder="Enter a city or venue"
                aria-label="City or venue"
              />
            </span>
          </label>
          <Button size="lg" type="submit">
            Find events <ArrowRight />
          </Button>
        </form>
      </div>
    </section>
  )
}
