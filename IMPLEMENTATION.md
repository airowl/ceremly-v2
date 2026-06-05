# IMPLEMENTATION — Da Ceremly a Boilerplate SaaS

> **Cos'è questo file.** Il piano-master di alto livello per trasformare il prodotto esistente
> *Ceremly* (SaaS gestione eventi/inviti) in un **boilerplate SaaS generico riutilizzabile**.
> Definisce le fasi, lo scope di ognuna, l'ordine e i checkpoint. I dettagli implementativi di
> ogni fase verranno prodotti con i superpower (`brainstorming` → `writing-plans`) in sessioni dedicate,
> usando questo documento come spec di partenza.

---

## Decisioni architetturali (già prese — non rivalutare)

| Dimensione | Scelta | Conseguenza |
|---|---|---|
| **Deploy** | Vercel serverless | DB driver → Neon HTTP; background → QStash + Vercel Cron |
| **Tenancy** | Better Auth organization plugin | `events` (tenant attuale) → `organizations`; `event_users` → `members` |
| **Dominio** | Strip chirurgico | Togli risorse event-specific, tieni infra trasversale + entità-esempio `projects` |
| **Caso d'uso** | Uso personale (assunto) | Convenzioni opinionate OK, niente over-generalizzazione |

**Approccio: Ibrido pendente verso `base/`.** Le fondamenta (deploy, tenancy, driver, background)
seguono `base/`. Le convenzioni-superficie dove `base/` non aggiunge valore restano quelle attuali:
- ✅ Si tiene: `parseBody` (no `readValidatedBody`), React Email (no `vue-email`), `useRuntimeConfig`.
- 🔄 Da rivalutare in fase: provider-abstraction (`server/queue/` per QStash ha senso; `billing/` forse),
  repository pattern (costa poco se si riscrive comunque il layer DB).

**Coerenza dura (unica regola non negoziabile):** serverless ⟹ MAI TCP pool, MAI worker in-process.
Tutto il background passa per QStash (coda HTTP) o Vercel Cron.

---

## Stato attuale verificato (punto di partenza)

- Nessun preset nitro (`node-server` default) + driver TCP `node-postgres` (`getPgPool`)
- Nessun `vercel.json`, nessun `server/api/{cron,jobs}`, nessun `server/queue/`
- Tenancy: `events` È il tenant — `event_users` = membership, `permissions.ts` = RBAC event-scoped,
  `server/middleware/2.events.ts` = carica event context, `eventStore` (Pinia) = stato lato client
- Dominio eventi pervasivo: 7 tabelle, 7 service, 4 cartelle API, 8 pagine, 3 cartelle componenti,
  4 composable, ~130 stringhe i18n

---

## Le fasi (sequenziali — ogni fase poggia sulla precedente)

> Regola d'oro (da `base/`): un checkpoint che non passa BLOCCA la fase successiva.
> Una fase = un commit pulito. I commit li fa l'utente (mai automatici).

### FASE 0 — Strip risorse-prodotto eventi (NON la spina tenancy)
**Obiettivo:** rimuovere le **risorse di dominio** appese all'evento (guests, landing, reminders, ecc.),
lasciando un boilerplate che *compila ancora e parte*. **La spina-tenancy event-based resta intatta**
(mal-nominata ma funzionante) e si sostituirà in blocco in FASE 1.

> ⚠️ **Principio chiave (non violare).** "events" è DUE cose:
> 1. **Spina-tenancy** — `events` (unità org) + `event_users` (membership) + `invitations` + `permissions.ts`
>    (`getUserRole/requireMember/requireWrite/requireOwner`) + `team.service.ts` + `2.events.ts` +
>    ogni route che usa `requireMember`. **È un'unità atomica: si tiene intera o si sostituisce intera.**
> 2. **Risorse-prodotto** — guests, landing, registration, reminders, eventTemplate, rsvp, ai — appese
>    all'evento ma non parte della spina.
>
> FASE 0 rimuove **solo le risorse-prodotto (2)**. La spina (1) NON si tocca qui — cancellarne un pezzo
> (es. la tabella `events` o `event.service`) mentre si tiene `team.service`/`permissions.ts` rompe
> la compilazione all'istante. La spina si sostituisce **tutta insieme** in FASE 1.

**Rimuovi (risorse-prodotto):**
- Schema: `guest.ts`, `landingPage.ts`, `registrationPage.ts`, `reminderTemplate.ts`,
  `eventTemplate.ts`, `emailLog.ts` (orfano senza guests)
  → **NON** `event.ts` (contiene la spina events/event_users/invitations — resta fino a FASE 1)
- Service: `guest`, `landing`, `reminder`, `eventTemplate`, `publicEvent`, `ai` (Mastra)
  → **NON** `event.service.ts` (lo usa la spina/team.service — resta fino a FASE 1)
- API: cartelle `server/api/event/` (public), `server/api/rsvp/`, `server/api/templates/`;
  dentro `server/api/events/` rimuovi solo le sotto-risorse (`guests/`, `landing/`, `registration/`,
  `reminders/`, `templates/`) → **tieni** le route base event + `/api/team/*` (spina, fino a FASE 1)
- Pagine: `dashboard/event/[id]/{guests,reminders,templates,settings}`, `event/[slug]`, `rsvp/[slug]`
  → **tieni** `dashboard/event/index`, `dashboard/event/[id]/{index,team}`, `invite/[token]` (spina)
- Componenti: `landing-editor/`, `event/` (solo i product-specific), `reminder/`
- Composable: `useGuests`, `useLandingEditor`, `useReminders`, `useEventTemplates`
- Shared: schemas `guest/landing/reminder/eventTemplate/sections`
- Dipendenze: `@mastra/core`, tutti i pacchetti `grapesjs-*` (già inutilizzati) da `package.json`
- Artefatti prodotto: `PRD.md`, cartella `design/`

**Scollega (cross-deps che romperebbero):**
- `index.ts` barrel schema → rimuovi export delle SOLE tabelle-risorsa eliminate (no `event`)
- `file.ts` schema → rimuovi FK `eventId` (tieni la tabella)
- `auditLog.ts` → tieni schema, `eventId` resta nullable (azzerato)
- `planLimit.service.ts` → rimuovi `canAddGuest/canSendEmail/countMonthlyEmails` (contano risorse-prodotto);
  **tieni** `canCreateEvent/canAddTeamMember` (usano la spina, ancora viva); tieni `getUserPlan/getEffectiveLimits`
- `pricing.ts` → rimuovi `max_guests_per_event`, `has_registration_landing`;
  tieni `max_events`, `team_members`, `storage_mb` (rinominati in FASE 1)
- `nuxt.config.ts` → rimuovi route rules `/rsvp/**`, `/event/**` (public); tieni `/invite/**` (spina)
- i18n → rimuovi/genericizza le chiavi delle risorse-prodotto (guest/landing/reminder)
- `contact.service.ts` + `contactMessage.ts` + `/api/contact.post.ts` → **TIENI INTERI** (contact form =
  infra SaaS generica, non prodotto eventi)
- `team.service.ts`, `permissions.ts`, `eventStore.ts`, `2.events.ts` → **NON toccare** (spina → FASE 1)

**Checkpoint FASE 0:**
- [ ] `pnpm typecheck` passa — **verifica esplicita**: grep nel codice TENUTO (team.service, permissions.ts,
      contact.service, route file) di import verso service/funzioni eliminati e query su tabelle-risorsa
      eliminate → zero hit
- [ ] `pnpm build` produce build
- [ ] L'app parte: login/signup/dashboard/profile/subscription/team funzionano (la spina event vive ancora)
- [ ] Nessun riferimento residuo alle risorse-prodotto (grep `guest|reminder|landing|rsvp` pulito;
      `event`/`event_users` restano — sono la spina, fino a FASE 1)
- [ ] Commit: `refactor: strip event product resources (keep tenancy spine)`

> ⚠️ FASE 0 lascia VIVA e compilante l'intera spina event-tenancy (events, event_users, permissions,
> team.service). È deliberato: la spina è atomica e si sostituisce tutta in FASE 1, non si smonta a pezzi.

---

### FASE 1 — Tenancy: events → organizations (Better Auth org plugin)
**Obiettivo:** sostituire la spina dorsale tenancy event-based con il plugin organization di Better Auth.
È la fase architetturalmente più importante (corrisponde a `base/` PHASE-1+2).

**Da fare:**
- Studio doc Better Auth organization plugin (via web — non a memoria): quali tabelle genera
  (`organization`, `member`, `invitation`), quali campi, come si integra con l'adapter Drizzle
- Schema: introduci `organizations` + `members` + `invitations` (allineate al plugin).
  **Rimuovi l'intera spina event-tenancy lasciata viva in FASE 0**: tabelle `events` + `event_users`
  + vecchia `invitations`, `event.service.ts`, `event.ts` schema
- Better Auth: attiva il plugin organization, configura ruoli (owner/admin/member),
  hook signup → **auto-creazione org personale** (caso B2C = org con 1 membro)
- RBAC: `permissions.ts` `getUserRole(userId, eventId)` → `getOrgRole(userId, organizationId)`;
  `requireMember/requireWrite/requireOwner` su organization
- Middleware: rimuovi `2.events.ts`, crea `2.organization.ts` (carica org attiva in `event.context`)
- `team.service.ts` → riscrivi su organization (inviti/membri org-level); rimuovi le route base
  `/api/events/*` e `/api/team/*` residue → `/api/organizations/*`
- `planLimit.service.ts` → `canCreateEvent`→`canCreateOrganization()`, `canAddTeamMember` su org
- Pagine: rimuovi `dashboard/event/**` residue + `invite/[token]` event-scoped → equivalenti org
- Frontend: `eventStore` → `organizationStore`; `useDashboard`, `dashboard/profile/members.vue`,
  componenti `admin/home/*` da event-centric a org-centric
- Migration Drizzle + seeder (1 org B2C, 1 org B2B multi-membro)

**Checkpoint FASE 1:**
- [ ] Signup crea utente + org personale (owner) automaticamente
- [ ] Un utente può creare una 2ª org (caso B2B) ed essere owner
- [ ] Owner/admin può invitare un membro; member NO (gating per ruolo testato)
- [ ] `assertOwnership` blocca accesso a risorsa di un'altra org (403, testato)
- [ ] Middleware protegge rotte org-scoped; senza sessione → 401
- [ ] `pnpm typecheck` passa
- [ ] Commit: `feat: organization-based multi-tenancy`

> ⚠️ Test più importante: utente A non vede mai dati di org B. È un requisito di sicurezza.

---

### FASE 2 — DB driver: TCP → Neon HTTP serverless
**Obiettivo:** sostituire il driver `node-postgres` (TCP, processo persistente) con il driver
Neon HTTP/serverless — requisito del runtime Vercel serverless.

**Da fare:**
- `server/utils/drivers.ts` + `server/utils/db.ts`: da `drizzle-orm/node-postgres` + `getPgPool()`
  a `drizzle-orm/neon-http` + `@neondatabase/serverless` (già in `package.json`)
- Verifica `getDB()` singleton resti l'unico punto d'accesso
- Allinea `drizzle.config.ts` se serve
- Verifica le transazioni: il driver HTTP non supporta tutte le transazioni interattive →
  rivedi i punti dove si usano (specie team.service / planLimit)

**Checkpoint FASE 2:**
- [ ] Tutte le query passano dal driver Neon HTTP
- [ ] Nessun `getPgPool` / `node-postgres` residuo
- [ ] App funziona end-to-end (auth, org, billing) col nuovo driver
- [ ] `pnpm build` + `pnpm typecheck` passano
- [ ] Commit: `refactor: switch to Neon HTTP serverless driver`

---

### FASE 3 — Deploy Vercel + background (QStash + Cron)
**Obiettivo:** configurare il deploy serverless e spostare ogni lavoro background su coda HTTP / cron.

**Da fare:**
- `nuxt.config.ts`: `nitro: { preset: 'vercel' }`
- `vercel.json`: config base + sezione `crons` (anche vuota, predisposta)
- `server/queue/`: astrazione QStash con `dispatch(jobName, payload)`; consumer come rotte
  `server/api/jobs/...`. (Verifica se oggi esiste lavoro async da migrare: invio email batch ecc.)
- `server/api/cron/...`: endpoint colpiti da Vercel Cron (no lavoro pesante, accoda/batch)
- Env: aggiungi `QSTASH_*` a `env`/`.env.example`
- Verifica webhook Creem resti fuori dall'auth middleware (già esente)

**Checkpoint FASE 3:**
- [ ] `pnpm build` produce build Vercel (preset `vercel`)
- [ ] `vercel.json` valido, `crons` predisposta
- [ ] Lavoro async (se presente) passa per `server/queue/` → `server/api/jobs/`, non in-process
- [ ] Nessun worker persistente / connessione in attesa nel codebase
- [ ] Commit: `feat: vercel serverless deploy + qstash background jobs`

---

### FASE 4 — Entità-esempio generica (`projects`)
**Obiettivo:** fornire una risorsa di dominio neutra che dimostra il pattern multi-tenant
org-scoped, come riferimento per chi clona il boilerplate (corrisponde a `base/` PHASE-1.3).

**Da fare:**
- Schema `projects`: id, `organizationId` (FK, NOT NULL), name, timestamps, indice su `organizationId`
- Service `project.service.ts` (CRUD org-scoped, query filtrate per tenant)
- API `server/api/projects/` (thin controller, `parseBody`, RBAC org)
- Frontend: pagina lista/dettaglio `projects` nel dashboard (esempio CRUD completo)
- Schema Zod in `shared/schemas/project.ts`
- Seeder: qualche project per org (per testare isolamento)

**Checkpoint FASE 4:**
- [ ] CRUD `projects` funziona end-to-end, org-scoped
- [ ] Query su projects di org A non restituisce mai projects di org B (testato)
- [ ] È l'esempio canonico: ogni risorsa futura si modella così
- [ ] Commit: `feat: example domain entity (projects) with multi-tenant pattern`

---

### FASE 5 — Pulizia documentazione e branding
**Obiettivo:** allineare docs e branding al boilerplate (oggi descrivono Ceremly).

**Da fare:**
- `CLAUDE.md`: riscrivi per il boilerplate (org-tenancy, Vercel serverless, Neon HTTP, QStash).
  Oggi descrive l'architettura Ceremly — è artefatto da rifare, non regole da preservare
- `README.md`: riscrivi (oggi outdated, referenzia Supabase/Stripe/Polar)
- `.env.example`: allinea (rimuovi var event-specific, aggiungi QStash/Neon)
- `docs/`: rimuovi `requirements.md` event-specific (events/guests/reminders/templates/public-api/site-mode),
  tieni/aggiorna pattern generici (auth, dashboard, payments, database, storage)
- `nuxt.config.ts`: cambia default `ceremly.it` → placeholder neutro
- i18n: marketing/landing generico (non più "organizza il tuo evento")
- Valuta cosa fare di `base/` (guida originale) e `design/` (già rimossa in FASE 0)

**Checkpoint FASE 5:**
- [ ] CLAUDE.md, README, `.env.example` descrivono il boilerplate, non Ceremly
- [ ] Nessun riferimento a `ceremly.it` o naming prodotto
- [ ] docs/ coerenti con la nuova architettura
- [ ] Commit: `docs: rewrite docs and branding for boilerplate`

---

## Riepilogo ordine e dipendenze

```
FASE 0 (strip)  →  FASE 1 (tenancy org)  →  FASE 2 (Neon HTTP)  →  FASE 3 (Vercel+QStash)
                                                                          ↓
                                          FASE 5 (docs)  ←  FASE 4 (projects esempio)
```

- **0 prima di 1:** non migrare la tenancy mentre il dominio eventi è ancora attaccato.
- **1 prima di 2/3/4:** org-tenancy è la fondamenta; driver/deploy/dominio ci poggiano.
- **2 e 3 vicine:** entrambe servono il target serverless; 2 (driver) prima di 3 (deploy) per testare in locale.
- **4 dopo 1:** l'entità-esempio dimostra il pattern org-scoped → serve la tenancy pronta.
- **5 ultima:** la doc descrive lo stato finale.

## Come si esegue ogni fase (con superpower)

Per ogni fase, in una sessione dedicata:
1. `brainstorming` per chiarire i dettagli aperti della fase
2. `writing-plans` per produrre il piano dettagliato (questo file è la spec di input)
3. Esecuzione + checkpoint
4. Commit (manuale, dall'utente)

> Stima grezza: il blocco fondamenta (FASE 0-3) è il grosso; FASE 4-5 sono più leggere.
