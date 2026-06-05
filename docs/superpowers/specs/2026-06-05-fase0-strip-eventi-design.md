# FASE 0 — Strip risorse-prodotto eventi (Design)

> **Spec di input per `writing-plans`.** Deriva da `IMPLEMENTATION.md` FASE 0 (righe 47-105),
> corretta e verificata contro lo stato reale del codice (grep file-per-file, non elenco teorico).
> Obiettivo della fase: rimuovere le **risorse-prodotto** eventi di Ceremly lasciando un boilerplate
> che **compila ancora e parte**. La **spina tenancy event-based resta intatta** (mal-nominata ma
> funzionante) e si sostituirà in blocco in FASE 1.

---

## Contesto: "zero Ceremly" è il risultato di tutte le fasi, non della sola FASE 0

Il boilerplate finale non deve avere alcuna traccia di Ceremly. Quel risultato si raggiunge a tappe
verificabili, non in un big-bang:

- **FASE 0 (questa)** — togli i *prodotti* appesi all'evento (guest, landing, reminder, rsvp, ai,
  templates). Test di completezza: `grep "guest|reminder|landing|rsvp"` deve tornare **pulito**.
- **FASE 1** — rinomina la *spina* tenancy: `events`→`organizations`, `event_users`→`members`.
  La parola "event" come nome di dominio **muore qui**.
- **FASE 5** — pulisci docs/branding (`ceremly.it`, README, i18n marketing).

### Principio chiave (non violare): "events" è DUE cose

1. **Spina-tenancy** — `events` (unità org) + `event_users` (membership) + `invitations` +
   `permissions.ts` (`getUserRole/requireMember/requireWrite/requireOwner`) + `team.service.ts` +
   `2.events.ts` + ogni route che usa `requireMember`. **È un'unità atomica: si tiene intera o si
   sostituisce intera.** Cancellarne un pezzo (es. la tabella `events`) mentre si tiene `team.service`
   che lo importa rompe la compilazione all'istante. Si sostituisce **tutta insieme** in FASE 1.
2. **Risorse-prodotto** — guest, landing, registration, reminder, eventTemplate, rsvp, ai — appese
   all'evento ma non parte della spina.

**FASE 0 rimuove SOLO le risorse-prodotto (2). La spina (1) NON si tocca qui.**

---

## Sezione 1 — Regola di scope (decide ogni artefatto)

Lo strip ha una regola **meccanica** derivata dai due gate del checkpoint FASE 0. Per ogni artefatto
nel codice tenuto:

| Caso | Azione |
|---|---|
| Rompe `typecheck` (import/ref hard verso codice rimosso) | **Taglio chirurgico** del riferimento (obbligatorio) |
| Compila ma matcha il grep-prodotto (`guest/landing/reminder/rsvp`) | **Taglio comunque** (lo impone il grep gate) |
| Né l'uno né l'altro | **Non tocco** |

**Corollario duro:** niente refactor/rinomina dei file-spina tenuti oltre la rimozione dei
riferimenti-prodotto. FASE 1 sostituisce la spina in blocco → ogni pulizia extra è lavoro buttato la
fase dopo. **Taglio minimo per passare i 3 gate** (typecheck, app parte, grep pulito), nulla di più.

---

## Sezione 2 — I due set + il non-toccare

### SET A — Eliminazione completa (file/cartelle cancellati interi)

Verificati senza consumer residui nella spina.

```
Schema:      guest.ts  landingPage.ts  registrationPage.ts  reminderTemplate.ts
             eventTemplate.ts  emailLog.ts            (NON event.ts → spina)
Service:     guest  landing  reminder  eventTemplate  publicEvent  ai
                                                       (NON event.service → spina)
API:         server/api/event/      (public, singolare)
             server/api/rsvp/
             server/api/templates/
             server/api/events/[eventId]/{guests,landing,registration,reminders,templates}/
Pagine:      app/pages/dashboard/event/[id]/guests.vue
             app/pages/dashboard/event/[id]/reminders/  (index, new, [templateId])
             app/pages/dashboard/event/[id]/templates/  (index, editor)
             app/pages/dashboard/event/[id]/settings.vue
             app/pages/event/[slug].vue
             app/pages/rsvp/[slug].vue
Componenti:  app/components/landing-editor/
             app/components/reminder/
             app/components/event/   (i product-specific)
Composable:  useGuests  useLandingEditor  useReminders  useEventTemplates  useLandingTheme
Shared:      shared/schemas/{guest,landing,reminder,eventTemplate,sections}.ts
npm:         @mastra/core   grapesjs-*
Artefatti:   PRD.md   design/
```

> Nota: `useLandingTheme.ts` è incluso (accoppiato al landing editor) — estensione esplicita oltre la
> lista letterale di IMPLEMENTATION.md, confermata in brainstorming.

### SET B — Modifica chirurgica (file TENUTI che importano il SET A)

Rotture verificate grep-per-grep. Per ognuna: cosa tagliare, cosa tenere.

| File tenuto | Cosa taglio (verificato) |
|---|---|
| `server/database/schema/event.ts` | import righe 110-113 (`guest/landingPage/registrationPage/reminderTemplate`) + relazioni `guests/landingPage/registrationPage/reminderTemplates` (righe 122-125). Tengo tutto il resto (events/event_users/invitations). |
| `server/database/schema/index.ts` | export righe 9-14 (`guest/landingPage/registrationPage/reminderTemplate/emailLog/eventTemplate`). Tengo `event` (riga 8) e gli altri spina. |
| `shared/schemas/index.ts` | export righe 10-14 (`guest/landing/reminder/sections/eventTemplate`). Tengo `event` (riga 9) e gli altri. |
| `server/services/planLimit.service.ts` | rimuovo `canAddGuest` (217-233), `countEventGuests` (203-212), `canSendEmail` (281-297), `countMonthlyEmails` (240-276). **Tengo** `canCreateEvent`, `canAddTeamMember`, `getUserPlan`, `getEffectiveLimits`, `countUserEvents`, `countReservedSlots`, `validateDowngrade`. |
| `server/services/event.service.ts` | rimuovo `getDefaultLandingData()` + import collegati (righe 13-15, 92-114) e i `leftJoin`/count su `schema.guests` nelle query evento (146, 152, 179-185). Tengo CRUD event, ownership, slug. |
| `server/utils/userPlan.ts` | rimuovo le 4 righe re-export delle funzioni eliminate (15-18: `countEventGuests/canAddGuest/countMonthlyEmails/canSendEmail`). Il blocco resta valido (consumer reali usano solo `getUserPlanInfo/getEffectiveLimits`). |
| `app/stores/eventStore.ts` | rimuovo i 4 campi `totalGuests/confirmedGuests/pendingGuests/declinedGuests` + il loro popolamento. Tengo il ruolo tenancy dello store. **Risolve la contraddizione doc** (riga 92 "non toccare" vs riga 100 grep gate: lo store portava conteggi-prodotto). |
| `app/pages/dashboard/event/[id]/index.vue` | rimuovo `useGuests(eventId)` (riga 15) + il rendering dei conteggi guest. Pagina TENUTA (spina), edit chirurgico. |
| `shared/constants/pricing.ts` | rimuovo `max_guests_per_event`, `emails_per_month`, `has_registration_landing`. Tengo `max_events`, `team_members`, `storage_mb` (rinominati in FASE 1). |
| `nuxt.config.ts` | rimuovo route rules `/event/**`, `/en/event/**`, `/rsvp/**`, `/en/rsvp/**` (righe 93-96). **Tengo** `/invite/**` (spina). |
| `i18n/locales/it-IT.json`, `en-US.json` | rimuovo i blocchi di chiavi `guest/landing/reminder/rsvp/registration/template`. JSON, non rompono typecheck → li prende il grep gate. |

### SET C — Non toccare (spina, verificata pulita)

Grep `guest|landing|reminder|eventTemplate|publicEvent|ai.service|sections|emailLog` → **zero hit** su:
`team.service.ts`, `dataExport.service.ts`, `user.service.ts`, `waitingList.service.ts`,
`contact.service.ts`.

Anche intatti: `file/fileService.ts` (usa `eventId` = tenant isolation legittimo su `events`, che
resta), `permissions.ts`, `2.events.ts`, `auditLog.ts` (eventId nullable), `file.ts` (FK eventId→events
valida), `contactMessage.ts`. Route base `/api/events/*`, `/api/team/*`, `/api/contact`,
`/api/limits/*` (usano solo funzioni spina di planLimit).

> `contact.service.ts` + `contactMessage.ts` + `/api/contact.post.ts` = infra SaaS generica, NON
> prodotto eventi → si tengono interi.

---

## Sezione 3 — Ordine di esecuzione

Ordine che minimizza la finestra di codice rotto e rende il typecheck finale l'arbitro:

1. **Scollega i barrel prima** (`schema/index.ts`, `shared/schemas/index.ts`). Tolti gli export, gli
   `import * as schema` nei file tenuti faranno emergere via typecheck ogni `schema.guests`-style
   residuo — è il meccanismo che cattura le ref hard.
2. **Cancella il SET A** (file/cartelle interi).
3. **Applica il SET B** (tagli chirurgici).
4. **Pulisci `package.json`** (`@mastra/core` + `grapesjs-*`) → `pnpm install` per rigenerare il lock.
5. **Cancella artefatti** (`PRD.md`, `design/`).

Filosofia: **barrel → cancella → ripara**. Dopo lo step 3 il typecheck deve essere verde. Se segnala
qualcosa, è una ref mancata → si sistema lì. Non si procede a FASE 1 con typecheck rosso.

---

## Sezione 4 — Accettazione (i 3 gate, espliciti)

- **Gate 1 — typecheck:** `pnpm typecheck` verde. Cattura le ref hard (import + `schema.X` + chiamate
  a funzioni rimosse).
- **Gate 2 — grep pulito:** `grep -rIE "guest|reminder|landing|rsvp" app/ server/ shared/ i18n/`
  → **zero hit**. Cattura ciò che typecheck non vede: template `.vue`, chiavi i18n `t('guest.*')`,
  stringhe. I termini `event`/`event_users` **restano** (spina, non si grep-ano).
- **Gate 3 — app parte:** `pnpm dev` + flussi vivi: login, signup, dashboard, profile, subscription,
  team. La spina event vive ancora e funziona.
- **Extra:** `pnpm build` produce build.

I due grep sono complementari per design: typecheck prende i riferimenti tipizzati, grep prende le
stringhe non tipizzate. **Entrambi devono passare.**

**Commit finale (manuale, lo fa l'utente):**
`refactor: strip event product resources (keep tenancy spine)`

---

## Cosa esplicitamente NON fa questa fase

- NON tocca la spina tenancy (events/event_users/permissions/team.service/2.events) → FASE 1.
- NON rinomina nulla event→organization → FASE 1.
- NON cambia il driver DB, il deploy, l'astrazione queue → FASI 2-3.
- NON riscrive docs/branding/README → FASE 5.
- NON aggiunge l'entità-esempio `projects` → FASE 4.
