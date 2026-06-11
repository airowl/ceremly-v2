# SPEC IMPLEMENTAZIONE — Ceremly MVP (Phase 1)

> Contratto tecnico unico per l'implementazione. Deriva da `docs/saas-prd/PRD-Ceremly.md` (feature M + S visibili nei mockup) e dai mockup UI in `docs/ui/project/`. Ogni modulo DEVE rispettare le shape e i contratti qui definiti. Convenzioni backend: `docs/guide/STACK-AND-CONVENTIONS.md` + CLAUDE.md.

## 0. Decisioni architetturali

- **Scope MVP**: Feature 5.1, 5.2, 5.4, 5.5, 5.8, 5.9, 5.10, 5.11 (tutte M) + QR singolo per ospite (5.6 parziale), export CSV e viste aggregate base (5.12 parziale) perché presenti nei mockup. Esclusi: gruppi condizionali sui blocchi (5.7 — il selettore "Visibile a" nell'editor è renderizzato disabilitato con nota "Phase 2"), broadcast (5.13), pagina live (5.14), gallery collaborativa (5.15), personalizzazione colori (5.3 — template a stile fisso).
- **i18n**: interfaccia organizzatore SOLO italiano (PRD: multi-lingua deferred). Le nuove pagine Ceremly usano stringhe italiane inline, NON chiavi i18n. Le pagine esistenti del boilerplate restano invariate.
- **Tenancy**: ogni evento appartiene a un'organization (pattern `projects`). Tutte le query org-scoped by-construction. L'ospite NON ha account: accede via token opaco.
- **Realtime**: polling 30s sulla dashboard (PRD lo consente). Nessun websocket.
- **Token ospite**: 10 char URL-safe generati con `crypto` (alfabeto base62), util server `server/utils/guestToken.ts`. NO nuove dipendenze npm.
- **CSV import**: parsing lato client (util condivisa `shared/utils/csv.ts`), il server riceve righe JSON già strutturate e valida/segnala errori.
- **Email**: Resend via pattern esistente (`server/emailTemplates/` + `server/utils/email.ts` tipo `custom`). Invii batch via QStash (`server/queue/dispatch`) — 1 job per ospite. Tracking apertura: pixel `GET /api/public/pixel/{token}.gif`.
- **Reminder**: Vercel Cron giornaliero (`vercel.json`, 07:00 UTC) → `/api/cron/send-reminders` → enqueue job per ospite.
- **Limiti piano Free** (landing): max 30 ospiti/evento, max 1 evento attivo, 3 template per tipo. Enforcement nel service layer. Org con subscription attiva (qualsiasi piano Creem esistente) = nessun limite. Pagamento one-time per evento: Phase 2 (PRD).
- **Branding**: `NUXT_PUBLIC_APP_NAME=Ceremly` in `.env`.

## 1. Design system "Soft Meadow"

Port fedele di `docs/ui/project/styles.css` in `app/assets/css/ceremly.css`. Regole:

- Tutte le classi/var CSS del mockup mantenute identiche (`.cer`, `.cer-card`, `.cer-btn`, `.cer-tag`, `.cer-input`, `.kpi`, `.pill`, `.cer-table`, `.av`, `.row`, `.col`, ecc.) così i markup dei mockup si traducono 1:1.
- Palette: `--bone:#fefae0; --bone-50:#FFFFFF; --bone-100:#faedcd; --bone-200:#e9edc9; --bone-300:#ccd5ae; --ink:#3F3622; --wine/--purple:#d4a373; --purple-bright:#c28c54; --wine-deep:#5E4426; --confirm:#6B8E23; --decline:#B0481A; --pending:#d4a373;` ecc. (copiare integralmente da styles.css).
- Font: Bricolage Grotesque (display 400-800), Be Vietnam Pro (sans 300-700), Space Mono (mono 400-700). Configurati via `@nuxt/fonts` (provider google) dichiarando le family in `ceremly.css` (`--font-display`, `--font-sans`, `--font-mono`) — @nuxt/fonts rileva e self-hosta automaticamente le font-family usate nel CSS.
- Il CSS è globale (importato in `nuxt.config.ts` → `css: [...]`, ownership: orchestratore) ma tutte le regole sono scoped sotto `.cer` per non inquinare pagine boilerplate esistenti.
- Icone: port di `docs/ui/project/icons.jsx` in `app/components/ceremly/CerIcon.vue` — prop `name` (chiavi: home, events, guests, mail, bell, chart, settings, plus, search, calendar, pin, clock, heart, drag, eye, send, copy, check, x, chevR, chevD, trash, edit, upload, sparkle, ring, cake, cap, cross, whatsapp, qr), prop `s` (size, default 18), prop `sw` (strokeWidth, default 1.5). Stesso path SVG del mockup.

## 2. Schema database (Drizzle, `server/database/schema/`)

Pattern identico a `projects.ts`: `text` id con `$default(() => uuidv7())`, `organizationId` NOT NULL ref `organization.id` onDelete cascade + index, `createdAt`/`updatedAt`. Nuovi file: `events.ts`, `guests.ts`, `rsvpResponses.ts`, `guestActivities.ts`, `eventReminders.ts`. Aggiornare il barrel `index.ts`.

### `events`
| colonna | tipo | note |
|---|---|---|
| id | text PK uuidv7 | |
| organizationId | text NOT NULL → organization, cascade, index | |
| type | text NOT NULL | `matrimonio\|laurea\|compleanno\|battesimo` |
| templateKey | text NOT NULL | es. `toscana` |
| title | text NOT NULL | es. "Giulia & Tommaso" |
| slug | text NOT NULL UNIQUE | per URL `/e/{slug}/{token}`; generato server-side: slugify(title) + `-` + 4 char random; |
| eventDate | timestamp | data evento |
| eventTime | text | es. "16:00" (solo display) |
| locationName | text | riepilogo per card |
| locationAddress | text | |
| status | text NOT NULL default `draft` | `draft\|active\|closed` |
| blocks | jsonb NOT NULL default `[]` | `InviteBlock[]` (§3.1) |
| rsvpConfig | jsonb NOT NULL default `[]` | `RsvpQuestion[]` (§3.2) |
| rsvpDeadline | timestamp | dopo questa data il form è chiuso |
| rsvpClosedMessage | text | default it: "Le risposte a questo invito sono chiuse. Per qualsiasi variazione contatta l'organizzatore." |
| distribution | jsonb NOT NULL default `{}` | `{ emailSubject: string, emailBody: string, whatsappTemplate: string, senderName: string }` |
| createdAt / updatedAt | timestamp | come projects |

### `guests`
| colonna | tipo | note |
|---|---|---|
| id | text PK | |
| organizationId | text NOT NULL → organization, cascade, index | |
| eventId | text NOT NULL → events.id cascade, index | |
| firstName / lastName | text NOT NULL | |
| email | text | nullable |
| phone | text | nullable |
| groupName | text | nullable (es. "Famiglia") |
| notes | text | visibili solo all'organizzatore |
| token | text NOT NULL UNIQUE (index) | 10 char base62, stabile per sempre |
| sentAt | timestamp | primo invio |
| sentChannel | text | `email\|whatsapp` |
| emailOpenedAt | timestamp | pixel |
| firstOpenedAt | timestamp | primo accesso link |
| openCount | integer NOT NULL default 0 | |
| remindersDisabled | boolean NOT NULL default false | |
| removedAt | timestamp | soft-delete: link inattivo, risposta conservata (PRD edge case) |
| createdAt / updatedAt | | |

### `rsvp_responses`
| colonna | tipo | note |
|---|---|---|
| id | text PK | |
| organizationId / eventId | come sopra, index su eventId | |
| guestId | text NOT NULL UNIQUE → guests.id cascade | ultima versione (upsert) |
| attending | text NOT NULL | `yes\|no\|maybe` |
| companionsCount | integer NOT NULL default 0 | |
| answers | jsonb NOT NULL default `{}` | §3.3 |
| declineMessage | text | messaggio opzionale se `no` |
| submittedAt | timestamp NOT NULL defaultNow | prima compilazione |
| updatedAt | timestamp | |

### `guest_activities`
| colonna | tipo | note |
|---|---|---|
| id | text PK | |
| organizationId / eventId / guestId | NOT NULL, cascade, index su guestId e eventId | |
| type | text NOT NULL | `invite_sent\|link_opened\|email_opened\|rsvp_submitted\|rsvp_updated\|reminder_sent` |
| meta | jsonb default `{}` | es. `{ channel: 'email' }`, `{ reminderId }` |
| createdAt | timestamp defaultNow | |

### `event_reminders`
| colonna | tipo | note |
|---|---|---|
| id | text PK | |
| organizationId / eventId | NOT NULL cascade, index su eventId | |
| daysBefore | integer NOT NULL | giorni prima della rsvpDeadline |
| subject | text NOT NULL | |
| message | text NOT NULL | placeholder `{nome}` `{link}` |
| enabled | boolean NOT NULL default true | |
| sentAt | timestamp | null finché non inviato (idempotenza cron) |
| createdAt / updatedAt | | |

Migrazione: `pnpm db:generate` (se interattivo, rispondere "create table"; fallback `pnpm db:push` per il dev DB, ma i file di migrazione DEVONO essere generati).

## 3. Shape JSON condivise (`shared/types/ceremly.ts` — solo `export type/interface`, niente runtime)

### 3.1 InviteBlock
```ts
export type BlockType = 'header' | 'message' | 'program' | 'location' | 'dresscode' | 'logistics' | 'countdown' | 'gallery' | 'rsvp'

export interface InviteBlock {
  id: string            // `b_` + 8 char random, generato client-side
  type: BlockType
  data: BlockData       // discriminata per type, vedi sotto
}
// header:    { eyebrow: string; intro: string; names: string[]; dateText: string; timeText: string }
// message:   { text: string }
// program:   { title: string; items: { time: string; label: string; description: string }[] }
// location:  { title: string; name: string; address: string; showMap: boolean; mapsUrl: string }
// dresscode: { title: string; headline: string; note: string }
// logistics: { title: string; text: string }
// countdown: { title: string }                       // giorni calcolati da event.eventDate
// gallery:   { images: { url: string; alt: string }[] }   // max 5
// rsvp:      { buttonLabel: string }                  // SEMPRE presente, SEMPRE ultimo, NON rimovibile
```
Regole: l'array `blocks` è ordinato (l'ordine è l'ordine di rendering). Il blocco `rsvp` esiste sempre ed è sempre in coda. `header` sempre primo e non rimovibile (i mockup non mostrano delete su header? — header rimovibile NO: è l'intestazione; trattarlo come rimovibile=false insieme a rsvp).

### 3.2 RsvpQuestion
```ts
export type RsvpQuestionType = 'text' | 'single' | 'multiple' | 'number' | 'boolean'
export type RsvpConditionOp = 'eq' | 'neq' | 'gt'

export interface RsvpCondition { questionId: string; op: RsvpConditionOp; value: string | number }

export interface RsvpQuestion {
  id: string                 // `q_` + 8 char random; id riservati: 'attendance', 'companions_count', 'companion_names'
  label: string
  description?: string
  type: RsvpQuestionType
  options?: string[]         // per single/multiple
  min?: number               // per number (default 0)
  max?: number               // per number (default 4)
  required: boolean
  perPerson: boolean         // replica per ospite + accompagnatori
  perPersonScope?: 'all' | 'companions'  // default 'all'; 'companions' per companion_names
  condition?: RsvpCondition | null
  locked?: boolean           // true solo per 'attendance' (non eliminabile, tipo fisso)
}
```
Domanda base **fissa** in ogni config (indice 0): `{ id: 'attendance', label: 'Partecipi?', type: 'single', options: ['Sì, ci sarò', 'No, mi dispiace', 'Non ancora sicuro'], required: true, perPerson: false, locked: true }`. Il valore della risposta è mappato a `attending`: indice 0 → `yes`, 1 → `no`, 2 → `maybe` (mapping POSIZIONALE, le label sono personalizzabili). `companions_count` è una domanda `number` standard (se presente, il suo valore alimenta `companionsCount` e la replica perPerson).
Condizioni: nelle condition su `attendance`, `value` usa i valori canonici `'yes' | 'no' | 'maybe'` (non le label).

### 3.3 Answers
```ts
export type RsvpAnswerValue = string | number | boolean | string[]
// chiave = question.id
// domanda normale:    answers[qid] = RsvpAnswerValue
// domanda perPerson:  answers[qid] = { self: RsvpAnswerValue | null; companions: RsvpAnswerValue[] }
//                     (scope 'companions' → self sempre null)
export type RsvpAnswers = Record<string, RsvpAnswerValue | { self: RsvpAnswerValue | null; companions: RsvpAnswerValue[] }>
```

### 3.4 Logica condizionale — `shared/utils/rsvpLogic.ts`
```ts
// Ritorna il valore "canonico" di una risposta per la valutazione delle condition.
// Per 'attendance' ritorna 'yes'|'no'|'maybe' (mapping posizionale su options).
export function getCanonicalAnswer(q: RsvpQuestion, answers: RsvpAnswers): string | number | boolean | string[] | null

// Una domanda è visibile se: senza condition → true;
// con condition → la domanda referenziata è visibile E il suo valore canonico soddisfa op/value.
// op 'gt' confronta Number(). 'eq'/'neq' su string/number; per 'multiple' eq = include.
export function isQuestionVisible(q: RsvpQuestion, config: RsvpQuestion[], answers: RsvpAnswers): boolean

// Ordina/filtra le domande visibili per il rendering.
export function getVisibleQuestions(config: RsvpQuestion[], answers: RsvpAnswers): RsvpQuestion[]

// Validazione server-side della submission. Errori in italiano.
// Controlla: attendance presente e valida; per attending='no' nessuna domanda obbligatoria oltre attendance;
// required solo sulle domande VISIBILI; perPerson array dimensionato a companionsCount;
// type-check dei valori; opzioni dentro options[].
export function validateRsvpSubmission(config: RsvpQuestion[], payload: { attending: 'yes'|'no'|'maybe'; companionsCount: number; answers: RsvpAnswers }): { ok: true } | { ok: false; errors: string[] }
```

## 4. Template e preset (`shared/constants/`)

### `shared/constants/eventTypes.ts`
```ts
export const EVENT_TYPES = [
  { key: 'matrimonio', label: 'Matrimonio', icon: 'ring',  desc: 'Cerimonia + ricevimento, menu, alloggio' },
  { key: 'laurea',     label: 'Laurea',     icon: 'cap',   desc: 'Cerimonia in ateneo + rinfresco' },
  { key: 'battesimo',  label: 'Battesimo',  icon: 'cross', desc: 'Chiesa, padrini, rinfresco' },
  { key: 'compleanno', label: 'Compleanno', icon: 'cake',  desc: 'Festa, dress code, regali' },
] as const
export type EventTypeKey = 'matrimonio' | 'laurea' | 'compleanno' | 'battesimo'
```

### `shared/constants/templates.ts`
12 template (3 per tipo). Shape:
```ts
export interface InviteTemplate {
  key: string            // es. 'toscana'
  eventType: EventTypeKey
  name: string           // 'Toscana'
  tone: string           // 'romantico · floreale'
  accent: string         // colore accento CSS (es. '#9D4E3C')
  accentSoft: string     // tinta chiara per sfondi
  defaultBlocks: InviteBlock[]   // contenuto placeholder COMPLETO, tono calibrato al tipo (PRD 5.1)
  rsvpPresetKey: EventTypeKey    // preset domande
}
export const INVITE_TEMPLATES: InviteTemplate[]
export function getTemplatesByType(type: EventTypeKey): InviteTemplate[]
export function getTemplate(key: string): InviteTemplate | undefined
```
Template: matrimonio `toscana` (romantico · floreale, accent terracotta `#9D4E3C`), `minimale` (editoriale · serif, accent ink `#3F3622`), `giardino` (botanico · acquerello, accent verde `#5A7A3A`); laurea `alloro` (classico · accademico, accent verde alloro `#4A5A2E`), `goliardico` (giocoso · pop, accent camel `#c28c54`), `moderno` (pulito · sans, accent ink); battesimo `celeste` (tenero · pastello, accent `#7FA8C9`), `colomba` (classico · sacro, accent oro `#B98A2F`), `nuvola` (soffice · minimal, accent sage `#8A9B6E`); compleanno `coriandoli` (festoso · colorato, accent `#C2622E`), `candeline` (caldo · familiare, accent camel), `neon` (bold · party, accent `#8C5A8F`).
I `defaultBlocks` di ogni template: header (eyebrow/intro/names/date placeholder appropriati: matrimonio "Save the date"/"con gioia annunciamo il matrimonio di"/["Giulia","Tommaso"]; laurea "Laurea"/"festeggia la laurea di"/["Andrea"]; battesimo "Battesimo"/"con amore vi invitiamo al battesimo di"/["Leo"]; compleanno "Festa!"/"sei invitato al compleanno di"/["Sara"]), message, program (voci tipiche per tipo: matrimonio cerimonia/aperitivo/cena/festa; laurea proclamazione/brindisi/rinfresco; battesimo funzione/rinfresco; compleanno accoglienza/torta/festa), location, dresscode (solo matrimonio+compleanno), rsvp. Testi placeholder in italiano, tono per tipo (formale per battesimo, elegante matrimonio, giocoso compleanno, orgoglioso laurea).

### `shared/constants/rsvpPresets.ts`
`export const RSVP_PRESETS: Record<EventTypeKey, RsvpQuestion[]>` — esattamente da PRD 5.8:
- **matrimonio**: attendance(locked) · "A cosa partecipi?" multiple [Cerimonia, Ricevimento] cond attendance eq yes, required · companions_count number 0-4 cond attendance eq yes · companion_names text perPerson scope companions cond companions_count gt 0, required · "Preferenza menu" single [Carne, Pesce, Vegetariano, Vegano] perPerson all, cond attendance eq yes, required · "Allergie o intolleranze" text perPerson all, cond attendance eq yes, optional · "Hai bisogno di alloggio?" boolean cond attendance eq yes optional · "Una canzone che non può mancare" text optional · "Un messaggio per gli sposi" text optional.
- **laurea**: attendance · "A cosa partecipi?" multiple [Cerimonia, Rinfresco] cond yes · companions_count · companion_names · "Allergie alimentari" text perPerson cond yes optional · "Messaggio di auguri" text optional.
- **compleanno**: attendance · companions_count cond yes · companion_names · "Allergie alimentari" text optional cond yes · "Nome del bambino partecipante" text optional cond yes · "Contatto genitore per emergenze" text optional cond yes.
- **battesimo**: attendance · "A cosa partecipi?" multiple [Cerimonia, Rinfresco] cond yes · companions_count · companion_names · "Allergie alimentari" text perPerson cond yes optional · "Messaggio per la famiglia" text optional.

### Default distribution (in `templates.ts`: `export function getDefaultDistribution(type, title): EventDistribution`)
emailSubject/emailBody/whatsappTemplate sensati per tipo con placeholder `{nome}` `{link}` (cfr. mockup distribution.jsx).

### `shared/constants/pricing.ts` (APPEND, non riscrivere)
```ts
export const CEREMLY_FREE_LIMITS = { maxGuestsPerEvent: 30, maxActiveEvents: 1, maxReminders: 3 } as const
```

## 5. Zod schemas (`shared/schemas/ceremly.ts`, append export al barrel `shared/schemas/index.ts`)

```ts
createEventSchema   // { type: enum, templateKey: string min1, title: string min1 max120, eventDate?: coerce.date opzionale, eventTime?: string, locationName?, locationAddress? }
updateEventSchema   // partial: title, eventDate, eventTime, locationName, locationAddress, status enum, blocks (array di blockSchema), rsvpConfig (array di rsvpQuestionSchema), rsvpDeadline nullable, rsvpClosedMessage, distribution
blockSchema         // discriminated union su type (§3.1), id string min1
rsvpQuestionSchema  // §3.2 con refine: options richieste per single/multiple
createGuestSchema   // { firstName min1 max80, lastName min1 max80, email email opzionale-vuota, phone?, groupName?, notes? }
updateGuestSchema   // partial di createGuest + remindersDisabled boolean
importGuestsSchema  // { rows: createGuestSchema[] } max 500
sendInvitesSchema   // { guestIds: string[].min(1).max(200), subject: string min1 max200, body: string min1 max5000 }
publicRsvpSchema    // { attending: enum yes/no/maybe, companionsCount: int 0-10 default 0, answers: record(unknown), declineMessage?: string max1000 }
remindersSchema     // { reminders: { id?: string, daysBefore: int 1-60, subject min1 max200, message min1 max2000, enabled: boolean }[].max(3) }
```

## 6. API — contratti

Tutte le route auth: `requireAuth` → `requireMember`/`requireWrite` → `parseBody/parseQueryParams` → service → try/catch 23505/rethrow/500 (pattern `api/projects`). Audit su ogni scrittura (`AUDIT_ACTIONS` da estendere: `event.created/updated/deleted`, `guest.created/updated/deleted/imported`, `invite.sent`, `reminder.updated` — aggiungere in `server/utils/audit/`(file actions) SOLO dall'agente B1).

### Eventi & ospiti (owner: B1)
| Route | Descrizione |
|---|---|
| `GET /api/events` | lista eventi org + per ciascuno `counts: { guests, confirmed, declined, pending, opened, sent }` (1 query aggregata su guests+responses, escludendo removedAt) |
| `POST /api/events` | crea da `createEventSchema`; applica `getTemplate(templateKey)`: copia defaultBlocks (deep clone, sostituendo nei placeholder names/title/date se forniti), rsvpConfig = preset del tipo, distribution = default; slug generato; status `draft`. Enforcement: org free con ≥1 evento attivo/draft → 402 con messaggio chiaro |
| `GET /api/events/:id` | evento completo |
| `PUT /api/events/:id` | update parziale; se `blocks` valida invarianti (rsvp presente e ultimo, header presente e primo); se `rsvpConfig` valida che attendance sia indice 0 locked |
| `DELETE /api/events/:id` | hard delete (cascade) |
| `GET /api/events/:id/stats` | §6.1 |
| `GET /api/events/:id/guests` | tutti gli ospiti (anche removed, flag) + per ciascuno: `rsvpStatus: 'confirmed'\|'declined'\|'maybe'\|'opened'\|'not_opened'` (derivato: risposta → attending; no risposta → firstOpenedAt ? opened : not_opened), `respondedAt`, `totalPeople` (1+companionsCount se confirmed), summary |
| `POST /api/events/:id/guests` | crea ospite + token; limite free 30 → 402 |
| `GET /api/events/:id/guests/:guestId` | dettaglio: guest + response completa + activities ordinate desc |
| `PUT /api/events/:id/guests/:guestId` | update (token IMMUTABILE) |
| `DELETE /api/events/:id/guests/:guestId` | soft: set removedAt (PRD: risposta resta, link inattivo) |
| `POST /api/events/:id/guests/import` | bulk: valida righe, segnala `{ imported: n, skipped: [{ row, reason }] }`; dedup warning se nome+cognome già presente (importa comunque, segnala in `warnings`); rispetta limite 30 free |
| `GET /api/events/:id/guests/:guestId/qr` | PNG QR (pkg `qrcode`, width 600) del link personale; `Content-Type: image/png` |
| `GET /api/events/:id/export` | CSV UTF-8 BOM, separatore virgola, quoting RFC: colonne fisse (nome, cognome, email, telefono, gruppo, stato, persone, data risposta) + 1 colonna per domanda rsvpConfig (perPerson: valori `self; comp1; comp2` joinati con ` / `); `Content-Disposition: attachment` |

#### 6.1 `GET /api/events/:id/stats` →
```ts
{
  kpi: { totalGuests, sent, opened, responded, confirmed, declined, maybe, pending, totalPeople /* confermati+accompagnatori */ },
  timeline: { date: 'YYYY-MM-DD', confirmed, declined, maybe }[],   // cumulativo per giorno, ultimi 28 giorni
  menuBreakdown: { label: string, count: number }[],   // somma self+companions delle domande single con id/label contenente 'menu' (match: question label lowercase include 'menu')
  allergies: { value: string, count: number }[],       // risposte text non vuote a domande con label include 'allerg', deduplicate case-insensitive trim
  needsAttention: { guestId, name, contact, openedDaysAgo }[],  // aperto >7gg fa senza risposta, max 10
  noEmailPending: number   // senza email e senza risposta (per reminder WhatsApp manuali)
}
```

### Distribuzione (owner: B3)
| Route | Descrizione |
|---|---|
| `POST /api/events/:id/send` | `sendInvitesSchema`; per ogni guestId (valido, org-scoped, non removed, con email): dispatch job `send-invite-email`; set `sentAt`(se null)/`sentChannel='email'`; activity `invite_sent`; salva subject/body in `event.distribution`. Ritorna `{ queued: n, skippedNoEmail: n }` |
| `POST /api/events/:id/send-test` | invia l'email d'invito all'email dell'utente corrente col primo ospite come esempio (o nome fittizio "Anna") |
| `POST /api/events/:id/mark-sent` | `{ guestIds }` → marca sentAt/sentChannel='whatsapp' + activity (usato dal bottone "Copia" WhatsApp) |

Job queue (append a `server/queue/types.ts` + handler): `'send-invite-email': { guestId: string }`, `'send-reminder-email': { guestId: string; reminderId: string }`. Handler: re-fetch guest+event, skip se removed/risposto(per reminder), render template email, send via Resend (`sendEmail` type custom), include link `{baseURL}/e/{slug}/{token}` e pixel `{baseURL}/api/public/pixel/{token}.gif`.
Email templates (pattern React Email esistente, file .ts): `GuestInviteEmail.ts`, `GuestReminderEmail.ts` — design Soft Meadow semplice (sfondo #fefae0, card bianca, accent #d4a373, CTA pill "Apri l'invito di {nome}", nomi evento in serif). Append render functions a `server/emailTemplates/index.ts`.

### Pubblico ospite (owner: B2) — NO auth, sotto `/api/public/`
| Route | Descrizione |
|---|---|
| `GET /api/public/invite/:token` | lookup guest by token (index). 404 generico "Invito non disponibile" se token inesistente O guest removed O event status `draft`. Side-effect: firstOpenedAt (se null), openCount+1, activity `link_opened` (meta: nth). Risposta §6.2 |
| `POST /api/public/invite/:token/rsvp` | `publicRsvpSchema` + `validateRsvpSubmission`; 410 se rsvpDeadline passata (body: rsvpClosedMessage); upsert su rsvp_responses (guestId unique); activity `rsvp_submitted` (prima volta) / `rsvp_updated`; ritorna `{ response }` |
| `GET /api/public/pixel/:token.gif` | 1x1 GIF trasparente; set emailOpenedAt se null + activity `email_opened`; SEMPRE 200 anche con token invalido |

#### 6.2 Payload pubblico (MAI esporre: organizationId, email/phone/notes di altri, id interni guest oltre il necessario)
```ts
{
  event: { title, type, templateKey, eventDate, eventTime, blocks, rsvpConfig, rsvpDeadline, rsvpClosedMessage, slug },
  guest: { firstName, lastName },
  response: { attending, companionsCount, answers, declineMessage, updatedAt } | null,
  deadlinePassed: boolean
}
```

### Reminder (owner: B4)
| Route | Descrizione |
|---|---|
| `GET /api/events/:id/reminders` | lista (max 3) |
| `PUT /api/events/:id/reminders` | `remindersSchema` bulk upsert (id presente=update, assente=create, mancante=delete). I reminder già `sentAt` non sono modificabili (skip silenzioso) |
| `GET /api/cron/send-reminders` | protetto: header `x-vercel-cron` oppure `requireAdminApiKey` fallback. Per ogni reminder enabled, sentAt null, evento active con rsvpDeadline: se `today >= rsvpDeadline - daysBefore` → enqueue `send-reminder-email` per ogni ospite con email, non removed, remindersDisabled=false, SENZA risposta; activity `reminder_sent` la scrive il job handler; set reminder.sentAt subito (idempotenza). Ritorna `{ processed, queued }` |

`vercel.json` (nuovo): `{ "crons": [{ "path": "/api/cron/send-reminders", "schedule": "0 7 * * *" }] }`

### Repository (file per agente, no conflitti)
- B1: `eventRepository.ts`, `guestRepository.ts` (tutte le query eventi/ospiti/stats/aggregati)
- B2: `publicRsvpRepository.ts` (findGuestWithEventByToken, trackOpen, upsertResponse, markEmailOpened, insertActivity)
- B3: `distributionRepository.ts` (markSent, findGuestsForSend)
- B4: `reminderRepository.ts` (CRUD reminder, findDueReminders, findPendingGuestsForReminder)
Services speculari: `event.service.ts`, `guest.service.ts` (B1), `publicInvite.service.ts` (B2), `distribution.service.ts` (B3), `reminder.service.ts` (B4).

## 7. Frontend — mappa file e requisiti

Regola generale: **fedeltà pixel ai mockup jsx** (stesse classi CSS, stessi spacing/typography inline dove il mockup li usa), dati REALI dalle API (niente mock), stati empty/loading/error curati. Ogni pagina dashboard usa layout `ceremly` e `definePageMeta({ layout: 'ceremly', middleware: ... auth })` come le pagine dashboard esistenti (verificare il meccanismo auth esistente in `auth.global.ts`: `auth: { only: 'user' }`).

### Layout `app/layouts/ceremly.vue` (owner: A3)
Port di `app-shell.jsx`: sidebar 240px (brand "Ceremly·", nav: Home/I tuoi eventi/Template → link a `/dashboard`; gruppo contestuale evento quando route ha `params.id` con voci Invito/Ospiti/Form RSVP/Distribuzione/Reminder/Andamento → `/dashboard/events/{id}/{editor|guests|rsvp|distribution|reminders|}`; in fondo Impostazioni → `/dashboard/profile` e footer utente con iniziali, nome reale da `useAuth()`, piano). Topbar: breadcrumbs (slot/provide dal page), search ghost ⌘K (solo estetico), slot azioni destra. Il contenuto in `.cer-page.scroll`. Nav item attivo via route matching. Il label gruppo contestuale = `{TipoLabel} · {titolo evento}` (fetch leggero evento o store).

### Componenti condivisi `app/components/ceremly/` 
- A3: `CerIcon.vue`, `KpiCard.vue`, `StatusPill.vue` (confirm/decline/pending/neutral + label), `CerToggle.vue` (v-model), `CerCheckbox.vue`, `Stepper.vue` (steps[], current), `EventCard.vue` (port da events-home.jsx, prop event con counts, gradient header per tint wine/sage, progress bar, click → naviga)
- F3: `InviteRenderer.vue` — rendering invito da `{ blocks, template, eventDate, rsvpDeadline, guestName? }`: port fedele di `InvitePreview` (editor.jsx) + `invite-mobile.jsx`; ogni block type renderizzato (header con eyebrow spaziato lettera-per-lettera, message corsivo, program timeline, location card con bottone "Apri in Google Maps" (`mapsUrl` o `https://maps.google.com/?q=` + encodeURIComponent(address)), dresscode, logistics, countdown con `CountdownRing.vue`, gallery grid, rsvp CTA). Accent color dal template via CSS var `--tpl-accent` inline. Prop `interactive` (editor: blocchi cliccabili con outline selezione + label) vs display puro. Slot/emit `rsvpClick`.
- F3: `RsvpFormRenderer.vue` — form dinamico multi-step mobile-first da rsvpConfig (port rsvp-mobile.jsx): un "gruppo" di domande visibili per step (attendance da sola al primo step; poi le successive a gruppi di 1-2), progress bar segmenti, replica perPerson per persona ("Menu di Anna", "Menu di — accompagnatore 1" usando i nomi da companion_names se compilati), bottoni Indietro/Continua, validazione client con `rsvpLogic`, emit `submit(payload)`. Tag visivi "mostrata perché hai risposto Sì" / "per ogni persona" come mockup.
- F3: `CountdownRing.vue` (port).

### Pagine (1 agente ciascuna salvo indicato)
| Pagina | Mockup | Note |
|---|---|---|
| `app/pages/index.vue` (F1) | landing.jsx | RISCRITTURA COMPLETA in stile Soft Meadow: nav sticky, hero con card invito ruotata + stat card + mini card (hard shadows), problem, how-it-works, features dark, pricing (Free 0/Celebrazione 39/Atelier 24 — bottoni → /auth/signup), quote, CTA, footer. PRESERVARE la logica site-mode esistente presente nell'attuale index.vue (guardare le prime righe: middleware/redirect waitinglist) e SEO meta. CTA → `/auth/signup` o route login esistenti. Responsive: il mockup è 1400 fisso → adattare con max-width container e breakpoint ragionevoli (grid → stack sotto 900px) |
| `app/pages/auth/login.vue` + `signup.vue` (F2) | auth.jsx | Restyle MANTENENDO la logica Better Auth esistente (`useAuth`). Split layout: pannello ink con cerchi decorativi camel/orange, quote card; form a destra con `.cer-input`/`FormField` mono label. Social: SOLO Google (Apple non configurato — ometterlo). Signup: nome/cognome/email/password + strength bar + selettore tipo evento (salvato in localStorage `ceremly:onboarding-type` per pre-selezione wizard, NON nel backend). Checkbox termini. Route legali esistenti `/legal/tos`, `/legal/privacy` |
| `app/pages/dashboard/index.vue` (F4) | events-home.jsx | KPI aggregate (totale ospiti gestiti, in attesa, RSVP settimana, tasso apertura — calcolati dai counts della lista eventi), sezione Attivi (EventCard grid 3), Bozze (card dashed "Continua la configurazione" → wizard/editor), card "Crea un nuovo evento" → `/dashboard/events/new`. Empty state per zero eventi (invito a creare il primo, friendly) |
| `app/pages/dashboard/events/new.vue` (F4) | onboarding.jsx | Wizard client: stepper [Tipo evento, Template, Dettagli, Ospiti, Invio]; step 1 card tipi (4), step 2 template del tipo (TemplateCard con anteprima mini-invito col placeholder names/accent del template), step 3 Dettagli (titolo, data, ora, location nome+indirizzo — form `.cer-input`); "Continua con {template}" → POST /api/events → redirect `/dashboard/events/{id}/editor`. Gli step Ospiti/Invio sono mostrati nello stepper ma completati nelle pagine dedicate |
| `app/pages/dashboard/events/[id]/editor.vue` (F5) | editor.jsx | 3 colonne 220/1fr/280: libreria blocchi (tutti i BlockType, dot sage se on-page, lock su rsvp; click su blocco in libreria se assente → aggiunge), preview centrale con InviteRenderer interactive + toggle Desktop(540px)/Mobile(360px), inspector destro per blocco attivo (campi per type §3.1, textarea per message, lista voci program con add/remove, toggle showMap, delete blocco se non locked). Riordino: frecce su/giù nell'inspector o drag (vuedraggable è disponibile) — MVP: frecce ↑↓ accanto al titolo blocco nell'inspector + drag con vuedraggable nella libreria se rapido. Selettore "Visibile a" renderizzato disabled con tag "Phase 2". Salvataggio: bottone "Salva" topbar → PUT blocks (+ debounce autosave facoltativo). "Salva e continua" → guests. Upload gallery: usa il flusso file esistente (`/api/file` presigned o direct — verificare `useFile`/file service esistente; max 5 img) |
| `app/pages/dashboard/events/[id]/guests.vue` (F6) | guests.jsx | header conteggi, filtri pill (Tutti/Confermati/In attesa/Declinati con count), tabella (checkbox selezione, avatar iniziali, StatusPill, tag gruppo, canale Email/WhatsApp da presenza email, persone, risposta/stato apertura), action bar selezione (sfondo ink: Invia invito → distribution con preselezione; Cambia gruppo → prompt modal; Deseleziona), paginazione client 10/pagina, ricerca. Modale "Aggiungi ospite" (form createGuest), modale "Importa CSV" (file input → parse client `shared/utils/csv.ts` → preview prime righe + errori → POST import → report importati/saltati). Click riga → drawer/modale dettaglio ospite (risposte + timeline, port GuestDetailDrawer). Delete ospite con conferma (soft) |
| `app/pages/dashboard/events/[id]/rsvp.vue` (F6) | rsvp-builder.jsx | colonna sinistra lista domande (numero 01.., dot wine se required, tag BASE su locked, tag tipo + "mostra se {label} = {value}" + "per persona"), riordino frecce/drag, click → inspector destro: input label grande, select tipo, toggle Obbligatoria/Per persona, opzioni add/remove/drag per single/multiple, card "Logica condizionale" (toggle attiva + select domanda precedente/op/valore — i valori: per attendance le 3 opzioni canoniche con label, per number soglie 0-4, per single le options), card anteprima ospite live del tipo di domanda (come mockup). "Aggiungi domanda" → nuova text. Deadline RSVP visibile in header (`cer-tag`) editabile (date input) → PUT rsvpDeadline. Salva → PUT rsvpConfig. "Anteprima ospite" → link alla preview (apre `/e/{slug}/preview`? NO — semplice: modale con RsvpFormRenderer in frame mobile) |
| `app/pages/dashboard/events/[id]/distribution.vue` (F6) | distribution.jsx | switch pill Email/WhatsApp con count (ospiti con/senza email, non inviati o tutti); Email: form mittente (readonly `{senderName} <inviti@...>` — mittente reale da env, mostrare formattato), oggetto, messaggio con variabili `{nome}` `{link}` (tag visivi), anteprima inbox stilizzata (card con header + mini invito + CTA), bottoni "Invia un test a me" → send-test, "Invia a N ospiti" → POST send (target: ospiti selezionati da query param ?guests= oppure tutti i non-inviati con email; conferma modale prima dell'invio) con toast esito; WhatsApp: textarea modello, lista ospiti senza email con messaggio generato (sostituzione {nome},{link}) + bottone Copia (navigator.clipboard, su success → POST mark-sent) + bottone QR (scarica `/api/events/{id}/guests/{gid}/qr`), "Copia tutti" (testo concatenato separato da riga vuota), collassato a 4 + "Mostra tutti". Colonna destra: card destinatari (count + breakdown per gruppo), card ink motivazionale, cronologia invii (da activities invite_sent aggregate per giorno — semplificazione: GET guests e raggruppa client-side per sentAt) |
| `app/pages/dashboard/events/[id]/reminders.vue` (F6) | reminders.jsx | card Deadline RSVP (date input + giorni mancanti + nota chiusura form), 3 ReminderCard (R1/R2/R3: daysBefore select/input, data invio calcolata, toggle enabled, oggetto + messaggio editabili, stato "pianificato"/"inviato il X" se sentAt), "Aggiungi reminder" fino a 3, PUT bulk al salvataggio (bottone Salva topbar). Colonna destra: card "Sarà inviato a N" (da stats: pending con email / senza email con bottone "Apri lista" → guests filtrati), card Esclusioni (lista ospiti remindersDisabled con X per riattivare + "Escludi un ospite" select), card ink "Niente spam" |
| `app/pages/dashboard/events/[id]/index.vue` (F7) | event-dashboard.jsx | header "Come sta andando" + data + countdown giorni + dot live + "ultimo aggiornamento Xs fa"; polling stats ogni 30s; KPI row 4 (cliccabili → guests filtrati); grid: card Andamento RSVP con chart SVG area+linee (port RsvpChart, dati da stats.timeline, tab 4 sett/3 mesi/Tutto), legenda; colonna destra: Preferenze menu (bar), Allergie segnalate; bottom: Da contattare (needsAttention con bottone Reminder → naviga reminders) + GuestDetailDrawer (ultimo ospite che ha risposto, oppure selezionabile). Topbar azioni: Export → GET export (download), Comunicazione → distribution |
| `app/pages/e/[slug]/[token].vue` (F8) | invite-mobile.jsx + rsvp-mobile.jsx + confirm | SSR. Layout NESSUNO (`layout: false`), pagina standalone max-width 480 centrata su desktop (sfondo bone-100), mobile full. Fetch `GET /api/public/invite/{token}` (useFetch SSR). Stati: 404 → pagina cortese "Invito non disponibile"; ok → InviteRenderer con saluto personalizzato "CARA ANNA" (eyebrow da firstName, genere neutro: "CIAO ANNA" se incerto — usare "Ciao {nome}" spaziato), countdown, bottone RSVP sticky bottom → apre flusso RSVP (overlay full-screen con RsvpFormRenderer); se response esistente → invito mostra banner "Hai già risposto: {sintesi}" + bottone "Modifica la risposta" (form precompilato) — fino a deadline; deadline passata → blocco rsvp mostra rsvpClosedMessage. Submit → POST rsvp → schermata conferma (port confirm: check verde grande per yes / messaggio affettuoso per no/maybe, riepilogo risposte umano-leggibile, card "Salva in agenda" con bottoni Google (link calendar template URL)/Apple/ICS (endpoint? MVP: link Google Calendar + download .ics generato client-side), "Modifica la risposta", quote firmata coi nomi host). SEO/OG: useSeoMeta con title "{titolo} — Sei invitato!", og:description, noindex. FCP: pagina leggera, no librerie pesanti |

### Composables (owner: F4, file unico `app/composables/useCeremly.ts` o split per dominio — split: `useEvents.ts` (F4), `useEventGuests.ts` (F6), `useEventStats.ts` (F7), `usePublicInvite.ts` (F8)) — wrapper `$fetch` tipizzati stile `useProjects.ts`.

### Route rules (owner: orchestratore, in nuxt.config.ts)
```
"/e/**": { ssr: true },
"/dashboard/events/**": { ssr: false, prerender: false },  // già coperto da /dashboard/**
```

## 8. Vincoli di sicurezza (da PRD §7 + boilerplate)

1. OGNI query su events/guests/responses/reminders org-scoped (`organizationId`) — pattern assertOwnership.
2. Route pubbliche: lookup SOLO per token; 404 indistinguibile (no enumeration); nessun dato di altri ospiti; rate limit middleware esistente attivo.
3. Token: crypto-random, mai sequenziali; slug evento non segreto.
4. Validazione server della logica condizionale (no required bypass, no answer injection su qid inesistenti — scartare chiavi non in config).
5. `logAudit` su ogni scrittura organizzatore. Le azioni ospite (rsvp) NON sono audit-logged (no userId) ma tracciate in guest_activities.
6. Email: nessun dato sensibile nel subject; link con token solo verso il destinatario.

## 9. Ownership file (anti-conflitto)

| Agente | File |
|---|---|
| A1 | `server/database/schema/{events,guests,rsvpResponses,guestActivities,eventReminders}.ts`, `schema/index.ts`, migrazione |
| A2 | `shared/types/ceremly.ts`, `shared/utils/{rsvpLogic,csv}.ts`, `shared/constants/{eventTypes,templates,rsvpPresets}.ts`, `shared/schemas/ceremly.ts`, append a `shared/schemas/index.ts` e `shared/constants/pricing.ts` |
| A3 | `app/assets/css/ceremly.css`, `app/layouts/ceremly.vue`, `app/components/ceremly/{CerIcon,KpiCard,StatusPill,CerToggle,CerCheckbox,Stepper,EventCard}.vue` |
| B1 | `server/repositories/{event,guest}Repository.ts`, `server/services/{event,guest}.service.ts`, `server/api/events/...` (CRUD, stats, guests, import, qr, export), `server/utils/guestToken.ts`, append audit actions |
| B2 | `server/repositories/publicRsvpRepository.ts`, `server/services/publicInvite.service.ts`, `server/api/public/...` |
| B3 | `server/repositories/distributionRepository.ts`, `server/services/distribution.service.ts`, `server/api/events/[id]/{send,send-test,mark-sent}.post.ts`, `server/emailTemplates/{GuestInviteEmail,GuestReminderEmail}.ts` + append index, `server/queue/types.ts` + handlers append |
| B4 | `server/repositories/reminderRepository.ts`, `server/services/reminder.service.ts`, `server/api/events/[id]/reminders.{get,put}.ts`, `server/api/cron/send-reminders.get.ts`, `vercel.json` |
| F1 | `app/pages/index.vue` |
| F2 | `app/pages/auth/{login,signup}.vue` |
| F3 | `app/components/ceremly/{InviteRenderer,RsvpFormRenderer,CountdownRing}.vue` |
| F4 | `app/pages/dashboard/index.vue`, `app/pages/dashboard/events/new.vue`, `app/composables/useEvents.ts` |
| F5 | `app/pages/dashboard/events/[id]/editor.vue` |
| F6 | `app/pages/dashboard/events/[id]/{guests,rsvp,distribution,reminders}.vue`, `app/composables/useEventGuests.ts` |
| F7 | `app/pages/dashboard/events/[id]/index.vue`, `app/composables/useEventStats.ts` |
| F8 | `app/pages/e/[slug]/[token].vue`, `app/composables/usePublicInvite.ts` |
| Orchestratore | `nuxt.config.ts` (css + routeRules + fonts), `.env` (APP_NAME), commit |

## 10. Definition of Done

- `pnpm typecheck` e `pnpm lint` puliti; `pnpm build` ok (sharp-wasm32 noto escluso).
- Migrazione applicata al DB dev; flusso completo verificabile: signup → crea evento (wizard) → editor salva blocchi → aggiungi ospiti (manuale+CSV) → configura RSVP → apri link ospite → compila RSVP condizionale → dashboard aggiornata → export CSV.
- Multi-tenancy verificata (org B non vede evento org A).
- UI fedele ai mockup (palette, font, hard shadows, spacing).
