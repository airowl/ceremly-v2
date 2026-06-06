# FASE 1c — RBAC + middleware + route org Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare authorization, middleware e route da event-scoped a org-scoped. `permissions.ts` valuta i permessi sul ruolo letto dalla tabella `member`; un guard condiviso carica l'org attiva (dalla sessione) in `event.context.organization`; le route base diventano `/api/organizations/*`; le route admin contano `organization`/`member`; `planLimit`/`pricing.ts` passano da event a org. È il layer di sicurezza della fase: "utente A non tocca risorse di org B", ora a livello route/middleware.

**Architecture:** Due percorsi di authorization tenuti distinti — (1) **app-resource** (projects, FASE 4): `requireMember`/`requireWrite` risolvono l'**org attiva** dalla sessione e popolano `event.context.organization`, il client non passa mai `orgId`; (2) **org-management** (`/api/organizations/[id]`): operano su un'org **identificata dal path-id**, quindi NON usano le guard active-org — delegano l'authz al plugin Better Auth (`auth.api.*`, che verifica il ruolo del caller in *quell'* org) oppure fanno un check esplicito `getOrgRole(userId, params.id)`. `assertOwnership` è il 2° guard sui by-id delle risorse (null/mismatch → 403, no leak). Nessun framework di test: verifica via `pnpm typecheck`, `pnpm build`, grep gate, script tsx assertivi (`verify-rbac.ts`), smoke manuale.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Drizzle ORM (PostgreSQL), Zod, Better Auth 1.4.5 (organization plugin), H3. Verifica: `pnpm typecheck`, `pnpm db:generate`/`db:push`, `npx tsx`, smoke.

---

## Prerequisiti / Gate

**Questo piano dipende da 1b landed.** Stato verificato all'inizio (path:riga reali):

- `server/utils/permissions.ts` → **NON esiste** (verificato). 1c lo CREA.
- `server/middleware/2.events.ts` → **stub no-op** `defineEventHandler(() => {})` (verificato). 1c lo SOSTITUISCE con `2.organization.ts`.
- `server/middleware/1.auth.ts` → inietta solo `event.context.user` (righe 18-21). NON risolve org attiva.
- `server/types/context.d.ts` → augmenta `H3EventContext` con `user`/`userEvent`/`eventAccess` (event model morto). 1c aggiunge `organization` e rimuove i campi event-morti.
- `server/services/planLimit.service.ts` → STUB event (`countUserEvents`→0, `canCreateEvent` allowed:true). `getUserPlan`/`getEffectiveLimits`/`getUserCustomLimits` REALI.
- `shared/constants/pricing.ts` → `PlanLimits { max_events, storage_mb, team_members }`.
- `server/database/schema/auth.ts` → `organization` (id/name/slug/logo/createdAt/metadata, righe 69-76), `member` (id/organizationId/userId/role default "member"/createdAt, righe 78-95), `invitation` (righe 97-117).
- Repositories esistenti: `organizationRepository.ts` (`findOrganizationById`, `findOrganizationsForUser`), `memberRepository.ts` (`findMembers`, `findMemberRole`), `invitationRepository.ts` (`findPendingInvitations`).
- Admin: `server/api/admin/stats/index.get.ts` ha `totalEvents={count:0}`/`newEvents={count:0}` hardcoded (righe 48-49). `server/api/admin/users/[id].get.ts` ha `events: [] ` hardcoded (riga 75). NON sono 501 — query vive con conteggi-evento azzerati.
- `server/api/limits/index.get.ts` usa `countUserEvents` stub (riga 27).

> **GATE per i consumer (FASE 4):** la convenzione route + le firme RBAC qui prodotte DEVONO combaciare con il plan FASE 4 già committato (`docs/superpowers/plans/2026-06-06-fase4-projects-plan.md`). Vedi "Contratti vincolanti" sotto. Se 1c definisse firme diverse, FASE 4 si romperebbe a compile/run.

> **Ordine di esecuzione tra le fasi:** 1c può LANDARE prima di 1b end-to-end, ma alcune verifiche runtime di 1c (org attiva in sessione viva, 401/403 HTTP con cookie) sono **runtime-contingenti su 1b**. Sono marcate esplicitamente nei task. Le verifiche offline (typecheck, `verify-rbac.ts` contro il seed) sono complete e non dipendono da 1b.

### Contratti vincolanti (consumati da FASE 4 — NON deviare)

| Simbolo | Firma/semantica esatta che FASE 4 assume |
|---|---|
| `requireMember(event)` | Risolve l'**org attiva** dalla sessione, verifica membership, popola+ritorna `event.context.organization = { id, role }`. 401 se non autenticato, 403 se non membro/no org attiva. **NON dipende dal path** (funziona su `/api/projects/*`). |
| `requireWrite(event)` | Come `requireMember`, richiede ruolo con permesso write (= owner/admin/member; nessun viewer). Con i ruoli default è funzionalmente identico a `requireMember` — implementati entrambi perché FASE 4 chiama entrambi. |
| `requireOwner(event)` | Come sopra ma richiede `role === "owner"`. Spec-mandated; **nessun consumer FASE 4** (tabella contratti FASE 4 lo omette) → implementazione minima, niente guard derivate senza consumer. |
| `assertOwnership(resource, organizationId)` | `resource` null/undefined **oppure** `resource.organizationId !== organizationId` → `throw createError({ statusCode: 403 })` (messaggio generico, no leak). Altrimenti **ritorna** la risorsa non-null. Usato come statement (return ignorato) in FASE 4 service (righe 379/406/423). NON assertion function (FASE 4 non usa il narrowing). |
| `event.context.organization` | `{ id: string; role: string }` = org attiva del membro, popolato dai guard. Il service legge `organizationId` SOLO da qui. |

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `server/utils/permissions.ts` | **Create** | `getOrgRole`, `loadActiveOrganization`, guard `requireMember`/`requireWrite`/`requireOwner`, `assertOwnership`, pure fns `roleCanWrite`/`roleIsOwner` |
| `server/types/context.d.ts` | Modify | + `organization?: { id; role }`; rimuovere `userEvent`/`eventAccess` (event model morto) |
| `server/middleware/2.organization.ts` | **Create** | Risoluzione org attiva non-bloccante per `/api/organizations/*` (convenienza, NON enforcement) |
| `server/middleware/2.events.ts` | **Delete** | Stub no-op rimosso |
| `shared/schemas/organization.ts` | **Create** | `createOrganizationSchema` / `updateOrganizationSchema` + tipi |
| `shared/schemas/index.ts` | Modify | `export * from "./organization"` |
| `server/services/organization.service.ts` | **Create** | CRUD org via plugin `auth.api.*` + repository, audit, `canCreateOrganization` gate |
| `server/api/organizations/index.get.ts` | **Create** | `GET /api/organizations` — lista org dell'utente |
| `server/api/organizations/index.post.ts` | **Create** | `POST /api/organizations` — crea org (plan-limit + plugin) |
| `server/api/organizations/[id].get.ts` | **Create** | `GET /api/organizations/:id` — dettaglio org (path-id, plugin) |
| `server/api/organizations/[id].put.ts` | **Create** | `PUT /api/organizations/:id` — update org (path-id, plugin) |
| `server/api/organizations/[id].delete.ts` | **Create** | `DELETE /api/organizations/:id` — delete org (path-id, plugin) |
| `server/api/organizations/[id]/members/index.get.ts` | **Create** | `GET …/members` — lista membri+inviti (risoluzione `/api/team/*`) |
| `server/utils/audit/types.ts` | Modify | + `AUDIT_CATEGORIES.organization` + `organization.created/updated/deleted` |
| `shared/constants/pricing.ts` | Modify | `max_events` → `max_organizations` (interface + 3 plan + `getPlanLimits`) |
| `server/database/schema/userCustomLimits.ts` | Modify | colonna `max_events` → `max_organizations` (campo `maxEvents`→`maxOrganizations`) |
| `drizzle/migrations/*` | Create (gen/manual) | Rename colonna `user_custom_limits.max_events` |
| `shared/schemas/admin.ts` | Modify | `max_events` → `max_organizations` in `adminUpdateLimitsSchema` |
| `server/api/admin/users/[id]/limits.patch.ts` | Modify | `max_events`→`max_organizations`, `maxEvents`→`maxOrganizations` |
| `server/services/planLimit.service.ts` | Modify | `LimitType`, `countUserEvents`→`countUserOrganizations`, `canCreateEvent`→`canCreateOrganization` (REALE), team count org-aware, downgrade |
| `server/api/limits/index.get.ts` | Modify | usa `countUserOrganizations` + key `organizations` |
| `server/api/admin/stats/index.get.ts` | Modify | conteggi event → `organization` reali |
| `server/api/admin/users/[id].get.ts` | Modify | `events: []` → org dell'utente da `member` |
| `server/database/seed/verify-rbac.ts` | **Create** | TEST: `getOrgRole` (incl. cross-org → null), pure fns, `assertOwnership` 403 |

> **Nota di onestà (gate FASE 4):** `server/utils/permissions.ts` e `assertOwnership` sono importati dal service FASE 4 già committato. Finché 1c non landa, `pnpm typecheck` in FASE 4 fallisce su `Cannot find module '../utils/permissions'` — è il comportamento atteso del gate. 1c chiude quel gate.

---

## Task 1 — `permissions.ts`: getOrgRole, guard, assertOwnership, pure fns

**Files:**
- Create: `server/utils/permissions.ts`
- Verify: `pnpm typecheck`

> Il file CREA i simboli che FASE 4 importa. `loadActiveOrganization` è l'unico punto di risoluzione (idempotente). Le pure fns `roleCanWrite`/`roleIsOwner` rendono il gating testabile senza sessione. `assertOwnership` ritorna la risorsa (non assertion function).

- [ ] Creare `server/utils/permissions.ts`:

```typescript
/**
 * RBAC org-scoped (FASE 1c).
 *
 * DUE percorsi di authorization, tenuti distinti:
 *  1) APP-RESOURCE (projects, risorse di dominio future): requireMember/requireWrite/
 *     requireOwner risolvono l'ORG ATTIVA dalla sessione e popolano event.context.organization.
 *     Il client non passa mai orgId. È il pattern che ogni risorsa futura clona (vedi FASE 4).
 *  2) ORG-MANAGEMENT (/api/organizations/[id]): l'org è identificata dal PATH-ID, NON è l'org
 *     attiva → NON usare queste guard lì. L'authz è delegata al plugin (auth.api.*) o a un check
 *     esplicito getOrgRole(userId, params.id). Vedi server/api/organizations/[id].*.ts.
 *
 * Ruoli (default plugin Better Auth): owner > admin > member. Nessun viewer.
 *  - write risorse = owner | admin | member (tutti scrivono)
 *  - owner-only = owner
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { requireAuth } from "./auth";
import { getAuthSession } from "./auth";
import { findMemberRole } from "../repositories/memberRepository";

/** Ruoli che possono scrivere risorse di dominio. Pure → testabile senza sessione. */
export function roleCanWrite(role: string | null | undefined): boolean {
    return role === "owner" || role === "admin" || role === "member";
}

/** Solo owner. Pure → testabile senza sessione. */
export function roleIsOwner(role: string | null | undefined): boolean {
    return role === "owner";
}

/**
 * Ruolo dell'utente in una specifica org (dalla tabella member).
 * null se l'utente NON è membro di quell'org (anche cross-org → null).
 */
export async function getOrgRole(
    userId: string,
    organizationId: string,
): Promise<string | null> {
    return findMemberRole(organizationId, userId);
}

/**
 * Risolve l'org ATTIVA dalla sessione e popola event.context.organization.
 * Idempotente: no-op se già popolato (evita doppio lavoro middleware+guard).
 * Ritorna null se: non autenticato, nessuna org attiva, o utente non più membro.
 */
export async function loadActiveOrganization(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string } | null> {
    if (event.context.organization) {
        return event.context.organization;
    }
    const session = await getAuthSession(event);
    const userId = session?.user?.id;
    const activeOrgId = session?.session?.activeOrganizationId;
    if (!userId || !activeOrgId) {
        return null;
    }
    const role = await getOrgRole(userId, activeOrgId);
    if (!role) {
        return null;
    }
    event.context.organization = { id: activeOrgId, role };
    return event.context.organization;
}

/**
 * Guard APP-RESOURCE: utente autenticato + membro dell'org attiva.
 * Popola+ritorna event.context.organization. 401 senza auth, 403 se non membro/no org attiva.
 */
export async function requireMember(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string }> {
    await requireAuth(event);
    const org = await loadActiveOrganization(event);
    if (!org) {
        throw createError({
            statusCode: 403,
            statusMessage: "Nessuna organizzazione attiva o accesso negato",
        });
    }
    return org;
}

/**
 * Guard APP-RESOURCE: richiede ruolo con permesso write.
 * Con i ruoli default coincide con requireMember; mantenuto separato per chiarezza/futuro.
 */
export async function requireWrite(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string }> {
    const org = await requireMember(event);
    if (!roleCanWrite(org.role)) {
        throw createError({ statusCode: 403, statusMessage: "Permesso di scrittura negato" });
    }
    return org;
}

/** Guard APP-RESOURCE owner-only. */
export async function requireOwner(
    event: H3Event<EventHandlerRequest>,
): Promise<{ id: string; role: string }> {
    const org = await requireMember(event);
    if (!roleIsOwner(org.role)) {
        throw createError({ statusCode: 403, statusMessage: "Operazione riservata all'owner" });
    }
    return org;
}

/**
 * 2° guard sui by-id: una risorsa con organizationId è accessibile solo a quell'org.
 * null/undefined OPPURE mismatch → 403 (no leak esistenza). Altrimenti ritorna la risorsa.
 */
export function assertOwnership<T extends { organizationId: string }>(
    resource: T | null | undefined,
    organizationId: string,
): T {
    if (!resource || resource.organizationId !== organizationId) {
        throw createError({ statusCode: 403, statusMessage: "Accesso negato" });
    }
    return resource;
}
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore in `permissions.ts`.
  > **Nota di onestà (typecheck):** `session.session.activeOrganizationId` è tipato dal plugin org (schema-session). Se il tipo inferito di `getSession` NON espone il campo, `session?.session?.activeOrganizationId` è comunque un **errore di compile** (l'optional chaining guarda null/undefined, NON una proprietà inesistente). In quel caso usare un cast esplicito: `const activeOrgId = (session?.session as { activeOrganizationId?: string } | undefined)?.activeOrganizationId;`. Il VALORE è cablato da 1b (runtime-contingente).
- [ ] Commit: `feat: org RBAC helpers (getOrgRole, guards, assertOwnership) (phase 1c)`

---

## Task 2 — `context.d.ts`: augment `organization`, rimuovere event-morti

**Files:**
- Modify: `server/types/context.d.ts:5-32`
- Verify: `pnpm typecheck`

> FASE 4 (mock + service) legge `event.context.organization?.id`/`.role`. Va tipato qui. I campi `userEvent`/`eventAccess` appartengono al modello event morto (rimosso in 1a) e vanno tolti.

- [ ] Sostituire l'intero contenuto di `server/types/context.d.ts` con:

```typescript
/**
 * H3 Event Context type augmentation
 * Populated by server middleware (1.auth, 2.organization) e dai guard RBAC.
 */
declare module 'h3' {
    interface H3EventContext {
        /** Authenticated user — injected by 1.auth.ts (optional) or requireAuth() (required) */
        user?: {
            id: string
            email: string
            name: string | null
            role: string | null
            image?: string | null
        }
        /**
         * Org attiva del membro — popolata dai guard RBAC (requireMember/requireWrite/
         * requireOwner) o dal middleware 2.organization.ts (non-bloccante).
         * Il service legge organizationId SOLO da qui (mai da body/query).
         */
        organization?: {
            id: string
            role: string
        }
    }
}
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore nuovo. (Se compaiono errori "Property 'userEvent' does not exist", sono consumer event-morti residui — non dovrebbero esistere dopo 1a; in tal caso annotarli, sono fuori scope 1c.)
- [ ] Commit: `feat: augment H3EventContext with active organization (phase 1c)`

---

## Task 3 — Middleware: `2.organization.ts` + delete `2.events.ts`

**Files:**
- Create: `server/middleware/2.organization.ts`
- Delete: `server/middleware/2.events.ts`
- Verify: `pnpm typecheck`

> Il middleware è **convenienza** per `/api/organizations/*` (precarica l'org attiva nel context), NON enforcement: swallow degli errori come `1.auth.ts`. L'enforcement vive nei guard (`requireMember` & co.) chiamati dalle route → funziona anche su `/api/projects/*` senza middleware path-matched. Il checkpoint "no session → 401" è soddisfatto da `requireAuth` nelle route, NON dal middleware.

- [ ] Creare `server/middleware/2.organization.ts`:

```typescript
/**
 * Middleware org (FASE 1c) — sostituisce lo stub 2.events.ts.
 *
 * Precarica NON-BLOCCANTE l'org attiva in event.context.organization per le rotte
 * /api/organizations/*. È una convenienza: l'ENFORCEMENT (401/403) avviene nei guard
 * RBAC (requireMember/requireWrite/requireOwner) chiamati esplicitamente dalle route,
 * così il pattern funziona anche su /api/projects/* (nessun middleware path-matched).
 */
import { loadActiveOrganization } from "~~/server/utils/permissions";

export default defineEventHandler(async (event) => {
    const path = event.path;
    if (!path?.startsWith("/api/organizations")) {
        return;
    }
    try {
        await loadActiveOrganization(event);
    } catch {
        // Non-bloccante: i guard nelle route gestiscono i requisiti di accesso.
    }
});
```

- [ ] Eliminare lo stub: `rm server/middleware/2.events.ts`. Output atteso: nessun errore.
- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore; nessun riferimento residuo a `2.events`.
- [ ] Verifica nessun residuo: `grep -rn "2.events\|userEvent\|eventAccess" server/ app/`. Output atteso: nessuna riga (a parte eventuali commenti storici fuori scope).
- [ ] Commit: `feat: replace 2.events stub with 2.organization middleware (phase 1c)`

---

## Task 4 — Audit: categoria + azioni `organization.*`

**Files:**
- Modify: `server/utils/audit/types.ts:6-19` (categorie) e `:67-71` (azioni)
- Verify: `pnpm typecheck`

> `AuditAction`/`AuditCategory` sono union chiusi: estenderli PRIMA di usarli nel service org. `getCategoryFromAction` fa il cast del prefisso → la voce categoria deve esistere. `LogAuditOptions` ha già `organizationId` (verificato, riga 111-119) — nessuna modifica lì.

- [ ] In `server/utils/audit/types.ts`, dentro `AUDIT_CATEGORIES`, aggiungere `organization` dopo `event:` (riga 13). Sostituire:

```typescript
  event: 'event',
  contact: 'contact',
```

con:

```typescript
  event: 'event',
  organization: 'organization',
  contact: 'contact',
```

- [ ] In `server/utils/audit/types.ts`, dopo il blocco `// Event` (righe 67-71), aggiungere il blocco organization. Sostituire:

```typescript
  // Event
  'event.created': 'event.created',
  'event.updated': 'event.updated',
  'event.deleted': 'event.deleted',
```

con:

```typescript
  // Event
  'event.created': 'event.created',
  'event.updated': 'event.updated',
  'event.deleted': 'event.deleted',

  // Organization (FASE 1c)
  'organization.created': 'organization.created',
  'organization.updated': 'organization.updated',
  'organization.deleted': 'organization.deleted',
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore; `AuditAction` include i 3 nuovi literal; `getCategoryFromAction("organization.created")` → `"organization"` (la voce esiste).
- [ ] Commit: `feat: add organization audit categories/actions (phase 1c)`

---

## Task 5 — Zod schema `shared/schemas/organization.ts` + barrel

**Files:**
- Create: `shared/schemas/organization.ts`
- Modify: `shared/schemas/index.ts:9`
- Verify: `pnpm typecheck`

> Schema per create/update org. `slug` opzionale alla creazione (il plugin lo deriva se assente — vedi service). `slugField` da `common.ts` (verificato: `min(2).max(50).regex(/^[a-z0-9-]+$/)`).

- [ ] Creare `shared/schemas/organization.ts`:

```typescript
import { z } from "zod";
import { nonEmptyString, slugField } from "./common";

export const createOrganizationSchema = z.object({
    name: nonEmptyString.max(200),
    slug: slugField.optional(),
    logo: z.string().url().optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
    name: nonEmptyString.max(200).optional(),
    slug: slugField.optional(),
    logo: z.string().url().nullish(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
```

- [ ] Aggiungere l'export al barrel `shared/schemas/index.ts`. Dopo la riga 9 (`export * from "./event";`) aggiungere:

```typescript
export * from "./organization";
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore in `organization.ts` o nel barrel.
- [ ] Commit: `feat: add organization Zod schemas (phase 1c)`

---

## Task 6 — `planLimit` + `pricing.ts`: rename event→organization (atomico)

**Files:**
- Modify: `shared/constants/pricing.ts` (interface + 3 plan + `getPlanLimits` comment)
- Modify: `server/services/planLimit.service.ts`
- Modify: `server/database/schema/userCustomLimits.ts:18`
- Modify: `shared/schemas/admin.ts:12`
- Modify: `server/api/admin/users/[id]/limits.patch.ts` (campi)
- Modify: `server/api/limits/index.get.ts`
- Verify: `pnpm typecheck`, `pnpm db:generate` (o fallback), `pnpm db:migrate`

> **Ripple atomico:** il rename `max_events`→`max_organizations` tocca interface + DB column + tutti i consumer in un colpo solo, altrimenti `pnpm typecheck` rosso. La colonna DB cambia (`maxEvents`→`maxOrganizations`, `max_events`→`max_organizations`) → `db:generate` è interattivo (TTY noto) → fallback inline. `userPlan.ts` re-esporta solo nomi di funzione (non `max_events`) → si aggiorna implicitamente con la rinomina delle funzioni (Task 6, step finale).

- [ ] In `shared/constants/pricing.ts`, rinominare nell'interface `PlanLimits` (righe 10-17). Sostituire:

```typescript
export interface PlanLimits {
    /** Maximum number of events (-1 = unlimited) */
    max_events: number;
    /** Maximum storage in MB (-1 = unlimited) */
    storage_mb: number;
    /** Maximum team members (-1 = unlimited) */
    team_members: number;
}
```

con:

```typescript
export interface PlanLimits {
    /** Maximum number of organizations (-1 = unlimited) */
    max_organizations: number;
    /** Maximum storage in MB (-1 = unlimited) */
    storage_mb: number;
    /** Maximum team members (-1 = unlimited) */
    team_members: number;
}
```

- [ ] In `shared/constants/pricing.ts`, nei 3 plan, rinominare la chiave `max_events:` → `max_organizations:` (3 occorrenze, righe 54, 80, 106). Eseguire 3 Edit puntuali oppure un replace mirato:
  - `max_events: 2,` → `max_organizations: 2,` (starter)
  - `max_events: 5,` → `max_organizations: 5,` (premium)
  - `max_events: -1,` → `max_organizations: -1,` (agency)

- [ ] In `server/database/schema/userCustomLimits.ts`, rinominare la colonna (riga 18). Sostituire:

```typescript
    maxEvents: integer("max_events"),
```

con:

```typescript
    maxOrganizations: integer("max_organizations"),
```

- [ ] In `shared/schemas/admin.ts`, rinominare nel `adminUpdateLimitsSchema` (riga 12). Sostituire:

```typescript
    max_events: z.number().int().min(-1).nullable().optional(),
```

con:

```typescript
    max_organizations: z.number().int().min(-1).nullable().optional(),
```

- [ ] In `server/api/admin/users/[id]/limits.patch.ts`, sostituire ogni `max_events`→`max_organizations` e ogni `maxEvents`→`maxOrganizations`. Punti esatti: righe 66-67 (`if (validatedData.max_events !== undefined) { updateData.maxEvents = validatedData.max_events; }`), righe 81-83 (changes), righe 110/125 (delete-check + insert). Risultato dei 3 blocchi:

  - Blocco update (sostituire righe 66-68):
  ```typescript
    if (validatedData.max_organizations !== undefined) {
        updateData.maxOrganizations = validatedData.max_organizations;
    }
  ```
  - Blocco changes (sostituire righe 81-83):
  ```typescript
    if (validatedData.max_organizations !== undefined) {
        changes.max_organizations = { from: existing?.maxOrganizations ?? 'plan default', to: validatedData.max_organizations ?? 'plan default' };
    }
  ```
  - Delete-check (sostituire riga 110): `updated.maxEvents === null &&` → `updated.maxOrganizations === null &&`
  - Insert (sostituire riga 125): `maxEvents: validatedData.max_events ?? null,` → `maxOrganizations: validatedData.max_organizations ?? null,`

- [ ] In `server/services/planLimit.service.ts`, aggiornare il blocco custom-limits (riga 120) e i merge (riga 147). Sostituire `if (custom.maxEvents !== null) limits.max_events = custom.maxEvents;` con:

```typescript
    if (custom.maxOrganizations !== null) limits.max_organizations = custom.maxOrganizations;
```

e nel merge `getEffectiveLimits` (riga 147) sostituire `max_events: customLimits.max_events ?? planInfo.limits.max_events,` con:

```typescript
        max_organizations: customLimits.max_organizations ?? planInfo.limits.max_organizations,
```

- [ ] In `server/services/planLimit.service.ts`, rinominare il tipo e le funzioni event→org. Sostituire `export type LimitType = 'event' | 'team'` con:

```typescript
export type LimitType = 'organization' | 'team'
```

  e rinominare le funzioni (righe 161-189): `countUserEvents` → `countUserOrganizations` (REALE) e `canCreateEvent` → `canCreateOrganization` (REALE). Sostituire il blocco righe 161-189:

```typescript
// ─── Event limit checks ─────────────────────────────────────────────

/**
 * Count events owned by a user
 * STUB phase 1a — sostituito da countUserOrganizations in 1c
 */
export async function countUserEvents(_userId: string): Promise<number> {
    return 0; // STUB phase 1a — query su schema.events rimossa; 1c conta le organizzazioni
}

/**
 * Check if user can create a new event based on plan limits
 */
export async function canCreateEvent(userId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(userId);
    const limit = effectiveInfo.limits.max_events;

    return {
        allowed: true, // STUB phase 1a — sempre permesso; 1c verifica contro organizationCount
        current: 0,    // STUB phase 1a — 0 fino a countUserOrganizations in 1c
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}
```

con (conteggio REALE sulle org di cui l'utente è **owner** — essere invitato in org altrui non consuma il limite di creazione):

```typescript
// ─── Organization limit checks ──────────────────────────────────────

/**
 * Count organizations OWNED by a user (role === "owner").
 * Essere membro/admin di org altrui NON consuma il limite di creazione.
 */
export async function countUserOrganizations(userId: string): Promise<number> {
    const db = getDB();
    const rows = await db
        .select({ id: schema.member.organizationId })
        .from(schema.member)
        .where(
            and(
                eq(schema.member.userId, userId),
                eq(schema.member.role, "owner"),
            ),
        );
    return rows.length;
}

/**
 * Check if user can create a new organization based on plan limits.
 */
export async function canCreateOrganization(userId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(userId);
    const limit = effectiveInfo.limits.max_organizations;
    const current = await countUserOrganizations(userId);

    return {
        allowed: !exceedsLimit(current, limit),
        current,
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}
```

- [ ] In `server/services/planLimit.service.ts`, aggiornare il file header (righe 1-5) togliendo "scoped to events". Sostituire `* All checks are scoped to events (the primary organizational entity).` con `* All checks are scoped to organizations (the primary tenant entity).`

- [ ] In `server/utils/userPlan.ts`, aggiornare il re-export barrel (righe 14-15). Sostituire `countUserEvents,` con `countUserOrganizations,` e `canCreateEvent,` con `canCreateOrganization,`.

- [ ] In `server/api/limits/index.get.ts`, ripuntare il conteggio e la key. Sostituire l'import `countUserEvents,` (riga 16) con `countUserOrganizations,`; sostituire la chiamata `countUserEvents(user.id)` (riga 27) con `countUserOrganizations(user.id)`; rinominare `eventsCount`→`orgCount`, `eventsMax`→`orgsMax` e la key `events:` dentro `usage` → `organizations:`. Risultato del blocco (righe 24-43):

```typescript
    // User's own plan info + organizations count (always returned)
    const [userEffective, orgCount] = await Promise.all([
        getEffectiveLimits(user.id),
        countUserOrganizations(user.id),
    ]);

    const orgsMax = userEffective.limits.max_organizations;

    const response = {
        plan: userEffective.plan,
        limits: userEffective.limits,
        usage: {
            organizations: {
                current: orgCount,
                limit: isUnlimited(orgsMax) ? -1 : orgsMax,
                allowed: !exceedsLimit(orgCount, orgsMax),
            },
            team: null as { current: number; limit: number; allowed: boolean } | null,
        },
    };
```

> **Nota di onestà:** la sezione `team` di questo endpoint resta `STUB` (count org-aware completo dei membri/inviti è 1d-frontend-driven e fuori dal core 1c). 1c rende REALE solo `organizations`. Lasciare il ramo `if (eventId)` invariato (resta stub) — sarà ripulito quando il frontend org-scoped lo consuma in 1d.

- [ ] Generare la migration di rename colonna: `pnpm db:generate`. Output atteso: drizzle-kit rileva il rename `user_custom_limits.max_events` → `max_organizations`. **Fallback se il prompt TTY si blocca** (drizzle chiede "is column renamed or created+dropped"): non usare il prompt; creare a mano un file in `drizzle/migrations/` con `ALTER TABLE "user_custom_limits" RENAME COLUMN "max_events" TO "max_organizations";` e aggiornare lo snapshot, **oppure** `pnpm db:push` (applica il diff direttamente, rename incluso). Il rename preserva i dati esistenti (a differenza di drop+create).
- [ ] Applicare: `pnpm db:migrate`. Output atteso: migration eseguita senza errori (o "No migrations to run" se è stato usato `db:push`).
- [ ] Verifica: `pnpm typecheck`. Output atteso: **VERDE** (incluso `app/` — vue-tsc tipa l'intero progetto). Nessun `max_events`/`maxEvents`/`countUserEvents`/`canCreateEvent` residuo in `server/`/`shared/`.
  > **Fatto verificato (perché il gate è verde con il rename):** nessun file in `app/` legge il campo `.max_events` in modo tipato (grep `max_events|maxEvents` su `app/` → 0 hit). `app/stores/userStore.ts` importa il TIPO `PlanLimits` (riga 3) e lo usa come contenitore (`limits: PlanLimits`, riga 20) senza accedere al campo rinominato; `app/composables/usePricing.ts` usa `PRICING_PLANS_LIST`/`PricingPlan` senza leggere `limits.max_events`. Quindi il rename del CAMPO dell'interface NON rompe `app/`.
- [ ] Verifica nessun residuo server/shared: `grep -rn "max_events\|maxEvents\|countUserEvents\|canCreateEvent" server/ shared/`. Output atteso: nessuna riga.
- [ ] Commit: `feat: rename plan limit max_events to max_organizations (phase 1c)`

> **Gap runtime ATTESO (deferito a 1d, NON regressione typecheck):** la rinomina della **key di risposta** `/api/limits` (`usage.events` → `usage.organizations`, Task 6) e delle response admin (`AdminStats.events` → `organizations`, `users[id].events` → `organizations`, Task 9) NON è tipata sul client (il client usa `$fetch` con tipi LOCALI). Quindi typecheck resta verde ma a runtime questi consumer leggono la vecchia key e ottengono `undefined`:
> - `app/stores/userStore.ts:22` (tipo locale `LimitsResponse.usage.events`) e `:185` (`limitsData.value?.usage.events`) — si allineano a `usage.organizations` in **1d**.
> - `app/components/admin/home/HomeEventCards.client.vue:143` (`data.events`) e `app/stores/eventStore.ts:114` (`data.events`) — consumer admin/event-store morti, riscritti org-scoped in **1d**.
> Questi sono gap dichiarati, NON nascosti: 1c chiude il backend; il frontend è esplicitamente fuori scope (vedi "Cosa 1c NON copre").

---

## Task 7 — Service org `server/services/organization.service.ts`

**Files:**
- Create: `server/services/organization.service.ts`
- Verify: `pnpm typecheck`

> Stile: `server/services/contact.service.ts` (firma `(event, data)`, `createError`, `logAudit`). Le mutazioni org delegano al plugin (`auth.api.createOrganization`/`updateOrganization`/`deleteOrganization`) che possiede creazione member-row, slug, org attiva e l'authz role-based su path-id. `createOrganization` aggiunge il gate `canCreateOrganization` PRIMA. Le letture usano i repository. Audit dopo ogni scrittura.

> **Fatto pinnato (baseline A2/A4):** `auth.api.createOrganization({ body, headers })` con sessione viva crea org + member owner + setta org attiva. Da una route HTTP passiamo `headers: event.headers` (sessione viva). Slug: se assente lo deriviamo dal nome; collisione → il plugin lancia `ORGANIZATION_ALREADY_EXISTS` (gestita come 409 nella route).

- [ ] Creare `server/services/organization.service.ts`:

```typescript
/**
 * Organization Service (FASE 1c).
 *
 * Le MUTAZIONI org delegano al plugin Better Auth (auth.api.*): il plugin possiede
 * la creazione della member-row owner, lo slug, l'org attiva e l'authz role-based
 * sull'org identificata dal path-id. Le LETTURE usano i repository.
 * Gate plan-limit (canCreateOrganization) PRIMA della creazione. Audit su ogni scrittura.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type {
    CreateOrganizationInput,
    UpdateOrganizationInput,
} from "~~/shared/schemas/organization";
import { useServerAuth } from "../utils/auth";
import { findOrganizationsForUser } from "../repositories/organizationRepository";
import { findMembers } from "../repositories/memberRepository";
import { findPendingInvitations } from "../repositories/invitationRepository";
import { canCreateOrganization } from "./planLimit.service";
import { logAudit } from "../utils/audit";

/** Slug da nome: lowercase, spazi→-, solo [a-z0-9-]. */
function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50);
}

/** Lista le org di cui l'utente è membro (con ruolo). */
export async function listOrganizations(userId: string) {
    const organizations = await findOrganizationsForUser(userId);
    return { organizations };
}

/** Crea un'org (gate plan-limit + plugin) + audit. */
export async function createOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    data: CreateOrganizationInput,
) {
    const limit = await canCreateOrganization(userId);
    if (!limit.allowed) {
        throw createError({
            statusCode: 403,
            statusMessage: `Limite organizzazioni raggiunto (${limit.current}/${limit.limit})`,
        });
    }

    const auth = useServerAuth();
    const created = await auth.api.createOrganization({
        body: {
            name: data.name,
            slug: data.slug ?? slugify(data.name),
            ...(data.logo ? { logo: data.logo } : {}),
        },
        headers: event.headers,
    });

    await logAudit(event, "organization.created", {
        userId,
        organizationId: created?.id,
        targetType: "organization",
        targetId: created?.id,
    });
    return { organization: created };
}

/** Dettaglio org (path-id) via plugin (authz role-based del caller in quell'org). */
export async function getOrganization(
    event: H3Event<EventHandlerRequest>,
    organizationId: string,
) {
    const auth = useServerAuth();
    const organization = await auth.api.getFullOrganization({
        query: { organizationId },
        headers: event.headers,
    });
    if (!organization) {
        throw createError({ statusCode: 404, statusMessage: "Organizzazione non trovata" });
    }
    return { organization };
}

/** Update org (path-id) via plugin + audit. */
export async function updateOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    organizationId: string,
    data: UpdateOrganizationInput,
) {
    const auth = useServerAuth();
    const organization = await auth.api.updateOrganization({
        body: {
            organizationId,
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.slug !== undefined ? { slug: data.slug } : {}),
                ...(data.logo !== undefined ? { logo: data.logo } : {}),
            },
        },
        headers: event.headers,
    });

    await logAudit(event, "organization.updated", {
        userId,
        organizationId,
        targetType: "organization",
        targetId: organizationId,
    });
    return { organization };
}

/** Delete org (path-id) via plugin + audit. */
export async function deleteOrganization(
    event: H3Event<EventHandlerRequest>,
    userId: string,
    organizationId: string,
) {
    const auth = useServerAuth();
    await auth.api.deleteOrganization({
        body: { organizationId },
        headers: event.headers,
    });

    await logAudit(event, "organization.deleted", {
        userId,
        organizationId,
        targetType: "organization",
        targetId: organizationId,
    });
    return { success: true };
}

/** Lista membri + inviti pending di un'org (path-id). Authz nella route via getOrgRole. */
export async function listOrganizationMembers(organizationId: string) {
    const [members, pendingInvitations] = await Promise.all([
        findMembers(organizationId),
        findPendingInvitations(organizationId),
    ]);
    return { members, pendingInvitations };
}
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore in `organization.service.ts`.
  > **Nota di onestà (runtime-contingente su 1b):** le firme di `auth.api.getFullOrganization`/`updateOrganization`/`deleteOrganization` sono pinnate dalla baseline (plugin org 1.4.5). Se il typecheck segnala una forma di parametro diversa (es. `query` vs `body`, o `data` annidato), allinearla ai tipi reali del plugin — la SEMANTICA (delega al plugin, path-id authz) resta. La verifica runtime piena richiede sessione viva (1b).
- [ ] Commit: `feat: add organization service delegating to plugin (phase 1c)`

---

## Task 8 — Route `/api/organizations/*` (5 base + members)

**Files:**
- Create: `server/api/organizations/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`, `[id]/members/index.get.ts`
- Verify: `pnpm typecheck`, grep gate

> **Authz per le route org-management è path-id, NON active-org** (vedi Architecture): `[id]` get/put/delete delegano l'authz al plugin (`auth.api.*` verifica il ruolo del caller in *quell'* org). Per `…/members` (lettura) si fa un check esplicito `getOrgRole(user.id, params.id)` (null → 403). `index.get`/`index.post` sono user-scoped (la lista è dell'utente; la create gira sulla sua sessione). Pattern thin controller: `requireAuth` → (per `[id]` solo `requireAuth`) → `parseBody` → delega → try/catch.

- [ ] Creare `server/api/organizations/index.get.ts`:

```typescript
/**
 * GET /api/organizations
 * Lista le organizzazioni di cui l'utente è membro.
 */
import { listOrganizations } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);

    try {
        return await listOrganizations(user.id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.index.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list organizations" });
    }
});
```

- [ ] Creare `server/api/organizations/index.post.ts`:

```typescript
/**
 * POST /api/organizations
 * Crea un'organizzazione (gate plan-limit + plugin). RBAC: utente autenticato.
 */
import { createOrganizationSchema } from "~~/shared/schemas/organization";
import { parseBody } from "~~/server/utils/validateBody";
import { createOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const data = await parseBody(event, createOrganizationSchema);

    try {
        return await createOrganization(event, user.id, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        if (e.code === "23505" || e.body?.code === "ORGANIZATION_ALREADY_EXISTS") {
            throw createError({ statusCode: 409, statusMessage: "Organization slug already exists" });
        }
        console.error("[organizations.index.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create organization" });
    }
});
```

- [ ] Creare `server/api/organizations/[id].get.ts`:

```typescript
/**
 * GET /api/organizations/:id
 * Dettaglio org (path-id). Authz role-based del caller delegata al plugin.
 */
import { getOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    try {
        return await getOrganization(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch organization" });
    }
});
```

- [ ] Creare `server/api/organizations/[id].put.ts`:

```typescript
/**
 * PUT /api/organizations/:id
 * Update org (path-id). Authz role-based del caller delegata al plugin.
 */
import { updateOrganizationSchema } from "~~/shared/schemas/organization";
import { parseBody } from "~~/server/utils/validateBody";
import { updateOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }
    const data = await parseBody(event, updateOrganizationSchema);

    try {
        return await updateOrganization(event, user.id, id, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to update organization" });
    }
});
```

- [ ] Creare `server/api/organizations/[id].delete.ts`:

```typescript
/**
 * DELETE /api/organizations/:id
 * Delete org (path-id). Authz role-based del caller delegata al plugin.
 */
import { deleteOrganization } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    try {
        return await deleteOrganization(event, user.id, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].delete] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to delete organization" });
    }
});
```

- [ ] Creare `server/api/organizations/[id]/members/index.get.ts` (risoluzione `/api/team/*`: i membri stanno sotto l'org; authz path-id esplicita via `getOrgRole`):

```typescript
/**
 * GET /api/organizations/:id/members
 * Lista membri + inviti pending dell'org (path-id).
 * Risolve il vecchio /api/team/*: membership sotto /api/organizations/[id]/members.
 * Authz: il caller deve essere membro DI QUELL'org (getOrgRole != null).
 */
import { getOrgRole } from "~~/server/utils/permissions";
import { listOrganizationMembers } from "~~/server/services/organization.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing organization id" });
    }

    // Authz path-id: membro di QUESTA org (non dell'org attiva).
    const role = await getOrgRole(user.id, id);
    if (!role) {
        throw createError({ statusCode: 403, statusMessage: "Accesso negato" });
    }

    try {
        return await listOrganizationMembers(id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[organizations.[id].members.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list members" });
    }
});
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore nelle 6 route.
- [ ] Verifica gate RBAC statico: ogni route org porta `requireAuth`.
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas
  grep -L "requireAuth" server/api/organizations/*.ts server/api/organizations/\[id\]/members/*.ts   # atteso: nessun output
  ```
  `grep -L` elenca i file che NON matchano: output vuoto = tutte le route hanno `requireAuth`.
- [ ] Verifica nessuna `/api/team/*` residua: `ls server/api/team 2>/dev/null; ls server/api/events 2>/dev/null`. Output atteso: errore "No such file or directory" per entrambe (già rimosse in 1a; non reintrodotte).
- [ ] Commit: `feat: add /api/organizations routes + members (phase 1c)`

---

## Task 9 — Route admin: conteggi event → organization/member

**Files:**
- Modify: `server/api/admin/stats/index.get.ts:9-26` (interface), `:47-49` (count), `:91-94` (response)
- Modify: `server/api/admin/users/[id].get.ts:29-35` (interface), `:74-75` (events)
- Verify: `pnpm typecheck`

> 1a aveva azzerato i conteggi event (NON 501). 1c li ripunta a `organization`/`member`. Rinominare la sezione `events`→`organizations` nelle response per coerenza semantica (consumer admin frontend si allinea in 1d).

- [ ] In `server/api/admin/stats/index.get.ts`, rinominare la sezione `events` dell'interface `AdminStats` (righe 16-19). Sostituire:

```typescript
    events: {
        total: number;
        newLast30Days: number;
    };
```

con:

```typescript
    organizations: {
        total: number;
        newLast30Days: number;
    };
```

- [ ] In `server/api/admin/stats/index.get.ts`, sostituire le righe 47-49 (hardcoded 0) con query reali su `schema.organization`:

```typescript
    // Organization stats (FASE 1c — sostituisce gli stub event di 1a)
    const [totalOrganizations] = await db.select({ count: count() }).from(schema.organization);
    const [newOrganizations] = await db.select({ count: count() })
        .from(schema.organization)
        .where(gte(schema.organization.createdAt, thirtyDaysAgo));
```

- [ ] In `server/api/admin/stats/index.get.ts`, sostituire il blocco response `events` (righe 91-94) con:

```typescript
        organizations: {
            total: totalOrganizations?.count ?? 0,
            newLast30Days: newOrganizations?.count ?? 0,
        },
```

- [ ] In `server/api/admin/users/[id].get.ts`, rinominare la sezione `events` dell'interface (righe 29-34). Sostituire:

```typescript
    events: Array<{
        id: string;
        name: string;
        isOwner: boolean;
        role: string;
    }>;
```

con:

```typescript
    organizations: Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
    }>;
```

- [ ] In `server/api/admin/users/[id].get.ts`, sostituire le righe 74-75 (`events: []` stub) con query reale su `member` join `organization`, e aggiornare il return (riga 80). Sostituire:

```typescript
    // STUB phase 1a — query su schema.eventUsers + schema.events rimosse; 1c usa org membership
    const events: Array<{ id: string; name: string; isOwner: boolean; role: string }> = [];

    return {
        ...user,
        subscriptions,
        events,
    };
```

con:

```typescript
    // Org membership (FASE 1c — sostituisce lo stub event di 1a)
    const organizations = await db
        .select({
            id: schema.organization.id,
            name: schema.organization.name,
            slug: schema.organization.slug,
            role: schema.member.role,
        })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(eq(schema.member.userId, userId));

    return {
        ...user,
        subscriptions,
        organizations,
    };
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore. La response admin ora ritorna `organizations` reali.
- [ ] Commit: `feat: repoint admin stats/users to organizations (phase 1c)`

---

## Task 10 — TEST: `verify-rbac.ts` (getOrgRole + cross-org null + assertOwnership 403)

**Files:**
- Create: `server/database/seed/verify-rbac.ts`
- Verify: `npx tsx server/database/seed/verify-rbac.ts` (dopo `pnpm db:seed`)

> Lo script asserisce gli invarianti di sicurezza 1c **offline** (no sessione viva): `getOrgRole` ritorna il ruolo corretto e **null cross-org** (= il 403 di sicurezza, provabile offline), le pure fns `roleCanWrite`/`roleIsOwner` mappano i ruoli, `assertOwnership` lancia 403 su null/undefined/mismatch e ritorna la risorsa quando ok. Usa il seed esistente (slug `personal-org`/`team-org`, ruoli owner/admin/member).

> **Nota di onestà:** l'enforcement HTTP 401/403 con cookie di sessione viva NON è tsx-testabile (manca l'infra di sessione headless finché 1b non è end-to-end). Quei due checkpoint ("no session → 401", "member NO via HTTP") sono coperti da **smoke manuale** (Task 12) + dai test di 1b. `verify-rbac.ts` prova il **cuore della logica** (ruolo da `member`, cross-org null, gating per ruolo, assertOwnership) che è ciò che il middleware/guard usano.

- [ ] Creare `server/database/seed/verify-rbac.ts`:

```typescript
import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";
import {
    getOrgRole,
    roleCanWrite,
    roleIsOwner,
    assertOwnership,
} from "../../utils/permissions";

/**
 * Gate di sicurezza FASE 1c — RBAC org-scoped, verificabile OFFLINE (no sessione viva).
 * INVARIANTI:
 *   1. getOrgRole(user, org) ritorna il ruolo corretto dalla tabella member.
 *   2. getOrgRole(userCross, orgAltrui) === null  ← è il 403 cross-org provabile offline.
 *   3. roleCanWrite/roleIsOwner mappano correttamente owner/admin/member.
 *   4. assertOwnership lancia 403 su null/undefined/mismatch; ritorna la risorsa se ok.
 * Esegui dopo `pnpm db:seed`. Richiede Postgres vivo + 1c landed (permissions.ts).
 */
async function expect403(label: string, fn: () => unknown): Promise<boolean> {
    try {
        fn();
        console.error(`[FAIL] ${label}: atteso 403, nessun errore lanciato`);
        return false;
    } catch (e: any) {
        if (e?.statusCode === 403) return true;
        console.error(`[FAIL] ${label}: atteso statusCode 403, ricevuto`, e?.statusCode, e?.message);
        return false;
    }
}

async function main() {
    const db = getDB();

    const orgs = await db
        .select({ id: schema.organization.id, slug: schema.organization.slug })
        .from(schema.organization);
    const b2c = orgs.find((o) => o.slug === "personal-org");
    const b2b = orgs.find((o) => o.slug === "team-org");
    if (!b2c || !b2b) {
        throw new Error("seed mancante: esegui `pnpm db:seed` prima");
    }

    // Membri seed: b2c owner; b2b owner/admin/member.
    async function memberByRole(orgId: string, role: string): Promise<string | null> {
        const rows = await db
            .select({ userId: schema.member.userId })
            .from(schema.member)
            .where(and(eq(schema.member.organizationId, orgId), eq(schema.member.role, role)))
            .limit(1);
        return rows[0]?.userId ?? null;
    }

    const b2cOwner = await memberByRole(b2c.id, "owner");
    const b2bOwner = await memberByRole(b2b.id, "owner");
    const b2bAdmin = await memberByRole(b2b.id, "admin");
    const b2bMember = await memberByRole(b2b.id, "member");
    if (!b2cOwner || !b2bOwner || !b2bAdmin || !b2bMember) {
        throw new Error("seed incompleto: attesi owner B2C + owner/admin/member B2B");
    }

    let ok = true;

    // INVARIANTE 1: ruoli corretti dalla tabella member.
    if ((await getOrgRole(b2bOwner, b2b.id)) !== "owner") { console.error("[FAIL] B2B owner role"); ok = false; }
    if ((await getOrgRole(b2bAdmin, b2b.id)) !== "admin") { console.error("[FAIL] B2B admin role"); ok = false; }
    if ((await getOrgRole(b2bMember, b2b.id)) !== "member") { console.error("[FAIL] B2B member role"); ok = false; }
    if ((await getOrgRole(b2cOwner, b2c.id)) !== "owner") { console.error("[FAIL] B2C owner role"); ok = false; }

    // INVARIANTE 2: cross-org → null (= 403 di sicurezza, provato offline).
    if ((await getOrgRole(b2cOwner, b2b.id)) !== null) {
        console.error("[FAIL] cross-org: utente B2C ha un ruolo in B2B (leak RBAC!)");
        ok = false;
    }
    if ((await getOrgRole(b2bMember, b2c.id)) !== null) {
        console.error("[FAIL] cross-org: membro B2B ha un ruolo in B2C (leak RBAC!)");
        ok = false;
    }

    // INVARIANTE 3: pure fns role-mapping.
    if (!roleCanWrite("owner") || !roleCanWrite("admin") || !roleCanWrite("member")) {
        console.error("[FAIL] roleCanWrite dovrebbe essere true per owner/admin/member"); ok = false;
    }
    if (roleCanWrite(null) || roleCanWrite("viewer")) {
        console.error("[FAIL] roleCanWrite dovrebbe essere false per null/ruolo sconosciuto"); ok = false;
    }
    if (!roleIsOwner("owner") || roleIsOwner("admin") || roleIsOwner("member")) {
        console.error("[FAIL] roleIsOwner dovrebbe essere true solo per owner"); ok = false;
    }

    // INVARIANTE 4: assertOwnership.
    ok = (await expect403("assertOwnership(null)", () => assertOwnership(null, b2b.id))) && ok;
    ok = (await expect403("assertOwnership(undefined)", () => assertOwnership(undefined, b2b.id))) && ok;
    ok = (await expect403("assertOwnership(mismatch)", () => assertOwnership({ organizationId: b2c.id }, b2b.id))) && ok;
    try {
        const r = assertOwnership({ organizationId: b2b.id, x: 1 }, b2b.id);
        if (r.x !== 1) { console.error("[FAIL] assertOwnership ok-case non ritorna la risorsa"); ok = false; }
    } catch (e: any) {
        console.error("[FAIL] assertOwnership ok-case ha lanciato:", e?.statusCode);
        ok = false;
    }

    if (!ok) {
        console.error("[verify-rbac] RBAC VIOLATO");
        process.exit(1);
    }
    console.log("[verify-rbac] OK — ruoli corretti, cross-org → null, pure fns + assertOwnership 403 OK");
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-rbac] errore", e);
    process.exit(1);
});
```

- [ ] Verifica: `pnpm db:seed && npx tsx server/database/seed/verify-rbac.ts`. Output atteso: `[verify-rbac] OK — ruoli corretti, cross-org → null, pure fns + assertOwnership 403 OK` ed exit code 0.
- [ ] Commit: `test: add offline RBAC verification script (phase 1c)`

---

## Task 11 — Verifica isolamento repository 1a intatta + typecheck globale

**Files:**
- Verify: `npx tsx server/database/seed/verify-isolation.ts`, `pnpm typecheck`

> Smoke di non-regressione: 1c non deve rompere l'invariante repository di 1a.

- [ ] `npx tsx server/database/seed/verify-isolation.ts` (dopo seed). Output atteso: `[verify-isolation] OK — B2C=... projects, B2B=... projects, nessun leak cross-tenant` (invariante 1a intatta).
- [ ] `pnpm typecheck`. Output atteso: **VERDE su tutto il progetto** (vue-tsc tipa anche `app/`). I rename di 1c non introducono errori tipati in `app/` (verificato in Task 6: nessun consumer tipato del campo `max_events`; le response-key rinominate sono lette via `$fetch` non tipato). Se compare un errore tipato in `app/`, NON è atteso → investigare (non è un gap 1d).
- [ ] Commit: nessuno (verifica pura; se servono fix puntuali, commit `fix:` mirato).

---

## Task 12 — Smoke manuale + checkpoint di fase

**Files:**
- Verify: `pnpm dev`, grep gate

> Gli enforcement HTTP con sessione viva (401/403) sono **runtime-contingenti su 1b** (org attiva in sessione). Lo smoke li copre quando 1b è landed; offline restano coperti da `verify-rbac.ts`.

- [ ] Gate statico — ogni route org ha `requireAuth`; nessuna `/api/team/*` o `/api/events/*` residua:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas
  grep -L "requireAuth" server/api/organizations/*.ts server/api/organizations/\[id\]/members/*.ts   # atteso: vuoto
  ls server/api/team 2>&1 | grep -q "No such" && echo "team OK rimossa"                              # atteso: "team OK rimossa"
  ls server/api/events 2>&1 | grep -q "No such" && echo "events OK rimossa"                          # atteso: "events OK rimossa"
  grep -rn "max_events\|maxEvents\|countUserEvents\|canCreateEvent" server/ shared/                   # atteso: vuoto
  ```
- [ ] Smoke (richiede 1b landed + sessione viva) `pnpm dev`:
  - `GET /api/organizations` autenticato → lista org dell'utente.
  - `POST /api/organizations` con `{ name }` → crea org (member owner via plugin); senza sessione → 401.
  - `GET /api/organizations/:id/members` da un membro → membri+inviti; da non-membro → 403.
  - Una risorsa app-resource (es. `/api/projects` di FASE 4, se landed) da org attiva A non vede righe di org B; by-id cross-org → 403.
- [ ] Checkpoint 1c (mappatura a verifica concreta):
    - [ ] `getOrgRole` ritorna il ruolo corretto dalla tabella `member` → `verify-rbac.ts` INVARIANTE 1.
    - [ ] Owner/admin gestiscono, member gating per ruolo → `roleCanWrite`/`roleIsOwner` in `verify-rbac.ts` INVARIANTE 3 (gating logico offline) + smoke (HTTP, runtime-contingente 1b).
    - [ ] Middleware/guard: senza sessione → 401 → `requireAuth` nelle route (smoke; runtime-contingente 1b). *(Il middleware è convenienza non-bloccante; l'enforcement è nel guard.)*
    - [ ] `assertOwnership` blocca cross-org → 403 → `verify-rbac.ts` INVARIANTE 4 + cross-org null INVARIANTE 2.
    - [ ] Route `/api/organizations/*` funzionano; nessuna `/api/events/*` o `/api/team/*` residua → gate statico sopra.
    - [ ] `pnpm typecheck` verde → Task 11.
- [ ] Commit finale: `feat: org-based RBAC, middleware and routes (phase 1c)`

---

## Avvertenze runtime-contingenti (riepilogo)

1. **Org attiva in sessione (cablata da 1b).** `loadActiveOrganization` legge `session.session.activeOrganizationId`. Il VALORE è impostato da 1b (`databaseHooks.session.create.before` + `setActiveOrganization`, baseline A1/E1). Finché 1b non landa, in sessione viva il campo è assente → i guard danno 403 (nessuna org attiva) — comportamento corretto, non un bug di 1c. `verify-rbac.ts` non dipende da questo (interroga `member` direttamente).
2. **`getSession` espone `activeOrganizationId`** (atteso per lo schema-session del plugin org; baseline E4) — da confermare a runtime con sessione viva quando 1b landa.
3. **Firme `auth.api.*` org** (create/get/update/delete) pinnate dalla baseline 1.4.5; se il typecheck segnala forma di parametro diversa, allinearla mantenendo la semantica (delega + path-id authz). Task 7 lo nota.
4. **`db:generate` interattivo** sul rename colonna `max_organizations` (TTY noto) — fallback `db:push` o file SQL `RENAME COLUMN` inline (Task 6). Il rename preserva i dati.
5. **Enforcement HTTP 401/403** con cookie vivo = smoke + test 1b; offline coperto da `verify-rbac.ts`.
6. **Frontend (`app/`) NON toccato — gap di RUNTIME, non di typecheck.** Verificato: nessun consumer tipato di `max_events` in `app/` (grep → 0 hit), quindi il rename mantiene `pnpm typecheck` verde. I gap residui sono RUNTIME (response-key lette via `$fetch` non tipato): `userStore.usage.events` (`app/stores/userStore.ts:22,185`), admin `data.events` (`HomeEventCards.client.vue:143`, `eventStore.ts:114`). Si allineano a `usage.organizations`/`organizations` in **1d**. Dichiarati, non nascosti.

## Cosa 1c esplicitamente NON copre

- Frontend/store/pagine/gating UI/composable → **1d**.
- Signup→org, org attiva in sessione, wiring team plugin, email invito → già **1b**.
- Team mutations (invite/accept/remove/update-role) → plugin nativo / route 1d (1c espone solo `…/members` GET).
- Driver Neon, deploy, `projects` CRUD completa, branding, docs → FASI 2-5.
- Completare la sezione `team` di `/api/limits` (count membri/inviti org-aware) → 1d.
