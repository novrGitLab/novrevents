import type { NextConfig } from 'next'

// Server-side only: requests to /api/* on this app are proxied here, so the browser talks to one
// origin and the session cookie stays first-party. Production builds must set API_URL explicitly.
const apiUrl = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '')
const isProduction = process.env.NODE_ENV === 'production'

if (isProduction && !process.env.API_URL && process.env.VERCEL) {
  throw new Error('API_URL must be set for production builds (for example https://api.event.cybernovr.com).')
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The QR scanner needs the camera on this origin only.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
  ...(isProduction
    ? [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ]
    : []),
]

/** Personal, account and tool pages are never indexed, whatever robots.txt says. */
const noIndex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
const privatePaths = [
  '/checkout/:path*',
  '/dashboard/:path*',
  '/auth/:path*',
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
  output: 'standalone',
  async redirects() {
    return [
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/register', destination: '/auth/register', permanent: true },
      { source: '/check-email', destination: '/auth/check-email', permanent: true },
      { source: '/verify-email', destination: '/auth/verify-email', permanent: true },
      { source: '/forgot-password', destination: '/auth/forgot-password', permanent: true },
      { source: '/reset-password', destination: '/auth/reset-password', permanent: true },
      { source: '/welcome', destination: '/auth/welcome', permanent: true },
      { source: '/privacy', destination: '/legal/privacy-policy', permanent: true },
      { source: '/terms', destination: '/legal/terms-of-use', permanent: true },
      { source: '/explore', destination: '/events', permanent: true },
    ]
  },
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
