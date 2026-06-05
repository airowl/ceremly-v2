# FASE 1 — Tenancy: events → organizations (Design)

> **Spec di input per `writing-plans`.** Deriva da `IMPLEMENTATION.md` FASE 1 (righe 109-141),
> riconciliata contro `base/PHASE-1`, `base/PHASE-2`, `base/STACK-AND-CONVENTIONS.md` e verificata
> contro lo stato reale del codice (post-FASE-0) e il ground truth del plugin organization di
> Better Auth v1.4.5.
>
> **Obiettivo della fase:** sostituire la spina-tenancy event-based con il plugin **organization**
> di Better Auth. A fine fase `events`/`event_users` non esistono più, ogni risorsa è org-scoped,
> l'isolamento tenant è verificato. La parola "event" come nome di dominio **muore qui**.
>
> **Questa spec copre l'architettura dell'intera FASE 1 + la mappa di decomposizione + il
> sotto-step 1a in dettaglio implementabile.** 1b/1c/1d restano scope delineati: ognuno prende il
> suo ciclo `brainstorming → writing-plans` quando ci si arriva.

---

## Gerarchia delle fonti (risolta)

Tre documenti parlano di FASE 1 e in alcuni punti confliggono. Tie-break a tre livelli:

1. **Decisione esplicita di `IMPLEMENTATION.md`** → autoritativa (è il piano-master, dichiara le sue
   decisioni "già prese — non rivalutare", cita `base/` come proprio input).
2. **`IMPLEMENTATION.md` silente** → riempiono `base/STACK-AND-CONVENTIONS.md` + `base/PHASE-1/2`.
3. **`IMPLEMENTATION.md` marca "🔄 rivaluta"** → fork reale → deciso in brainstorming con l'utente.

> La clausola di supremazia di `STACK-AND-CONVENTIONS.md` ("se una guida di fase è in conflitto,
> vince questo file") è **scoped alla traccia greenfield `base/` PHASE-0..7**. `IMPLEMENTATION.md`
> sta *sopra* `base/`. Dove i due divergono su una decisione esplicita di IMPLEMENTATION, vince
> IMPLEMENTATION.

### Già chiuso da IMPLEMENTATION (non rivalutato in questa fase)

- **`parseBody`** (no `readValidatedBody`), **React Email** (no `vue-email`), **`useRuntimeConfig`**
  (no `process.env`) — IMPLEMENTATION riga 22. Le convenzioni-superficie attuali restano.
- **Struttura cartelle attuale** — `server/services`, `server/database/schema`. La task-list di
  IMPLEMENTATION FASE 1 usa i path correnti (`permissions.ts`, `team.service.ts`,
  `2.events.ts`→`2.organization.ts`). **Non** si migra a `server/db`/`server/schemas` di `base/`.
- **Driver DB** resta TCP `node-postgres` — Neon HTTP è FASE 2. Le migration di FASE 1 girano sul
  driver attuale (funziona contro Neon).
- **Scope = base PHASE-1 + PHASE-2 fusi** di proposito (IMPLEMENTATION riga 111: "corrisponde a
  base/ PHASE-1+2").
- **`projects` come entità-esempio completa** (CRUD+service+API+pagina) è **FASE 4**. In FASE 1 si
  crea solo il minimo per testare l'isolamento tenant.

---

## Stato reale di partenza (verificato post-FASE-0)

FASE 0 è chiusa e committata (`a756147` + follow-up). Working tree pulito, branch `main`.
Boilerplate **clean-slate**: 1 sola migration (`drizzle/migrations/0000_useful_starfox.sql`),
nessun `.env` con dati reali → la migration events→org è **drop+recreate, non migrazione dati**.

**Forma reale della spina tenancy** (diversa da come la doc la descrive a parole):

- **Owner = `events.userId`** (FK diretta a `user`), *non* una riga membership.
- **Membership secondaria = `event_users`** con ruoli `editor`/`viewer` (l'owner non vi compare).
- **`permissions.ts`**: `getUserRole(userId, eventId)` interroga `events.userId` per l'owner +
  `event_users` per il resto. Ruoli: `owner`/`editor`/`viewer`. I `require*` (`requireMember`/
  `requireWrite`/`requireOwner`) **non sono chiamati in nessuna route** — le route base delegano ai
  service; il caricamento accesso avviene in `2.events.ts` (popola `event.context.eventAccess`).
- **`team.service.ts`** (~1000 righe): inviti, token (`crypto.randomUUID`), tabella `invitations`
  custom, email Resend, accept/cancel/resend — **tutto fatto a mano**.
- **`2.events.ts`** (~90 righe): per `/api/events/[id]/*` carica `userEvent` + `eventAccess` in
  context.
- **`file.ts`** ha FK `eventId→events` (tenant-isolation legittima). **`auditLog.ts`** ha `eventId`
  nullable.

**Consumer reali della spina** (contati, sono pochi — il grosso è caduto in FASE 0):

- `permissions.ts` → consumato solo da `2.events.ts` e `team.service.ts`.
- `eventStore.ts` (Pinia) → 4 file: `app/components/admin/home/HomeStats.client.vue`,
  `HomeWelcome.client.vue`, `app/pages/dashboard/event/[id]/index.vue`, `.../team.vue`.
- Pagine event residue: `dashboard/event/index.vue`, `dashboard/event/[id]/index.vue`,
  `dashboard/event/[id]/team.vue` + `app/pages/invite/[token].vue`.
- Nessun composable `useTeam` (la pagina team chiama le API direttamente).

---

## Ground truth: plugin organization Better Auth v1.4.5

> **Onestà sulla provenienza.** Lo schema sotto è ricostruito dai **doc** Better Auth (la lettura
> diretta di `node_modules/better-auth/dist/plugins/organization` è fallita — i file sono `.d.mts`,
> non `.d.ts`, e l'unico presente è un re-export di tipi, non le definizioni dei campi). È
> sufficiente per disegnare, ma **i campi esatti delle tabelle generate si confermano quando
> `pnpm auth:schema` gira in 1a** — il design non li tratta come version-exact.

**Tabelle generate dal plugin** (via `auth:schema`, come già per `user`/`session`/`account`):

| Tabella | Campi (dai doc) | Note |
|---|---|---|
| `organization` | id (PK), name, slug (unique), logo?, metadata?, createdAt | il tenant |
| `member` | id (PK), userId (FK user), organizationId (FK org), role, createdAt | **owner = riga member con role**, non FK su org |
| `invitation` | id (PK), email, inviterId (FK user), organizationId (FK org), role?, status, createdAt, expiresAt | **`token` NON è colonna** — il plugin usa l'`id` invitation nel link |
| `session` (+=) | `activeOrganizationId`? (+ `activeTeamId`? se teams on) | **modifica la tabella `session` esistente** ⚠️ da accertare con Redis `secondaryStorage` (colonna vs KV) |

**Capacità del plugin rilevanti per la fase:**

- **Ruoli custom** supportati via `createAccessControl` + `roles: {}` (se servisse un read-only).
- **API native** per inviti/membri: `inviteMember`, `acceptInvitation`, `rejectInvitation`,
  `cancelInvitation`, `removeMember`, `updateMemberRole` → **rimpiazzano `team.service.ts`**.
- **Hook nativi**: `sendInvitationEmail(data)` (l'email d'invito), `afterCreateInvitation`,
  `afterAcceptInvitation`, ecc. → l'email passa per l'hook, riusando il `sendEmail` esistente.
- **`requireOrgRole`** middleware lato plugin per endpoint org-scoped.

---

## Sezione 1 — Le quattro decisioni architetturali (governano ogni sotto-step)

| # | Decisione | Scelta | Razionale |
|---|---|---|---|
| **A** | **Modello tenancy** | Plugin `organization` → `organization` + `member` + `invitation`. Owner = riga `member` con `role='owner'`. Membership **unificata**: ogni membro (owner incluso) è una riga `member`. | È un **cambio di forma** del modello membership, non una rinomina: oggi l'owner è una FK, dopo è una riga. |
| **B** | **Provenienza schema** | `organization`/`member`/`invitation` le **genera `pnpm auth:schema`**. **NON** scritte a mano (confliggerebbero col generatore). A mano: solo dominio (`projects`) + flip FK (`file`/`auditLog`). | `base/`1.1 + IMPLEMENTATION riga 114 impongono di documentare questa scelta. Le query dei repository girano sulle tabelle generate. |
| **C** | **Repository pattern** | Nuovo `server/repositories/`: ogni query Drizzle su risorse tenant dietro funzioni di dominio. Unico punto che filtra per `organizationId`. | IMPLEMENTATION lascia questo fork esplicitamente aperto ("🔄 rivaluta — costa poco se riscrivi il layer DB"). FASE 1 riscrive comunque il layer → costo basso **adesso**. Allinea a `base/STACK`. Superficie di sicurezza tenant auditabile in un posto solo. |
| **D** | **team.service → plugin** | Le ~1000 righe di inviti/token/email fatti a mano si **sostituiscono con le API native del plugin**. Email invito via hook `sendInvitationEmail`. | Il plugin fa nativamente ciò che `team.service` fa a mano. Meno codice, meno superficie, meno bug. |

**Confine duro della fase.** FASE 1 tocca **solo** la tenancy. Driver DB resta TCP (→ FASE 2),
deploy/queue intatti (→ FASE 3), `projects` completa (→ FASE 4), docs/branding (→ FASE 5).

---

## Sezione 2 — Ruoli

**Adottato: `owner` / `admin` / `member`** (default plugin). *(Raccomandazione del brainstorming,
confermata dall'utente. Allineato a `base/PHASE-1+2`.)*

| Ruolo | Può | Mapping dal vecchio |
|---|---|---|
| **owner** | tutto: billing, cancella org, gestisce membri | era `events.userId` implicito |
| **admin** | invita/rimuove membri, scrive risorse — **no** billing/delete-org | nuovo (più utile di `editor` per B2B) |
| **member** | scrive sulle risorse, partecipa — **no** gestione team | era `editor` |

Rimappatura `permissions.ts` (in 1c): `canManageTeam` = owner/admin · `canAccessBilling` = owner ·
write risorse = tutti e tre.

**Perché non si preserva il `viewer` read-only:** richiederebbe `createAccessControl` + access-control
statements custom **per ogni risorsa futura** (incluso `projects`). Il `viewer` nasceva per "invitati
che vedono l'evento" — dominio rimosso in FASE 0. **YAGNI**: se un progetto-figlio lo servisse,
reintrodurlo è additivo e localizzato.

---

## Sezione 3 — Mappa di decomposizione (split fine, 4 sotto-step)

Confini disegnati sulla superficie reale (poca). Asimmetrici: 1a porta il peso, 1c/1d sono leggeri.
Ogni step lascia l'app compilante; il suo checkpoint **blocca** il successivo.

```
┌─ 1a  FONDAMENTA DATI + PLUGIN  (il grosso) — DETTAGLIATO IN QUESTA SPEC
│   plugin org in auth config → auth:schema genera organization/member/invitation
│   re-add campi custom user · flip FK file.eventId→organizationId · projects minimo
│   server/repositories/ (organization/member/invitation/project) · migration · seeder
│   ✓ checkpoint: isolamento tenant verificato (query org A non vede org B)
│
├─ 1b  AUTH FLOWS + SIGNUP + TEAM  (medio) — scope delineato
│   hook signup → auto-creazione org personale (owner) + set org attiva
│   team.service → API native plugin · email invito via hook sendInvitationEmail
│   rimuove gli stub 1a riscrivendo i consumer team
│   ✓ checkpoint: signup crea org personale · invito/accept via plugin
│
├─ 1c  RBAC + MIDDLEWARE + ROUTE  (piccolo) — scope delineato
│   permissions.ts: getUserRole(eventId)→getOrgRole(orgId) su member
│   2.events.ts → 2.organization.ts (carica org attiva + ruolo in context)
│   route /api/events/* + /api/team/* → /api/organizations/*
│   ✓ checkpoint: gating per ruolo testato · 401 senza sessione · 403 cross-org
│
└─ 1d  FRONTEND  (piccolo) — scope delineato
    eventStore → organizationStore · 3 pagine event + 1 invite → equivalenti org
    2 componenti admin/home/* · useDashboard org-centric
    ✓ checkpoint: dashboard gira org-centric · typecheck verde
```

**Ordine e dipendenze:** dati prima (1a fondamenta) → signup-hook+team (1b, serve le tabelle vive) →
RBAC+route (1c, serve il modello membership di 1b) → frontend (1d, consuma le route di 1c).

---

## Sezione 4 — Sotto-step 1a in dettaglio (implementabile)

**Scope 1a:** fondamenta dati. Schema org generato, repository, migration, seeder, isolamento
verificato. **NON** in 1a: signup hook, auth flows, RBAC, route, frontend.

### Ordine di esecuzione (8 passi)

1. **Plugin org in auth config** — `server/utils/auth.ts`: aggiungi `organization({ ... })` all'array
   `plugins` (accanto a `admin()`, `twoFactor()`, `setupCreem()`). In 1a config minima: solo
   attivazione (ruoli custom/hook arrivano in 1b/1c).

2. **Genera schema** — `pnpm auth:schema` → rigenera `server/database/schema/auth.ts` con
   `organization`/`member`/`invitation`. **Qui si accerta** se `session.activeOrganizationId` finisce
   in tabella o nel KV Redis (`secondaryStorage`).

3. **Re-add campi custom user** ⚠️ — `auth:schema` **azzera** i campi custom (gotcha CLAUDE.md).
   Re-inserisci a mano in `user`: `phone`, `bio`, `timezone`. (`locale`/`tosAcceptedAt` sono in
   `additionalFields` della config → rigenerati.) Verifica il diff post-generazione.

4. **Flip FK tenant** (scritti a mano, il generatore non li tocca) — `file.ts`: `eventId →
   organizationId` (FK→`organization`). `auditLog.ts`: `eventId → organizationId` (resta nullable).

5. **Tabella `projects` minima** — `server/database/schema/projects.ts`: `id` (uuidv7),
   `organizationId` (FK NOT NULL → `organization`), `name`, `createdAt`/`updatedAt`, indice su
   `organizationId`. **Minimo per testare l'isolamento** — CRUD+service+API+pagina è FASE 4. Aggiorna
   il barrel `server/database/schema/index.ts`.

6. **Rimuovi la spina vecchia** — cancella `event.ts` schema (events/event_users/vecchia invitations)
   + `event.service.ts`. Togli `./event` dal barrel. ⚠️ Rompe `team.service.ts`, `permissions.ts`,
   `2.events.ts`, `planLimit.service.ts` (`canCreateEvent`/`canAddTeamMember`) e le route
   `/api/events/*`, `/api/team/*` → `typecheck` rosso **atteso**.
   **Strategia (decisa):** 1a **neutralizza i consumer al minimo** — stub che lanciano
   `createError({ statusCode: 501, statusMessage: 'Not implemented — phase 1b/1c' })`, *non* fail
   silenzioso. Così `typecheck` torna verde e il checkpoint isolamento è testabile. 1b/1c rimuovono
   gli stub riscrivendo davvero. *(Alternativa scartata: spostare la cancellazione di `event.ts` a
   1c → 1a coesisterebbe con due modelli tenancy e il seeder non potrebbe seminare org "pure".)*

7. **Repository** — `server/repositories/{organization,member,invitation,project}Repository.ts`:
   query Drizzle di dominio sulle tabelle generate (`findOrganizationsForUser`, `addMember`,
   `findMemberRole(orgId, userId)`, ecc.). **Regola assoluta:** ogni funzione tenant accetta
   `organizationId` e filtra per esso. Le query Drizzle vivono SOLO qui.

8. **Migration + seeder** — `pnpm db:generate` (drop events/event_users + create
   org/member/invitation/projects). `pnpm db:migrate` su DB pulito. Seeder
   (`server/database/seed/`): 1 org B2C (1 membro owner) + 1 org B2B (3 membri owner/admin/member +
   1 invitation pending) + qualche `projects` per entrambe (per testare l'isolamento). Il seeder deve
   popolare `file.organizationId`/`auditLog.organizationId` con org valide (FK).

### Error handling (1a)

- **Migration distruttiva:** drop di `events`/`event_users` irreversibile. Mitigazione: DB
  clean-slate (verificato), si rigenera da seeder. *(Su un DB con dati servirebbe backup — non è il
  caso.)*
- **`auth:schema` wipe campi custom:** rischio operativo #1 — gestito al passo 3 (re-add + diff).
- **Consumer stubbati:** stub con `501` espliciti, non fail silenzioso → un colpo accidentale a una
  route stubbata è visibile subito.
- **FK flip:** seeder popola `file.organizationId`/`auditLog.organizationId` con org valide.

### Testing / verifica (1a)

Il checkpoint È la verifica. Il test che conta — **isolamento tenant** — è manuale ma esplicito:
`projectRepository.findByOrg(orgA)` non deve mai restituire righe di `orgB`. È il requisito di
**sicurezza** non-negoziabile ("un buco qui si propaga ovunque"). I test end-to-end (signup→isolamento)
arrivano con gli auth flow in 1b; in 1a si verifica a livello repository.

### Checkpoint 1a

- [ ] `pnpm auth:schema` genera `organization`/`member`/`invitation` senza conflitti; campi custom
      user (`phone`/`bio`/`timezone`) ripristinati; accertato dove vive `activeOrganizationId`
- [ ] `pnpm db:generate` + `pnpm db:migrate` applicano su DB pulito (drop spina + create org)
- [ ] `pnpm db:seed`: 1 org B2C, 1 org B2B multi-membro, `projects` per entrambe
- [ ] `server/repositories/` esiste; **ogni** query tenant filtra per `organizationId`
- [ ] `pnpm typecheck` verde (consumer vecchi stubbati con `501`)
- [ ] **Verifica manuale isolamento:** query su `projects` di org A non restituisce mai `projects`
      di org B
- [ ] Commit: `feat: organization schema + tenant repositories (phase 1a)`

> ⚠️ Test più importante della FASE 1 (qui a livello repository, end-to-end in 1b): **utente A non
> vede mai dati di org B.** È un requisito di sicurezza.

---

## Rischi noti (portati nella spec)

| Rischio | Dove | Mitigazione |
|---|---|---|
| Schema generato diverge dai doc | 1a passo 2 | Campi esatti **confermati quando gira** `auth:schema`; il design non li dà per version-exact |
| `activeOrganizationId` in `session` vs KV | 1a passo 2 | Accertato in 1a col `secondaryStorage` Redis reale |
| `auth:schema` azzera phone/bio/timezone | 1a passo 3 | Re-add manuale + diff (gotcha CLAUDE.md) |
| `sharp-wasm32` build error | build | Pre-esistente (CLAUDE.md), non introdotto da 1a |

---

## Cosa esplicitamente NON copre questa spec

- **1b/1c/1d in dettaglio** — solo scope delineati (Sezione 3). Ognuno prende il suo ciclo
  `brainstorming → writing-plans` quando ci si arriva.
- **Driver Neon HTTP** → FASE 2.
- **Deploy Vercel + QStash/Cron** → FASE 3.
- **`projects` CRUD completo (service+API+pagina)** → FASE 4.
- **Docs/branding/README/i18n marketing** → FASE 5.

---

## Commit della fase (manuali — li fa l'utente)

- 1a: `feat: organization schema + tenant repositories (phase 1a)`
- 1b: `feat: auth flows + auto org creation + team via plugin (phase 1b)`
- 1c: `feat: org-based RBAC, middleware and routes (phase 1c)`
- 1d: `feat: org-centric frontend (phase 1d)`

> A FASE 1 chiusa, IMPLEMENTATION.md riga 139 prevede il commit-ombrello
> `feat: organization-based multi-tenancy` — qui realizzato come 4 commit verificabili.
