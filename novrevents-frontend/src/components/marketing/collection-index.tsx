import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { guides } from './guides'
import { EditorialPhoto } from './photo'

export function CollectionIndex() {
  return (
    <section className="spread field-guide" aria-labelledby="guide-heading">
      <h2 className="spread-heading" id="guide-heading">
        Explore by <em>occasion.</em>
      </h2>
      <div className="guide-grid">
        {guides.map((guide) => (
          <Link className="guide-cover" key={guide.slug} href={'/guides/' + guide.slug}>
            <EditorialPhoto
              name={guide.image}
              alt={guide.alt}
              sizes="(max-width: 640px) 82vw, (max-width: 960px) 45vw, 24vw"
            />
            <h3>
              {guide.title}
              <ArrowRight />
            </h3>
          </Link>
        ))}
      </div>
    </section>
  )
}
