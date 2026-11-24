/**
 * Sample content for the homepage illustrations. It is fictional, it is captioned as an illustration
 * wherever it appears, and it names no real organisation, customer or event.
 */
export const SAMPLE = {
  event: 'Incident Response Workshop',
  type: 'Workshop',
  dateShort: 'Sat 14 Mar · 10:00 WAT',
  place: 'Lagos',
  mode: 'In person',
  ticketType: 'General admission',
  ticketCode: 'K7QM-4XRT-92HP',
} as const

/** Rows for the illustrated registrations table. */
export const SAMPLE_REGISTRATIONS = [
  { name: 'Ada Okafor', ticket: 'General admission', status: 'Confirmed', when: '2 Mar' },
  { name: 'Tunde Bello', ticket: 'Student', status: 'Awaiting review', when: '2 Mar' },
  { name: 'Grace Mensah', ticket: 'General admission', status: 'Confirmed', when: '1 Mar' },
  { name: 'Ibrahim Musa', ticket: 'General admission', status: 'Confirmed', when: '28 Feb' },
  { name: 'Chioma Eze', ticket: 'Student', status: 'Declined', when: '27 Feb' },
] as const

/** Listings for the illustrated discovery results. */
export const SAMPLE_LISTINGS = [
  {
    title: 'Incident Response Workshop',
    type: 'Workshop',
    when: 'Sat 14 Mar',
    where: 'Lagos',
    price: 'Free',
  },
  { title: 'Web Exploitation CTF', type: 'CTF', when: 'Fri 20 Mar', where: 'Online', price: 'Free' },
  { title: 'Cloud Security Meetup', type: 'Meetup', when: 'Thu 26 Mar', where: 'Abuja', price: 'Free' },
] as const
