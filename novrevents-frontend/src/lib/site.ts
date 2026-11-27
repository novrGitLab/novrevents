/**
 * Public origin of the web app, without a trailing slash. Production builds fall back to the
 * canonical domain so metadata, sitemaps and share links never point at localhost.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NODE_ENV === 'production' ? 'https://event.cybernovr.com' : 'http://localhost:3100')
).replace(/\/$/, '')
