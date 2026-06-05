## Reminders API Requirements
<!-- Last updated: 2026-02-22 by Claude Code -->

### Current Implementation
- CRUD for reminder templates (email + WhatsApp)
- Auto-creation of default templates on first access
- Template active/inactive toggle (`isActive` field)
- Send reminder to individual guest (email log + WhatsApp deep link)
- Reminder history with guest and template name enrichment
- Template variable interpolation ({{variable}} syntax)
- WhatsApp deep link generation with Italian phone number normalization
- Reminder statistics (total active, email sent today, WhatsApp sent today)

### Endpoints

| Method | Path | Description | Auth | Status |
|--------|------|-------------|------|--------|
| GET | `/api/events/:eventId/reminders/templates` | List templates (auto-creates defaults) | Required | Implemented |
| POST | `/api/events/:eventId/reminders/templates` | Create custom template | Required | Implemented |
| PUT | `/api/events/:eventId/reminders/templates/:id` | Update template | Required | Implemented |
| PATCH | `/api/events/:eventId/reminders/templates/:id` | Toggle template isActive state | Required | Implemented |
| DELETE | `/api/events/:eventId/reminders/templates/:id` | Delete custom template | Required | Implemented |
| POST | `/api/events/:eventId/reminders/send/:guestId` | Send reminder to guest | Required | Implemented |
| GET | `/api/events/:eventId/reminders/history` | Reminder history | Required | Implemented |
| GET | `/api/events/:eventId/reminders/stats` | Reminder statistics | Required | Implemented |

### Authentication & Authorization
- All endpoints require authenticated user (`requireAuth`)
- Event ownership verified (`requireEventOwnership`) -- returns 403 if user does not own the event
- Rate limiting: 100 requests/minute per IP (global middleware)

### Default Templates
Auto-created when templates are first requested and none exist for the event:

1. **Reminder gentile** (email): Gentle RSVP reminder with event name, date, and link
2. **Ultimo avviso** (email): Final notice with deadline warning
3. **Reminder WhatsApp** (whatsapp): WhatsApp message with RSVP link

All default templates have `isDefault=true`, `isActive=true` and cannot be deleted.

### Template Active/Inactive Toggle
- Each template has an `isActive` boolean field (default: `true`)
- Toggle via PATCH endpoint with `{ isActive: boolean }` body
- Phase 1: Visual state only (manual sending)
- Phase 2 (planned): Automatic sending when active

### Template Variable Interpolation
Supported variables (replaced via `{{variable_name}}` syntax):
- `guest_name` -- Guest's name
- `event_name` -- Event name
- `event_date` -- Event date
- `event_time` -- Event time (empty string if not set)
- `event_location` -- Event location (empty string if not set)
- `rsvp_link` -- Full RSVP URL with guest ID: `{baseURL}/rsvp/{slug}?guest={guestId}`
- `deadline` -- Event deadline (empty string if not set)
- `organizer_name` -- Authenticated user's name

### Send Reminder Flow

**Email flow:**
1. Verify guest belongs to event
2. Check monthly email limit via `canSendEmail()`
3. Verify guest has email address
4. Interpolate template variables
5. Create `email_logs` entry (actual Resend sending deferred to future implementation)
6. Update guest tracking: `lastEmailSentAt`, `emailSentCount`
7. Return `{ success: true, type: "email" }`

**WhatsApp flow:**
1. Verify guest belongs to event
2. Verify guest has phone number
3. Interpolate template variables
4. Generate WhatsApp deep link URL
5. Create `email_logs` entry for tracking
6. Update guest tracking: `lastWhatsappClickedAt`
7. Return `{ success: true, type: "whatsapp", whatsappUrl }`

### Reminder Statistics
GET `/api/events/:eventId/reminders/stats` returns:
- `totalActive` -- Count of templates with `isActive=true` for this event
- `emailSentToday` -- Count of email-type reminder logs sent today
- `whatsappSentToday` -- Count of WhatsApp-type reminder logs sent today

Stats are calculated by joining `email_logs` through `guests.eventId`.

### WhatsApp Phone Normalization
- Strips whitespace, dashes, parentheses
- Removes leading `+`
- Removes leading `0039` prefix
- Prepends Italian country code `39` if not present
- Removes leading `0` before prepending country code
- URL format: `https://wa.me/{normalizedPhone}?text={encodedMessage}`

### Plan Limits
- Monthly email limit enforced before sending email reminders
- Limits defined in `server/config/planLimits.ts` (`emails_per_month`)
- Starter: 200, Premium: 2000, Agency: unlimited (-1)
- WhatsApp reminders do NOT count against email limits

### Validation Schemas (from `shared/schemas/reminder.ts`)
- `createReminderTemplateSchema` -- name (required, max 100), type ("email" | "whatsapp"), subject (optional, max 200), body (required, max 5000)
- `updateReminderTemplateSchema` -- all fields optional
- `toggleReminderActiveSchema` -- isActive (required boolean)
- `sendReminderSchema` -- templateId (required non-empty)

### Database Tables

**`reminder_templates`** (`server/database/schema/reminderTemplate.ts`)
- Columns: id (UUID v7), eventId, name, type, subject, body, isDefault, isActive, createdAt, updatedAt
- Indexes: eventId, type
- Cascade delete when parent event is deleted

**`email_logs`** (`server/database/schema/emailLog.ts`)
- Columns: id (UUID v7), guestId, templateId (nullable, set null on template delete), type, resendMessageId, status, sentAt, createdAt
- Indexes: guestId, templateId, type, sentAt
- Cascade delete when parent guest is deleted

### Frontend Architecture

**Main page** (`app/pages/dashboard/event/[id]/reminders.vue`):
- Single list view with UTable (no tabs)
- Columns: Titolo Reminder, Canale, Stato (toggle), Azioni Rapide
- Client-side search with 300ms debounce
- Client-side pagination via TanStack Vue Table
- Statistics cards: Total Active, Email Sent Today, WhatsApp Sent Today
- Delete confirmation modal

**Create/Edit pages** (`new.vue` / `[templateId].vue`):
- Lightweight wrappers around shared `ReminderForm` component
- Edit page pre-loads template data and passes as `initialData`
- Breadcrumb navigation: Dashboard / Reminder / Nuovo|NomeTemplate

**Shared form component** (`app/components/reminder/ReminderForm.vue`):
- 2-column layout: form (lg:col-span-7) + real-time phone preview (lg:col-span-5)
- Visual channel selector cards (Email Direct / WhatsApp Link) with icon + highlighted border
- Subject field visible only when type = email
- Clickable variable tags toolbar above textarea (click-to-insert at cursor position)
- Variables: guest_name, event_name, event_date, event_time, event_location, rsvp_link, deadline, organizer_name
- Real-time phone mockup preview with actual event data interpolation (from `useEventStore`)
- Email preview: subject, sender info, body paragraphs, CTA button
- WhatsApp preview: chat bubble style with message
- Suggestion box with static tip text
- Responsive: preview hidden on < lg screens

**Composable** (`app/composables/useReminders.ts`):
- State: templates, history, stats, isLoading, isSending, error
- Functions: loadTemplates, loadStats, createTemplate, updateTemplate, toggleActive, deleteTemplate, sendReminder, loadHistory

### Architecture Notes
- Delete protection: default templates (`isDefault=true`) cannot be deleted, returns 403
- Template update: all fields optional, only provided fields are updated
- History enrichment: guest name and template name are looked up and joined in application code
- History is ordered by `sentAt` descending (newest first)
- `resendMessageId` will be populated when actual email sending is implemented
- Send and History UI removed from reminders page (planned for separate dedicated pages)

### Audit Events
- `reminder.template_created` -- New template created
- `reminder.template_updated` -- Template content updated
- `reminder.template_deleted` -- Template deleted
- `reminder.template_toggled` -- Template isActive state toggled
- `reminder.sent` -- Reminder sent to guest

### Key Files
- `server/api/events/[eventId]/reminders/templates/index.get.ts` -- List templates
- `server/api/events/[eventId]/reminders/templates/index.post.ts` -- Create template
- `server/api/events/[eventId]/reminders/templates/[id].put.ts` -- Update template
- `server/api/events/[eventId]/reminders/templates/[id].patch.ts` -- Toggle isActive
- `server/api/events/[eventId]/reminders/templates/[id].delete.ts` -- Delete template
- `server/api/events/[eventId]/reminders/send/[guestId].post.ts` -- Send reminder
- `server/api/events/[eventId]/reminders/history.get.ts` -- Reminder history
- `server/api/events/[eventId]/reminders/stats.get.ts` -- Reminder statistics
- `server/services/reminder.service.ts` -- Business logic
- `server/utils/reminder.ts` -- `interpolateTemplate()`, `generateWhatsAppLink()`
- `server/utils/userPlan.ts` -- `canSendEmail()`, `countMonthlyEmails()`
- `server/utils/event.ts` -- `requireEventOwnership()`
- `server/database/schema/reminderTemplate.ts` -- Reminder templates schema
- `server/database/schema/emailLog.ts` -- Email logs schema
- `shared/schemas/reminder.ts` -- Validation schemas
- `app/pages/dashboard/event/[id]/reminders.vue` -- Main list page
- `app/pages/dashboard/event/[id]/reminders/new.vue` -- Create page (wrapper)
- `app/pages/dashboard/event/[id]/reminders/[templateId].vue` -- Edit page (wrapper)
- `app/components/reminder/ReminderForm.vue` -- Shared form + preview component
- `app/composables/useReminders.ts` -- Frontend composable
