/**
 * Public origin of the web app, without a trailing slash. Production builds fall back to the
 * canonical domain so metadata, sitemaps and share links never point at localhost.
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.NODE_ENV === 'production' ? 'https://event.cybernovr.com' : 'http://localhost:3100')
).replace(/\/$/, '')

/**
 * Whether the API delivers email in this deployment. Production email is not configured yet, so
 * the default is off and the interface never claims that a message was sent. Set
 * NEXT_PUBLIC_EMAIL_DELIVERY=enabled once the API's email provider is live.
 */
export const emailDeliveryEnabled = process.env.NEXT_PUBLIC_EMAIL_DELIVERY === 'enabled'
