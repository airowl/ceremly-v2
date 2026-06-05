## Site Mode Requirements
<!-- Last updated: 2026-02-02 by Claude Code -->

### Current Implementation
- Three site modes: `active`, `waitinglist`, `maintenance` via `NUXT_PUBLIC_SITE_MODE`
- Server-side full blocking middleware (API + page routes) ✅ (Updated 2026-02-02)
- Client-side route allowlist middleware ✅ (Updated 2026-02-02)
- ~~Server-side API-only blocking~~ (Extended to page routes 2026-02-02)
- ~~Client-side blocklist approach~~ (Replaced with allowlist 2026-02-02)

### Architecture Notes
- Single env variable `NUXT_PUBLIC_SITE_MODE` controls all behavior
- **Defense-in-depth**: server middleware blocks BOTH API and page routes (primary gate)
- Client middleware `0.site-mode.global.ts` provides UX-level navigation blocking (secondary gate)
- Composable `useSiteMode.ts` centralizes mode checks for conditional UI rendering
- Static assets (`/_nuxt/`, `.js`, `.css`, fonts, images) always pass through
- After changing `.env`, dev server MUST be restarted (`pnpm dev`)

### Waitinglist Mode

#### Allowed Routes (Pages)
- `/` — Landing page (default locale)
- `/en` — Landing page (English)
- `/legal/*` — Legal pages (privacy, tos, dpa) in all locales

#### Allowed Routes (API)
- `POST /api/waiting-list/subscribe` — Email subscription

#### Blocked
- All other pages → redirect to `/`
- All other API routes → HTTP 503 Service Unavailable

### Active Mode
- No restrictions, normal SaaS behavior
- Auth middleware handles authentication

### Maintenance Mode
- All pages redirect to `/maintenance`
- All API routes → HTTP 503

### Key Files

| Purpose | File |
|---------|------|
| Composable | `app/composables/useSiteMode.ts` |
| Client middleware | `app/middleware/0.site-mode.global.ts` |
| Server middleware | `server/middleware/0.site-mode.ts` |
| Waiting list API | `server/api/waiting-list/subscribe.post.ts` |
| Waiting list component | `app/components/landing/WaitingListCTA.vue` |
| Waiting list schema | `server/database/schema/waitingList.ts` |
| Email template | `server/emailTemplates/WaitingListEmail.ts` |

### Security
- Server middleware provides defense-in-depth (API routes blocked server-side)
- Client middleware prevents navigation (UX layer)
- Auth handler in `server/api/auth/[...all].ts` also returns empty in non-active mode
- Rate limiting still applies to allowed endpoints
