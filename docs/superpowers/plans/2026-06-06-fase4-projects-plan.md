# FASE 4 — Entità-esempio `projects` (CRUD multi-tenant org-scoped) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare `projects` (oggi solo schema, da 1a) nell'entità di RIFERIMENTO CRUD end-to-end org-scoped che chi clona il boilerplate copia per ogni risorsa futura.

**Architecture:** Route thin controller (`/api/projects` top-level, org dal context) → service (org da `event.context`, mai dal client) → repository org-scoped (`WHERE organizationId` in ogni query) → schema Zod. Isolamento tenant a difesa in profondità: query scoped by-construction + `assertOwnership` come 2° guard (null → 403, non leakare esistenza). Frontend Nuxt UI v4: pagina dashboard con `useAsyncData` (CSR) + composable `useProjects`, CRUD completo (lista/create/edit/delete) via un solo `UModal` guidato da `editingId`.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Drizzle ORM (PostgreSQL), Zod, Better Auth (org plugin), Nuxt UI v4, vue-i18n. Nessun framework di test: verifica via `pnpm typecheck`, `pnpm db:migrate`, script tsx assertivi.

---

## ⚠️ GATE HARD — Prerequisiti 1b/1c/1d (oggi NON implementati)

**Questo piano NON può iniziare prima che 1b/1c/1d siano landed.** Solo 1a è committato. FASE 4 è scritta contro l'API ASSUNTA post-1c/1d. Verificato a inizio piano:

- `server/utils/permissions.ts` → **non esiste** (cancellato in FASE 0).
- `server/middleware/2.events.ts` → **stub no-op** (verificato: `defineEventHandler(() => {})`).
- grep `activeOrganizationId` su `server/` + `app/` → **0 hit** (org attiva inferita in Redis/sessione, non cablata).
- `organizationStore` → **non esiste** (oggi `app/stores/eventStore.ts`).

### Contratti ASSUNTI da 1b/1c/1d (allineamento obbligatorio — se 1c/1d definiscono firme diverse, riallineare PRIMA di eseguire)

| Simbolo | Fase | Contratto assunto (questo piano dipende da questo) |
|---|---|---|
| `requireMember(event)` | 1c | Risolve l'org attiva dalla sessione, verifica che lo user sia membro, popola `event.context.organization = { id, role, ... }` e lo ritorna. 401 se non autenticato, 403/404 se non membro. **NON dipende dal path** (deve funzionare anche su `/api/projects/*`, non solo `/api/organizations/*`). |
| `requireWrite(event)` | 1c | Come `requireMember` ma richiede ruolo con permesso di scrittura. Per le risorse: write = owner/admin/member (tutti scrivono, nessun viewer — deciso in spec FASE 1). Ritorna/popola `event.context.organization`. |
| `assertOwnership(resource, organizationId)` | 1c | Helper: se `resource` è `null`/`undefined` **oppure** `resource.organizationId !== organizationId` → `throw createError({ statusCode: 403 })`. **null trattato come 403** (non leakare esistenza cross-tenant). Ritorna la risorsa non-null se ok. |
| `event.context.organization` | 1c | Popolato dal guard RBAC con `{ id: string, role: string, ... }` = org attiva del membro. Il service legge `organizationId` SOLO da qui, mai da body/query. |
| `organizationStore` (`role`) | 1d | Store Pinia con `role` dell'org attiva, per il gating UI. |

> **Nota di onestà (baseline):** la risoluzione dell'org attiva è il perno del pattern e oggi non compare nel codice (grep 0 hit). Va **confermata a runtime** quando 1b cabla l'org attiva. Finché 1c non esiste, il Task 4 (test 403 a livello service) **importa i simboli reali e fallirà a compile/run** — è il comportamento atteso del "test eseguibile che fallisce prima, passa dopo".

> **Decisione 403-vs-404 (seam critico):** i fetch by-id usano il repository **scoped** (`findProjectByIdScoped` → null se di altra org), poi il service passa il risultato (anche null) a `assertOwnership`, che tratta **null come 403**. Così cross-org e inesistente danno entrambi 403, senza leakare l'esistenza, e la query resta scoped by-construction. Il test del Task 4 asserisce `statusCode === 403`.

> **Decisione route/context (seam critico):** le route `/api/projects/*` chiamano `requireMember(event)`/`requireWrite(event)` **esplicitamente** come prima riga RBAC. È il guard a risolvere org-attiva+ruolo e popolare il context — il pattern NON dipende dal middleware path-matched `/api/organizations/*`. Ogni risorsa futura clona questa forma.

---

## Decisioni di fase (chiuse, NON rivalutare)

| # | Decisione | Scelta |
|---|---|---|
| 1 | Campi | `name` (NOT NULL) + `description` (text **nullable**) + `status` (enum `active`/`archived`, default `active`) |
| 2 | `status` storage | colonna `text` semplice + Zod `z.enum([...])` (coerente con lo schema esistente che usa `text`; evita attrito `pgEnum`) |
| 3 | Route shape | top-level `/api/projects` (org dal `event.context`, client non passa mai `orgId`) |
| 4 | Isolamento | query scoped by-construction (`WHERE organizationId`) + `assertOwnership` 2° guard sui by-id (null → 403) |
| 5 | Frontend state | composable `useProjects` + `useAsyncData` (CSR), **no** Pinia store dedicato |
| 6 | UI | CRUD completo: lista + create + edit + delete (un solo `UModal` guidato da `editingId`) |
| 7 | planLimit | **fuori** dal core (non incluso in questa fase) |

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `server/database/schema/projects.ts` | Modify | Aggiungere `description` (nullable) + `status` (text, default `"active"`) |
| `drizzle/migrations/*` | Create (generato) | Migration additiva colonne `description`/`status` |
| `shared/schemas/project.ts` | Create | `createProjectSchema` / `updateProjectSchema` + tipi inferiti |
| `shared/schemas/index.ts` | Modify | `export * from "./project"` |
| `server/repositories/projectRepository.ts` | Modify | + `findProjectByIdScoped`, `createProject`, `updateProjectScoped`, `deleteProjectScoped` (tutti `WHERE organizationId`) |
| `server/utils/audit/types.ts` | Modify | + `AUDIT_CATEGORIES.project` + `project.created/updated/deleted` |
| `server/services/project.service.ts` | Create | Logica business: org da context, `assertOwnership`, `logAudit` su scrittura |
| `server/api/projects/index.get.ts` | Create | `GET /api/projects` (lista) — `requireMember` |
| `server/api/projects/index.post.ts` | Create | `POST /api/projects` (crea) — `requireWrite` |
| `server/api/projects/[id].get.ts` | Create | `GET /api/projects/:id` — `requireMember` + `assertOwnership` |
| `server/api/projects/[id].put.ts` | Create | `PUT /api/projects/:id` — `requireWrite` + `assertOwnership` |
| `server/api/projects/[id].delete.ts` | Create | `DELETE /api/projects/:id` — `requireWrite` + `assertOwnership` |
| `app/composables/useProjects.ts` | Create | `list/create/update/remove` via `$fetch`, `isLoading`/`error`, guard `import.meta.server` |
| `app/pages/dashboard/projects/index.vue` | Create | Pagina CRUD Nuxt UI v4 (UTable + UModal + UForm) |
| `i18n/locales/it-IT.json` | Modify | `dashboard.projects.*` (chiavi funzionali) |
| `i18n/locales/en-US.json` | Modify | `dashboard.projects.*` (chiavi funzionali) |
| `server/database/seed/index.ts` | Modify | Arricchire i projects con `description`/`status` + qualche riga in più |
| `server/database/seed/verify-isolation-api.ts` | Create | **Test critico**: 403 cross-org a livello service + lista non leaka |

---

## Task 1 — Schema DB: aggiungere `description` + `status` + migration

**Files:**
- Modify: `server/database/schema/projects.ts:11-28`
- Verify: `pnpm db:generate`, `pnpm db:migrate`

- [ ] Modificare `server/database/schema/projects.ts`. Sostituire il blocco colonne (righe 14-23, da `id:` fino a `.notNull()` di `updatedAt`) aggiungendo `description` e `status`. Risultato completo del blocco `pgTable`:

```typescript
export const projects = pgTable(
    "projects",
    {
        id: text("id").primaryKey().$default(() => uuidv7()),
        organizationId: text("organization_id")
            .notNull()
            .references(() => organization.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        description: text("description"),
        status: text("status").default("active").notNull(),
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
```

- [ ] Aggiornare il commento di intestazione del file (righe 6-10) per togliere "Qui solo lo schema". Sostituire il blocco commento con:

```typescript
/**
 * Example domain table — multi-tenant pattern reference (CRUD completo, FASE 4).
 * Ogni risorsa di dominio futura si modella così: organizationId NOT NULL + indice.
 * Campi esemplari: name (NOT NULL), description (nullable), status (enum via text + Zod).
 * Service: server/services/project.service.ts — API: server/api/projects/.
 */
```

- [ ] Generare la migration: `pnpm db:generate`. Output atteso: drizzle-kit rileva 2 nuove colonne additive (`description`, `status`) e crea un file in `drizzle/migrations/`. Aggiunta di colonne nuove è additiva → **non** dovrebbe servire la conferma rename interattiva. **Fallback se il prompt TTY si blocca:** generare a mano. Eseguire `pnpm db:push` (applica lo schema diff direttamente) **oppure** creare il file migration a mano con SQL: `ALTER TABLE "projects" ADD COLUMN "description" text; ALTER TABLE "projects" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;` e aggiornare lo snapshot drizzle.
- [ ] Applicare la migration: `pnpm db:migrate`. Output atteso: la migration viene eseguita senza errori (o "No migrations to run" se è stato usato `db:push`).
- [ ] Verifica colonne presenti: `pnpm db:studio` (o query manuale) — la tabella `projects` ha `description` (nullable) e `status` (default `active`).
- [ ] Commit: `feat(projects): add description + status columns (phase 4)`

---

## Task 2 — Schema Zod `shared/schemas/project.ts` + barrel

**Files:**
- Create: `shared/schemas/project.ts`
- Modify: `shared/schemas/index.ts:9`
- Verify: `pnpm typecheck`

- [ ] Creare `shared/schemas/project.ts` con create/update separati (modello: `shared/schemas/event.ts:1-33`, helper da `shared/schemas/common.ts:8` `nonEmptyString`):

```typescript
import { z } from "zod";
import { nonEmptyString } from "./common";

export const projectStatusEnum = z.enum(["active", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusEnum>;

export const createProjectSchema = z.object({
    name: nonEmptyString.max(200),
    description: z.string().max(2000).nullish(),
    status: projectStatusEnum.default("active"),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
    name: nonEmptyString.max(200).optional(),
    description: z.string().max(2000).nullish(),
    status: projectStatusEnum.optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
```

- [ ] Aggiungere l'export al barrel `shared/schemas/index.ts`. Dopo la riga 9 (`export * from "./event";`) aggiungere:

```typescript
export * from "./project";
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore nuovo relativo a `shared/schemas/project.ts` o al barrel.
- [ ] Commit: `feat(projects): add Zod create/update schemas (phase 4)`

---

## Task 3 — Repository org-scoped: 4 metodi mancanti

**Files:**
- Modify: `server/repositories/projectRepository.ts:1-11`
- Verify: `pnpm typecheck`

> Ogni metodo porta `WHERE organizationId = ?` (isolamento by-construction). I by-id usano `and(eq(id), eq(organizationId))` → ritornano `undefined` se la riga è di un'altra org (il service poi passa a `assertOwnership`, null → 403).

- [ ] Sostituire l'intero contenuto di `server/repositories/projectRepository.ts` con (mantiene `findProjectsByOrg`, aggiunge i 4 metodi; tipi `Create/UpdateProjectInput` dallo schema Zod):

```typescript
import { and, eq } from "drizzle-orm";
import { getDB } from "../utils/db";
import * as schema from "../database/schema";
import type { CreateProjectInput, UpdateProjectInput } from "~~/shared/schemas/project";

/** Lista projects di un'org (scoped by-construction). */
export async function findProjectsByOrg(organizationId: string) {
    const db = getDB();
    return db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId));
}

/** Fetch singolo project scoped: undefined se di un'altra org (no leak). */
export async function findProjectByIdScoped(organizationId: string, id: string) {
    const db = getDB();
    const rows = await db
        .select()
        .from(schema.projects)
        .where(
            and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
            ),
        )
        .limit(1);
    return rows[0];
}

/** Crea un project nell'org indicata. */
export async function createProject(
    organizationId: string,
    data: CreateProjectInput,
) {
    const db = getDB();
    const rows = await db
        .insert(schema.projects)
        .values({
            organizationId,
            name: data.name,
            description: data.description ?? null,
            status: data.status ?? "active",
        })
        .returning();
    return rows[0];
}

/** Update scoped: aggiorna solo se il project appartiene all'org. Undefined altrimenti. */
export async function updateProjectScoped(
    organizationId: string,
    id: string,
    data: UpdateProjectInput,
) {
    const db = getDB();
    const patch: Partial<typeof schema.projects.$inferInsert> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.status !== undefined) patch.status = data.status;
    const rows = await db
        .update(schema.projects)
        .set(patch)
        .where(
            and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
            ),
        )
        .returning();
    return rows[0];
}

/** Delete scoped: elimina solo se il project appartiene all'org. Undefined altrimenti. */
export async function deleteProjectScoped(organizationId: string, id: string) {
    const db = getDB();
    const rows = await db
        .delete(schema.projects)
        .where(
            and(
                eq(schema.projects.id, id),
                eq(schema.projects.organizationId, organizationId),
            ),
        )
        .returning();
    return rows[0];
}
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore in `projectRepository.ts` (import `CreateProjectInput`/`UpdateProjectInput` risolve, `$inferInsert` valido).
- [ ] Commit: `feat(projects): add scoped repository methods (phase 4)`

---

## Task 4 — Audit: categoria + azioni `project.*`

**Files:**
- Modify: `server/utils/audit/types.ts:6-19` (categorie) e `:67-71` (azioni)
- Verify: `pnpm typecheck`

> `AuditAction`/`AuditCategory` sono union chiusi: vanno estesi PRIMA di usarli nel service, altrimenti type error. `getCategoryFromAction` fa il cast del prefisso → la voce categoria deve esistere.

- [ ] In `server/utils/audit/types.ts`, dentro `AUDIT_CATEGORIES` (oggetto righe 6-19), aggiungere la voce `project` dopo `event:` (riga 13). Sostituire la riga `  event: 'event',` con:

```typescript
  event: 'event',
  project: 'project',
```

- [ ] In `server/utils/audit/types.ts`, dentro `AUDIT_ACTIONS`, dopo il blocco `// Event` (righe 67-71, dopo `'event.deleted': 'event.deleted',`) aggiungere il blocco project. Sostituire:

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

  // Project (entità-esempio multi-tenant — FASE 4)
  'project.created': 'project.created',
  'project.updated': 'project.updated',
  'project.deleted': 'project.deleted',
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore; `AuditAction` ora include i 3 nuovi literal.
- [ ] Commit: `feat(projects): add audit categories/actions (phase 4)`

---

## Task 5 — Service `server/services/project.service.ts`

**Files:**
- Create: `server/services/project.service.ts`
- Verify: `pnpm typecheck` (atteso: ERRORE su import `permissions` finché 1c non landa — vedi nota gate)

> Stile di riferimento: `server/services/contact.service.ts:23-132` (firma `(event, data)`, `getDB`, `createError`, `logAudit`). Org letta SOLO da `event.context.organization` (popolata da `requireMember/requireWrite`). I by-id passano per `assertOwnership` (null → 403).

- [ ] Creare `server/services/project.service.ts`:

```typescript
/**
 * Project Service — entità-esempio multi-tenant org-scoped (FASE 4).
 *
 * RICETTA riproducibile per ogni risorsa di dominio futura:
 *   1. organizationId SEMPRE da event.context.organization (popolata da requireMember/requireWrite),
 *      MAI da body/query.
 *   2. Query repository scoped by-construction (WHERE organizationId).
 *   3. assertOwnership come 2° guard sui by-id (null → 403, no leak esistenza).
 *   4. logAudit obbligatorio su ogni scrittura.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import type {
    CreateProjectInput,
    UpdateProjectInput,
} from "~~/shared/schemas/project";
import {
    findProjectsByOrg,
    findProjectByIdScoped,
    createProject as createProjectRow,
    updateProjectScoped,
    deleteProjectScoped,
} from "../repositories/projectRepository";
import { assertOwnership } from "../utils/permissions";
import { logAudit } from "../utils/audit";

/** Legge l'org attiva dal context. 401 se assente (guard RBAC non eseguito). */
function getOrgId(event: H3Event<EventHandlerRequest>): string {
    const orgId = event.context.organization?.id;
    if (!orgId) {
        throw createError({
            statusCode: 401,
            statusMessage: "Organizzazione attiva non risolta",
        });
    }
    return orgId;
}

/** Lista i projects dell'org attiva. */
export async function listProjects(event: H3Event<EventHandlerRequest>) {
    const organizationId = getOrgId(event);
    const projects = await findProjectsByOrg(organizationId);
    return { projects };
}

/** Singolo project by-id, scoped + assertOwnership (null → 403). */
export async function getProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
) {
    const organizationId = getOrgId(event);
    const project = await findProjectByIdScoped(organizationId, id);
    assertOwnership(project, organizationId);
    return { project };
}

/** Crea un project nell'org attiva + audit. */
export async function createProject(
    event: H3Event<EventHandlerRequest>,
    data: CreateProjectInput,
) {
    const organizationId = getOrgId(event);
    const project = await createProjectRow(organizationId, data);
    await logAudit(event, "project.created", {
        organizationId,
        targetType: "project",
        targetId: project.id,
    });
    return { project };
}

/** Aggiorna un project dell'org attiva (scoped) + assertOwnership + audit. */
export async function updateProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
    data: UpdateProjectInput,
) {
    const organizationId = getOrgId(event);
    const existing = await findProjectByIdScoped(organizationId, id);
    assertOwnership(existing, organizationId);
    const project = await updateProjectScoped(organizationId, id, data);
    await logAudit(event, "project.updated", {
        organizationId,
        targetType: "project",
        targetId: id,
    });
    return { project };
}

/** Elimina un project dell'org attiva (scoped) + assertOwnership + audit. */
export async function deleteProject(
    event: H3Event<EventHandlerRequest>,
    id: string,
) {
    const organizationId = getOrgId(event);
    const existing = await findProjectByIdScoped(organizationId, id);
    assertOwnership(existing, organizationId);
    await deleteProjectScoped(organizationId, id);
    await logAudit(event, "project.deleted", {
        organizationId,
        targetType: "project",
        targetId: id,
    });
    return { success: true };
}
```

- [ ] Verifica: `pnpm typecheck`. Output atteso (PRIMA di 1c): **errore** `Cannot find module '../utils/permissions'` su `assertOwnership` — atteso, il gate 1c non è landed. DOPO 1c (gate soddisfatto): nessun errore. **Non procedere oltre il Task 8 se 1c non è landed.**
- [ ] Commit: `feat(projects): add org-scoped service with audit (phase 4)`

---

## Task 6 — API: 5 thin controller in `server/api/projects/`

**Files:**
- Create: `server/api/projects/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].put.ts`, `[id].delete.ts`
- Verify: `pnpm typecheck`

> Pattern (riferimenti `server/api/contact.post.ts:9-19`, `server/api/user/profile.patch.ts:9-14`): `requireAuth` → RBAC org (`requireMember`/`requireWrite` che risolve+popola context) → `parseBody`/`parseQueryParams` → delega al service → try/catch re-throw `statusCode` + fallback 500 (gestione `23505`). Validazione SEMPRE via `parseBody` (`server/utils/validateBody.ts:8`).

- [ ] Creare `server/api/projects/index.get.ts`:

```typescript
/**
 * GET /api/projects
 * Lista i projects dell'org attiva (RBAC: requireMember).
 */
import { requireMember } from "~~/server/utils/permissions";
import { listProjects } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);

    try {
        return await listProjects(event);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.index.get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to list projects" });
    }
});
```

- [ ] Creare `server/api/projects/index.post.ts`:

```typescript
/**
 * POST /api/projects
 * Crea un project nell'org attiva (RBAC: requireWrite).
 */
import { createProjectSchema } from "~~/shared/schemas/project";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { createProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const data = await parseBody(event, createProjectSchema);

    try {
        return await createProject(event, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        if (e.code === "23505") {
            throw createError({ statusCode: 409, statusMessage: "Project already exists" });
        }
        console.error("[projects.index.post] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to create project" });
    }
});
```

- [ ] Creare `server/api/projects/[id].get.ts`:

```typescript
/**
 * GET /api/projects/:id
 * Singolo project (RBAC: requireMember + assertOwnership nel service).
 */
import { requireMember } from "~~/server/utils/permissions";
import { getProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireMember(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing project id" });
    }

    try {
        return await getProject(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.[id].get] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to fetch project" });
    }
});
```

- [ ] Creare `server/api/projects/[id].put.ts`:

```typescript
/**
 * PUT /api/projects/:id
 * Aggiorna un project (RBAC: requireWrite + assertOwnership nel service).
 */
import { updateProjectSchema } from "~~/shared/schemas/project";
import { parseBody } from "~~/server/utils/validateBody";
import { requireWrite } from "~~/server/utils/permissions";
import { updateProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing project id" });
    }
    const data = await parseBody(event, updateProjectSchema);

    try {
        return await updateProject(event, id, data);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.[id].put] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to update project" });
    }
});
```

- [ ] Creare `server/api/projects/[id].delete.ts`:

```typescript
/**
 * DELETE /api/projects/:id
 * Elimina un project (RBAC: requireWrite + assertOwnership nel service).
 */
import { requireWrite } from "~~/server/utils/permissions";
import { deleteProject } from "~~/server/services/project.service";

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    await requireWrite(event);
    const id = getRouterParam(event, "id");
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: "Missing project id" });
    }

    try {
        return await deleteProject(event, id);
    } catch (e: any) {
        if (e.statusCode) throw e;
        console.error("[projects.[id].delete] error:", e);
        throw createError({ statusCode: 500, statusMessage: "Failed to delete project" });
    }
});
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: solo l'errore residuo su `permissions` finché 1c non landa; nessun errore nelle route (firme service corrette, `parseBody`/`requireAuth` auto-importati da Nitro).
- [ ] Commit: `feat(projects): add 5 thin controllers (phase 4)`

---

## Task 7 — Seeder: arricchire i projects con i nuovi campi

**Files:**
- Modify: `server/database/seed/index.ts:72-77`
- Verify: `pnpm db:reset && pnpm db:seed`

- [ ] In `server/database/seed/index.ts`, sostituire il blocco `// --- projects per testare l'isolamento ---` (righe 72-77) con (aggiunge `description`/`status` e una riga in più per org per esercitare l'enum):

```typescript
    // --- projects per testare l'isolamento (con description nullable + status enum) ---
    await db.insert(schema.projects).values([
        { id: uuidv7(), organizationId: orgB2C, name: "B2C Project 1", description: "Primo progetto personale", status: "active" },
        { id: uuidv7(), organizationId: orgB2C, name: "B2C Project 2", description: null, status: "archived" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 1", description: "Progetto del team", status: "active" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 2", description: null, status: "active" },
        { id: uuidv7(), organizationId: orgB2B, name: "B2B Project 3", description: "Progetto archiviato", status: "archived" },
    ]);
```

- [ ] Verifica: `pnpm db:reset` poi `pnpm db:seed`. Output atteso: `[seed] done — orgB2C=... orgB2B=...` senza errori (le colonne `description`/`status` accettate).
- [ ] Verifica isolamento repository (invariante 1a, deve restare verde): `npx tsx server/database/seed/verify-isolation.ts`. Output atteso: `[verify-isolation] OK — B2C=2 projects, B2B=3 projects, nessun leak cross-tenant`.
- [ ] Commit: `feat(projects): enrich seed with description/status (phase 4)`

---

## Task 8 — TEST CRITICO: 403 cross-org a livello service (script tsx)

**Files:**
- Create: `server/database/seed/verify-isolation-api.ts`
- Verify: `npx tsx server/database/seed/verify-isolation-api.ts`

> Requisito di sicurezza della fase (checkpoint master spec). I guard route-level (`requireMember`) richiedono una sessione viva → non tsx-testabili. Ma i due invarianti del checkpoint vivono nel SERVICE e SONO testabili con un `event` mock che porta `context.organization`. Lo script importa i simboli REALI (service + `assertOwnership`): **fallisce a compile/run finché 1c non landa** (`permissions` assente), **passa dopo** — è il "test eseguibile che fallisce prima, passa dopo" della metodologia.

- [ ] Creare `server/database/seed/verify-isolation-api.ts`:

```typescript
import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import {
    listProjects,
    getProject,
    updateProject,
    deleteProject,
} from "../../services/project.service";

/**
 * Gate di sicurezza FASE 4: isolamento tenant a LIVELLO SERVICE (oltre il repository).
 * INVARIANTI:
 *   1. listProjects con org A non restituisce mai projects di org B.
 *   2. getProject/updateProject/deleteProject su un project di org B → 403 (assertOwnership).
 *
 * Costruisce un H3Event-mock con context.organization (ciò che 1c popola via requireMember).
 * Esegui dopo `pnpm db:seed`. Richiede 1c landed (assertOwnership) + Postgres vivo.
 */

/** Mock minimale di H3Event: solo i campi che il service legge. */
function mockEvent(organizationId: string, userId: string): any {
    return {
        context: {
            organization: { id: organizationId, role: "owner" },
            user: { id: userId },
        },
        // logAudit legge headers via getHeader(event, ...): node.req con headers vuoti basta.
        node: { req: { headers: {} } },
    };
}

async function expect403(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    try {
        await fn();
        console.error(`[FAIL] ${label}: atteso 403, nessun errore lanciato`);
        return false;
    } catch (e: any) {
        if (e?.statusCode === 403) {
            return true;
        }
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

    // Un membro per ciascuna org (owner del seed).
    const b2cMember = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2c.id))
        .limit(1);
    if (!b2cMember[0]) throw new Error("seed mancante: nessun membro per org B2C");
    const b2cUserId = b2cMember[0].userId;

    // Un project che appartiene a B2B (target cross-org per i tentativi da B2C).
    const b2bProjects = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, b2b.id))
        .limit(1);
    if (!b2bProjects[0]) throw new Error("seed mancante: nessun project per org B2B");
    const foreignProjectId = b2bProjects[0].id;

    const eventB2C = mockEvent(b2c.id, b2cUserId);

    let ok = true;

    // INVARIANTE 1: list come membro B2C non contiene mai righe B2B.
    const { projects: listedForB2C } = await listProjects(eventB2C);
    const leaked = listedForB2C.filter((p: any) => p.organizationId !== b2c.id);
    if (leaked.length > 0) {
        console.error("[FAIL] listProjects(B2C) contiene righe non-B2C:", leaked);
        ok = false;
    }
    if (listedForB2C.length === 0) {
        console.error("[FAIL] listProjects(B2C) vuota — seed incompleto");
        ok = false;
    }

    // INVARIANTE 2: get/put/delete su project di B2B come membro B2C → 403.
    ok = (await expect403("getProject cross-org", () => getProject(eventB2C, foreignProjectId))) && ok;
    ok = (await expect403("updateProject cross-org", () => updateProject(eventB2C, foreignProjectId, { name: "hack" }))) && ok;
    ok = (await expect403("deleteProject cross-org", () => deleteProject(eventB2C, foreignProjectId))) && ok;

    // Sanity: il project di B2B esiste ancora (il delete cross-org NON deve averlo toccato).
    const stillThere = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.id, foreignProjectId))
        .limit(1);
    if (!stillThere[0]) {
        console.error("[FAIL] il project B2B è sparito dopo i tentativi cross-org — leak di scrittura!");
        ok = false;
    }

    if (!ok) {
        console.error("[verify-isolation-api] ISOLAMENTO API VIOLATO");
        process.exit(1);
    }
    console.log(
        `[verify-isolation-api] OK — list scoped (${listedForB2C.length} righe B2C, 0 leak), get/put/delete cross-org → 403`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-isolation-api] errore", e);
    process.exit(1);
});
```

- [ ] Verifica (PRIMA di 1c — deve fallire): `npx tsx server/database/seed/verify-isolation-api.ts`. Output atteso: errore di import/run su `assertOwnership` (modulo `permissions` assente) → exit code != 0. È il "fallisce prima" atteso.
- [ ] Verifica (DOPO 1c + seed — deve passare): `pnpm db:reset && pnpm db:seed && npx tsx server/database/seed/verify-isolation-api.ts`. Output atteso: `[verify-isolation-api] OK — list scoped (2 righe B2C, 0 leak), get/put/delete cross-org → 403` ed exit code 0.
- [ ] Commit: `test(projects): add service-level cross-org 403 isolation script (phase 4)`

---

## Task 9 — Composable `app/composables/useProjects.ts`

**Files:**
- Create: `app/composables/useProjects.ts`
- Verify: `pnpm typecheck`

> CRUD via `$fetch`, `isLoading`/`error`, guard `import.meta.server` per le letture (allineato a `useAsyncData {server:false}` della pagina). Tipi inferiti dagli schemi Zod.

- [ ] Creare `app/composables/useProjects.ts`:

```typescript
import type {
    CreateProjectInput,
    UpdateProjectInput,
    ProjectStatus,
} from "~~/shared/schemas/project";

export interface ProjectItem {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
}

export function useProjects() {
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    async function list(): Promise<ProjectItem[]> {
        if (import.meta.server) return [];
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ projects: ProjectItem[] }>("/api/projects");
            return res.projects ?? [];
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nel caricamento";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function create(data: CreateProjectInput): Promise<ProjectItem> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ project: ProjectItem }>("/api/projects", {
                method: "POST",
                body: data,
            });
            return res.project;
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nella creazione";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function update(id: string, data: UpdateProjectInput): Promise<ProjectItem> {
        isLoading.value = true;
        error.value = null;
        try {
            const res = await $fetch<{ project: ProjectItem }>(`/api/projects/${id}`, {
                method: "PUT",
                body: data,
            });
            return res.project;
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nell'aggiornamento";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    async function remove(id: string): Promise<void> {
        isLoading.value = true;
        error.value = null;
        try {
            await $fetch(`/api/projects/${id}`, { method: "DELETE" });
        } catch (e: any) {
            error.value = e.data?.message || e.message || "Errore nell'eliminazione";
            throw e;
        } finally {
            isLoading.value = false;
        }
    }

    return { isLoading, error, list, create, update, remove };
}
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore in `useProjects.ts` (tipi Zod risolvono; `$fetch`/`ref`/`import.meta` auto-importati).
- [ ] Commit: `feat(projects): add useProjects composable (phase 4)`

---

## Task 10 — i18n: chiavi funzionali `dashboard.projects.*`

**Files:**
- Modify: `i18n/locales/it-IT.json:565` (inserire prima di `"customers"`)
- Modify: `i18n/locales/en-US.json` (stessa posizione, prima di `"customers"`)
- Verify: `python3 -c "import json; json.load(open('i18n/locales/it-IT.json')); json.load(open('i18n/locales/en-US.json'))"`

> Chiavi FUNZIONALI per la UI (non marketing — quello è FASE 5). Inserire il blocco `"projects"` come nuova chiave di `dashboard`, subito prima di `"customers"`. Indentazione: 8 spazi per la chiave, coerente con le sorelle.

- [ ] In `i18n/locales/it-IT.json`, individuare la riga 564 (`        },` che chiude `eventsList`) seguita dalla riga 565 (`        "customers": {`). Inserire tra le due il blocco `"projects"`. Cioè sostituire:

```json
        },
        "customers": {
```

(la prima occorrenza, quella che chiude `eventsList` — verificare il contesto: subito sopra c'è `"dateRequired"`) con:

```json
        },
        "projects": {
            "title": "Progetti",
            "subtitle": "Gestisci i progetti della tua organizzazione",
            "search": "Cerca progetti...",
            "create": "Nuovo progetto",
            "empty": {
                "title": "Nessun progetto",
                "description": "Crea il tuo primo progetto per iniziare.",
                "createButton": "Crea progetto"
            },
            "columns": {
                "name": "Nome",
                "description": "Descrizione",
                "status": "Stato",
                "createdAt": "Creato il",
                "actions": "Azioni"
            },
            "status": {
                "active": "Attivo",
                "archived": "Archiviato"
            },
            "modal": {
                "createTitle": "Nuovo progetto",
                "editTitle": "Modifica progetto",
                "name": "Nome",
                "namePlaceholder": "Es. Sito web aziendale",
                "description": "Descrizione",
                "descriptionPlaceholder": "Descrizione opzionale del progetto",
                "status": "Stato",
                "cancel": "Annulla",
                "save": "Salva",
                "saving": "Salvataggio...",
                "createSuccess": "Progetto creato",
                "updateSuccess": "Progetto aggiornato",
                "error": "Operazione non riuscita",
                "validation": {
                    "nameRequired": "Il nome è obbligatorio"
                }
            },
            "delete": {
                "title": "Elimina progetto",
                "confirm": "Sei sicuro di voler eliminare \"{name}\"? L'azione è irreversibile.",
                "cancel": "Annulla",
                "confirmButton": "Elimina",
                "success": "Progetto eliminato",
                "error": "Eliminazione non riuscita"
            }
        },
        "customers": {
```

- [ ] In `i18n/locales/en-US.json`, applicare la stessa modifica (inserire `"projects"` prima di `"customers"`) con i testi inglesi:

```json
        },
        "projects": {
            "title": "Projects",
            "subtitle": "Manage your organization's projects",
            "search": "Search projects...",
            "create": "New project",
            "empty": {
                "title": "No projects",
                "description": "Create your first project to get started.",
                "createButton": "Create project"
            },
            "columns": {
                "name": "Name",
                "description": "Description",
                "status": "Status",
                "createdAt": "Created",
                "actions": "Actions"
            },
            "status": {
                "active": "Active",
                "archived": "Archived"
            },
            "modal": {
                "createTitle": "New project",
                "editTitle": "Edit project",
                "name": "Name",
                "namePlaceholder": "e.g. Company website",
                "description": "Description",
                "descriptionPlaceholder": "Optional project description",
                "status": "Status",
                "cancel": "Cancel",
                "save": "Save",
                "saving": "Saving...",
                "createSuccess": "Project created",
                "updateSuccess": "Project updated",
                "error": "Operation failed",
                "validation": {
                    "nameRequired": "Name is required"
                }
            },
            "delete": {
                "title": "Delete project",
                "confirm": "Are you sure you want to delete \"{name}\"? This action cannot be undone.",
                "cancel": "Cancel",
                "confirmButton": "Delete",
                "success": "Project deleted",
                "error": "Delete failed"
            }
        },
        "customers": {
```

> ⚠️ Attenzione: `"customers": {` compare una sola volta come chiave di `dashboard` in ciascun file (verificato: it-IT riga 565). Se l'Edit fallisce per non-unicità, includere più contesto a monte (la riga `"dateRequired"` + le due `}` di chiusura di `validation`/`eventsList`).

- [ ] Verifica JSON valido: `python3 -c "import json; json.load(open('i18n/locales/it-IT.json')); json.load(open('i18n/locales/en-US.json')); print('JSON OK')"`. Output atteso: `JSON OK`.
- [ ] Commit: `feat(projects): add functional i18n keys it/en (phase 4)`

---

## Task 11 — Pagina dashboard `app/pages/dashboard/projects/index.vue`

**Files:**
- Create: `app/pages/dashboard/projects/index.vue`
- Verify: `pnpm typecheck`, smoke manuale (`pnpm dev`)

> Modello: `app/pages/dashboard/event/index.vue:1-458` (struttura Nuxt UI v4), ma CRUD completo: un solo `UModal` guidato da `editingId` (create se null, edit se valorizzato) + delete con conferma. `status` in form come `USelect`, in tabella come `UBadge`. `description` nullable gestita in form e tabella (`—` se vuota). Sull'update si invia `description: null` esplicito quando svuotata. Gating UI: write = tutti i membri (`organizationStore.role` referenziato; nessuna azione owner-only per i project → non si nasconde nulla, ma il ruolo è disponibile).

- [ ] Creare `app/pages/dashboard/projects/index.vue`:

```vue
<script setup lang="ts">
import type { TableColumn, FormSubmitEvent } from '@nuxt/ui'
import * as z from 'zod'
import { format } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useProjects, type ProjectItem } from '~/composables/useProjects'

definePageMeta({
    title: 'Projects',
    layout: 'dashboard'
})

const { t, locale } = useI18n()
const toast = useToast()
const { create, update, remove } = useProjects()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')

const search = ref('')

// --- Projects data (CSR) ---
const { data: projects, status, error, refresh } = await useAsyncData(
    'projects-list',
    async () => {
        if (import.meta.server) return []
        const res = await $fetch<{ projects: ProjectItem[] }>('/api/projects')
        return res.projects ?? []
    },
    { server: false }
)

const filteredProjects = computed(() => {
    const all = projects.value ?? []
    if (!search.value) return all
    const q = search.value.toLowerCase()
    return all.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false)
    )
})

function formatDate(dateString: string) {
    const dateLocale = locale.value === 'it' ? it : enUS
    return format(new Date(dateString), 'd MMM yyyy', { locale: dateLocale })
}

// --- Create/Edit Modal (un solo modale guidato da editingId) ---
const isModalOpen = ref(false)
const isSubmitting = ref(false)
const editingId = ref<string | null>(null)

const statusOptions = computed(() => [
    { label: t('dashboard.projects.status.active'), value: 'active' },
    { label: t('dashboard.projects.status.archived'), value: 'archived' }
])

const formSchema = computed(() => z.object({
    name: z.string().min(1, t('dashboard.projects.modal.validation.nameRequired')).max(200),
    description: z.string().max(2000).optional().or(z.literal('')),
    status: z.enum(['active', 'archived'])
}))

type FormSchema = z.output<typeof formSchema.value>

const formState = reactive({
    name: '',
    description: '',
    status: 'active' as 'active' | 'archived'
})

function openCreate() {
    editingId.value = null
    formState.name = ''
    formState.description = ''
    formState.status = 'active'
    isModalOpen.value = true
}

function openEdit(project: ProjectItem) {
    editingId.value = project.id
    formState.name = project.name
    formState.description = project.description ?? ''
    formState.status = project.status
    isModalOpen.value = true
}

async function onSubmit(event: FormSubmitEvent<FormSchema>) {
    isSubmitting.value = true
    try {
        if (editingId.value) {
            await update(editingId.value, {
                name: event.data.name,
                description: event.data.description ? event.data.description : null,
                status: event.data.status
            })
            toast.add({ title: t('dashboard.projects.modal.updateSuccess'), color: 'success' })
        } else {
            await create({
                name: event.data.name,
                description: event.data.description ? event.data.description : null,
                status: event.data.status
            })
            toast.add({ title: t('dashboard.projects.modal.createSuccess'), color: 'success' })
        }
        isModalOpen.value = false
        await refresh()
    } catch (err: any) {
        toast.add({
            title: t('dashboard.projects.modal.error'),
            description: err.data?.message || err.message,
            color: 'error'
        })
    } finally {
        isSubmitting.value = false
    }
}

// --- Delete with confirmation ---
const isDeleteOpen = ref(false)
const isDeleting = ref(false)
const deleteTarget = ref<ProjectItem | null>(null)

function openDelete(project: ProjectItem) {
    deleteTarget.value = project
    isDeleteOpen.value = true
}

async function confirmDelete() {
    if (!deleteTarget.value) return
    isDeleting.value = true
    try {
        await remove(deleteTarget.value.id)
        toast.add({ title: t('dashboard.projects.delete.success'), color: 'success' })
        isDeleteOpen.value = false
        deleteTarget.value = null
        await refresh()
    } catch (err: any) {
        toast.add({
            title: t('dashboard.projects.delete.error'),
            description: err.data?.message || err.message,
            color: 'error'
        })
    } finally {
        isDeleting.value = false
    }
}

// --- Table columns ---
const columns: TableColumn<ProjectItem>[] = [
    {
        accessorKey: 'name',
        header: () => t('dashboard.projects.columns.name'),
        cell: ({ row }) => h('span', { class: 'font-semibold text-sm text-highlighted' }, row.original.name)
    },
    {
        accessorKey: 'description',
        header: () => t('dashboard.projects.columns.description'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.description ?? '—')
    },
    {
        id: 'status',
        header: () => t('dashboard.projects.columns.status'),
        cell: ({ row }) => {
            const archived = row.original.status === 'archived'
            return h(UBadge, {
                color: archived ? 'neutral' : 'primary',
                variant: 'subtle',
                size: 'sm'
            }, () => archived
                ? t('dashboard.projects.status.archived')
                : t('dashboard.projects.status.active'))
        }
    },
    {
        accessorKey: 'createdAt',
        header: () => t('dashboard.projects.columns.createdAt'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, formatDate(row.original.createdAt))
    },
    {
        id: 'actions',
        header: () => h('span', { class: 'text-right block' }, t('dashboard.projects.columns.actions')),
        cell: ({ row }) => h('div', { class: 'flex items-center justify-end gap-1' }, [
            h(UButton, {
                icon: 'i-lucide-pencil',
                color: 'neutral',
                variant: 'ghost',
                size: 'sm',
                onClick: () => openEdit(row.original)
            }),
            h(UButton, {
                icon: 'i-lucide-trash-2',
                color: 'error',
                variant: 'ghost',
                size: 'sm',
                onClick: () => openDelete(row.original)
            })
        ])
    }
]
</script>

<template>
    <UDashboardPanel id="projects-list">
        <template #header>
            <UDashboardNavbar :title="$t('dashboard.projects.title')" :ui="{ right: 'gap-3' }">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>

                <template #right>
                    <UInput
                        v-model="search"
                        icon="i-lucide-search"
                        :placeholder="$t('dashboard.projects.search')"
                        class="max-w-64 hidden lg:block"
                    />
                    <UButton
                        icon="i-lucide-plus"
                        :label="$t('dashboard.projects.create')"
                        @click="openCreate"
                    />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <p class="text-muted text-sm mb-6">{{ $t('dashboard.projects.subtitle') }}</p>

            <!-- Loading State -->
            <div v-if="status === 'pending'" class="flex items-center justify-center py-12">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-primary" />
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="text-center py-12">
                <UIcon name="i-lucide-alert-circle" class="size-12 text-error mx-auto mb-4" />
                <p class="text-muted">{{ error.message }}</p>
            </div>

            <!-- Empty State -->
            <div v-else-if="!projects?.length" class="text-center py-12">
                <UIcon name="i-lucide-folder-open" class="size-12 text-muted mx-auto mb-4" />
                <h3 class="text-lg font-medium mb-2">{{ $t('dashboard.projects.empty.title') }}</h3>
                <p class="text-muted mb-4">{{ $t('dashboard.projects.empty.description') }}</p>
                <UButton icon="i-lucide-plus" @click="openCreate">
                    {{ $t('dashboard.projects.empty.createButton') }}
                </UButton>
            </div>

            <!-- Projects Table -->
            <div v-else class="bg-default rounded-xl border border-default overflow-hidden">
                <UTable
                    :data="filteredProjects"
                    :columns="columns"
                    :ui="{
                        base: 'table-fixed',
                        thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
                        tbody: '[&>tr]:last:[&>td]:border-b-0',
                        th: 'py-3 first:rounded-l-lg last:rounded-r-lg text-xs uppercase tracking-wider font-bold',
                        td: 'py-4'
                    }"
                />
            </div>
        </template>
    </UDashboardPanel>

    <!-- Create/Edit Modal -->
    <UModal
        v-model:open="isModalOpen"
        :title="editingId ? $t('dashboard.projects.modal.editTitle') : $t('dashboard.projects.modal.createTitle')"
    >
        <template #body>
            <UForm :schema="formSchema" :state="formState" class="space-y-5" @submit="onSubmit">
                <UFormField :label="$t('dashboard.projects.modal.name')" name="name" required>
                    <UInput
                        v-model="formState.name"
                        :placeholder="$t('dashboard.projects.modal.namePlaceholder')"
                        class="w-full"
                    />
                </UFormField>

                <UFormField :label="$t('dashboard.projects.modal.description')" name="description">
                    <UTextarea
                        v-model="formState.description"
                        :placeholder="$t('dashboard.projects.modal.descriptionPlaceholder')"
                        :rows="3"
                        class="w-full"
                    />
                </UFormField>

                <UFormField :label="$t('dashboard.projects.modal.status')" name="status">
                    <USelect
                        v-model="formState.status"
                        :items="statusOptions"
                        value-key="value"
                        class="w-full"
                    />
                </UFormField>

                <div class="flex items-center justify-end gap-3 pt-2">
                    <UButton
                        :label="$t('dashboard.projects.modal.cancel')"
                        color="neutral"
                        variant="ghost"
                        @click="isModalOpen = false"
                    />
                    <UButton
                        :label="isSubmitting ? $t('dashboard.projects.modal.saving') : $t('dashboard.projects.modal.save')"
                        color="primary"
                        type="submit"
                        :loading="isSubmitting"
                    />
                </div>
            </UForm>
        </template>
    </UModal>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="isDeleteOpen" :title="$t('dashboard.projects.delete.title')">
        <template #body>
            <p class="text-sm text-muted">
                {{ $t('dashboard.projects.delete.confirm', { name: deleteTarget?.name ?? '' }) }}
            </p>
        </template>
        <template #footer>
            <div class="flex items-center justify-end gap-3 w-full">
                <UButton
                    :label="$t('dashboard.projects.delete.cancel')"
                    color="neutral"
                    variant="ghost"
                    @click="isDeleteOpen = false"
                />
                <UButton
                    :label="$t('dashboard.projects.delete.confirmButton')"
                    color="error"
                    :loading="isDeleting"
                    @click="confirmDelete"
                />
            </div>
        </template>
    </UModal>
</template>
```

- [ ] Verifica: `pnpm typecheck`. Output atteso: nessun errore nella pagina (componenti Nuxt UI auto-importati, `useProjects`/`ProjectItem` risolti, i tipi Zod del form coerenti).
- [ ] Smoke manuale (richiede 1b/1c/1d landed + sessione viva): `pnpm dev`, navigare a `/dashboard/projects`. Verificare: lista popolata, create apre il modale vuoto e crea, edit precompila e salva, delete chiede conferma e rimuove, `status` come `UBadge`, `description` vuota mostra `—`.
- [ ] Commit: `feat(projects): add dashboard CRUD page (phase 4)`

---

## Task 12 — Verifica finale di fase + commit complessivo

**Files:**
- Verify: `pnpm typecheck`, script tsx, smoke

- [ ] `pnpm typecheck`. Output atteso (gate 1c/1d landed): verde, nessun errore.
- [ ] `pnpm db:reset && pnpm db:seed`. Output atteso: seed completo senza errori.
- [ ] `npx tsx server/database/seed/verify-isolation.ts`. Output atteso: `[verify-isolation] OK — ... nessun leak cross-tenant` (invariante repository 1a intatta).
- [ ] `npx tsx server/database/seed/verify-isolation-api.ts`. Output atteso: `[verify-isolation-api] OK — list scoped (2 righe B2C, 0 leak), get/put/delete cross-org → 403`.
- [ ] **Wiring RBAC per-route (check statico)** — il test a livello service NON cattura una route che dimentica un guard o che chiama il repository direttamente. Verifica che ogni route porti `requireAuth` + il guard org corretto:
  ```bash
  cd /Users/airowlgasga/coding/project/boilerplate-saas
  grep -L "requireAuth" server/api/projects/*.ts                    # atteso: nessun output
  grep -L -E "requireMember|requireWrite" server/api/projects/*.ts   # atteso: nessun output
  grep -L "assertOwnership" server/api/projects/\[id\].*.ts          # atteso: nessun output (i by-id lo hanno)
  ```
  `grep -L` elenca i file che NON matchano il pattern: output vuoto = tutte le route hanno il guard. Se un file compare, manca un guard → fix prima di procedere.
- [ ] Smoke `pnpm dev`: `/dashboard/projects` CRUD completo funzionante.
- [ ] Checkpoint (spec FASE 4):
    - [ ] CRUD `projects` end-to-end org-scoped funziona (lista/create/edit/delete)
    - [ ] Isolamento cross-org → 403: **invariante verificata a livello service** (`verify-isolation-api.ts`) **+ wiring RBAC per-route verificato staticamente** (grep guard). L'enforcement HTTP a runtime con sessione viva è coperto da **smoke manuale** e dai test di **1c**, non da un test API automatico in questa fase (manca l'infra di sessione headless finché 1b non è testabile end-to-end). *(Limitazione dichiarata, non nascosta.)*
    - [ ] Query projects org A non restituisce mai projects org B (testato)
    - [ ] `status` enum reso come `UBadge`; `description` nullable gestita in form e tabella
    - [ ] AUDIT `project.created/updated/deleted` registrato su scrittura
    - [ ] `pnpm typecheck` verde; migration `description`/`status` applicata
- [ ] Commit finale: `feat: example domain entity (projects) with multi-tenant pattern`

---

## Sezione finale — Pattern resi espliciti (è l'entità che si clona)

Checklist riproducibile per ogni risorsa di dominio futura (incarnata da `projects`):

1. **Org-da-context** — `organizationId` da `event.context.organization` (popolata da `requireMember`/`requireWrite`), MAI dal client (body/query).
2. **Query scoped by-construction** — ogni metodo repo porta `WHERE organizationId`.
3. **`assertOwnership` come 2° guard sui by-id** — null trattato come 403 (no leak esistenza).
4. **Audit-on-write obbligatorio** — `logAudit(event, "<resource>.<verb>", { organizationId, targetType, targetId })`.
5. **Separazione** thin route → service → repository → schema Zod.
6. **Costanti audit estese PRIMA dell'uso** (`AUDIT_CATEGORIES` + `AUDIT_ACTIONS` sono union chiusi).
7. **Test isolamento eseguibile** — script tsx a livello service che asserisce list-scoped + 403 cross-org.

---

## Cosa questo piano esplicitamente NON copre

- RBAC org / `assertOwnership` / `getOrgRole` / middleware `2.organization.ts` / risoluzione org attiva → **1c** (gate hard).
- `organizationStore` + convenzione pagine dashboard → **1d** (gate hard).
- `planLimit` per projects (`canCreateProject`, `max_projects`) → fuori dal core.
- Driver Neon / deploy → FASI 2-3. Branding / i18n marketing → FASE 5.
- Ripristino `docs/pattern/` (rimosso) → FASE 5.
