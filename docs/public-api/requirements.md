## Public Event & RSVP API Requirements
<!-- Last updated: 2026-02-17 by Claude Code -->

### Current Implementation
- Public event data endpoint for registration landing pages
- Public guest self-registration with guest limit enforcement
- Public RSVP landing data with optional guest context
- Public RSVP response (yes/no) by guest

### Endpoints

| Method | Path | Description | Auth | Status |
|--------|------|-------------|------|--------|
| GET | `/api/event/:slug` | Public event data + registration page | None | Implemented |
| POST | `/api/event/:slug/register` | Public guest self-registration | None | Implemented |
| GET | `/api/rsvp/:slug?guest=guestId` | Public RSVP landing data | None | Implemented |
| POST | `/api/rsvp/:slug/respond` | Public RSVP response (yes/no) | None | Implemented |

### Authentication & Authorization
- All public endpoints require NO authentication
- Events are identified by `slug` (not `eventId`) for public URLs
- No user context is required or attached

### GET `/api/event/:slug` -- Public Event Data
- Returns: `{ event, registrationPage }`
- Event fields: id, name, slug, date, time, location, address, primaryColor, showGuestCount, maxGuests, autoConfirmRegistration, deadline
- `registrationPage` is JSONB data from `registration_pages` table (null if not configured)
- If `showGuestCount` is true, includes `confirmedGuestCount` (count of guests with status="yes")
- 404 if slug not found

### POST `/api/event/:slug/register` -- Guest Self-Registration
- Body validated with `publicRegistrationSchema` (name required, email/phone/customFields optional)
- Checks `maxGuests` limit before inserting
- Guest `source` is set to `"registration"`
- If `autoConfirmRegistration` is true: status="yes" and respondedAt is set
- If `autoConfirmRegistration` is false: status="pending"
- Returns: `{ success: true, status: "yes" | "pending" }`
- 403 if guest limit reached, 404 if event not found

### GET `/api/rsvp/:slug` -- RSVP Landing Data
- Query param: `?guest=guestId` (optional)
- Returns: `{ event, landingPage, guest }`
- `landingPage` is JSONB data from `landing_pages` table (null if not configured)
- If guest param provided, includes `{ id, name, status }` for the guest
- If `showGuestCount` is true, includes `confirmedGuestCount`
- 404 if event not found or if guest param provided but guest not found

### POST `/api/rsvp/:slug/respond` -- RSVP Response
- Body validated with `rsvpRespondSchema` (guestId required, status: "yes" | "no")
- Verifies guest belongs to the event
- Updates guest status and respondedAt timestamp
- Returns: `{ success: true }`
- 404 if event or guest not found

### Validation Schemas (from `shared/schemas/guest.ts`)
- `publicRegistrationSchema` -- name (required, max 200), email (optional), phone (optional, max 30), customFields (optional record)
- `rsvpRespondSchema` -- guestId (required non-empty), status ("yes" | "no")

### Database Tables Used
- `events` -- Looked up by slug (unique index)
- `guests` -- Created on registration, updated on RSVP response
- `registration_pages` -- JSONB data for registration landing
- `landing_pages` -- JSONB data for RSVP landing

### Architecture Notes
- Public routes use `server/api/event/` (singular) and `server/api/rsvp/` to distinguish from authenticated `server/api/events/` (plural)
- Guest limit check on registration compares total guest count (all statuses) against `maxGuests`
- `respondedAt` is set when guest registers with auto-confirm, or when they respond via RSVP
- No rate limiting beyond global server middleware (100 req/min per IP)

### Key Files
- `server/api/event/[slug].get.ts` -- Public event data endpoint
- `server/api/event/[slug]/register.post.ts` -- Public registration endpoint
- `server/api/rsvp/[slug].get.ts` -- Public RSVP landing endpoint
- `server/api/rsvp/[slug]/respond.post.ts` -- Public RSVP response endpoint
- `shared/schemas/guest.ts` -- Validation schemas (publicRegistrationSchema, rsvpRespondSchema)
- `server/database/schema/event.ts` -- Events table
- `server/database/schema/guest.ts` -- Guests table
- `server/database/schema/landingPage.ts` -- Landing pages table
- `server/database/schema/registrationPage.ts` -- Registration pages table
