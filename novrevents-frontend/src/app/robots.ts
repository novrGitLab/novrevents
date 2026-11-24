import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** Public marketing, discovery and event pages are crawlable; accounts, tools and personal pages are not. */
export default function robots(): MetadataRoute.Robots {
  // Vercel preview deployments also build in production mode; only the production deployment is indexed.
  const production =
    siteUrl === 'https://novrevents.com' && (process.env.VERCEL_ENV ?? 'production') === 'production'
  return {
    rules: production
      ? {
          userAgent: '*',
          allow: '/',
          disallow: [
            '/api/',
            '/dashboard',
            '/admin',
            '/login',
            '/register',
            '/welcome',
            '/check-email',
            '/verify-email',
            '/forgot-password',
            '/reset-password',
            '/r/',
            '/f/',
            '/u/',
            '/certificates/',
            '/unsubscribe',
          ],
        }
      : // Preview and local deployments are never indexed.
        { userAgent: '*', disallow: '/' },
    sitemap: production ? `${siteUrl}/sitemap.xml` : undefined,
  }
}
