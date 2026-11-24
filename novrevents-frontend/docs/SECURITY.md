# Frontend security

The API enforces every security rule; the web app must never be the only guard. See the backend
`docs/SECURITY.md` for the full list. Frontend-specific measures:

- **No secrets in the bundle.** Only `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_EMAIL_DELIVERY` are public. `API_URL` is used by the server-side rewrite.
- **Same-origin API** via rewrites: the HTTP-only session cookie is first-party and unreadable by scripts.
- **CSRF token** attached to every mutation by the API client middleware; raw `fetch` is only used for uploads,
  which add the same header.
- **Redirect safety:** `?next=` after login only accepts same-site relative paths (`safeNextPath`, unit-tested).
- **Rendering:** `dangerouslySetInnerHTML` is used once, for the event page's JSON-LD, with `<` escaped; user content is rendered as text (`whitespace-pre-line` for line
  breaks). External links use `rel="noopener noreferrer"` (+ `nofollow` for user-supplied URLs).
- **Uploads** are pre-checked for type and size for fast feedback; the API validates content again.
- **Headers** (`next.config.ts`): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` allowing the camera on this origin only.
  Production adds a Content-Security-Policy (same-origin everything, `frame-ancestors 'none'`,
  `object-src 'none'`) and HSTS. Account, dashboard, admin, ticket-link, form and profile pages send
  `X-Robots-Tag: noindex, nofollow`.
- **Private data:** form responses, attendee lists and analytics are only fetched on authenticated organiser pages;
  public pages never request them. Guest ticket links are bearer credentials and the page says so.
- **No analytics trackers or third-party scripts**, and no web-font requests.

Known gap: the CSP allows `'unsafe-inline'` scripts because Next.js inlines its bootstrap scripts; moving to
nonces would force every page to render dynamically. All other sources are restricted to this origin.
