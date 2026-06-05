# Ceremly — PRD Tecnico-Operativo per Sviluppo

**Versione:** 4.0
**Data:** Febbraio 2026
**Tipo:** Documento tecnico-operativo (ottimizzato per Claude Code)
**Status:** In produzione

---

## 1. Contesto Progetto

### 1.1 Cosa è Ceremly

Ceremly è una piattaforma SaaS per la gestione degli inviti e delle conferme di partecipazione a eventi privati nel mercato italiano (matrimoni, compleanni, battesimi, lauree, feste). L'organizzatore crea un evento, carica gli invitati (manualmente o via CSV), configura due landing page personalizzabili tramite un editor drag & drop (una per la registrazione pubblica e una per la conferma RSVP), e gestisce i solleciti agli invitati che non hanno ancora risposto tramite un'area dedicata con template email e WhatsApp deep links.

### 1.2 Problema che risolve

Gli organizzatori di eventi in Italia gestiscono le conferme manualmente: telefonate sparse, messaggi WhatsApp individuali, fogli Excel. Non hanno visibilità su chi ha risposto e chi no, e sollecitare chi non risponde è tedioso e imbarazzante. Ceremly centralizza tutto il flusso in un'unica piattaforma: raccolta iscrizioni, conferma presenze, solleciti automatizzati, dashboard in tempo reale.

### 1.3 Differenziatore chiave

Ceremly intercetta chi NON ha risposto e fornisce strumenti 1-click per sollecitare (email + WhatsApp) da un'area dedicata con template personalizzabili. L'editor landing page ispirato a Shopify Themes (sezioni predefinite riordinabili via drag & drop) rende la personalizzazione accessibile anche a utenti non tecnici. L'AI tramite Mastra con `gpt-4o-mini` genera landing page complete a partire da un semplice prompt.

---

## 2. Stack Tecnico e Convenzioni

### 2.1 Stack

| Layer | Tecnologia | Note |
|-------|------------|------|
| Framework | Nuxt 4 (Vue 3) | SSR/CSR hybrid, TypeScript strict, Composition API, `<script setup>` |
| UI | Nuxt UI v4 + Tailwind CSS | Warm earthy palette (Light Bronze primary, Tea Green secondary) |
| Icons | @iconify-json/lucide + @iconify-json/simple-icons | Bundle locale, no API calls |
| Backend | Nuxt Server Routes | Thin controllers + service layer in `server/services/` |
| Database | PostgreSQL | Neon serverless o qualsiasi PG compatibile |
| ORM | Drizzle ORM | Type-safe, UUID v7, migrations via `drizzle-kit` |
| Auth | Better Auth v1.4.5 | Email/password + Google OAuth + 2FA, session cache in Redis |
| Email | Resend + React Email | Template i18n in `server/emailTemplates/` |
| Landing Editor | vuedraggable@next | Editor sezioni drag & drop ispirato a Shopify Themes |
| AI | Mastra (`@mastra/core`) + OpenAI `gpt-4o-mini` | Genera landing pages complete da prompt |
| Pagamenti | Creem (`@creem_io/better-auth`) | MoR, plugin Better Auth, webhook auto-registrato |
| Storage | Cloudflare R2 (S3-compatible) | Upload file con SHA-256 dedup, magic bytes validation |
| Cache | Redis (unstorage) | Session cache, con fallback in-memory |
| Security | nuxt-security | CSP, HSTS, rate limiting, XSS protection |
| SEO | @nuxtjs/seo | Sitemap, robots, schema.org |
| Blog | @nuxt/content | Markdown in `content/blogs/` |
| i18n | @nuxtjs/i18n | Italiano default, inglese alternativo |
| State | Pinia | Auto-imported stores |
| Deployment | Node.js o Cloudflare Workers | `NUXT_NITRO_PRESET=node-server` o `cloudflare-module` |

### 2.2 Struttura Cartelle

```
ceremly/
├── CLAUDE.md                         # Istruzioni per Claude Code
├── PRD.md                            # Questo file
├── nuxt.config.ts
├── app/
│   ├── pages/
│   │   ├── index.vue                 # Landing page marketing
│   │   ├── login.vue
│   │   ├── signup.vue
│   │   ├── logout.vue
│   │   ├── maintenance.vue
│   │   ├── contactUs.vue
│   │   ├── auth/callback.vue         # OAuth callback
│   │   ├── blogs/
│   │   │   ├── index.vue             # Lista blog
│   │   │   └── [slug].vue            # Singolo post
│   │   ├── legal/                    # ToS, Privacy, DPA
│   │   ├── dashboard.vue             # Layout shell dashboard
│   │   ├── dashboard/
│   │   │   ├── index.vue             # Home dashboard
│   │   │   ├── subscription/         # Gestione abbonamento
│   │   │   ├── profile/
│   │   │   │   ├── index.vue         # Profilo utente
│   │   │   │   └── members.vue       # Team members
│   │   │   └── event/
│   │   │       ├── index.vue         # Lista eventi (creazione)
│   │   │       └── [id]/
│   │   │           ├── index.vue     # Dashboard singolo evento
│   │   │           ├── guests.vue    # Gestione invitati
│   │   │           ├── settings.vue  # Impostazioni evento
│   │   │           ├── team.vue      # Team evento
│   │   │           ├── templates/
│   │   │           │   ├── index.vue # Galleria template
│   │   │           │   └── editor.vue # Editor landing drag & drop
│   │   │           └── reminders/
│   │   │               ├── index.vue # Area solleciti
│   │   │               ├── new.vue   # Nuovo template reminder
│   │   │               └── [templateId].vue # Modifica template
│   │   ├── event/
│   │   │   └── [slug].vue            # Landing pubblica REGISTRAZIONE
│   │   ├── rsvp/
│   │   │   └── [slug].vue            # Landing pubblica RSVP
│   │   └── invite/
│   │       └── [token].vue           # Accettazione invito team
│   ├── components/
│   │   ├── admin/                    # Componenti dashboard admin
│   │   ├── landing/                  # Sezioni landing pubbliche
│   │   ├── landing-editor/           # Editor drag & drop
│   │   │   ├── LandingEditor.vue     # Layout 3 colonne
│   │   │   ├── SectionList.vue       # Sidebar sinistra - lista sezioni draggable
│   │   │   ├── SectionConfigurator.vue # Sidebar destra - form configurazione
│   │   │   ├── LandingPreview.vue    # Centro - anteprima live
│   │   │   ├── AddSectionDialog.vue  # Dialog per aggiungere sezioni
│   │   │   ├── GlobalSettingsPanel.vue # Pannello colori/font globali
│   │   │   ├── FieldRenderer.vue     # Renderizza campo form per tipo
│   │   │   └── ImageUploadField.vue  # Upload immagini nell'editor
│   │   ├── event/                    # Componenti sezioni rendering
│   │   │   ├── SectionRenderer.vue   # Dispatcher sezioni
│   │   │   ├── HeroSection.vue
│   │   │   ├── DetailsSection.vue
│   │   │   ├── StorySection.vue
│   │   │   ├── CountdownSection.vue
│   │   │   ├── GallerySection.vue
│   │   │   ├── RsvpSection.vue
│   │   │   ├── RegistrationFormSection.vue
│   │   │   ├── MapSection.vue
│   │   │   └── FooterSection.vue
│   │   └── reminder/                 # Componenti area solleciti
│   │       └── ReminderForm.vue      # Form condiviso create/edit
│   ├── composables/
│   │   ├── useAuth.ts                # Wraps Better Auth client
│   │   ├── useGuests.ts              # Guest CRUD operations
│   │   ├── useLandingEditor.ts       # Stato e azioni editor landing
│   │   ├── useLandingTheme.ts        # CSS variable injection per preview
│   │   ├── useReminders.ts           # Template CRUD + invio + history + stats
│   │   ├── useSubscription.ts        # Stato abbonamento + checkout/portal Creem
│   │   ├── useEventTemplates.ts      # Template list/delete/apply
│   │   ├── useDashboard.ts           # Dashboard data loading
│   │   ├── usePricing.ts             # Dati piani pricing
│   │   ├── useTwoFactor.ts           # Flusso abilita/disabilita 2FA
│   │   ├── useSiteMode.ts            # Stato site mode
│   │   ├── useUsageNotifications.ts  # Warning limiti piano
│   │   ├── useBlog.ts                # Blog post fetching
│   │   └── useScrollReveal.ts        # Animazioni intersection observer
│   ├── stores/
│   │   ├── userStore.ts              # Auth state, subscription, plan limits/usage
│   │   ├── eventStore.ts             # Current event data, counts, permissions
│   │   ├── profileStore.ts           # User profile data
│   │   └── feedbackStore.ts          # Feedback UI state
│   ├── layouts/
│   │   ├── default.vue               # Layout base
│   │   ├── auth.vue                  # Layout login/signup
│   │   ├── dashboard.vue             # Layout con sidebar (app)
│   │   ├── landing.vue               # Layout landing pubbliche
│   │   └── maintenance.vue           # Layout manutenzione
│   └── middleware/
│       ├── auth.global.ts            # Protezione route (auth: { only: 'guest'|'user' })
│       └── 0.site-mode.global.ts     # Enforcement site mode (client-side)
├── server/
│   ├── api/
│   │   ├── auth/[...all].ts          # Better Auth catch-all
│   │   ├── events/                   # CRUD eventi (autenticato)
│   │   │   └── [eventId]/
│   │   │       ├── guests/           # CRUD invitati
│   │   │       ├── landing/          # Landing RSVP (salva/carica/genera AI)
│   │   │       ├── registration/     # Landing registrazione (salva/carica)
│   │   │       └── reminders/        # Template solleciti e invio
│   │   ├── event/                    # Endpoint pubblici registrazione
│   │   ├── rsvp/                     # Endpoint pubblici RSVP
│   │   ├── templates/               # CRUD template + generazione AI
│   │   ├── team/                    # Inviti team + membership
│   │   ├── file/                    # Upload file (presign/confirm/direct)
│   │   ├── user/                    # Profilo + account + data export GDPR
│   │   ├── limits/                  # Plan limit validation
│   │   ├── admin/                   # Admin panel endpoints (require API key)
│   │   ├── contact.post.ts          # Form contatto
│   │   └── waiting-list/            # Iscrizione waiting list
│   ├── services/                     # Business logic layer
│   │   ├── event.service.ts          # Event CRUD, ownership, slug generation
│   │   ├── guest.service.ts          # Guest CRUD, bulk CSV import, dedup
│   │   ├── landing.service.ts        # Landing + registration page CRUD
│   │   ├── reminder.service.ts       # Template interpolation, WhatsApp links, invio
│   │   ├── ai.service.ts             # Mastra agent (gpt-4o-mini), genera LandingPageData
│   │   ├── eventTemplate.service.ts  # Template CRUD + apply to event
│   │   ├── planLimit.service.ts      # canCreateEvent(), canAddGuest(), canSendEmail()...
│   │   ├── team.service.ts           # Inviti team, membership management
│   │   ├── publicEvent.service.ts    # Public RSVP + registration APIs
│   │   ├── user.service.ts           # Profile updates, account deletion
│   │   ├── dataExport.service.ts     # GDPR user data export
│   │   ├── contact.service.ts        # Contact form handling
│   │   ├── waitingList.service.ts    # Waiting list subscriptions
│   │   └── file/                     # File upload subsystem
│   │       ├── fileService.ts        # R2 uploads (direct + presigned), dedup SHA-256
│   │       ├── imageProcessor.ts     # Image processing/variants
│   │       ├── magicBytes.ts         # Binary header file type validation
│   │       ├── rateLimiter.ts        # 100 uploads/min per user
│   │       └── cleanup.ts            # Storage cleanup
│   ├── database/
│   │   ├── schema/                   # Drizzle schema files
│   │   │   └── index.ts              # Barrel export
│   │   ├── drizzle.config.ts         # Drizzle config
│   │   └── seed/                     # Seed + reset scripts
│   ├── emailTemplates/               # React Email templates (i18n: it/en)
│   │   ├── VerificationEmail.ts
│   │   ├── ResetPasswordEmail.ts
│   │   ├── EventInviteEmail.ts
│   │   ├── WaitingListEmail.ts
│   │   ├── ContactConfirmationEmail.ts
│   │   └── ContactNotificationEmail.ts
│   ├── middleware/                    # Server middleware (numerati per ordine)
│   │   ├── 0.common.ts
│   │   ├── 0.site-mode.ts
│   │   ├── 1.auth.ts
│   │   ├── 2.events.ts
│   │   ├── 3.rate-limit.ts
│   │   └── 4.block-bots.ts
│   └── utils/                        # Server utilities
│       ├── auth.ts                   # getAuthSession(), requireAuth()
│       ├── db.ts                     # getDB() (singleton)
│       ├── validateBody.ts           # parseBody(), parseQueryParams()
│       ├── permissions.ts            # RBAC: requireMember/Write/Owner()
│       ├── audit/                    # logAudit(), AUDIT_ACTIONS
│       ├── drivers.ts                # getPgPool(), cacheClient, getResendInstance()
│       ├── query.ts                  # processFilters(), withFilters()
│       ├── spamProtection.ts         # Disposable email, honeypot, timing
│       └── runtimeConfig.ts          # generateRuntimeConfig()
├── shared/
│   ├── schemas/                      # Zod validation schemas
│   │   ├── auth.ts, event.ts, guest.ts, landing.ts, reminder.ts
│   │   ├── sections.ts              # SECTION_DEFINITIONS (9 tipi sezione)
│   │   ├── subscription.ts, team.ts, file.ts, admin.ts
│   │   ├── contact.ts, eventTemplate.ts, waiting-list.ts
│   │   └── common.ts                # Schema condivisi (paginazione, filtri)
│   ├── constants/
│   │   ├── enums.ts                  # GUEST_STATUSES, REMINDER_TYPES, SECTION_TYPES...
│   │   └── pricing.ts               # PRICING_PLANS, PlanLimits, helpers
│   └── utils/                        # Utilities condivise
├── i18n/locales/                     # it-IT.json, en-US.json
├── content/blogs/                    # Blog posts Markdown
├── docs/
│   ├── pattern/                      # Backend patterns (MUST READ)
│   │   ├── api-routes.md
│   │   ├── services.md
│   │   ├── validators.md
│   │   └── middleware-server.md
│   └── [feature]/requirements.md     # auth, dashboard, events, guests, payments,
│                                     # public-api, reminders, site-mode, templates
└── drizzle/migrations/               # Generated migration files
```

### 2.3 Convenzioni di Codice

**Naming:** variabili e funzioni in `camelCase`, componenti Vue in `PascalCase` (es. `GuestList.vue`, `EventCard.vue`), composables con prefisso `use` (es. `useAuth`, `useGuests`), file server API in `kebab-case.method.ts` (es. `import.post.ts`), schema Drizzle in camelCase con tabella in snake_case.

**Validazione:** ogni endpoint usa `parseBody(event, schema)` e `parseQueryParams(event, schema)` da `server/utils/validateBody.ts`. Schema Zod definiti in `shared/schemas/`. Mai `readValidatedBody`, `readBody` + `safeParse`, o schema inline.

**Error handling:** try-catch con gestione `23505` (unique constraint) + re-throw + fallback 500. Usa `createError()` di Nuxt.

**Backend pattern:** Route API sono thin controller (max 20-25 righe) che delegano ai service in `server/services/`. I service contengono tutta la business logic. Leggere `docs/pattern/` prima di scrivere codice backend.

**Auth nelle route:** `requireAuth(event)` come prima operazione. RBAC con `requireMember()` / `requireWrite()` / `requireOwner()` per operazioni su eventi.

**Database:** `getDB()` (singleton) — mai `useDB()`. `useRuntimeConfig()` nelle route — mai `process.env`.

**Audit:** `logAudit()` obbligatorio su ogni operazione di scrittura.

**Componenti UI:** usare Nuxt UI v4 per bottoni, input, dialog, toast, table. Landing page usa pure Tailwind (no Nuxt UI).

---

## 3. Flusso Principale dell'Applicazione

### 3.1 Panoramica dei Flussi

Il flusso di Ceremly si articola attorno a due percorsi principali di raccolta guest, che convergono in un unico sistema di gestione e sollecito.

**Percorso A — Invitati diretti (CSV/manuale):** L'organizzatore carica una lista di invitati noti tramite CSV o aggiunta manuale. Ogni invitato riceve un link RSVP personalizzato (`/rsvp/[slug]?guest=[guestId]`) dove conferma o declina la presenza.

**Percorso B — Registrazione pubblica:** L'organizzatore condivide un link generico (`/event/[slug]`) su social, chat di gruppo, ecc. Nuovi guest si registrano autonomamente compilando un form con campi personalizzabili. Un toggle nelle impostazioni evento (`autoConfirmRegistration`) decide se la registrazione vale automaticamente come conferma (status "yes") oppure se il guest viene aggiunto come "pending" e riceverà il link RSVP personalizzato per confermare.

**Convergenza:** Una volta nel sistema, tutti i guest (sia da CSV che da registrazione pubblica) appaiono nella stessa lista invitati e possono essere gestiti uniformemente. I guest con status "pending" possono essere sollecitati dall'area dedicata.

### 3.2 Flusso Dettagliato

```
1. Registrazione organizzatore → Dashboard (vuoto)
2. Crea evento → Configura impostazioni (incluso toggle autoConfirmRegistration)
3. Due azioni parallele:
   a. Carica invitati (CSV o manuale) → Guest con status "pending"
   b. Configura landing registrazione → Condivide link /event/[slug]
4. Configura landing RSVP (personalizzata per singolo guest)
5. Invia inviti ai guest da CSV (email con link RSVP personalizzato)
6. Nuovi guest arrivano da registrazione pubblica:
   - Se autoConfirmRegistration = true → status "yes"
   - Se autoConfirmRegistration = false → status "pending", ricevono link RSVP
7. Guest pending ricevono solleciti dall'area dedicata (email + WhatsApp)
8. Dashboard mostra stato in tempo reale
```

---

## 4. Le Due Landing Page

Entrambe le landing page utilizzano lo stesso template builder con editor drag & drop, ma servono scopi diversi e hanno sezioni specifiche.

### 4.1 Landing Registrazione (`/event/[slug]`)

**Scopo:** Pagina pubblica dove nuovi guest si iscrivono all'evento. L'organizzatore la condivide liberamente.

**Sezioni disponibili:** hero, details, story, countdown, gallery, registration_form (al posto di rsvp), map, footer.

**Sezione Registration Form:** È il cuore di questa landing. Il form raccoglie informazioni configurabili dall'organizzatore. L'organizzatore decide tramite l'editor quali campi includere: nome (sempre presente), email, telefono, numero accompagnatori, allergie alimentari, note, e potenzialmente campi custom. Ogni campo può essere marcato come obbligatorio o opzionale dall'organizzatore nel configuratore della sezione.

**Comportamento post-registrazione:** Dipende dal toggle `autoConfirmRegistration` nelle impostazioni evento. Se true, il guest viene creato con status "yes" e vede un messaggio di conferma. Se false, il guest viene creato con status "pending" e riceve automaticamente un'email con il link alla landing RSVP personalizzata.

**Dati salvati:** La configurazione della landing registrazione è salvata nella tabella `registration_pages` con la stessa struttura `LandingPageData` (settings globali + array sezioni con valori).

### 4.2 Landing RSVP (`/rsvp/[slug]?guest=[guestId]`)

**Scopo:** Pagina personalizzata per singolo guest dove conferma o declina la presenza. Il guest arriva qui tramite link ricevuto via email o WhatsApp.

**Sezioni disponibili:** hero, details, story, countdown, gallery, rsvp (form conferma/declina), map, footer.

**Sezione RSVP:** Mostra i dati del guest (pre-compilati dal `guestId` nel query parameter), due bottoni (conferma / declina) con testi personalizzabili, e opzionalmente il social proof ("X persone hanno già confermato").

**Identificazione guest:** Il parametro `guest=[guestId]` nel URL identifica univocamente l'invitato. La pagina carica i dati dell'evento e del guest specifico. Se il `guestId` non è valido, mostra un messaggio di errore.

**Dati salvati:** La configurazione della landing RSVP è salvata nella tabella `landing_pages` con struttura `LandingPageData`.

### 4.3 Template Builder (condiviso)

Entrambe le landing usano lo stesso componente `LandingEditor.vue` con layout a 3 colonne: sidebar sinistra con lista sezioni draggable, centro con anteprima live, sidebar destra con form di configurazione della sezione selezionata.

**Architettura del sistema:**

Il sistema si basa su tre pilastri. Lo **schema delle sezioni** (`shared/schemas/sections.ts` → `SECTION_DEFINITIONS`) è un JSON che definisce quali sezioni esistono e quali campi ha ognuna, e serve a generare dinamicamente i form di configurazione. I **dati landing page** sono un JSON salvato nel database che contiene impostazioni globali (colori, font) + array delle sezioni attive con i loro valori. I **componenti di rendering** (`app/components/event/`) sono componenti Vue che ricevono i valori e renderizzano l'HTML della sezione.

**Tipi di campo supportati nell'editor:** text, textarea, richtext, color, image, select, toggle, date, time, number.

**Sezioni disponibili con i loro campi:**

- **Hero (Intestazione):** titolo, sottotitolo, mostra data (toggle), immagine sfondo, opacità overlay (0-100), altezza (small/medium/large/full).
- **Details (Dettagli Evento):** mostra data (toggle), mostra orario (toggle), nome location, indirizzo, dress code, informazioni aggiuntive, layout (cards/list/timeline).
- **Story (La Nostra Storia):** titolo, testo, foto, posizione immagine (left/right/top).
- **Countdown:** titolo, mostra giorni/ore/minuti/secondi (toggle ciascuno), messaggio scaduto.
- **Gallery (Galleria Foto):** titolo, immagini (max 6), layout (grid/masonry/carousel).
- **RSVP (Conferma Presenza):** titolo, descrizione, testo bottone conferma, testo bottone rifiuto, mostra contatore conferme (toggle), testo contatore.
- **Registration Form (Form Registrazione):** titolo, descrizione, campi form personalizzabili con toggle obbligatorio per ciascuno (nome, email, telefono, accompagnatori, allergie, note, campi custom), testo bottone submit, messaggio successo.
- **Map (Mappa):** titolo, mostra bottone indicazioni (toggle), testo bottone.
- **Footer:** messaggio finale, mostra contatti (toggle), email, telefono.

**Settings globali:** primaryColor, secondaryColor, backgroundColor, textColor, fontFamily (inter/playfair/montserrat/lora/roboto), borderRadius (none/sm/md/lg/full).

**Funzionalità editor:** drag & drop sezioni con vuedraggable, click per selezionare e configurare, toggle attiva/disattiva, anteprima live in tempo reale con toggle desktop/mobile, pannello impostazioni globali colori/font, generazione con AI via Mastra, salvataggio con indicatore "modifiche non salvate", warning se l'utente lascia con modifiche non salvate (`beforeunload`).

### 4.4 Event Templates

Il sistema include una galleria di template landing page riutilizzabili:

- **Template di sistema** (`isSystem: true`, `userId: null`) — predefiniti nella piattaforma
- **Template utente** — creati dall'utente per riuso personale
- **Template AI** (`isAiGenerated: true`) — generati da Mastra tramite prompt

Ogni template è categorizzato (es. matrimonio, compleanno, festa) e contiene un `LandingPageData` completo. L'utente può applicare un template al proprio evento dalla galleria (`/dashboard/event/[id]/templates/`).

Tabella: `event_templates` con campi `userId`, `name`, `description`, `category`, `data` (jsonb), `thumbnailUrl`, `isSystem`, `isAiGenerated`.

---

## 5. Schema Database

### 5.1 Relazioni

```
user ──< events ──< guests ──< email_logs
                 ──< landing_pages (1:1, per landing RSVP)
                 ──< registration_pages (1:1, per landing registrazione)
                 ──< reminder_templates
                 ──< event_users (team members)
                 ──< invitations (team invites)
     ──< event_templates
     ──< creem_subscription (auto-managed by plugin)
     ──< file
     ──< data_exports
     ──< user_custom_limits
```

### 5.2 Tabella: user (Better Auth + custom fields)

La tabella `user` è auto-generata da Better Auth. Campi custom aggiunti manualmente dopo `pnpm auth:schema`:

| Colonna | Tipo | Note |
|---------|------|------|
| phone | text (nullable) | Telefono utente |
| bio | text (nullable) | Bio profilo |
| locale | text | Default 'it', lingua preferita |
| timezone | text (nullable) | Timezone utente |
| tosAcceptedAt | timestamp (nullable) | Accettazione ToS |
| creemCustomerId | text (nullable) | ID cliente su Creem |
| hadTrial | boolean | Default false, ha già usato il trial |
| twoFactorEnabled | boolean | Default false, 2FA attivo |
| role | text (nullable) | Per Better Auth admin plugin |
| banned | boolean | Default false |
| banReason | text (nullable) | Motivo ban |
| banExpires | timestamp (nullable) | Scadenza ban |

**Nota:** Il piano dell'utente è gestito dalla tabella `creem_subscription` (auto-managed dal plugin `@creem_io/better-auth`), non da colonne nella tabella user.

### 5.3 Tabella: events

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | Generato automaticamente |
| userId | text (FK → user) | Proprietario evento, cascade delete |
| name | text | Nome evento (es. "Matrimonio Marco & Giulia") |
| slug | text (unique) | URL-friendly per landing pubbliche |
| description | text (nullable) | Descrizione evento |
| date | date | Data evento |
| time | time (nullable) | Orario evento |
| location | text (nullable) | Luogo evento |
| address | text (nullable) | Indirizzo completo per mappa |
| deadline | date (nullable) | Scadenza per rispondere |
| primaryColor | text | Colore tema, default '#6366f1' |
| showGuestCount | boolean | Social proof su landing, default true |
| socialProofEnabled | boolean | Default false |
| maxGuests | integer | Limite invitati, default 20 |
| autoConfirmRegistration | boolean | Se true, registrazione = conferma automatica. Default false |
| createdAt | timestamp | Default now() |
| updatedAt | timestamp | Aggiornato automaticamente |
| deletedAt | timestamp (nullable) | Soft delete |

### 5.4 Tabella: event_users (Team)

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | |
| eventId | text (FK → events) | Cascade delete |
| userId | text (FK → user) | Cascade delete |
| role | text | 'editor' o 'viewer' (owner è implicito da events.userId) |
| createdAt / updatedAt | timestamp | |

### 5.5 Tabella: invitations (Team Invites)

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | |
| eventId | text (FK → events) | Cascade delete |
| email | text | Email invitato |
| token | text (unique) | Token di accettazione |
| invitedById | text (FK → user, nullable) | Chi ha invitato |
| status | text | pending, accepted, expired, cancelled |
| expiresAt | timestamp | Scadenza invito |
| acceptedAt | timestamp (nullable) | |

### 5.6 Tabella: guests

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | Generato automaticamente |
| eventId | text (FK → events) | Cascade delete |
| name | text | Nome completo invitato |
| email | text (nullable) | Per invio email |
| phone | text (nullable) | Per WhatsApp deep link |
| group | text (nullable) | Raggruppamento invitati |
| status | text: pending, yes, no | Default 'pending' |
| source | text: manual, csv, registration | Come è stato aggiunto |
| customFields | jsonb (nullable) | Campi personalizzati dalla registrazione |
| respondedAt | timestamp (nullable) | Quando ha risposto |
| lastEmailSentAt | timestamp (nullable) | Ultima email inviata |
| emailSentCount | integer | Default 0 |
| lastWhatsappClickedAt | timestamp (nullable) | Ultimo click WhatsApp |
| createdAt / updatedAt | timestamp | |

### 5.7 Tabella: landing_pages (Landing RSVP)

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | |
| eventId | text (FK → events, unique) | Relazione 1:1 con evento |
| data | jsonb (LandingPageData) | Settings globali + array sezioni con valori |
| createdAt / updatedAt | timestamp | |

### 5.8 Tabella: registration_pages (Landing Registrazione)

Stessa struttura di `landing_pages`.

### 5.9 Tabella: reminder_templates

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | |
| eventId | text (FK → events) | Cascade delete |
| name | text | Nome template (es. "Reminder gentile") |
| type | text: email, whatsapp | Canale di invio |
| subject | text (nullable) | Oggetto email (solo per type email) |
| body | text | Corpo messaggio con variabili `{{...}}` |
| isDefault | boolean | Template predefinito dal sistema, default false |
| isActive | boolean | Template attivo, default true |
| createdAt / updatedAt | timestamp | |

### 5.10 Tabella: email_logs

| Colonna | Tipo | Note |
|---------|------|------|
| id | text (PK, UUID v7) | |
| guestId | text (FK → guests) | Cascade delete |
| templateId | text (FK → reminder_templates, nullable) | Null per inviti iniziali |
| type | text: invitation, reminder, registration_confirm | Tipo comunicazione |
| resendMessageId | text (nullable) | ID messaggio su Resend |
| status | text: sent, delivered, bounced, failed | Default 'sent' |
| sentAt | timestamp | |
| createdAt | timestamp | |

### 5.11 Altre tabelle

- **event_templates** — Template landing riutilizzabili (vedi sezione 4.4)
- **file** — File caricati su R2 (SHA-256, variant tracking)
- **audit_log** — Log audit su operazioni di scrittura
- **waiting_list** — Iscrizioni waiting list pre-lancio
- **contact_messages** — Messaggi form contatto (con soft delete `isArchived`)
- **data_exports** — Export dati GDPR utente
- **user_custom_limits** — Override limiti piano per singolo utente (admin)
- **creem_subscription** — Auto-managed dal plugin Creem/Better Auth

---

## 6. API Endpoints

Ogni endpoint è una Nuxt Server Route in `server/api/`. Le route sono thin controller che delegano ai service.

### 6.1 Eventi (`server/api/events/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/events | Lista eventi dell'utente autenticato |
| POST | /api/events | Crea evento. Genera slug auto. Verifica limite piano. |
| GET | /api/events/:eventId | Dettaglio evento + conteggi guest |
| PUT | /api/events/:eventId | Aggiorna evento |
| DELETE | /api/events/:eventId | Soft delete evento |

### 6.2 Invitati (`server/api/events/[eventId]/guests/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/events/:eventId/guests | Lista invitati con filtri (?status=, ?source=, ?group=) |
| POST | /api/events/:eventId/guests | Aggiungi singolo (source = 'manual'). Verifica limite piano. |
| POST | /api/events/:eventId/guests/import | Import CSV bulk. Source = 'csv'. |
| PUT | /api/events/:eventId/guests/:guestId | Aggiorna dati invitato. |
| DELETE | /api/events/:eventId/guests/:guestId | Rimuovi invitato. |

### 6.3 Landing RSVP (`server/api/events/[eventId]/landing/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/events/:eventId/landing | Ritorna LandingPageData. Se non esiste, ritorna default. |
| PUT | /api/events/:eventId/landing | Salva LandingPageData. |
| POST | /api/events/:eventId/landing/generate | Genera landing con AI (Mastra gpt-4o-mini). |

### 6.4 Landing Registrazione (`server/api/events/[eventId]/registration/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/events/:eventId/registration | Ritorna LandingPageData della landing registrazione. |
| PUT | /api/events/:eventId/registration | Salva LandingPageData. |

### 6.5 Area Solleciti (`server/api/events/[eventId]/reminders/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/events/:eventId/reminders/templates | Lista template solleciti (default + custom). |
| POST | /api/events/:eventId/reminders/templates | Crea nuovo template. |
| PUT | /api/events/:eventId/reminders/templates/:id | Aggiorna template. |
| PATCH | /api/events/:eventId/reminders/templates/:id | Aggiorna parziale (es. toggle isActive). |
| DELETE | /api/events/:eventId/reminders/templates/:id | Elimina template (solo custom). |
| POST | /api/events/:eventId/reminders/send/:guestId | Invia sollecito a singolo guest. |
| GET | /api/events/:eventId/reminders/history | Storico solleciti inviati. |
| GET | /api/events/:eventId/reminders/stats | Statistiche invio. |

### 6.6 Templates (`server/api/templates/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/templates | Lista template (system + user). |
| POST | /api/templates | Crea template personalizzato. |
| GET | /api/templates/:id | Dettaglio template. |
| PUT | /api/templates/:id | Aggiorna template. |
| DELETE | /api/templates/:id | Elimina template. |
| POST | /api/templates/generate | Genera template landing con AI. |
| POST | /api/events/:eventId/templates/apply | Applica template a evento. |

### 6.7 Endpoint Pubblici — Registrazione (`server/api/event/`)

Endpoint PUBBLICI (no auth required).

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/event/:slug | Dati evento pubblici + landing registrazione. |
| POST | /api/event/:slug/register | Registra nuovo guest. Se autoConfirmRegistration = true → status 'yes', altrimenti 'pending' + email RSVP. |

### 6.8 Endpoint Pubblici — RSVP (`server/api/rsvp/`)

Endpoint PUBBLICI (no auth required).

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/rsvp/:slug | Dati evento + landing RSVP. Query param ?guest= per dati guest specifico. |
| POST | /api/rsvp/:slug/respond | Registra risposta RSVP. Input: guestId, status (yes/no). |

### 6.9 Team (`server/api/team/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/team/members | Lista membri team dell'evento. |
| POST | /api/team/invite | Invia invito team (email + token). |
| GET | /api/team/invite/:token | Dettaglio invito. |
| POST | /api/team/accept-invite | Accetta invito team. |
| DELETE | /api/team/invitation/:id | Cancella invito. |
| POST | /api/team/invitation/:id/resend | Rinvia invito. |
| DELETE | /api/team/:userId | Rimuovi membro. |
| PATCH | /api/team/:userId/permissions | Cambia ruolo membro. |

### 6.10 File (`server/api/file/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | /api/file/upload | Upload diretto. |
| POST | /api/file/presign | Genera presigned URL per upload client-side. |
| POST | /api/file/confirm | Conferma upload presigned. |
| GET | /api/file/:id/url | URL file. |
| DELETE | /api/file/:id | Elimina file. |

### 6.11 User (`server/api/user/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/user/profile | Profilo utente. |
| PATCH | /api/user/profile | Aggiorna profilo. |
| DELETE | /api/user/account | Elimina account. |
| POST | /api/user/data-export/request | Richiedi export dati GDPR. |
| GET | /api/user/data-export/status | Stato export. |
| GET | /api/user/data-export/history | Storico export. |
| GET | /api/user/data-export/download/:token | Download export. |

### 6.12 Limiti Piano (`server/api/limits/`)

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/limits | Limiti e usage correnti dell'utente. |
| POST | /api/limits/validate-downgrade | Verifica se downgrade è possibile. |

### 6.13 Admin (`server/api/admin/`)

Tutti richiedono header `NUXT_ADMIN_API_KEY`.

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | /api/admin/stats | Statistiche globali piattaforma. |
| GET | /api/admin/users | Lista utenti. |
| GET | /api/admin/users/:id | Dettaglio utente. |
| PATCH | /api/admin/users/:id | Aggiorna utente (ban, etc). |
| GET | /api/admin/users/:id/audit-logs | Audit log per utente. |
| GET | /api/admin/users/:id/limits | Limiti custom utente. |
| PATCH | /api/admin/users/:id/limits | Aggiorna limiti custom. |
| GET | /api/admin/subscriptions | Lista sottoscrizioni. |
| PATCH | /api/admin/subscriptions/:id | Aggiorna sottoscrizione. |
| GET | /api/admin/audit-logs | Tutti gli audit log. |
| GET | /api/admin/waiting-list/export | Export waiting list. |
| POST | /api/admin/cleanup-files | Pulizia file orfani su R2. |

### 6.14 Altro

| Metodo | Path | Descrizione |
|--------|------|-------------|
| POST | /api/contact | Invio form contatto (con spam protection). |
| POST | /api/waiting-list/subscribe | Iscrizione waiting list. |

---

## 7. Area Solleciti Dedicata

L'area solleciti (`/dashboard/event/[id]/reminders/`) è uno spazio dedicato dove l'organizzatore gestisce i reminder ai guest che non hanno ancora risposto.

### 7.1 Funzionalità

**Vista principale:** mostra la lista dei guest con status "pending", ordinati per data di aggiunta (più vecchi prima). Per ogni guest: nome, canali disponibili (email badge, phone badge), ultimo sollecito inviato (data + canale), bottoni azione rapida.

**Template solleciti:** il sistema fornisce template predefiniti (es. "Reminder gentile", "Ultimo avviso prima della scadenza") e l'organizzatore può creare template personalizzati. Ogni template ha un tipo (email o whatsapp), un corpo con variabili interpolabili, e per le email un oggetto. I template possono essere attivati/disattivati (`isActive`).

**Invio singolo:** l'organizzatore seleziona un guest, sceglie un template, e invia. Per email usa Resend. Per WhatsApp genera un deep link `https://wa.me/39{phone}?text={encoded_message}` con il testo del template interpolato (incluso il link RSVP personalizzato del guest). La normalizzazione numeri italiani è gestita dal service.

**Invio batch:** per email usa Resend batch API (max 100 per chiamata, 1s delay tra batch). Per WhatsApp non esiste invio batch (limitazione deep link), quindi mostra la lista con bottone WhatsApp per ogni guest.

**Storico:** ogni sollecito inviato viene loggato in `email_logs` con riferimento al template usato. L'organizzatore può vedere lo storico completo per evento e statistiche di invio.

### 7.2 Template predefiniti

Il sistema crea automaticamente questi template quando l'organizzatore accede all'area solleciti per la prima volta:

**Template email "Reminder gentile":**
Oggetto: "{{event_name}} — Ci fai sapere?"
Corpo: "Ciao {{guest_name}}, ti ricordiamo di confermare la tua presenza per {{event_name}} del {{event_date}}. Rispondi qui: {{rsvp_link}}"

**Template email "Ultimo avviso":**
Oggetto: "{{event_name}} — Ultimi giorni per confermare"
Corpo: "Ciao {{guest_name}}, mancano pochi giorni alla scadenza per confermare la tua presenza a {{event_name}}. Se non rispondi entro il {{deadline}}, considereremo la tua assenza. Conferma qui: {{rsvp_link}}"

**Template WhatsApp "Reminder WhatsApp":**
Corpo: "Ciao {{guest_name}}! Ti ricordo di confermare la tua presenza per {{event_name}} del {{event_date}}. Rispondi qui: {{rsvp_link}}"

### 7.3 Variabili disponibili nei template

| Variabile | Descrizione |
|-----------|-------------|
| {{guest_name}} | Nome dell'invitato |
| {{event_name}} | Nome dell'evento |
| {{event_date}} | Data evento formattata |
| {{event_time}} | Orario evento |
| {{event_location}} | Luogo evento |
| {{rsvp_link}} | Link RSVP personalizzato del guest |
| {{deadline}} | Data scadenza risposte |
| {{organizer_name}} | Nome dell'organizzatore |

---

## 8. AI con Mastra

### 8.1 Architettura

Mastra è integrato embedded nel server Nuxt tramite `@mastra/core`. Un agent singleton dedicato gestisce la generazione delle landing page. Il modello usato è OpenAI `gpt-4o-mini`, configurato tramite la variabile d'ambiente `NUXT_OPENAI_API_KEY`.

### 8.2 Agent per Generazione Landing

L'agent riceve come input un prompt dell'utente (es. "Landing elegante per matrimonio in campagna, colori pastello") e opzionalmente una categoria di template. Produce un oggetto `LandingPageData` completo via structured output (Zod schema), validato contro `landingPageDataSchema` da `shared/schemas/landing.ts`.

Il system prompt dell'agent specifica lo schema JSON esatto da generare, il tipo di evento e tono desiderato, istruzioni per testi in italiano appropriati al contesto, e vincoli sui valori ammessi per ogni campo.

### 8.3 Endpoint generazione

- **POST `/api/events/:eventId/landing/generate`** — Genera landing RSVP con AI per un evento specifico (usa dati evento come contesto). Ritorna `LandingPageData` che l'editor carica nell'anteprima.
- **POST `/api/templates/generate`** — Genera template landing standalone e lo salva nel database come `event_template` con `isAiGenerated: true`.

---

## 9. Pagamenti con Creem

### 9.1 Integrazione

Il plugin `@creem_io/better-auth` si integra con Better Auth e gestisce automaticamente:
- Sincronizzazione `creemCustomerId` con tabella `user`
- Tabella `creem_subscription` auto-managed (`persistSubscriptions: true`)
- Webhook auto-registrato a `/api/auth/creem/webhook` con verifica signature

### 9.2 Flusso Checkout

L'utente clicca "Upgrade" → `useSubscription()` composable chiama Creem checkout con il `product_id` del piano selezionato → redirect a pagina Creem → pagamento → webhook aggiorna subscription → customer portal via `creem.createPortal()` per gestione/upgrade/downgrade.

### 9.3 Piani

Configurati in `shared/constants/pricing.ts`:

| Piano | Prezzo Mensile | Prezzo Annuale | Tipo |
|-------|---------------|----------------|------|
| Starter | €9/mese | €90/anno | Subscription |
| Premium | €39/mese | €390/anno | Subscription |
| Agency | €49/mese | €490/anno | Subscription |

### 9.4 Limiti per piano

| Piano | Max eventi | Max guest/evento | Email/mese | Storage | Team members | Landing registrazione |
|-------|-----------|------------------|------------|---------|-------------|----------------------|
| Starter | 2 | 50 | 200 | 500 MB | 1 | Si |
| Premium | 5 | 350 | 2,000 | 2 GB | 5 | Si |
| Agency | Illimitati | Illimitati | Illimitate | 10 GB | Illimitati | Si |

Il check dei limiti avviene server-side tramite `planLimit.service.ts` (`canCreateEvent()`, `canAddGuest()`, `canSendEmail()`, `canAddTeamMember()`, `getEffectiveLimits()`). Override per singolo utente possibili via `user_custom_limits` (admin).

### 9.5 Variabili d'ambiente

```env
NUXT_CREEM_API_KEY=creem_xxxxx
NUXT_CREEM_WEBHOOK_SECRET=whsec_xxxxx
NUXT_CREEM_PRODUCT_ID_STARTER_MONTH=prod_xxx
NUXT_CREEM_PRODUCT_ID_STARTER_YEAR=prod_xxx
NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH=prod_xxx
NUXT_CREEM_PRODUCT_ID_PREMIUM_YEAR=prod_xxx
NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH=prod_xxx
NUXT_CREEM_PRODUCT_ID_AGENCY_YEAR=prod_xxx
```

---

## 10. Gestione Guest

### 10.1 Fonti di aggiunta guest

I guest possono arrivare da tre fonti, tracciate nel campo `source`: aggiunta manuale (source = 'manual'), import CSV (source = 'csv'), e registrazione dalla landing pubblica (source = 'registration').

### 10.2 Import CSV

Upload file → parsing → preview con mapping colonne → conferma → inserimento batch. Colonne attese: `nome`, `email`, `telefono`. Gestire varianti italiane (Nome/Cognome, Numero, ecc.). Deduplicazione gestita dal service.

### 10.3 Campi personalizzati

Quando un guest si registra dalla landing pubblica, i campi aggiuntivi configurati dall'organizzatore (accompagnatori, allergie, note, ecc.) vengono salvati nel campo `customFields` (jsonb) del guest. Questi campi sono visibili nella scheda del guest nella lista invitati.

### 10.4 Raggruppamento

I guest possono essere assegnati a un `group` (testo libero) per organizzazione e filtraggio nella lista invitati.

---

## 11. File Upload

### 11.1 Architettura

Due percorsi di upload disponibili:
- **Upload diretto** — POST `/api/file/upload` con file nel body
- **Presigned URL** — POST `/api/file/presign` → upload client-side a R2 → POST `/api/file/confirm`

### 11.2 Sicurezza e deduplication

- Validazione tipo file tramite magic bytes (header binario, non solo MIME)
- SHA-256 hash per deduplicazione — se lo stesso file esiste già, ritorna il record esistente
- Rate limiting: 100 upload per minuto per utente
- Image processing con generazione varianti (resize, crop)
- Cleanup job per file orfani (admin endpoint)

---

## 12. Requisiti Non Funzionali

### 12.1 Performance

| Metrica | Target |
|---------|--------|
| Caricamento dashboard | < 2 secondi |
| Caricamento landing pubbliche | < 1 secondo |
| Risposta API (p95) | < 500ms |
| Guest supportati per evento | 500+ |

### 12.2 Mobile

Il 70%+ degli utenti finali (guest) accederà da mobile. Le landing pubbliche (registrazione e RSVP) sono responsive. L'editor landing funziona su desktop; su mobile mostra messaggio "Usa un computer per modificare la landing page".

### 12.3 Sicurezza

- TLS su tutte le comunicazioni
- Session httpOnly, secure, sameSite
- Isolamento dati con ownership check + RBAC (owner/editor/viewer) su ogni query
- Validazione Zod su ogni input
- Rate limiting su endpoint pubblici e privati (100 req/min)
- CSP, HSTS (2 anni), X-Frame-Options DENY
- Fake server headers per misdirection bot
- Bot traps su percorsi WordPress/env
- Spam protection: disposable email check, honeypot, timing validation
- File upload: magic bytes validation, rate limiting
- Audit logging su operazioni di scrittura

### 12.4 SEO e i18n

- Landing pubbliche SSR per SEO con meta tags dinamici
- Blog con SSR e syntax highlighting
- Sitemap e robots.txt automatici (@nuxtjs/seo)
- Schema.org Organization markup
- Internazionalizzazione: italiano default, inglese alternativo (`prefix_except_default`)
- Traduzioni in `i18n/locales/` (it-IT.json, en-US.json)

---

## 13. Out of Scope (futuro)

Funzionalità escluse e rimandate a versioni future:
- SMS sending (costi elevati)
- AI timing per invio automatico solleciti
- Gestione +1 tramite sistema dedicato (gestita come campo custom)
- Previsioni ML
- Check-in giorno evento
- Seating chart
- App mobile nativa (PWA sufficiente)
- Reminder automatici via cron (invio manuale)
- WebSocket per real-time (polling)
- A/B testing landing
- Analytics avanzate
- Campi custom illimitati (set predefinito estendibile)
