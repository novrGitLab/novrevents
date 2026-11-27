'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight } from '@/components/ui/icons'
import { guides } from './guides'
import { EditorialPhoto } from './photo'

const notes = {
  workshops: 'Try a technique. Leave with something made by hand.',
  conferences: 'Choose a track, catch a talk and meet the speakers.',
  'arts-and-culture': 'Find an opening, a performance or a new gallery.',
  celebrations: 'Bring the family together, from the invitation to the last dance.',
}

export function CollectionIndex() {
  const [active, setActive] = useState(0)
  const guide = guides[active]
  return (
    <section className="spread occasion-index" aria-labelledby="guide-heading">
      <header>
        <h2 className="spread-heading" id="guide-heading">
          Pick an <em>occasion.</em>
        </h2>
        <p>Field guides for guests and hosts.</p>
      </header>
      <div className="occasion-layout">
        <div className="occasion-print" aria-hidden="true">
          <EditorialPhoto key={guide.image} name={guide.image} alt="" sizes="(min-width: 721px) 42vw, 0px" />
        </div>
        <div className="occasion-list">
          {guides.map((item, i) => (
            <Link
              href={'/guides/' + item.slug}
              key={item.slug}
              className="occasion-row"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              <EditorialPhoto name={item.image} alt="" sizes="76px" />
              <span>
                <strong>{item.title}</strong>
                <small>{notes[item.slug]}</small>
              </span>
              <ArrowRight />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
