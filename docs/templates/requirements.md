# Event Templates Requirements
<!-- Last updated: 2026-02-21 by Claude Code -->

## Overview
Event templates allow users to browse, create, and apply pre-designed landing page layouts for their events. The system supports system-wide templates, user-created custom templates, and AI-generated templates via Mastra AI.

## Architecture

### Data Model

#### `event_templates` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | text (UUID v7) | Primary key |
| `userId` | text nullable | FK -> user.id, NULL for system templates |
| `name` | text | Required |
| `description` | text | Nullable |
| `category` | text | TemplateCategory enum |
| `data` | jsonb | LandingPageData structure (settings + sections) |
| `thumbnailUrl` | text | Nullable |
| `isSystem` | boolean | Default false |
| `isAiGenerated` | boolean | Default false |
| `createdAt` | timestamp | Auto |
| `updatedAt` | timestamp | Auto |

Indexes: `user_id`, `category`, `is_system`

### Template Categories
Static enum in `shared/constants/enums.ts`:
- wedding, birthday, corporate, conference, networking, party, other

### Template Data Structure
Uses the same `LandingPageData` schema (`shared/schemas/landing.ts`) as `landing_pages` and `registration_pages` tables. This includes:
- `settings`: primaryColor, secondaryColor, backgroundColor, textColor, fontFamily, borderRadius
- `sections`: array of { id, type, enabled, order, values }

## API Endpoints

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/templates` | GET | user | List templates (system + own), query: `category?` |
| `/api/templates` | POST | user | Create custom template |
| `/api/templates/generate` | POST | user | Generate template with AI |
| `/api/templates/[id]` | GET | user | Get single template |
| `/api/templates/[id]` | PUT | user | Update own template |
| `/api/templates/[id]` | DELETE | user | Delete own template |
| `/api/events/[eventId]/templates/apply` | POST | event member | Apply template to event landing page |

## Frontend

### Page
- Route: `/dashboard/event/[id]/templates`
- File: `app/pages/dashboard/event/[id]/templates.vue`
- Sidebar nav icon: `i-lucide-layout-template`

### Composable
- File: `app/composables/useEventTemplates.ts`
- Methods: `loadTemplates`, `generateTemplate`, `deleteTemplate`, `applyTemplate`

### UI Sections
1. **AI Hero Section**: Input + "Generate" button, gradient background
2. **Category Filter Tabs**: All + per-category buttons
3. **Template Grid**: 4-column responsive grid with card components
4. **Empty State**: When no templates match the category

## AI Generation (Mastra)

### Implementation
- Uses `@mastra/core` Agent with `openai/gpt-4o-mini` model
- Service: `server/services/ai.service.ts`
- Env var: `NUXT_OPENAI_API_KEY` (auto-read by Mastra)
- Structured output with Zod schema for type-safe responses
- Output validated against `landingPageDataSchema` before saving

### Flow
1. User enters prompt describing event vibe
2. `POST /api/templates/generate` sends prompt to AI agent
3. Agent returns `LandingPageData` JSON
4. Data validated with Zod schema
5. Template saved to DB as user-owned, `isAiGenerated: true`
6. Template appears in user's template list

## Permissions
- System templates: visible to all users, not editable/deletable
- User templates: visible only to owner, full CRUD
- Apply template: requires event ownership (via `requireEventOwnership`)

## Audit Events
- `template.created` - User creates a template
- `template.updated` - User updates a template
- `template.deleted` - User deletes a template
- `template.applied` - Template applied to event landing page
- `template.ai_generated` - AI-generated template created

## Landing Page Editor (Template Builder)
<!-- Added: 2026-02-21 by Claude Code -->

### Overview
Shopify Themes-style visual editor for creating and modifying landing page templates. Accessed from the Templates page, not as a separate nav item. Provides a 3-column layout: section list (left), live preview (center), section configurator (right).

### UX Flow
1. Templates list page → click "Modifica" on template → opens editor with template data
2. Templates list page → click "Crea Nuovo Template" → opens editor with default sections
3. In editor: activate/disable sections, reorder via drag & drop, configure fields
4. Save → creates new template (POST) or updates existing (PUT)
5. Back on templates list → "Applica" copies template data to event landing page

### Routes
- **Templates list**: `/dashboard/event/[id]/templates` → `app/pages/dashboard/event/[id]/templates/index.vue`
- **Editor**: `/dashboard/event/[id]/templates/editor?id=xxx` → `app/pages/dashboard/event/[id]/templates/editor.vue`
- **AI generation API**: `POST /api/events/[eventId]/landing/generate` → returns `LandingPageData` (does NOT persist)

### Architecture

#### Composable: `useLandingEditor`
- File: `app/composables/useLandingEditor.ts`
- Params: `eventId`, `templateId` (null for new)
- Injected via `provide('landingEditor', editor)` from editor page
- State: `data` (LandingPageData), `templateMeta`, `selectedSectionId`, `showGlobalSettings`, `previewMode`, dirty tracking
- Actions: `load()`, `save(meta)`, `selectSection()`, `updateSectionValues()`, `toggleSection()`, `reorderSections()`, `addSection()`, `removeSection()`, `updateSettings()`, `generateWithAI()`

#### Editor Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `LandingEditor.vue` | `landing-editor/` | 3-column layout (left sidebar w-72, center flex-1, right sidebar w-80) |
| `SectionList.vue` | `landing-editor/` | Left sidebar: draggable sections list + toggle switches |
| `LandingPreview.vue` | `landing-editor/` | Center: live preview using `EventSectionRenderer`, desktop/mobile toggle |
| `SectionConfigurator.vue` | `landing-editor/` | Right sidebar: dynamic form from `SECTION_DEFINITIONS` fields |
| `GlobalSettingsPanel.vue` | `landing-editor/` | Right sidebar alternate: colors, font, border radius |
| `FieldRenderer.vue` | `landing-editor/` | Maps `SectionFieldType` to Nuxt UI inputs |
| `ImageUploadField.vue` | `landing-editor/` | R2 image upload via `POST /api/file/upload` |
| `AddSectionDialog.vue` | `landing-editor/` | Modal for adding new sections (shows only unaddded types) |

#### Dependencies
- `vuedraggable@next` (v4.1.0) for drag & drop
- Existing `SECTION_DEFINITIONS` from `shared/schemas/sections.ts` drives dynamic form generation
- Existing `EventSectionRenderer.vue` + 9 section components for live preview
- Existing R2 upload system (`POST /api/file/upload`)
- Existing Mastra AI service (`generateEventTemplate()`)

### Section Field Types → UI Mapping
| SectionFieldType | Component | Notes |
|------------------|-----------|-------|
| `text` | `UInput` | Standard text input |
| `textarea` / `richtext` | `UTextarea` | richtext uses textarea for now |
| `color` | `<input type="color">` + `UInput` | Color picker + hex text |
| `image` | `ImageUploadField` | R2 upload with preview |
| `select` | `USelect` | Uses `field.options` |
| `toggle` | `USwitch` | Boolean |
| `number` | `UInput type="number"` | With min/max from field |
| `date` | `UInput type="date"` | Native date picker |
| `time` | `UInput type="time"` | Native time picker |

### Features
- Drag & drop section reordering (vuedraggable)
- Enable/disable sections with toggle switches
- Real-time preview with CSS variables (`--landing-primary`, etc.)
- Desktop/mobile preview toggle (max-w-4xl vs w-[375px])
- AI template generation via Mastra (replaces current editor data)
- Image upload to Cloudflare R2
- Dirty tracking (JSON snapshot comparison)
- `beforeunload` warning for unsaved changes
- Mobile warning: "Use desktop" message on `< lg` breakpoints

### i18n
- Translation key: `landingEditor.*` in both `it-IT.json` and `en-US.json`
- Added `eventTemplates.createNew`, `eventTemplates.card.edit`, `eventTemplates.card.apply`

## Key Files

| File | Purpose |
|------|---------|
| `server/database/schema/eventTemplate.ts` | DB schema |
| `shared/schemas/eventTemplate.ts` | Zod validation schemas |
| `shared/schemas/landing.ts` | Landing page + generateLanding schemas |
| `shared/schemas/sections.ts` | `SECTION_DEFINITIONS`, `getSectionDefaults()` |
| `shared/constants/enums.ts` | `TEMPLATE_CATEGORIES`, `LANDING_SECTION_TYPES`, `LANDING_FONTS`, `LANDING_BORDER_RADIUS` |
| `server/services/eventTemplate.service.ts` | CRUD + apply service |
| `server/services/ai.service.ts` | Mastra AI generation |
| `server/api/templates/` | API routes (6 files) |
| `server/api/events/[eventId]/templates/apply.post.ts` | Apply route |
| `server/api/events/[eventId]/landing/generate.post.ts` | AI generation endpoint (no persist) |
| `app/composables/useEventTemplates.ts` | Frontend composable (list/delete/apply) |
| `app/composables/useLandingEditor.ts` | Editor composable (load/save/edit/AI) |
| `app/pages/dashboard/event/[id]/templates/index.vue` | Templates list page |
| `app/pages/dashboard/event/[id]/templates/editor.vue` | Template editor page |
| `app/components/landing-editor/` | 8 editor components |
| `app/components/event/SectionRenderer.vue` | Section rendering for preview |
| `app/pages/dashboard.vue` | Sidebar nav (templates link) |
| `i18n/locales/it-IT.json` | Italian translations (`eventTemplates` + `landingEditor`) |
| `i18n/locales/en-US.json` | English translations (`eventTemplates` + `landingEditor`) |
