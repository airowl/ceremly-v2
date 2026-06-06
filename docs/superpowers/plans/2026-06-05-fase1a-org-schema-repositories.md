# FASE 1a — Organization schema + tenant repositories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire lo schema tenancy event-based con le tabelle generate dal plugin organization di Better Auth, introdurre il layer repository org-scoped, e verificare l'isolamento tenant — lasciando il codebase compilante (consumer event-based neutralizzati, da riscrivere in 1b/1c).

**Architecture:** Le tabelle `organization`/`member`/`invitation` le **genera `pnpm auth:schema`** in `server/database/schema/auth.ts` (non scritte a mano). A mano si scrivono solo: la tabella dominio `projects`, il flip delle FK tenant (`file`/`auditLog` da `eventId` a `organizationId`), e i repository in `server/repositories/`. La vecchia spina (`event.ts` schema + `event.service.ts`) viene cancellata; i suoi consumer (servizi, middleware, route) vengono neutralizzati con stub `501` o cancellati, e verranno riscritti in 1b/1c. L'isolamento tenant si verifica con uno script `tsx` (stesso pattern di `db:seed`/`db:reset`), non con un framework di test.

**Tech Stack:** Nuxt 4, Drizzle ORM (PostgreSQL), Better Auth v1.4.5 (+ plugin organization), `tsx` per gli script, `uuid` (v7).

---

## Precondizioni di esecuzione (LEGGERE PRIMA)

- **Postgres raggiungibile e vuoto.** Ogni gate (`auth:schema`, `db:generate`, `db:migrate`, `db:seed`, `verify-isolation`) richiede un Postgres vivo con `NUXT_DATABASE_URL` (e opzionalmente `NUXT_DATABASE_URL_DIRECT` per le migration DDL) impostate in `.env`. Il DB è **clean-slate** (nessun dato reale): la migration è drop+recreate, non migrazione dati. Se manca il DB, i comandi falliscono e la verifica diventa fittizia.
- **Working tree pulito su `main`** (FASE 0 committata, branch `main`). Ogni task termina con un commit.
- **`pnpm` come package manager.** Comandi dalla radice del repo.
- **Distinzione critica su `auth.ts`** (ricorre nei Task 2-3): `pnpm auth:schema` rigenera `server/database/schema/auth.ts` da zero. Questo ha **due effetti opposti** da trattare diversamente:
  1. I campi custom utente (`phone`, `bio`, `timezone`) vengono **cancellati → si RI-AGGIUNGONO**.
  2. La relation `user → events: many(events)` + `import { events }` viene **cancellata → NON si ri-aggiunge** (la tabella `events` viene eliminata nel Task 8). Le relations org (`members`, `invitations`) devono comparire generate dal plugin.

---

## File Structure

**Creati:**
- `server/database/schema/projects.ts` — tabella dominio d'esempio (org-scoped), minima (CRUD completo → FASE 4)
- `server/repositories/organizationRepository.ts` — query Drizzle su `organization`
- `server/repositories/memberRepository.ts` — query Drizzle su `member`
- `server/repositories/invitationRepository.ts` — query Drizzle su `invitation`
- `server/repositories/projectRepository.ts` — query Drizzle su `projects` (org-scoped, per il test isolamento)
- `server/database/seed/index.ts` — seeder (`pnpm db:seed` lo richiede; oggi manca)
- `server/database/seed/verify-isolation.ts` — script `tsx` che asserisce l'isolamento tenant

**Modificati (a mano):**
- `server/utils/auth.ts` — aggiunge `organization()` ai plugin
- `server/database/schema/auth.ts` — rigenerato da `auth:schema`; poi ri-add campi user + rimozione relation events
- `server/database/schema/file.ts` — FK `eventId` → `organizationId`
- `server/database/schema/auditLog.ts` — colonna `eventId` → `organizationId` (nullable, no FK)
- `server/database/schema/index.ts` — barrel: rimuove `./event`, aggiunge `./projects`
- `server/services/planLimit.service.ts` — neutralizza `canCreateEvent`/`canAddTeamMember`/conteggi event
- `server/api/admin/stats/index.get.ts` — stub conteggio events (→ 1c lo ripunta a org)
- `server/api/admin/users/[id].get.ts` — stub lista events (→ 1c)
- `server/middleware/2.events.ts` — neutralizzato (→ 1c lo sostituisce con `2.organization.ts`)

**Cancellati:**
- `server/database/schema/event.ts` — la vecchia spina (events/eventUsers/invitations + relations)
- `server/services/event.service.ts` — CRUD event
- `server/services/team.service.ts` — sostituito dal plugin in 1b
- `server/utils/permissions.ts` — RBAC event-scoped (→ 1c lo riscrive su org)
- `server/api/events/index.get.ts`, `index.post.ts`, `[eventId].get.ts`, `[eventId].put.ts`, `[eventId].delete.ts` — route base (non importate da nulla → si cancellano)
- `server/api/team/` (intera cartella, 8 file) — sostituita dal plugin in 1b

> **Stub vs delete (regola di consistenza):** ciò che è **importato da altro codice** (servizi, schema, middleware, la relation in `auth.ts`) si **neutralizza con stub `501`/rimozione-import** per tenere `typecheck` verde. Gli **endpoint route** (`/api/events/*`, `/api/team/*`) non sono importati da nulla → si **cancellano** direttamente. `permissions.ts`/`team.service.ts`/`event.service.ts` non hanno consumer residui dopo aver cancellato le route che li usano → si **cancellano**.

---

## Task 1: Aggiungi il plugin organization alla config Better Auth

**Files:**
- Modify: `server/utils/auth.ts:215-225` (array `plugins`)

- [ ] **Step 1: Importa `organization` e aggiungilo ai plugin**

In `server/utils/auth.ts`, alla riga 6 l'import dei plugin è:
```ts
import { admin, openAPI, twoFactor } from "better-auth/plugins";
```
Aggiungi `organization`:
```ts
import { admin, openAPI, organization, twoFactor } from "better-auth/plugins";
```

Nell'array `plugins` (righe 215-225), aggiungi `organization()` dopo `admin()`:
```ts
        plugins: [
            ...(runtimeConfig.public.appEnv === "development"
                ? [openAPI()]
                : []),
            admin(),
            organization(),
            twoFactor({
                issuer: runtimeConfig.public.appName || "SaaS App",
                backupCodeOptions: { amount: 10 },
            }),
            setupCreem(),
        ],
```

> Config minima in 1a: solo attivazione. Ruoli custom, `sendInvitationEmail` e hook signup→org arrivano in 1b/1c.

- [ ] **Step 2: Verifica che il typecheck regga l'import**

Run: `pnpm typecheck`
Expected: PASS (l'import esiste; nessun nuovo errore introdotto da questa riga). Se compaiono errori, sono pre-esistenti o relativi a `event.ts` che si risolveranno nei task successivi — annotali ma non bloccarti qui se riguardano `events`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/auth.ts
git commit -m "feat: enable better-auth organization plugin (phase 1a)"
```

---

## Task 2: Genera lo schema org con auth:schema e verifica il diff

**Files:**
- Modify: `server/database/schema/auth.ts` (rigenerato dal comando)

- [ ] **Step 1: Esegui il generatore**

Run: `pnpm auth:schema`
Expected: il comando scrive `server/database/schema/auth.ts` rigenerato, includendo le tabelle `organization`, `member`, `invitation` (oltre a `user`/`session`/`account`/`verification`/`two_factor`).

- [ ] **Step 2: Ispeziona il diff — è il GATE di questo task**

Run: `git diff server/database/schema/auth.ts`

Conferma **tutte e tre** le condizioni:
1. **Tabelle org presenti:** compaiono `export const organization`, `export const member`, `export const invitation` (PostgreSQL `pgTable`).
2. **Campi custom user CANCELLATI:** `phone`, `bio`, `timezone` NON sono più nella tabella `user` (li ri-aggiunge il Task 3). *(Nota: `locale` e `tosAcceptedAt` sono in `additionalFields` della config → rigenerati automaticamente, restano.)*
3. **Relation events CANCELLATA:** l'`import { events } from "./event"` (era riga ~106) e `events: many(events)` nelle `userRelations` (era riga ~112) NON ci sono più. **Questo è corretto e voluto** — `events` viene eliminata nel Task 8, quindi NON va ri-aggiunta.

> ⚠️ Se per qualche motivo il generatore avesse PRESERVATO l'import/relation `events`, rimuovili a mano ora (sono righe verso la fine del file, nel blocco `userRelations`), perché punterebbero a una tabella che cancelleremo.

- [ ] **Step 3: Accerta dove vive `activeOrganizationId`**

Nel diff, controlla la tabella `session`: il plugin org può aggiungere la colonna `activeOrganizationId` (e `activeTeamId` se i teams fossero abilitati — non lo sono). Annota nel commit message quale dei due casi è vero (colonna presente in `session`, oppure assente → l'org attiva vive nel `secondaryStorage` Redis). Questo fatto serve a 1b.

- [ ] **Step 4: Commit (parziale — campi user ancora da ripristinare nel Task 3)**

Non committare ancora da solo: il Task 3 completa `auth.ts`. Procedi direttamente al Task 3, poi committi insieme.

---

## Task 3: Ri-aggiungi i campi custom utente a auth.ts

**Files:**
- Modify: `server/database/schema/auth.ts` (tabella `user`)

- [ ] **Step 1: Re-inserisci `phone`, `bio`, `timezone` nella tabella `user`**

Nel blocco `export const user = pgTable("user", { ... })`, aggiungi le tre colonne custom (text, nullable) accanto agli altri campi. Esempio (allinea allo stile delle colonne generate adiacenti):
```ts
  phone: text("phone"),
  bio: text("bio"),
  timezone: text("timezone"),
```

> Questo è il gotcha documentato in CLAUDE.md: `auth:schema` azzera i campi custom. `locale`/`tosAcceptedAt` NON vanno qui (sono in `additionalFields`, già rigenerati).

- [ ] **Step 2: Verifica typecheck**

Run: `pnpm typecheck`
Expected: gli errori residui riguardano SOLO `event.ts`/`events` (consumer ancora presenti) — quelli si risolvono nei Task 6-8. Nessun errore deve riguardare `phone`/`bio`/`timezone` mancanti (es. in `user.service.ts` o nei tipi `User`).

- [ ] **Step 3: Commit**

```bash
git add server/database/schema/auth.ts
git commit -m "feat: generate organization schema, re-add custom user fields (phase 1a)"
```

---

## Task 4: Crea la tabella dominio `projects`

**Files:**
- Create: `server/database/schema/projects.ts`

- [ ] **Step 1: Scrivi la tabella `projects` (minima, org-scoped)**

```ts
import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { organization } from "./auth";

/**
 * Example domain table — multi-tenant pattern reference.
 * Ogni risorsa di dominio futura si modella così: organizationId NOT NULL + indice.
 * CRUD completo (service + API + pagina) → FASE 4. Qui solo lo schema per testare l'isolamento.
 */
export const projects = pgTable(
    "projects",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        createdAt: timestamp("created_at").defaultNow().notNull(),
        updatedAt: timestamp("updated_at")
            .defaultNow()
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("projects_organization_id_idx").on(table.organizationId),
    ],
);

export const projectsRelations = relations(projects, ({ one }) => ({
    organization: one(organization, {
        fields: [projects.organizationId],
        references: [organization.id],
    }),
}));
```

> `organization` è esportata da `./auth` (generata nel Task 2). PK `text` + `uuidv7` per coerenza con le tabelle Better Auth (config usa `generateId: uuidv7`).

- [ ] **Step 2: Verifica che l'import `organization` risolva**

Run: `pnpm typecheck`
Expected: nessun errore su `projects.ts` (l'import `organization` da `./auth` esiste). Errori residui solo su `events`.

- [ ] **Step 3: Commit**

```bash
git add server/database/schema/projects.ts
git commit -m "feat: add example projects domain table (phase 1a)"
```

---

## Task 5: Flippa le FK tenant in file.ts e auditLog.ts

**Files:**
- Modify: `server/database/schema/file.ts:5,22,29,40-43`
- Modify: `server/database/schema/auditLog.ts:7,19`

- [ ] **Step 1: `file.ts` — da `eventId`→`events` a `organizationId`→`organization`**

Sostituisci l'import (riga 5):
```ts
import { events } from './event'
```
con:
```ts
import { organization } from './auth'
```

Sostituisci la colonna (riga 22):
```ts
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
```
con:
```ts
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
```

Sostituisci l'indice (riga 29):
```ts
  index('file_event_id_idx').on(table.eventId),
```
con:
```ts
  index('file_organization_id_idx').on(table.organizationId),
```

Sostituisci la relation (righe 40-43) nel blocco `fileRelations`:
```ts
  event: one(events, {
    fields: [file.eventId],
    references: [events.id]
  }),
```
con:
```ts
  organization: one(organization, {
    fields: [file.organizationId],
    references: [organization.id]
  }),
```

- [ ] **Step 2: `auditLog.ts` — colonna `eventId`→`organizationId` (nullable, no FK)**

Sostituisci la colonna (riga 7):
```ts
  eventId: text('event_id'),
```
con:
```ts
  organizationId: text('organization_id'),
```

Sostituisci l'indice (riga 19):
```ts
  index('audit_log_event_id_idx').on(table.eventId),
```
con:
```ts
  index('audit_log_organization_id_idx').on(table.organizationId),
```

> `auditLog` non ha FK su `eventId` (è una colonna nuda) — il flip è solo rinomina colonna+indice. Resta nullable.

- [ ] **Step 3: Verifica typecheck del flip**

Run: `pnpm typecheck`
Expected: `file.ts` e `auditLog.ts` non riferiscono più `events`. **Ma** i consumer che usano `file.eventId`/`auditLog.eventId` (es. `file/fileService.ts`, `logAudit`) ora rompono → li gestisce lo Step 4.

- [ ] **Step 4: Aggiorna i consumer della colonna rinominata (lista enumerata, verificata)**

Il flip della **colonna** rompe solo i punti che scrivono/leggono `fileTable.eventId` e `auditLog.eventId`. **Nessun call-site di `logAudit` passa `eventId`** (tutti erano in `team.service.ts`/`event.service.ts`, cancellati al Task 7 — verificato con grep). Decisione di design: **taglio minimo** — rinomina solo i punti-colonna; il *parametro funzionale* `eventId` di `fileService` resta invariato (è un id-tenant opaco che ora scrive nella colonna `organization_id`; la sua rinomina cosmetica → quando file diventa org-aware in 1c/FASE 4). Lo storage key `evt/{eventId}/...` resta (è solo una stringa di path).

**A) `server/utils/audit/types.ts:112`** — rinomina la chiave del tipo opts:
```ts
  organizationId?: string
```
(era `eventId?: string`)

**B) `server/utils/audit/index.ts:44`** — rinomina il mapping all'insert:
```ts
      organizationId: opts?.organizationId,
```
(era `eventId: opts?.eventId`)

**C) `server/services/file/fileService.ts`** — i 4 punti che toccano `fileTable.eventId` (la colonna, ora `organizationId`). Le firme/parametri `eventId?` restano; cambia solo il riferimento alla colonna:
- riga ~85: `conditions.push(eq(fileTable.organizationId, eventId))`
- riga ~88: `conditions.push(eq(fileTable.organizationId, ''))`
- riga ~159: `organizationId: eventId || null,` (nell'oggetto `fileData` di `uploadFile`)
- riga ~245: `organizationId: eventId || null,` (in `generateAndStoreVariants`)
- riga ~292: `organizationId: eventId || null,` (in `confirmPendingUpload`)

> Le righe `pendingFile.eventId` (413, 448) leggono dal **record** ritornato da Drizzle: dopo il flip il campo del record si chiama `organizationId` → diventano `pendingFile.organizationId ?? undefined`.

Run: `pnpm typecheck`
Expected: nessun errore residuo su `eventId` in `file`/`auditLog`/`audit`. Errori solo su `events` (la tabella, Task 6-8).

- [ ] **Step 5: Commit**

```bash
git add server/database/schema/file.ts server/database/schema/auditLog.ts server/utils/audit/types.ts server/utils/audit/index.ts server/services/file/fileService.ts
git commit -m "refactor: flip file/auditLog tenant FK from event to organization (phase 1a)"
```

---

## Task 6: Neutralizza i consumer event-based (servizi, middleware, route admin/limits)

**Files:**
- Modify: `server/services/planLimit.service.ts`
- Modify: `server/api/admin/stats/index.get.ts`
- Modify: `server/api/admin/users/[id].get.ts`
- Modify: `server/middleware/2.events.ts`

> Questo task neutralizza ciò che **resterà importato** dopo il Task 7-8. Strategia: tutto ciò che conta risorse-event ritorna `0`/stub `501`; la riscrittura org-aware è 1b/1c. Stub espliciti, mai fail silenzioso.

- [ ] **Step 1: `planLimit.service.ts` — neutralizza le funzioni event-based**

Le funzioni `countUserEvents`, `countEventMembers`, `countPendingInvitations`, `countReservedSlots`, `canCreateEvent`, `canAddTeamMember` interrogano `schema.events`/`schema.eventUsers`/`schema.invitations` (che cadono nel Task 8). Sostituisci i loro **corpi** con stub che ritornano valori neutri, mantenendo le firme (così i consumer — `limits/index.get.ts`, ecc. — compilano):

Per `countUserEvents(userId)`:
```ts
export async function countUserEvents(_userId: string): Promise<number> {
    // STUB phase 1a — sostituito da countUserOrganizations in 1c
    return 0;
}
```

Per `canCreateEvent(userId)` (mantieni la shape del return):
```ts
export async function canCreateEvent(userId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    // STUB phase 1a — diventa canCreateOrganization in 1c
    const effectiveInfo = await getEffectiveLimits(userId);
    return { allowed: true, current: 0, limit: effectiveInfo.limits.max_events, plan: effectiveInfo.plan };
}
```

Per `countEventMembers`, `countPendingInvitations`, `countReservedSlots` (rimuovi le query su `schema.eventUsers`/`schema.invitations`, ritorna `0`):
```ts
export async function countEventMembers(_eventId: string): Promise<number> { return 0; }
export async function countPendingInvitations(_eventId: string): Promise<number> { return 0; }
export async function countReservedSlots(_eventId: string): Promise<number> { return 0; }
```

Per `canAddTeamMember(eventOwnerId, eventId)`:
```ts
export async function canAddTeamMember(
    eventOwnerId: string,
    _eventId: string
): Promise<{ allowed: boolean; current: number; limit: number; plan: PlanName }> {
    // STUB phase 1a — diventa membership org check in 1c
    const effectiveInfo = await getEffectiveLimits(eventOwnerId);
    return { allowed: true, current: 0, limit: effectiveInfo.limits.team_members, plan: effectiveInfo.plan };
}
```

> Tieni invariati `getUserPlan`/`getEffectiveLimits`/`getPlanFromProductId` (non toccano events).

- [ ] **Step 2: `admin/stats/index.get.ts` — azzera i conteggi event**

Le righe che fanno `db.select({count}).from(schema.events)` (righe ~47-50) rompono col drop di `events`. Sostituiscile con conteggi a `0` e un commento `// STUB phase 1a → org in 1c`:
```ts
    const totalEvents = { count: 0 }; // STUB phase 1a → totalOrganizations in 1c
    const recentEvents = { count: 0 }; // STUB phase 1a
```
Adatta i nomi alle variabili reali del file e rimuovi gli `import`/`from(schema.events)` ora morti.

- [ ] **Step 3: `admin/users/[id].get.ts` — stub lista eventi utente**

La query su `schema.eventUsers`/`schema.events` (righe ~74-82) rompe. Sostituisci con array vuoto:
```ts
    const events: Array<{ id: string; name: string; role: string; userId: string }> = []; // STUB phase 1a → organizations in 1c
```
Rimuovi la query Drizzle morta e gli import relativi.

- [ ] **Step 4: `2.events.ts` — neutralizza il middleware**

Il middleware carica `userEvent`/`eventAccess` da `events` e importa `getUserRole` da `permissions.ts` (che cancelliamo nel Task 7). Sostituisci l'intero corpo con un no-op che lascia passare (la protezione org-scoped la fa `2.organization.ts` in 1c):
```ts
/**
 * STUB phase 1a — il middleware event-scoped è disattivato.
 * 1c lo sostituisce con 2.organization.ts (carica org attiva + ruolo in context).
 */
export default defineEventHandler(() => {
    // no-op: nessun caricamento event-context in 1a
});
```
Rimuovi tutti gli import ora inutilizzati (`events`, `getUserRole`, `getDB`, `requireAuth`, drizzle ops).

- [ ] **Step 5: Verifica typecheck (resteranno errori solo su event.ts non ancora cancellato)**

Run: `pnpm typecheck`
Expected: gli errori residui riguardano l'`event.service.ts`/`permissions.ts`/`team.service.ts`/route `/api/events`/`/api/team` ancora presenti — eliminati nei Task 7-8.

- [ ] **Step 6: Commit**

```bash
git add server/services/planLimit.service.ts server/api/admin/ server/middleware/2.events.ts
git commit -m "refactor: stub event-based consumers (admin, limits, middleware) for org migration (phase 1a)"
```

---

## Task 7: Cancella i file event-based senza consumer residui

**Files:**
- Delete: `server/services/event.service.ts`
- Delete: `server/services/team.service.ts`
- Delete: `server/utils/permissions.ts`
- Delete: `server/utils/event.ts` (re-export di backwards-compat da `event.service.ts` — `requireEventOwnership`/`generateEventSlug`; zero consumer residui, verificato in esecuzione → cade con event.service)
- Delete: `server/api/events/` (5 file)
- Delete: `server/api/team/` (8 file)

- [ ] **Step 1: Cancella le route (non importate da nulla)**

```bash
git rm -r server/api/events server/api/team
```

- [ ] **Step 2: Verifica che nulla importi ancora i servizi/permissions che stai per cancellare**

Run: `grep -rln "event.service\|team.service\|utils/permissions\|getUserRole\|requireMember\|requireWrite\|requireOwner" server/ app/ | grep -v node_modules`
Expected: nessun hit **fuori** dai file che stai cancellando. Se compaiono hit in file TENUTI (es. un'altra route admin), neutralizzali con lo stesso pattern del Task 6 prima di procedere.

- [ ] **Step 3: Cancella servizi e permissions**

```bash
git rm server/services/event.service.ts server/services/team.service.ts server/utils/permissions.ts
```

- [ ] **Step 4: Verifica typecheck**

Run: `pnpm typecheck`
Expected: gli unici errori residui riguardano ora `server/database/schema/event.ts` ancora presente nel barrel `index.ts` (Task 8) e i tipi `EventListItem`/`EventDetail` se referenziati dal frontend (`eventStore` — quello è 1d; se rompe il typecheck globale, lasciane lo stub: vedi nota Task 8 Step 4).

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor: delete event service, team service, event-scoped RBAC and routes (phase 1a)"
```

---

## Task 8: Cancella event.ts, aggiorna il barrel, genera la migration

**Files:**
- Delete: `server/database/schema/event.ts`
- Modify: `server/database/schema/index.ts`

- [ ] **Step 1: Aggiorna il barrel `index.ts`**

In `server/database/schema/index.ts`, rimuovi l'ultima riga:
```ts
export * from './event'
```
e aggiungi:
```ts
export * from './projects'
```
Il barrel risultante esporta: auditLog, auth, contactMessage, dataExport, file, userCustomLimits, waitingList, **projects** (non più event).

- [ ] **Step 2: Cancella lo schema event**

```bash
git rm server/database/schema/event.ts
```

- [ ] **Step 3: Verifica typecheck — deve diventare VERDE (modulo frontend)**

Run: `pnpm typecheck`
Expected sul layer **server**: PASS. Se restano errori, sono nel frontend (`app/`) che referenzia `eventStore`/tipi event → quello è 1d.

- [ ] **Step 4: Se il typecheck globale rompe sul frontend, stub minimale (NON riscrittura — è 1d)**

Se `app/stores/eventStore.ts` o le pagine event rompono il typecheck globale: NON riscriverle qui (è 1d). Opzioni minime per sbloccare:
- Lascia `eventStore.ts` com'è se i tipi `EventListItem`/`EventDetail` sono definiti localmente nello store (non importati da `event.ts`) → potrebbe già compilare.
- Se importa tipi da schema `event` cancellato, definisci i tipi inline nello store con un commento `// TODO 1d` (stub di tipo, non di logica).

Annota: la conversione vera di `eventStore`→`organizationStore` è 1d (vedi `...fase1d-frontend-design.md`).

- [ ] **Step 5: Genera la migration**

Run: `pnpm db:generate`
Expected: Drizzle Kit genera una nuova migration in `drizzle/migrations/` con: DROP `events`/`event_users`/`invitations`; CREATE `organization`/`member`/`invitation`/`projects`; ALTER `file` (rename event_id→organization_id + FK) + `audit_log` (rename event_id→organization_id); eventuale ALTER `session` (+activeOrganizationId). Rivedi l'SQL generato: conferma che il DROP delle 3 tabelle event e il CREATE delle tabelle org ci siano.

- [ ] **Step 6: Commit**

```bash
git add server/database/schema/index.ts drizzle/migrations/
git commit -m "feat: drop event spine, generate organization migration (phase 1a)"
```

---

## Task 9: Applica la migration e scrivi il seeder

**Files:**
- Create: `server/database/seed/index.ts`

- [ ] **Step 1: Applica la migration su DB pulito**

Run: `pnpm db:migrate`
Expected: la migration applica senza errori, in ordine: `0000` (schema Ceremly originale) poi `0001` (la transform org). Le tabelle `events`/`event_users` non esistono più; `organization`/`member`/`invitation`/`projects` esistono.

> ⚠️ **Precondizioni per `db:migrate`:**
> - Il `.env` deve avere un `NUXT_DATABASE_URL` **reale** (il `.env` attuale ha un placeholder fittizio creato per `auth:schema` — va sostituito). Conferma di non puntare a un Postgres locale non voluto su 5432.
> - Il DB deve essere **genuinamente vuoto** così `0000` crea le tabelle che `0001` poi droppa/trasforma. I `DROP` di `0001` assumono che `0000` le abbia create.
> - **Fallback NON banale:** `pnpm db:reset` fa `DROP SCHEMA public CASCADE` + `CREATE SCHEMA` + **`pnpm db:push`** (sync diretto schema→DB, **bypassa le migration**). Quindi `reset` NON testa le migration `0000→0001`: porta il DB allo schema finale via push. Per testare le migration vere: svuota lo schema (`db:reset` o drop manuale) e poi `db:migrate` (non lasciare che `reset` faccia il push). Leggi `server/database/seed/reset.ts` prima di affidartici.

- [ ] **Step 2: Scrivi il seeder**

`pnpm db:seed` punta a `server/database/seed/index.ts` (oggi manca). Crea lo script che semina con **insert Drizzle dirette via `schema.*`** (un seeder scrive dati, non passa dai repository read-oriented del Task 10 — i due task sono indipendenti, nessun ordine vincolato tra 9 e 10). Contenuto: 1 org B2C (1 owner) + 1 org B2B (owner+admin+member + 1 invitation pending) + projects per entrambe.

```ts
import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { v7 as uuidv7 } from "uuid";
import { getDB } from "../../utils/db";
import * as schema from "../schema";

async function seed() {
    const db = getDB();
    console.log("[seed] start");

    // --- utenti (le password/auth reali si creano via signup; qui solo righe user per FK) ---
    const userB2C = uuidv7();
    const userOwner = uuidv7();
    const userAdmin = uuidv7();
    const userMember = uuidv7();
    await db.insert(schema.user).values([
        { id: userB2C, name: "B2C Owner", email: "b2c@example.com", emailVerified: true },
        { id: userOwner, name: "B2B Owner", email: "owner@example.com", emailVerified: true },
        { id: userAdmin, name: "B2B Admin", email: "admin@example.com", emailVerified: true },
        { id: userMember, name: "B2B Member", email: "member@example.com", emailVerified: true },
    ]);

    // --- org B2C (1 membro owner) ---
    const orgB2C = uuidv7();
    await db.insert(schema.organization).values({ id: orgB2C, name: "Personal Org", slug: "personal-org", createdAt: new Date() });
    await db.insert(schema.member).values({ id: uuidv7(), organizationId: orgB2C, userId: userB2C, role: "owner", createdAt: new Date() });

    // --- org B2B (3 membri + 1 invito pending) ---
    const orgB2B = uuidv7();
    await db.insert(schema.organization).values({ id: orgB2B, name: "Team Org", slug: "team-org", createdAt: new Date() });
    await db.insert(schema.member).values([
        { id: uuidv7(), organizationId: orgB2B, userId: userOwner, role: "owner", createdAt: new Date() },
        { id: uuidv7(), organizationId: orgB2B, userId: userAdmin, role: "admin", createdAt: new Date() },
        { id: uuidv7(), organizationId: orgB2B, userId: userMember, role: "member", createdAt: new Date() },
    ]);
    await db.insert(schema.invitation).values({
        id: uuidv7(), organizationId: orgB2B, email: "invitee@example.com", inviterId: userOwner,
        role: "member", status: "pending", expiresAt: new Date(Date.now() + 7 * 864e5),
    });

    // --- projects per testare l'isolamento ---
    await db.insert(schema.projects).values([
        { id: uuidv7(), organizationId: orgB2C, name: "B2C Project 1" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 1" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 2" },
    ]);

    console.log(`[seed] done — orgB2C=${orgB2C} orgB2B=${orgB2B}`);
    process.exit(0);
}

seed().catch((e) => { console.error("[seed] failed", e); process.exit(1); });
```

> ⚠️ Allinea i nomi dei campi (`member.role`, `invitation.inviterId`, ecc.) a quelli **effettivamente generati** nel Task 2 (verifica nel `git diff` di `auth.ts`). Se il plugin ha generato `inviterId` vs un altro nome, usa il nome reale.

- [ ] **Step 3: Esegui il seeder**

Run: `pnpm db:seed`
Expected: stampa `[seed] done — orgB2C=... orgB2B=...`, exit 0. Se viola una FK o un nome colonna, correggi allineando allo schema generato.

- [ ] **Step 4: Commit**

```bash
git add server/database/seed/index.ts
git commit -m "feat: seeder with B2C + B2B organizations (phase 1a)"
```

---

## Task 10: Scrivi i repository org-scoped

**Files:**
- Create: `server/repositories/organizationRepository.ts`
- Create: `server/repositories/memberRepository.ts`
- Create: `server/repositories/invitationRepository.ts`
- Create: `server/repositories/projectRepository.ts`

> **Regola assoluta:** ogni funzione che tocca risorse tenant accetta `organizationId` e filtra per esso. Le query Drizzle su queste tabelle vivono SOLO qui.

- [ ] **Step 1: `organizationRepository.ts`**

```ts
import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findOrganizationById(organizationId: string) {
    const db = getDB();
    const rows = await db.select().from(schema.organization)
        .where(eq(schema.organization.id, organizationId)).limit(1);
    return rows[0] ?? null;
}

export async function findOrganizationsForUser(userId: string) {
    const db = getDB();
    return db.select({
        id: schema.organization.id,
        name: schema.organization.name,
        slug: schema.organization.slug,
        role: schema.member.role,
    })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(eq(schema.member.userId, userId));
}
```

- [ ] **Step 2: `memberRepository.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findMembers(organizationId: string) {
    const db = getDB();
    return db.select().from(schema.member)
        .where(eq(schema.member.organizationId, organizationId));
}

export async function findMemberRole(organizationId: string, userId: string): Promise<string | null> {
    const db = getDB();
    const rows = await db.select({ role: schema.member.role }).from(schema.member)
        .where(and(eq(schema.member.organizationId, organizationId), eq(schema.member.userId, userId)))
        .limit(1);
    return rows[0]?.role ?? null;
}
```

- [ ] **Step 3: `invitationRepository.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findPendingInvitations(organizationId: string) {
    const db = getDB();
    return db.select().from(schema.invitation)
        .where(and(
            eq(schema.invitation.organizationId, organizationId),
            eq(schema.invitation.status, "pending"),
        ));
}
```

- [ ] **Step 4: `projectRepository.ts` (org-scoped — base del test isolamento)**

```ts
import { eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";

export async function findProjectsByOrg(organizationId: string) {
    const db = getDB();
    return db.select().from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId));
}
```

- [ ] **Step 5: Verifica typecheck**

Run: `pnpm typecheck`
Expected: PASS sul layer server. Allinea i nomi colonna (`member.role`, `invitation.status`/`organizationId`) a quelli reali generati nel Task 2 se il typecheck segnala mismatch.

- [ ] **Step 6: Commit**

```bash
git add server/repositories/
git commit -m "feat: org-scoped tenant repositories (phase 1a)"
```

---

## Task 11: Verifica l'isolamento tenant (il gate di sicurezza della fase)

**Files:**
- Create: `server/database/seed/verify-isolation.ts`

- [ ] **Step 1: Scrivi lo script di verifica isolamento**

```ts
import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { findProjectsByOrg } from "../../repositories/projectRepository";
import { getDB } from "../../utils/db";
import * as schema from "../schema";

async function main() {
    const db = getDB();

    // prendi le due org seminate
    const orgs = await db.select({ id: schema.organization.id, slug: schema.organization.slug })
        .from(schema.organization);
    const b2c = orgs.find((o) => o.slug === "personal-org");
    const b2b = orgs.find((o) => o.slug === "team-org");
    if (!b2c || !b2b) throw new Error("seed mancante: esegui `pnpm db:seed` prima");

    const projB2C = await findProjectsByOrg(b2c.id);
    const projB2B = await findProjectsByOrg(b2b.id);

    // INVARIANTE: la query org A non restituisce MAI righe di org B
    const leakInB2C = projB2C.filter((p) => p.organizationId !== b2c.id);
    const leakInB2B = projB2B.filter((p) => p.organizationId !== b2b.id);

    let failed = false;
    if (leakInB2C.length > 0) { console.error(`[FAIL] projects di B2C contengono righe non-B2C:`, leakInB2C); failed = true; }
    if (leakInB2B.length > 0) { console.error(`[FAIL] projects di B2B contengono righe non-B2B:`, leakInB2B); failed = true; }
    if (projB2C.length === 0 || projB2B.length === 0) { console.error(`[FAIL] una delle due org ha 0 projects — seed incompleto`); failed = true; }

    if (failed) { console.error("[verify-isolation] ISOLAMENTO VIOLATO"); process.exit(1); }
    console.log(`[verify-isolation] OK — B2C=${projB2C.length} projects, B2B=${projB2B.length} projects, nessun leak cross-tenant`);
    process.exit(0);
}

main().catch((e) => { console.error("[verify-isolation] errore", e); process.exit(1); });
```

- [ ] **Step 2: Esegui — è il GATE di sicurezza**

Run: `npx tsx server/database/seed/verify-isolation.ts`
Expected: `[verify-isolation] OK — B2C=1 projects, B2B=2 projects, nessun leak cross-tenant`, exit 0.

> Se exit 1: l'isolamento è rotto — NON procedere, è il requisito di sicurezza non-negoziabile della fase. Indaga il repository (filtro `organizationId` mancante?) prima di committare.

- [ ] **Step 3: (opzionale) aggiungi lo script a package.json**

In `package.json`, sezione `scripts`, aggiungi:
```json
    "db:verify-isolation": "npx tsx server/database/seed/verify-isolation.ts",
```

- [ ] **Step 4: Commit**

```bash
git add server/database/seed/verify-isolation.ts package.json
git commit -m "test: tenant isolation verification script (phase 1a)"
```

---

## Checkpoint finale 1a (rispecchia la spec)

Esegui in sequenza e conferma ognuno verde. **Gate vincolanti** (devono passare):

- [ ] `git diff` mostra: `auth.ts` con org/member/invitation generate, campi user ripristinati, relation events RIMOSSA
- [ ] `pnpm typecheck` → PASS (server; eventuali stub di tipo frontend annotati `// TODO 1d`)
- [ ] `pnpm db:migrate` → applica su DB pulito (drop spina event + create org)
- [ ] `pnpm db:seed` → 1 org B2C, 1 org B2B multi-membro, projects per entrambe
- [ ] `npx tsx server/database/seed/verify-isolation.ts` → OK, nessun leak cross-tenant

**Gate best-effort** (non vincolante):

- [ ] `pnpm build` → tentato. ⚠️ Il `sharp-wasm32` è un **errore di build pre-esistente** (CLAUDE.md): se `build` fallisce, conferma che il fallimento sia **solo** `sharp-wasm32` e identico alla baseline pre-1a (`git stash` + build su `main` per confronto, se serve). Un fallimento diverso (es. su `events`/`organization`) È una regressione di 1a → indaga. Non bloccare il checkpoint su un fallimento sharp-wasm32 confermato pre-esistente.

I commit per-task (Task 1-11) sono già granulari; non serve un commit finale aggiuntivo.

> ⚠️ Il test che conta: **query su projects di org A non restituisce mai projects di org B** (Task 11). È il requisito di sicurezza su cui poggia tutta la FASE 1.

---

## ⚠️ Requisito di sicurezza #1 per 1c (dalla code review finale 1a)

I repository org-keyed (`findOrganizationById(orgId)`, `findMembers(orgId)`, `findPendingInvitations(orgId)`) sono **lookup puri per `organizationId`**: dato un `orgId` arbitrario dal client, restituiscono i dati di quell'org **a chiunque**. È corretto per un data-access layer ed è **safe in 1a SOLO perché nessuna route live li chiama** (verificato: unici caller in `verify-isolation.ts`). **1c DEVE accoppiare ogni chiamata repo con un `organizationId` proveniente dal client a un controllo di membership/ruolo al call-site** (`findMemberRole(orgId, userId)` + `assertOwnership`). È la condizione che trasforma "i repo filtrano per orgId" (vero ora) in "il sistema è isolation-safe" (non ancora). **Tienilo in cima alla checklist di 1c.**

Altri item dalla review finale 1a (non-bloccanti):
- `validateDowngrade` è stub `allowed: true` con consumer vivo (`/api/limits/validate-downgrade.post.ts`) → enforcement downgrade OFF fino a 1c (non è confine di sicurezza, è UX billing).
- Tipi orfani `userEvent`/`eventAccess` in `server/types/context.d.ts` → rimuovere con `2.organization.ts`.
- `fileService.ts`: parametro ancora chiamato `eventId` (scrive in `organizationId`) + chiave R2 `evt/` → rinominare `organizationId`/`org/` in 1c/1d.
- (pre-esistente) `findDuplicate` confronta `organizationId = ''` ma i record globali hanno `null` → mismatch dedup, da hardening futuro.

## Note di handoff per le fasi successive

- **Stub neutralizzati da ripristinare org-aware in 1b/1c** (lista REALE, ampliata in esecuzione oltre quella del piano iniziale):
  - `planLimit.service.ts` — `countUserEvents`/`canCreateEvent`/`countEventMembers`/`countPendingInvitations`/`countReservedSlots`/`canAddTeamMember`/`getTeamLimit`/`validateDowngrade` (tutte stub→0/neutro). `canCreateEvent`→`canCreateOrganization`.
  - `2.events.ts` (no-op) → `2.organization.ts`.
  - `admin/stats/index.get.ts` + `admin/users/[id].get.ts` (conteggi/liste event a 0/vuoto) → org.
  - `admin/audit-logs/index.get.ts` + `admin/users/[id]/audit-logs.get.ts` — già rinominati `eventId`→`organizationId` (colonna); il query-param API si chiama ancora `eventId` → genericizzare in 1c.
  - **`limits/index.get.ts`** — owner-lookup su `schema.events` rimosso, usa i limiti del requester (STUB); 1c: risolvere owner via `member` org.
  - **`dataExport.service.ts`** (GDPR) — sezione eventi dell'export è `[]` (STUB); 1c: ripristinare con `organization`/`member` lookup. Il tipo `ExportEvent` e il campo `events` restano.
  - `logAudit` — la chiave opts è ora `organizationId` (era `eventId`); i call-site la passeranno in 1c.
- **⚠️ Migration `0001_easy_meltdown.sql`:** il flip `file.event_id`→`organization_id` è generato come **DROP COLUMN + ADD COLUMN** (non rename). Su DB clean-slate è corretto (modello drop+recreate della fase). Se mai applicata a un DB con file reali, perderebbe l'associazione tenant dei file → non è il caso del boilerplate.
- **`auth.ts` activeOrganizationId:** annotato nel commit del Task 2 (colonna session vs KV Redis) — input per 1b.
- **Frontend (`eventStore` + pagine event):** intatto o con stub di tipo `// TODO 1d` — riscrittura in 1d.
