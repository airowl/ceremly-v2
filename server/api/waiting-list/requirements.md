# Waiting List Feature Requirements
<!-- Last updated: 2026-02-02 by Claude Code -->

## Current Implementation

### Overview
Pre-launch email collection system for YourSaaS landing page with analytics tracking and admin export.

### Components
- **WaitingListCTA.vue** - Frontend form component (`app/components/landing/`)
- **subscribe.post.ts** - API endpoint (`server/api/waiting-list/`)
- **waitingList.ts** - Database schema (`server/database/schema/`)
- **WaitingListEmail.ts** - Email template (`server/emailTemplates/`)
- **spamProtection.ts** - Anti-spam utilities (`server/utils/`)
- **export.get.ts** - Admin export endpoint (`server/api/admin/waiting-list/`)

### Database Schema
```sql
CREATE TABLE "waiting_list" (
    "id" text PRIMARY KEY NOT NULL,
    "email" text NOT NULL UNIQUE,
    "language" text DEFAULT 'it' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "source" text,
    "utm_source" text,
    "utm_medium" text,
    "utm_campaign" text,
    "ip_address" text,
    "user_agent" text
);
```

### API Endpoints

#### POST /api/waiting-list/subscribe
Subscribes an email to the waiting list.

**Request Body:**
```json
{
  "email": "user@example.com",
  "language": "it" | "en",
  "website": "",
  "_t": 1706832000000,
  "source": "https://referrer.com",
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "launch2026"
}
```

- `website` — honeypot field (must be empty for valid submissions)
- `_t` — form load timestamp in ms (used for timing validation)
- `source` — (optional) referrer URL captured from `document.referrer`
- `utmSource` — (optional) UTM source parameter
- `utmMedium` — (optional) UTM medium parameter
- `utmCampaign` — (optional) UTM campaign parameter

Server also captures automatically:
- `ipAddress` — from request headers (`x-forwarded-for` or socket)
- `userAgent` — from `User-Agent` header

**Response (Success):**
```json
{
  "success": true,
  "alreadySubscribed": false,
  "emailSent": true
}
```

**Response (Already Subscribed):**
```json
{
  "success": true,
  "alreadySubscribed": true,
  "emailSent": false
}
```

**Error Codes:**
- 400: Invalid email address or disposable email domain
- 429: Too many requests (endpoint rate limit exceeded)
- 500: Server error

#### GET /api/admin/waiting-list/export
<!-- Last updated: 2026-02-02 by Claude Code -->

Admin-only endpoint to export waiting list subscribers. Auth via `X-Admin-API-Key` header.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | `json` \| `csv` | `json` | Response format |
| `page` | number | `1` | Page number (JSON only) |
| `limit` | number | `20` | Items per page (JSON only, max 100) |
| `search` | string | — | Filter by email (case-insensitive) |
| `sortBy` | `createdAt` \| `email` \| `language` | `createdAt` | Sort column |
| `sortOrder` | `asc` \| `desc` | `desc` | Sort direction |

**JSON Response:**
```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

**CSV Response:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="waiting-list-YYYY-MM-DD.csv"`
- All rows exported (no pagination)
- Columns: id, email, language, created_at, source, utm_source, utm_medium, utm_campaign, ip_address, user_agent

### Architecture Notes
- Language detected from browser locale via i18n
- Email sent via Resend API using centralized `sendEmail()` utility
- Unique constraint on email prevents duplicates
- Race condition handled via PostgreSQL unique constraint (code 23505)
- Analytics data (referrer, UTM params) captured client-side and sent with subscription
- Client IP and User-Agent captured server-side automatically

### Anti-Spam Protection
<!-- Last updated: 2026-02-02 by Claude Code -->

Four-layer platform-agnostic protection with zero external dependencies:

| Layer | Technique | Behavior on Detection |
|-------|-----------|----------------------|
| 1. Honeypot | Hidden `website` field (CSS-hidden, `aria-hidden`, `tabindex=-1`) | Silent fake success (doesn't reveal detection) |
| 2. Timing | Rejects submissions under 3 seconds from form load | Silent fake success |
| 3. Rate Limit | Max 5 submissions/hour per IP for this endpoint | HTTP 429 error |
| 4. Disposable Email | Blocks ~50 known throwaway email domains | HTTP 400 with message |

#### Implementation Details

**Honeypot Field:**
- Hidden via CSS (`position: absolute; left: -9999px; opacity: 0`) — not `type="hidden"` which bots detect
- Uses `aria-hidden="true"` and `tabindex="-1"` for accessibility
- Named `website` (attractive to bots that auto-fill URL fields)
- Server returns fake success if filled → bot thinks submission worked

**Timing Validation:**
- `formLoadedAt` timestamp set on `onMounted()` in the Vue component
- Sent as `_t` in request body
- Server rejects if `Date.now() - _t < 3000ms`
- Returns fake success to not reveal detection

**Endpoint Rate Limit:**
- Separate from global middleware rate limiter
- 5 requests per hour per IP specifically for `/api/waiting-list/subscribe`
- In-memory Map with auto-cleanup every 30 minutes
- Returns HTTP 429 (visible to user — legitimate users won't hit this)

**Disposable Email Blocking:**
- Server-side check against ~50 known throwaway domains
- Returns HTTP 400 with "Please use a permanent email address"
- List in `server/utils/spamProtection.ts`

#### Utility: `server/utils/spamProtection.ts`

Exports:
- `isDisposableEmail(email)` — checks domain against blocklist
- `isEndpointRateLimited(ip, endpoint, max, windowMs)` — per-endpoint rate limiting
- `isHoneypotTriggered(value)` — checks if honeypot field was filled
- `isSubmittedTooFast(loadedAt)` — checks if form submitted under 3s

### Analytics Tracking
<!-- Last updated: 2026-02-02 by Claude Code -->

Client-side data captured on form mount via `WaitingListCTA.vue`:
- `document.referrer` → stored as `source`
- `URLSearchParams` → `utm_source`, `utm_medium`, `utm_campaign`

Server-side data captured automatically:
- `x-forwarded-for` or socket IP → stored as `ip_address`
- `User-Agent` header → stored as `user_agent`

All analytics fields are nullable to maintain backward compatibility with existing rows.

### Email Template
- Multi-language support (IT/EN)
- React Email based template
- Brand colors: Primary `#d4a373`
- Contains welcome message + CTA to website

### Security
- Public endpoint (no auth required for subscribe)
- Admin export requires `X-Admin-API-Key` header
- Email validation via Zod schema
- Email normalized to lowercase before storage
- No RLS needed (public INSERT allowed)
- Anti-spam: honeypot + timing + rate limit + disposable email blocking
- Rate limiting: 100 requests/minute per IP (global), 5/hour per IP (endpoint)

### Dependencies
- Drizzle ORM for database operations
- Zod for validation
- UUID for ID generation
- Resend for email delivery

### TODOs
- [x] Add rate limiting to prevent abuse
- [x] Add admin endpoint to export subscribers
- [x] Add analytics tracking (UTM params, referrer, IP, user agent)
- [ ] Add unsubscribe functionality
