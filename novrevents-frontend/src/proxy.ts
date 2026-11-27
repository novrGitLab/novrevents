import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') return NextResponse.next()
  const nonce = randomBytes(18).toString('base64')
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  const headers = new Headers(request.headers)
  headers.set('Content-Security-Policy', policy)
  headers.set('x-novr-nonce', nonce)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', policy)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
export const config = {
  matcher: [
    '/((?!api/|_next/|photography/|robots\\.txt|sitemap\\.xml|favicon\\.ico|.*\\.(?:svg|png|webp|ico|woff2)$).*)',
  ],
}
