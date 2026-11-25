# Design system

NOVR Events is professional infrastructure for the cybersecurity community. The interface follows the
Stitch "Editorial Precision" system (`stitch_novr_events_design_system/` in the workspace): matte
pure-white surfaces, precise 1px hairlines, Inter, and restrained Cybernovr purple. There is **one
theme**; dark mode does not exist and the app stays white when the operating system prefers dark
(`color-scheme: light`).

All values are CSS variables in `src/app/globals.css`. Components use semantic Tailwind tokens
(`bg-card`, `text-muted-foreground`, `bg-primary` …), never raw hex values.

## Colour

| Token                       | Value                 | Use                                                               |
| --------------------------- | --------------------- | ----------------------------------------------------------------- |
| `background`, `card`        | `#FFFFFF`             | Canvas and every surface                                          |
| `secondary`                 | `#FFFFFF`             | White secondary buttons (not a grey fill)                         |
| `muted`                     | `#F7F7F8`             | Skeletons, progress tracks, quiet wells                           |
| `border`, `input`           | `#E5E7EB`             | Every panel, input, table and divider                             |
| `foreground`                | `#171717`             | Primary text                                                      |
| `muted-foreground`          | `#667085`             | Secondary text, table headers, metadata                           |
| `subtle-foreground`         | `#98A2B3`             | Placeholders and inactive text only                               |
| `primary` / `brand`         | `#662F8E`             | Primary buttons, active states, links, focus, charts              |
| `primary-hover`/`brand-text`| `#4E216D`             | Pressed states and purple text on white                           |
| `brand-soft` / `accent`     | `#F5EFF9`             | Hover and selected fills, active filters, chips, cover placeholder |
| `info`                      | `#4451A2`             | Cybernovr blue: informational accents, second chart series        |
| `destructive`               | `#B42318`             | Destructive actions and errors                                    |
| `success` / `warning`       | `#067647` / `#B54708` | Status only, always with a text label                             |

Purple marks the one primary action on a screen and the current selection. It is not used for
decoration, large fills or backgrounds.

## Type

Inter everywhere (self-hosted by `next/font`). Monospace only for ticket codes and identifiers.
Tailwind's default scale (`text-xs` … `text-5xl`) is unchanged; the Stitch roles are added as named
sizes.

| Role                       | Size / weight      | Class                                   |
| -------------------------- | ------------------ | --------------------------------------- |
| Marketing hero             | 32 → 48px / 700    | `marketing-hero`                        |
| Marketing section heading  | 24 → 32px / 600    | `marketing-heading`                     |
| Page heading               | 24 → 32px / 600    | `page-title`                            |
| Display / headlines        | 48, 32, 24, 18px   | `text-display`, `text-headline-lg/md/sm` |
| Body                       | 16, 14, 13px       | `text-body-lg/md/sm`                    |
| Labels                     | 14, 12px           | `text-label-lg/md`                      |
| Micro-label (uppercase)    | 11px / 600, +0.04em | `eyebrow` — table headers, meta labels only |

## Layout

- **Authenticated shell** (`components/layout/app-shell.tsx`): fixed 240px white sidebar, uppercase
  group labels, 36px rows with a purple-tint active fill; 64px header with breadcrumbs; content max
  width 1200px (1440px for editors). On phones the dashboard has a bottom tab bar (Home, Discover,
  Tickets, My events, More → full navigation drawer); admin uses a menu button.
- **Public pages**: 1280px container, 16px phone gutter, 40px desktop gutter.
- **Page heading** (`PageHeader`): title, one-line description, actions right-aligned, hairline below.
- **Metrics** (`StatCard` or a divided stats band): uppercase micro-label, value, hint. Only real
  numbers from the API.
- **Tables**: `data-table` utility inside `bg-card rounded-lg border` with `overflow-x-auto`; white
  header with uppercase micro-labels, 48px rows, tinted row hover.
- **Radius**: 4px controls, chips and badges (`rounded-sm`); 8px panels and cards (`rounded-lg`);
  12px hero surfaces and passes (`rounded-xl`). No pill buttons; full rounding only for status dots
  and avatars.
- **Depth**: hairline borders plus `shadow-xs` (0 1px 2px rgb(16 24 40 / 5%)) on panels; `shadow-md`
  (0 4px 12px / 8%) only on menus, dialogs and sheets. No blur, glass or gradients.
- **Dialogs** open as bottom sheets on phones and centred from `sm` up; filter panels use the
  right-hand sheet (`DialogContent side="right"`).
- No cards inside cards: a section inside a panel uses a heading or a hairline, not another box.

## Components

Buttons: `primary` purple, `outline`/`secondary` white with a hairline that turns purple with a tint on
hover, `ghost` grey text that turns purple on hover, `destructive`, `link`. Heights 32/40/44px.
`Card` is static; add the `card-interactive` utility when the whole card is a link (border turns
purple, no lift or zoom). Badges are 4px, tinted, sentence case (`enumLabel()` in `lib/format.ts`);
the `security` variant is the only uppercase one. Tabs are underlined with a purple active rule.
Inputs use 16px text on phones (no iOS zoom) and 14px from `sm`. Empty, loading and error states come
from `components/states.tsx`.

## Brand

- NOVR Events is the dominant identity, set in type (`<Wordmark />`). There is no NOVR Events logo
  mark; do not invent one.
- The Cybernovr logo (`public/brand/cybernovr-logo.png`, official artwork from cybernovr.com) appears
  as a "by Cybernovr" endorsement. Never redraw, recolour or crop it.
- Events without cover artwork use a typographic placeholder on `brand-soft`.

## Content

Plain, factual sentence-case copy. Illustrations on the marketing site and auth pages are built from
real product labels and captioned as sample content; "Upcoming in the community" on the homepage lists
real events from the API and is omitted when there are none. No testimonials, customer logos,
invented statistics, stock "hacker" imagery, gradients, glassmorphism or decorative animation. Never
claim an email was sent unless `NEXT_PUBLIC_EMAIL_DELIVERY=enabled`.
