## Event Settings Page
<!-- Last updated: 2026-02-21 by Claude Code -->

### Current Implementation
- Full event settings form with 5 sections
- Manual save with sticky footer bar + last save timestamp
- Soft delete with confirmation modal (type event name)
- Badge Live/Draft based on date + slug
- "Visualizza Landing" button linking to `/event/{slug}`
- Google Maps placeholder (ready for API key integration)
- Permission-based: owner/editor can edit, viewer sees read-only

### Architecture Notes
- **Page**: `app/pages/dashboard/event/[id]/settings.vue`
- **Store**: `app/stores/eventStore.ts` — `updateEvent()`, `deleteEvent()`
- **API**: `PUT /api/events/:eventId` — validates with `updateEventSchema`
- **API**: `DELETE /api/events/:eventId` — soft delete (`deletedAt` timestamp)
- **Schema**: `shared/schemas/event.ts` — Zod validation
- **DB Schema**: `server/database/schema/event.ts` — events table
- **Service**: `server/services/event.service.ts` — business logic
- **i18n**: Keys under `event.settings.*`

### Form Sections

#### 1. Informazioni Base
- `name` — text, min 2, max 200 (required)
- `slug` — text, min 2, max 50, pattern `^[a-z0-9-]+$`
- `description` — textarea, max 500, nullable
- `date` — date input, format YYYY-MM-DD (required)
- `time` — time input, format HH:MM, nullable
- `maxGuests` — number, min 1 (default 20)

#### 2. Logistica
- `location` — text, max 200, nullable
- `address` — text, max 500, nullable
- Map placeholder (Google Maps integration pending)

#### 3. Landing & Personalizzazione
- `deadline` — date input, RSVP deadline, nullable
- `primaryColor` — color picker + hex input, pattern `^#[0-9a-fA-F]{6}$`
- `showGuestCount` — toggle (default true)
- `socialProofEnabled` — toggle (default false)

#### 4. Automazione
- `autoConfirmRegistration` — toggle (default false)

#### 5. Danger Zone (owner only)
- Delete event with confirmation modal
- User must type event name to confirm
- Soft delete: sets `deletedAt` timestamp
- Redirects to `/dashboard` after deletion

### Permissions
- `can_edit_settings` — required for form editing
- `is_owner` — required for danger zone (delete)
- Viewers see read-only display of all fields

### Data Flow
1. `eventStore.loadEvent(id)` → populates `currentEvent`
2. Form initialized via `syncFormFromEvent()`
3. `hasChanges` computed detects modifications
4. Submit sends only changed fields (diff) via `eventStore.updateEvent()`
5. `lastSavedAt` updated on successful save
6. Cancel resets form from `currentEvent`

### Soft Delete
- `deleteEvent()` service: `UPDATE events SET deleted_at = NOW()`
- All dashboard queries filter `WHERE deleted_at IS NULL`
- Public queries (`getEventBySlug`) also filter soft-deleted events
- Audit log: `event.deleted` action recorded
