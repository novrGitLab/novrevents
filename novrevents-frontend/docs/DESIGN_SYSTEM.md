# Design system

NOVR Events is professional infrastructure for the cybersecurity community. The interface is a
minimalist, pure-white enterprise UI with restrained Cybernovr purple, in the same product family as
NovrSOC. There is **one theme**; dark mode does not exist and the app stays white when the operating
system prefers dark (`color-scheme: light`).

All values are CSS variables in `src/app/globals.css`. Components use semantic Tailwind tokens
(`bg-card`, `text-muted-foreground`, `bg-primary` …), never raw hex values.

## Colour

| Token                 | Value                 | Use                                                                           |
| --------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `background`, `card`  | `#FFFFFF`             | Canvas, sidebar, header, panels                                               |
| `muted`, `secondary`  | `#F5F5F7`             | Table headers, wells, quiet fills                                             |
| `border`              | `#E4E4E7`             | Every panel, table and divider                                                |
| `foreground`          | `#18181B`             | Primary text                                                                  |
| `muted-foreground`    | `#5F5F68`             | Secondary text (6.3:1 on white)                                               |
| `subtle-foreground`   | `#7A7A83`             | Tertiary text and placeholders only                                           |
| `primary` / `brand`   | `#662F8E`             | Primary buttons, active states, links, focus, charts                          |
| `brand-soft`          | `#F4EEF8`             | Selected navigation, selected rows, cover placeholders                        |
| `brand-text`          | `#5B2A80`             | Purple text on white (8.6:1)                                                  |
| `info`                | `#4451A2`             | Cybernovr blue: informational accents, second chart series                    |
| `destructive`         | `#C8161D`             | Destructive actions and errors (darker than brand red `#EB2027` for contrast) |
| `success` / `warning` | `#17803D` / `#A35C00` | Status only, always with a text label                                         |

Purple marks the one primary action on a screen and the current selection. It is not used for
decoration, large fills or backgrounds.

## Type

Inter everywhere (self-hosted by `next/font`). Monospace only for ticket codes and identifiers.

| Role                      | Size / weight | Utility             |
| ------------------------- | ------------- | ------------------- |
| Marketing hero            | 40–60px / 600 | `marketing-hero`    |
| Marketing section heading | 28–36px / 600 | `marketing-heading` |
| Public page heading       | 32px / 600    | `display-title`     |
| Application page heading  | 24px / 600    | `page-title`        |
| Section heading           | 16px / 600    | `section-title`     |
| Body                      | 14–16px / 400 | —                   |
| Labels and metadata       | 12–13px / 500 | —                   |

## Layout

- **Authenticated shell** (`components/layout/app-shell.tsx`): fixed 240px white sidebar with a right
  border, grouped navigation rows (36px, pale-purple active background, purple icon and text), the
  account menu at the bottom; a 64px white header with breadcrumbs and notifications; content padded
  24–32px, max width 1200px (1440px for editors). Phones get the same navigation in a drawer.
- **Page heading** (`PageHeader`): title, one-line description, actions right-aligned; the primary
  action is the purple button.
- **Metrics** (`StatCard`): a row of separate white panels with a border, label, value and hint. Only
  real numbers from the API.
- **Tables**: `data-table` utility inside `bg-card rounded-lg border` with `overflow-x-auto`; compact
  rows, `muted` header. Tables scroll inside their container on phones; the page never scrolls sideways.
- Radius 4–8px (`rounded-md` controls, `rounded-lg` panels). Borders, not shadows, for ordinary
  panels; shadows only on menus and dialogs.
- No cards inside cards: a section inside a page uses a heading, not another bordered box.

## Components

Buttons: `default` purple, `outline` white with a neutral border (secondary), `ghost`, `destructive`,
`link`. Heights 32/36/40px. Badges are small, rounded 5px, tinted; status text is sentence case
(`enumLabel()` in `lib/format.ts`). Empty, loading and error states come from `components/states.tsx`.

## Brand

- NOVR Events is the dominant identity, set in type (`<Wordmark />`). There is no NOVR Events logo
  mark; do not invent one.
- The Cybernovr logo (`public/brand/cybernovr-logo.png`, official artwork from cybernovr.com) appears
  as a "by Cybernovr" endorsement. Never redraw, recolour or crop it.
- Events without cover artwork use a typographic placeholder on `brand-soft`.

## Content

Plain, factual sentence-case copy. Illustrations on the marketing site are built from real product
labels and captioned as sample content. No testimonials, customer logos, invented statistics,
stock "hacker" imagery, gradients, glassmorphism or decorative animation. Never claim an email was
sent unless `NEXT_PUBLIC_EMAIL_DELIVERY=enabled`.
