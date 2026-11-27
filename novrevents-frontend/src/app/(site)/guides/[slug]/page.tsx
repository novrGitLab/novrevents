import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EditorialPhoto } from '@/components/marketing/photo'
import { guides } from '@/components/marketing/guides'
import { ArrowRight } from '@/components/ui/icons'

type Props = { params: Promise<{ slug: string }> }
const findGuide = (slug: string) => guides.find((guide) => guide.slug === slug) ?? notFound()
export const generateStaticParams = () => guides.map(({ slug }) => ({ slug }))
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = findGuide((await params).slug)
  return {
    title: guide.title,
    description: guide.intro,
    alternates: { canonical: '/guides/' + guide.slug },
    openGraph: { images: ['/photography/' + guide.image + '-1440.webp'] },
  }
}
export default async function GuidePage({ params }: Props) {
  const guide = findGuide((await params).slug)
  return (
    <article className="spread guide-article">
      <header className="guide-lead">
        <div>
          <Link className="eyebrow" href="/">
            NovrEvents guides
          </Link>
          <h1 className="spread-heading">{guide.title}</h1>
          <p>{guide.intro}</p>
          <Link className="ink-link" href={guide.filter ? '/events?' + guide.filter : '/planning'}>
            {guide.action}
            <ArrowRight />
          </Link>
        </div>
        <EditorialPhoto name={guide.image} alt={guide.alt} priority sizes="(max-width: 720px) 100vw, 55vw" />
      </header>
      <div className="guide-body">
        {guide.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      {guide.slug === 'celebrations' && (
        <EditorialPhoto
          className="family-photo"
          name="anniversary"
          alt="An older couple sharing a quiet moment at their anniversary lunch"
        />
      )}
      <nav className="guide-next" aria-label="More event guides">
        {guides
          .filter((other) => other.slug !== guide.slug)
          .map((other) => (
            <Link key={other.slug} href={'/guides/' + other.slug}>
              {other.title}
              <ArrowRight />
            </Link>
          ))}
      </nav>
    </article>
  )
}
