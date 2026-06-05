## Guests API Requirements
<!-- Last updated: 2026-02-21 by Claude Code -->

### Current Implementation

- CRUD operations for event guests (list, create, update, delete)
- Bulk CSV import with duplicate detection by email
- Query filters: status, search (name/email/group)
- Plan-based guest limits enforced via `canAddGuest()` / `getEffectiveLimits()`
- Event ownership verified on every endpoint via `requireEventOwnership()`
- Guest grouping via `group` field (free text, optional)
- WhatsApp link for pending guests (wa.me/ with pre-composed message)

### Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/events/:eventId/guests` | List guests with filters + summary counts | Implemented |
| POST | `/api/events/:eventId/guests` | Add single guest (source=manual) | Implemented |
| POST | `/api/events/:eventId/guests/import` | Bulk import guests (source=csv) | Implemented |
| PUT | `/api/events/:eventId/guests/:guestId` | Update guest fields | Implemented |
| DELETE | `/api/events/:eventId/guests/:guestId` | Remove guest | Implemented |

### Authentication & Authorization
- All endpoints require authenticated user (`requireAuth`)
- Event ownership verified (`requireEventOwnership`) -- returns 403 if user does not own the event
- Utility created at `server/utils/event.ts`

### Validation Schemas (from `shared/schemas/guest.ts`)
- `createGuestSchema` -- name (required), email (optional), phone (optional), group (optional, max 100)
- `updateGuestSchema` -- all fields optional, includes status, group, and customFields
- `importGuestsSchema` -- array of guest rows (min 1, max 500), each with optional group
- `guestFilterSchema` -- status, source, search query params

### Plan Limits
- Guest count per event enforced before single add and bulk import
- Limits defined in `server/config/planLimits.ts` (`max_guests_per_event`)
- Starter: 50, Premium: 350, Agency: unlimited (-1)

### Database Schema (`server/database/schema/guest.ts`)
- Table: `guests`
- Columns: id (UUID v7), eventId, name, email, phone, group, status, source, customFields (JSONB), respondedAt, lastEmailSentAt, emailSentCount, lastWhatsappClickedAt, createdAt, updatedAt
- Indexes: eventId, status, source, email, group
- Cascade delete when parent event is deleted

### Bulk Import Logic
- Duplicates detected by email within the same event (existing guests + within-batch)
- Guests without email are never considered duplicates
- Returns `{ imported, duplicates, errors }` summary
- Limit check happens before and after deduplication
- CSV supports columns: nome/name, email/e-mail, telefono/phone/tel, gruppo/group

### UI Features (Dashboard Page)
- **Stats cards**: 4-card grid showing total, confirmed, declined, pending counts
- **Segmented tabs**: Filter by status (Tutti/Si/No/In attesa) replacing dropdown selects
- **Search bar**: Searches by name, email, and group
- **Table columns**: Nome Invitato (avatar+name), Contatto (email or phone), Gruppo (badge), Stato (pill badge), Azioni (contextual)
- **Contextual actions**: Confirmed/Declined: edit + delete | Pending: WhatsApp + edit
- **WhatsApp**: Opens wa.me/ link with pre-composed message for pending guests with phone number
- **Modals**: Add/Edit include group field, CSV import parses group column

### Architecture Notes
- `respondedAt` is automatically set when status changes to "yes" or "no" via PUT
- `updatedAt` is auto-managed by Drizzle `$onUpdate`
- Summary counts (total, confirmed, pending, declined) are always computed against full event guest set, not filtered subset
- Hard delete (no soft delete) -- cascade from event deletion handles cleanup
- Search also covers `group` field via ilike

### Key Files
- `server/api/events/[eventId]/guests/index.get.ts` -- List endpoint
- `server/api/events/[eventId]/guests/index.post.ts` -- Create endpoint
- `server/api/events/[eventId]/guests/import.post.ts` -- Bulk import endpoint
- `server/api/events/[eventId]/guests/[guestId].put.ts` -- Update endpoint
- `server/api/events/[eventId]/guests/[guestId].delete.ts` -- Delete endpoint
- `server/utils/event.ts` -- `requireEventOwnership` utility
- `server/utils/userPlan.ts` -- `canAddGuest`, `countEventGuests`
- `server/config/planLimits.ts` -- Plan limit definitions
- `server/database/schema/guest.ts` -- DB schema
- `shared/schemas/guest.ts` -- Zod validation schemas
- `app/pages/dashboard/event/[id]/guests.vue` -- Dashboard guest list page
- `app/composables/useGuests.ts` -- Client-side guest composable
