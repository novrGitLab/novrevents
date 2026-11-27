import type { Schema } from '@/lib/api/client'
import { formatDateTime } from '@/lib/format'

export function GuestInformation({ event }: { event: Schema<'EventDetail'> }) {
  const info = event.guestInfo
  if (!info) return null
  const facts = [
    [
      'Doors open',
      info.doorsBeforeMinutes == null
        ? null
        : formatDateTime(
            new Date(new Date(event.startsAt).getTime() - info.doorsBeforeMinutes * 60000),
            event.timezone,
          ),
    ],
    [
      'Age guidance',
      info.minimumAge == null
        ? null
        : info.minimumAge === 0
          ? 'All ages welcome'
          : 'Ages ' + info.minimumAge + ' and over',
    ],
    ['Accessibility', info.accessibility],
    ['Parking and transport', info.parking],
  ].filter((row): row is [string, string] => Boolean(row[1]))
  const faqs = info.faqs ?? []
  if (!facts.length && !faqs.length) return null
  return (
    <section className="guest-information" aria-labelledby="guest-information-title">
      <h2 id="guest-information-title" className="text-headline-sm">
        Before you go
      </h2>
      {facts.length > 0 && (
        <dl>
          {facts.map(([label, text]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      )}
      {faqs.map(({ question, answer }, i) => (
        <details key={i}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
    </section>
  )
}
