# FASE 0 — Strip risorse-prodotto eventi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimuovere le risorse-prodotto eventi di Ceremly (guest, landing, reminder, rsvp, ai, templates) lasciando un boilerplate che compila e parte, con la spina tenancy event-based intatta.

**Architecture:** Strip chirurgico in ordine **barrel → cancella → ripara**. Si scollegano prima i barrel (così il typecheck fa emergere le ref residue), si cancellano i file/cartelle interi del SET A, si applicano i tagli chirurgici del SET B sui file tenuti. La spina (events/event_users/permissions/team.service/2.events) NON si tocca — si sostituirà in blocco in FASE 1.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript strict, Drizzle ORM, pnpm. Verifica via `pnpm typecheck` + `grep`, non test unitari (è una rimozione, non una feature).

**Spec di riferimento:** `docs/superpowers/specs/2026-06-05-fase0-strip-eventi-design.md`

---

## Nota sul metodo (questo piano non è TDD)

È uno **strip**, non una feature: non c'è codice nuovo da testare. Il pattern adattato per ogni task:
1. Esegui la rimozione/taglio (file precisi, contenuto preciso).
2. **Verifica** = il "test": `pnpm typecheck` e/o `grep` mirato.
3. Avanza solo se la verifica passa.

L'arbitro finale sono i 3 gate (Task 14). **Nessun commit intermedio** — un solo commit finale, fatto
**manualmente dall'utente** (la CLAUDE.md vieta commit automatici).

---

## File Structure (cosa si tocca)

**Cancellati interi (SET A):** 6 schema, 6 service, 3+ cartelle API, 8 pagine, 3 cartelle componenti,
5 composable, 5 shared schemas, artefatti (`PRD.md`, `design/`), dipendenze npm.

**Modificati chirurgicamente (SET B):** `schema/event.ts`, `schema/index.ts`, `shared/schemas/index.ts`,
`planLimit.service.ts`, `event.service.ts`, `utils/userPlan.ts`, `eventStore.ts`,
`dashboard/event/[id]/index.vue`, `pricing.ts`, `nuxt.config.ts`, i18n `it-IT.json`/`en-US.json`,
`package.json`.

**Non toccati (SET C):** team/dataExport/user/waitingList/contact service, file/fileService,
permissions.ts, 2.events.ts, route base `/api/events|team|contact|limits`.

---

## Task 1: Scollega i barrel degli schemi

**Files:**
- Modify: `server/database/schema/index.ts`
- Modify: `shared/schemas/index.ts`

> Si fa **per primo**: tolti gli export, gli `import * as schema` nei file tenuti faranno emergere via
> typecheck ogni `schema.guests`-style residuo. (Il typecheck sarà rosso fino a Task 8 — atteso.)

- [ ] **Step 1: Taglia gli export prodotto da `server/database/schema/index.ts`**

Il file attuale (righe 8-14) esporta `event` (spina, TIENI) + 6 prodotto. Risultato finale del file:

```typescript
export * from './auditLog'
export * from './auth'
export * from './contactMessage'
export * from './dataExport'
export * from './file'
export * from './userCustomLimits'
export * from './waitingList'
export * from './event'
```

Rimosse: le righe `export * from './guest'|'./landingPage'|'./registrationPage'|'./reminderTemplate'|'./emailLog'|'./eventTemplate'`.

- [ ] **Step 2: Taglia gli export prodotto da `shared/schemas/index.ts`**

Risultato finale del file:

```typescript
export * from "./common";
export * from "./auth";
export * from "./team";
export * from "./file";
export * from "./contact";
export * from "./subscription";
export * from "./admin";
export * from "./waiting-list";
export * from "./event";
```

Rimosse: le righe `export * from "./guest"|"./landing"|"./reminder"|"./sections"|"./eventTemplate"`.

- [ ] **Step 3: Verifica grep — i barrel non citano più i prodotti**

Run: `grep -nE "guest|landing|reminder|sections|eventTemplate|emailLog|registrationPage" server/database/schema/index.ts shared/schemas/index.ts`
Expected: zero output.

---

## Task 2: Cancella i file schema prodotto

**Files:**
- Delete: `server/database/schema/{guest,landingPage,registrationPage,reminderTemplate,eventTemplate,emailLog}.ts`

- [ ] **Step 1: Cancella i 6 file schema**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm server/database/schema/guest.ts \
   server/database/schema/landingPage.ts \
   server/database/schema/registrationPage.ts \
   server/database/schema/reminderTemplate.ts \
   server/database/schema/eventTemplate.ts \
   server/database/schema/emailLog.ts
```

- [ ] **Step 2: Verifica i file non esistono**

Run: `ls server/database/schema/`
Expected: NON compaiono guest.ts, landingPage.ts, registrationPage.ts, reminderTemplate.ts, eventTemplate.ts, emailLog.ts. Restano: auditLog, auth, contactMessage, dataExport, event, file, index, userCustomLimits, waitingList.

---

## Task 3: Cancella i service prodotto

**Files:**
- Delete: `server/services/{guest,landing,reminder,eventTemplate,publicEvent,ai}.service.ts`

> NON cancellare `event.service.ts` (spina, si ripara in Task 9).

- [ ] **Step 1: Cancella i 6 service**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm server/services/guest.service.ts \
   server/services/landing.service.ts \
   server/services/reminder.service.ts \
   server/services/eventTemplate.service.ts \
   server/services/publicEvent.service.ts \
   server/services/ai.service.ts
```

- [ ] **Step 2: Verifica**

Run: `ls server/services/`
Expected: restano `contact.service.ts dataExport.service.ts event.service.ts planLimit.service.ts team.service.ts user.service.ts waitingList.service.ts file/`. NON compaiono guest/landing/reminder/eventTemplate/publicEvent/ai.

---

## Task 4: Cancella le cartelle/route API prodotto

**Files:**
- Delete: `server/api/event/`, `server/api/rsvp/`, `server/api/templates/`
- Delete: `server/api/events/[eventId]/{guests,landing,registration,reminders,templates}/`

> TIENI le route base `server/api/events/[eventId].{get,put,delete}.ts`, `index.{get,post}.ts`,
> e `server/api/team/`, `server/api/contact.post.ts`, `server/api/limits/`.

- [ ] **Step 1: Cancella le cartelle API public/prodotto**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm -rf server/api/event server/api/rsvp server/api/templates
```

- [ ] **Step 2: Cancella le sotto-risorse dentro server/api/events/[eventId]/**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm -rf "server/api/events/[eventId]/guests" \
       "server/api/events/[eventId]/landing" \
       "server/api/events/[eventId]/registration" \
       "server/api/events/[eventId]/reminders" \
       "server/api/events/[eventId]/templates"
```

- [ ] **Step 3: Verifica le route base restano**

Run: `ls server/api/events/ "server/api/events/[eventId]/"`
Expected: in `server/api/events/` restano `[eventId]/ [eventId].delete.ts [eventId].get.ts [eventId].put.ts index.get.ts index.post.ts`. La cartella `[eventId]/` non contiene più guests/landing/registration/reminders/templates (se diventa vuota, va bene — nessuna route dentro).

- [ ] **Step 4: Verifica nessuna route prodotto residua**

Run: `ls server/api/`
Expected: `admin auth events file limits team user waiting-list contact.post.ts`. NON compaiono `event` (singolare), `rsvp`, `templates`.

---

## Task 5: Cancella pagine, componenti e composable prodotto

**Files:**
- Delete pagine: `dashboard/event/[id]/{guests.vue,reminders/,templates/,settings.vue}`, `event/[slug].vue`, `rsvp/[slug].vue`
- Delete componenti: `app/components/{landing-editor,reminder,event}/`
- Delete composable: `useGuests.ts`, `useLandingEditor.ts`, `useReminders.ts`, `useEventTemplates.ts`, `useLandingTheme.ts`
- Delete shared schemas: `shared/schemas/{guest,landing,reminder,eventTemplate,sections}.ts`

> TIENI le pagine spina: `dashboard/event/index.vue`, `dashboard/event/[id]/index.vue` (si ripara in
> Task 10), `dashboard/event/[id]/team.vue`, `invite/[token].vue`.

- [ ] **Step 1: Cancella le pagine prodotto**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm "app/pages/dashboard/event/[id]/guests.vue" \
   "app/pages/dashboard/event/[id]/settings.vue" \
   "app/pages/event/[slug].vue" \
   "app/pages/rsvp/[slug].vue"
rm -rf "app/pages/dashboard/event/[id]/reminders" \
       "app/pages/dashboard/event/[id]/templates" \
       "app/pages/event" \
       "app/pages/rsvp"
```

- [ ] **Step 2: Cancella le cartelle componenti prodotto**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm -rf app/components/landing-editor app/components/reminder app/components/event
```

- [ ] **Step 3: Cancella i composable prodotto**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm app/composables/useGuests.ts \
   app/composables/useLandingEditor.ts \
   app/composables/useReminders.ts \
   app/composables/useEventTemplates.ts \
   app/composables/useLandingTheme.ts
```

- [ ] **Step 4: Cancella gli shared schema prodotto**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm shared/schemas/guest.ts \
   shared/schemas/landing.ts \
   shared/schemas/reminder.ts \
   shared/schemas/eventTemplate.ts \
   shared/schemas/sections.ts
```

- [ ] **Step 5: Verifica pagine spina restano**

Run: `find "app/pages/dashboard/event" -type f`
Expected: `app/pages/dashboard/event/index.vue`, `app/pages/dashboard/event/[id]/index.vue`, `app/pages/dashboard/event/[id]/team.vue`, `app/pages/dashboard/event/[id]/requirements.md`. NESSUNA tra guests/settings/reminders/templates.

- [ ] **Step 6: Verifica composable e schema prodotto spariti**

Run: `ls app/composables/ shared/schemas/`
Expected: in composable NON compaiono useGuests/useLandingEditor/useReminders/useEventTemplates/useLandingTheme. In shared/schemas NON compaiono guest/landing/reminder/eventTemplate/sections.

---

## Task 6: Ripara `schema/event.ts` (scollega relazioni prodotto)

**Files:**
- Modify: `server/database/schema/event.ts:110-125`

> `event.ts` è SPINA (events/event_users/invitations) ma importa le tabelle figlie prodotto per le
> relazioni. Si tagliano import + relazioni prodotto, si tengono `owner/members/invitations`.

- [ ] **Step 1: Rimuovi il blocco import delle child tables prodotto**

Cancella queste 5 righe (il commento + i 4 import, righe ~109-113):

```typescript
// Import child tables for relations
import { guests } from "./guest";
import { landingPages } from "./landingPage";
import { registrationPages } from "./registrationPage";
import { reminderTemplates } from "./reminderTemplate";
```

- [ ] **Step 2: Rimuovi le 4 relazioni prodotto da `eventsRelations`**

`eventsRelations` deve restare così (rimosse le righe `guests/landingPage/registrationPage/reminderTemplates`):

```typescript
export const eventsRelations = relations(events, ({ one, many }) => ({
    owner: one(user, {
        fields: [events.userId],
        references: [user.id],
    }),
    members: many(eventUsers),
    invitations: many(invitations),
}));
```

> Nota: `({ one, many })` resta invariato — `one` serve a `owner`, `many` a `members`/`invitations`.

- [ ] **Step 3: Verifica event.ts non cita più i prodotti**

Run: `grep -nE "guest|landingPage|registrationPage|reminderTemplate" server/database/schema/event.ts`
Expected: zero output.

---

## Task 7: Ripara `planLimit.service.ts` (rimuovi funzioni risorsa-prodotto)

**Files:**
- Modify: `server/services/planLimit.service.ts`

> Rimuovi le 4 funzioni che contano risorse-prodotto. TIENI `canCreateEvent`, `canAddTeamMember`,
> `getUserPlan`, `getEffectiveLimits`, `countUserEvents`, `countReservedSlots`, `validateDowngrade`.

- [ ] **Step 1: Rimuovi `countEventGuests` (≈ righe 203-212)**

Cancella l'intera funzione `export async function countEventGuests(...) { ... }` (quella che fa SELECT count su `schema.guests`).

- [ ] **Step 2: Rimuovi `canAddGuest` (≈ righe 217-233)**

Cancella l'intera funzione `export async function canAddGuest(...) { ... }`.

- [ ] **Step 3: Rimuovi `countMonthlyEmails` (≈ righe 240-276)**

Cancella l'intera funzione `export async function countMonthlyEmails(...) { ... }` (la JOIN su `schema.guests` + `schema.emailLogs`).

- [ ] **Step 4: Rimuovi `canSendEmail` (≈ righe 281-297)**

Cancella l'intera funzione `export async function canSendEmail(...) { ... }`.

- [ ] **Step 5: Controlla `validateDowngrade` per riferimenti residui**

`validateDowngrade` resta, ma potrebbe internamente chiamare le funzioni appena rimosse o contare guest/email. Aprilo e, se referenzia `canAddGuest/countEventGuests/canSendEmail/countMonthlyEmails/max_guests_per_event/emails_per_month/has_registration_landing`, rimuovi quei rami (la validazione downgrade resta solo su `max_events`/`team_members`/`storage_mb`).

Run: `grep -nE "guest|emailLog|emails_per_month|max_guests|has_registration_landing|canSendEmail|canAddGuest|countMonthlyEmails|countEventGuests" server/services/planLimit.service.ts`
Expected: zero output (se compare qualcosa dentro `validateDowngrade`, va rimosso in questo step).

---

## Task 8: Ripara `utils/userPlan.ts` (re-export backward-compat)

**Files:**
- Modify: `server/utils/userPlan.ts:15-18`

- [ ] **Step 1: Rimuovi le 4 righe re-export delle funzioni eliminate**

Il blocco export finale deve essere (rimosse `countEventGuests/canAddGuest/countMonthlyEmails/canSendEmail`):

```typescript
export {
    type PlanName,
    type UserPlanInfo,
    type EffectiveLimitsInfo,
    getUserPlan,
    getUserPlanInfo,
    getUserCustomLimits,
    getEffectiveLimits,
    countUserEvents,
    canCreateEvent,
    countEventMembers,
    countPendingInvitations,
    countReservedSlots,
    canAddTeamMember,
    getTeamLimit,
    validateDowngrade,
} from "../services/planLimit.service";
```

- [ ] **Step 2: Verifica typecheck del layer server schema/service**

A questo punto i barrel sono scollegati e i file riparati. Run: `pnpm typecheck`
Expected: NON devono più comparire errori del tipo `Property 'guests' does not exist on type ... schema`, né `Cannot find module './guest'`. Potrebbero restare errori lato `app/` (eventStore, pagina index, i18n) — quelli li chiudono i Task 9-12. Se compaiono errori server residui (es. `schema.emailLogs` in planLimit), tornare al task relativo.

---

## Task 9: Ripara `event.service.ts` (rimuovi logica landing + join guests)

**Files:**
- Modify: `server/services/event.service.ts`

> `event.service.ts` è SPINA (CRUD event, ownership, slug) ma contiene `getDefaultLandingData()` e join
> su `guests`. Si rimuove SOLO la logica prodotto, si tiene il CRUD.

- [ ] **Step 1: Rimuovi gli import landing (≈ righe 13-15)**

Cancella:

```typescript
import type { LandingPageData } from ...
import type { LandingSectionType } from ...
import { getSectionDefaults } from ...
```

(i percorsi esatti puntano a `shared/schemas/landing` / `sections`, ormai cancellati.)

- [ ] **Step 2: Rimuovi `getDefaultLandingData()` (≈ righe 92-114)**

Cancella l'intera funzione `getDefaultLandingData()` e ogni sua chiamata interna nel file (cerca
`getDefaultLandingData(` e rimuovi i punti d'uso — tipicamente nella creazione evento dove si seedava
la landing di default).

- [ ] **Step 3: Rimuovi i join/count su `schema.guests` nelle query (≈ righe 146, 152, 179-185)**

Trova i `leftJoin(schema.guests, ...)` e le SELECT che contano guest-status nelle query evento.
Rimuovi join e relativi campi dal SELECT. Le query devono restituire i dati evento senza i conteggi guest.

- [ ] **Step 4: Verifica event.service.ts non cita più prodotti**

Run: `grep -nE "guest|landing|LandingPageData|LandingSectionType|getSectionDefaults|getDefaultLandingData|schema.guests" server/services/event.service.ts`
Expected: zero output.

- [ ] **Step 5: Verifica typecheck server pulito**

Run: `pnpm typecheck`
Expected: nessun errore proveniente da `server/` (gli unici residui ammessi ora sono `app/`: eventStore, pagina index — Task 10-11).

---

## Task 10: Ripara `eventStore.ts` (rimuovi guest-count)

**Files:**
- Modify: `app/stores/eventStore.ts`

> Risolve la contraddizione spec: lo store è spina (TIENI) ma esponeva conteggi-prodotto. Si tolgono
> SOLO i 4 campi guest-count + il loro popolamento.

- [ ] **Step 1: Rimuovi i 4 campi guest-count dallo state/interface**

Trova e rimuovi `totalGuests`, `confirmedGuests`, `pendingGuests`, `declinedGuests` dall'interface dello
state e dal valore iniziale dello store.

- [ ] **Step 2: Rimuovi il popolamento di quei campi**

Trova dove lo store assegna quei 4 campi (tipicamente dopo una fetch `/api/events/[eventId]` che li
restituiva) e rimuovi quelle assegnazioni. Se c'è un getter/computed che li aggrega, rimuovilo.

- [ ] **Step 3: Verifica eventStore non cita guest**

Run: `grep -niE "guest" app/stores/eventStore.ts`
Expected: zero output.

---

## Task 11: Ripara `dashboard/event/[id]/index.vue` (rimuovi useGuests + render)

**Files:**
- Modify: `app/pages/dashboard/event/[id]/index.vue`

> Pagina SPINA (TIENI) che però chiama `useGuests(eventId)` (cancellato in Task 5) e renderizza i
> conteggi guest. Edit chirurgico.

- [ ] **Step 1: Rimuovi l'import/chiamata `useGuests`**

Trova `useGuests(` nello `<script setup>` (≈ riga 15) e rimuovi la riga + ogni variabile derivata da
essa (es. `const { guests, ... } = useGuests(eventId)`).

- [ ] **Step 2: Rimuovi dal template il rendering dei conteggi guest**

Nel `<template>` rimuovi i blocchi che mostrano `totalGuests/confirmedGuests/pendingGuests/declinedGuests`
(o le variabili da useGuests). Se restano riferimenti a card/statistiche guest, rimuovili. La pagina
deve mostrare i dati evento spina (nome, team, ecc.) senza la sezione guest.

- [ ] **Step 3: Verifica la pagina non cita guest**

Run: `grep -niE "guest|useGuests" "app/pages/dashboard/event/[id]/index.vue"`
Expected: zero output.

- [ ] **Step 4: Verifica typecheck completo**

Run: `pnpm typecheck`
Expected: **verde, zero errori** (Gate 1). Se compare ancora qualcosa, è una ref mancata → risolvere nel task pertinente.

---

## Task 12: Ripara `pricing.ts` + `nuxt.config.ts`

**Files:**
- Modify: `shared/constants/pricing.ts`
- Modify: `nuxt.config.ts:93-96`

- [ ] **Step 1: Rimuovi le chiavi limite prodotto da `pricing.ts`**

Nell'interface dei limiti piano e in OGNI definizione di piano (starter/premium/agency e free se
presente), rimuovi `max_guests_per_event`, `emails_per_month`, `has_registration_landing`.
TIENI `max_events`, `team_members`, `storage_mb`.

- [ ] **Step 2: Rimuovi le route rules public da `nuxt.config.ts`**

Cancella le 4 righe (93-96):

```typescript
"/event/**": { ssr: true },
"/en/event/**": { ssr: true },
"/rsvp/**": { ssr: true },
"/en/rsvp/**": { ssr: true },
```

> TIENI le righe `/invite/**` (99, 156, 174) — sono spina.

- [ ] **Step 3: Verifica**

Run: `grep -nE "max_guests_per_event|emails_per_month|has_registration_landing" shared/constants/pricing.ts; grep -nE '"/event|"/rsvp|"/en/event|"/en/rsvp' nuxt.config.ts`
Expected: zero output da entrambi.

- [ ] **Step 4: Typecheck dopo pricing**

Run: `pnpm typecheck`
Expected: verde. (Se un consumer dei limiti rimossi rompe — es. un componente che leggeva `max_guests_per_event` — risolverlo qui rimuovendo quel riferimento; dovrebbe essere già coperto dai task precedenti.)

---

## Task 13: Pulisci i18n e dipendenze npm

**Files:**
- Modify: `i18n/locales/it-IT.json`, `i18n/locales/en-US.json`
- Modify: `package.json`

- [ ] **Step 1: Rimuovi i blocchi i18n prodotto (it-IT.json)**

Apri `i18n/locales/it-IT.json` e rimuovi le chiavi top-level/blocchi relativi a:
`guest`, `landing`, `reminder`, `rsvp`, `registration`, `template` (e relative sotto-chiavi). Mantieni
JSON valido (attenzione alle virgole). Cerca anche chiavi annidate che contengono questi termini in
sezioni marketing/dashboard.

- [ ] **Step 2: Rimuovi i blocchi i18n prodotto (en-US.json)**

Stessa operazione su `i18n/locales/en-US.json`. Le due lingue devono restare allineate (stesse chiavi).

- [ ] **Step 3: Verifica grep i18n pulito**

Run: `grep -niE '"(guest|landing|reminder|rsvp|registration|template)' i18n/locales/it-IT.json i18n/locales/en-US.json`
Expected: zero output. (Se compaiono chiavi marketing legittime che contengono "template" in senso non-Ceremly, valutare caso per caso — ma in questo codebase sono prodotto.)

- [ ] **Step 4: Verifica JSON valido**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/locales/it-IT.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/en-US.json','utf8')); console.log('JSON ok')"`
Expected: `JSON ok`.

- [ ] **Step 5: Rimuovi le dipendenze da `package.json`**

Rimuovi da `dependencies`: `@mastra/core` (riga 26) e TUTTI i pacchetti `grapesjs*` (righe 47-60:
`grapesjs`, `grapesjs-blocks-basic`, `grapesjs-blocks-table`, `grapesjs-custom-code`,
`grapesjs-parser-postcss`, `grapesjs-plugin-forms`, `grapesjs-preset-webpage`, `grapesjs-style-bg`,
`grapesjs-style-filter`, `grapesjs-style-gradient`, `grapesjs-tabs`, `grapesjs-tooltip`,
`grapesjs-touch`, `grapesjs-typed`).

- [ ] **Step 6: Rigenera il lockfile**

Run: `pnpm install`
Expected: completa senza errori; `pnpm-lock.yaml` aggiornato senza mastra/grapesjs.

- [ ] **Step 7: Verifica nessuna dipendenza residua**

Run: `grep -nE "mastra|grapesjs" package.json`
Expected: zero output.

---

## Task 14: Cancella artefatti prodotto + Gate finali

**Files:**
- Delete: `PRD.md`, `design/`

- [ ] **Step 1: Cancella PRD e design/**

```bash
cd /Users/airowlgasga/coding/project/boilerplate-saas
rm -f PRD.md
rm -rf design
```

- [ ] **Step 2: GATE 1 — typecheck verde**

Run: `pnpm typecheck`
Expected: **zero errori.**

- [ ] **Step 3: GATE 2 — grep prodotto pulito**

Run: `grep -rIE "guest|reminder|landing|rsvp" app/ server/ shared/ i18n/`
Expected: **zero hit.** (I termini `event`/`event_users` RESTANO — sono la spina, non si grep-ano qui.) Se compare qualche hit, è un residuo → rimuoverlo nel file segnalato prima di procedere.

- [ ] **Step 4: GATE — build**

Run: `pnpm build`
Expected: build prodotta senza errori. (Nota known-issue: `sharp-wasm32` durante build Nitro è pre-esistente e non bloccante.)

- [ ] **Step 5: GATE 3 — app parte e flussi spina vivi**

Run: `pnpm dev`
Poi verifica manualmente: login, signup, dashboard, profile, subscription, team funzionano. La spina
event vive ancora. Ferma il server dopo la verifica.
Expected: nessun errore runtime; i flussi spina rispondono.

- [ ] **Step 6: Commit finale (MANUALE — lo fa l'utente)**

> ⚠️ La CLAUDE.md vieta commit automatici. NON eseguire `git commit` automaticamente. Comunica
> all'utente che le modifiche sono pronte e fornisci il comando:

```bash
git add -A
git commit -m "refactor: strip event product resources (keep tenancy spine)"
```

---

## Acceptance Criteria (riepilogo)

- [ ] `pnpm typecheck` verde (Gate 1)
- [ ] `grep -rIE "guest|reminder|landing|rsvp" app/ server/ shared/ i18n/` → zero hit (Gate 2)
- [ ] `pnpm build` produce build
- [ ] `pnpm dev` + flussi spina (login/signup/dashboard/profile/subscription/team) funzionano (Gate 3)
- [ ] `event`/`event_users` RESTANO intatti (spina → FASE 1)
- [ ] Commit `refactor: strip event product resources (keep tenancy spine)` fatto dall'utente
