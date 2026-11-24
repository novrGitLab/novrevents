import type { NextConfig } from 'next'

// Server-side only: requests to /api/* on this app are proxied here, so the browser talks to one
// origin and the session cookie stays first-party. Production builds must set API_URL explicitly.
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && !process.env.API_URL && process.env.VERCEL) {
  throw new Error('API_URL must be set for production builds (for example https://api.novrevents.com).')
}

/**
 * Content Security Policy. Next.js inlines its bootstrap scripts, so scripts allow 'unsafe-inline'
 * (no nonces, which would force every page to render dynamically). Everything else is same-origin:
 * uploaded images and the API are served through /api on this origin.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The QR scanner needs the camera on this origin only.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  ...(isProduction
    ? [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ]
    : []),
]

/** Personal, account and tool pages are never indexed, whatever robots.txt says. */
const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
const privatePaths = [
  '/dashboard/:path*',
  '/admin/:path*',
  '/login',
  '/register',
  '/welcome',
  '/check-email',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/r/:path*',
  '/f/:path*',
  '/u/:path*',
  '/certificates/:path*',
  '/unsubscribe',
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The floating dev badge overlaps page content during local demos.
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      ...privatePaths.map((source) => ({ source, headers: noIndex })),
    ]
  },
}

export default nextConfig
