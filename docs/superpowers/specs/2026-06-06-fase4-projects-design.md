# FASE 4 — Entità-esempio generica `projects` (Design)

> **Spec di input per `writing-plans`.** Deriva da `IMPLEMENTATION.md` FASE 4 (righe 187-203),
> riconciliata con lo stato reale (lo schema `projects` **esiste già** da 1a) e con gli spec
> `fase1c-rbac-routes-design.md` / `fase1d-frontend-design.md`. Obiettivo: trasformare `projects`
> (oggi solo schema) nell'**entità di RIFERIMENTO** CRUD end-to-end **org-scoped** che chi clona il
> boilerplate copia per ogni risorsa futura. Deve essere **esemplare**, non solo funzionante.

---

## Convenzioni già chiuse (NON rivalutare)

- Pattern multi-tenant **org-scoped** (`IMPLEMENTATION.md` + spec FASE 1).
- Ruoli org: **owner/admin/member**; write sulle risorse = **tutti e tre** (nessun viewer read-only — YAGNI).
- **Decisione utente:** campi `name + description (nullable) + status (enum active/archived)`; **UI CRUD completa**.
- **Decisione adottata:** route `/api/projects` top-level (org dal context); `planLimit` **fuori** dal core CRUD.

## ⚠️ Gate hard — prerequisiti 1b/1c/1d (oggi NON implementati)

Solo **1a** è committato. FASE 4 è scritta contro l'**API assunta post-1c/1d** e **non può iniziare**
prima che siano chiusi. Prerequisiti che oggi **non esistono**:

| Prerequisito | Fase | Stato oggi |
|---|---|---|
| `server/utils/permissions.ts` con `getOrgRole(userId, organizationId)` su `member` | 1c | cancellato (non esiste) |
| `requireMember` / `requireWrite` / `requireOwner` su org | 1c | assenti |
| `assertOwnership` (risorsa con `organizationId` accessibile solo a membri di quell'org → 403) | 1c | assente — `projects` è l'esempio d'uso documentato (`fase1c-rbac-routes-design.md:46,68`) |
| middleware `2.organization.ts` che popola `event.context.organization` (+ `role`) | 1c | `2.events.ts` è stub no-op |
| risoluzione **org attiva** (`activeOrganizationId`) | 1b | grep = 0 hit; inferita in Redis (`secondaryStorage`, `auth.ts:68`) — **da confermare a runtime** |
| `organizationStore` + `organizationClient()` + convenzione pagine `dashboard/**` | 1d | frontend ancora event-centric |

> **Nota di onestà (convenzione baseline):** la risoluzione dell'org attiva è il perno del pattern e
> oggi non compare nel codice. Lo spec assume `event.context.organization` popolato dal middleware 1c;
> va **confermato a runtime** quando 1b cabla l'org attiva.

---

## Sezione 1 — Cosa esiste già (NON rifare)

| Artefatto | Stato (`path:riga`) |
|---|---|
| Schema `projects` | ✅ `server/database/schema/projects.ts:1-35` — `id` (uuidv7), `organizationId` (FK NOT NULL → organization, onDelete cascade), `name`, `createdAt`/`updatedAt` (`$onUpdate`), indice `projects_organization_id_idx`, `projectsRelations`. Esportato dal barrel `index.ts:8`. Commento (6-10): "CRUD completo → FASE 4" |
| Repository | ⚠️ parziale — `server/repositories/projectRepository.ts:1-11` ha **solo** `findProjectsByOrg(organizationId)` |
| Seeder | ✅ `server/database/seed/index.ts:72-77` inserisce 3 projects (1 B2C + 2 B2B) |
| Test isolamento | ✅ `server/database/seed/verify-isolation.ts:27-46` verifica invariante repository |

**Da costruire (il lavoro di FASE 4):** modifica schema (+description+status → migration), `shared/schemas/project.ts`,
4 metodi repo scoped, `project.service.ts`, `server/api/projects/` (5 route), costanti audit `project.*`,
frontend (pagina + composable + i18n funzionali), test 403 cross-org a livello API.

---

## Sezione 2 — Decisioni

| # | Decisione | Scelta | Razionale |
|---|---|---|---|
| 1 | Campi | `name` + `description` (text nullable) + `status` (enum `active`/`archived`, default `active`) | Mostra i 2 casi Zod/UI più comuni (nullable + enum→UBadge) che ogni clonatore replica. Migration additiva banale |
| 2 | Route shape | top-level `/api/projects` (org dal `event.context`) | Riferimento più pulito da clonare; il client non passa mai `orgId`; evita IDOR by-design con `assertOwnership`. **Allineare alla convenzione route fissata da 1c** |
| 3 | Isolamento | by-construction (`WHERE organizationId` in ogni query) **+** `assertOwnership` 2° guard sui by-id | Difesa in profondità: anche se una route dimentica un check, il repository non leaka cross-tenant |
| 4 | Frontend state | composable `useProjects` + `useAsyncData` (CSR) — **no** Pinia store dedicato | Allineato al pattern `useAsyncData` già usato (`dashboard/event/index.vue`); `eventStore` sarà rimosso/rinominato in 1d → non clonarne lo stile |
| 5 | UI | CRUD completo (lista + create + edit + delete) | Decisione utente: è l'esempio canonico; una pagina lista-soltanto non insegna edit/delete scoped né il modale `UForm` |
| 6 | planLimit | **fuori** dal core (eventuale sezione opzionale) | Valore didattico primario = CRUD org-scoped; il limite è ortogonale, già illustrato altrove, e non va accoppiato al `planLimit` 1c (oggi stub) |

---

## Sezione 3 — Backend

### 3.1 Schema DB — modifica additiva
- `server/database/schema/projects.ts`: aggiungere `description: text("description")` (nullable) e
  `status` (enum `active`/`archived`, default `active`). Mantenere tutto il resto.
- `pnpm db:generate` (⚠️ interattivo, needs TTY — known issue) → nuova migration; `pnpm db:migrate`.

### 3.2 Schema Zod — `shared/schemas/project.ts` (nuovo)
- `createProjectSchema`: `{ name: nonEmptyString.max(200), description: z.string().max(2000).nullish(), status: z.enum(["active","archived"]).default("active") }` (riuso helper di `shared/schemas/common.ts`).
- `updateProjectSchema`: tutti i campi `optional`.
- Tipi inferiti (`z.infer`). **Aggiungere** `export * from "./project"` al barrel `shared/schemas/index.ts`.
- Modello: `shared/schemas/contact.ts:1-11` (minimale) + `shared/schemas/event.ts:1-33` (create/update separati).

### 3.3 Repository — `server/repositories/projectRepository.ts` (completare)
Aggiungere, ognuno con **`WHERE organizationId = ?`** (isolamento by-construction):
- `findProjectByIdScoped(organizationId, id)`
- `createProject(organizationId, data)`
- `updateProjectScoped(organizationId, id, data)`
- `deleteProjectScoped(organizationId, id)`

Mantenere `findProjectsByOrg`.

### 3.4 Service — `server/services/project.service.ts` (nuovo)
- Funzioni pure `(event: H3Event, ...data)`; `const db = getDB()`.
- Legge `organizationId` da **`event.context.organization`** (org attiva dal middleware 1c) — **mai** da body/query.
- Delega al repository scoped; sui by-id chiama **`assertOwnership`** come 2° guard.
- `logAudit(event, action, { organizationId, targetType: "project", targetId })` su create/update/delete.
- Stile di riferimento: `server/services/contact.service.ts:23-132` (firma, `getDB`, `createError`, `logAudit`).

### 3.5 API — `server/api/projects/` (5 thin controller)

| Endpoint | File | RBAC |
|---|---|---|
| `GET /api/projects` (lista) | `index.get.ts` | `requireMember` |
| `POST /api/projects` (crea) | `index.post.ts` | `requireWrite` |
| `GET /api/projects/:id` | `[id].get.ts` | `requireMember` + `assertOwnership` |
| `PUT /api/projects/:id` | `[id].put.ts` | `requireWrite` + `assertOwnership` |
| `DELETE /api/projects/:id` | `[id].delete.ts` | `requireWrite` + `assertOwnership` |

Pattern: `requireAuth(event)` → RBAC org → `parseBody`/`parseQueryParams` → delega → `try/catch` con
re-throw `statusCode` + fallback 500 (gestione `23505`). Riferimenti: `server/api/contact.post.ts:9-19`,
`server/api/user/profile.patch.ts:9-14`. Validazione **sempre** via `parseBody`/`parseQueryParams`
(`server/utils/validateBody.ts:8-42`).

### 3.6 Audit — `server/utils/audit/types.ts`
- Aggiungere `AUDIT_CATEGORIES.project` e `AUDIT_ACTIONS` `project.created` / `project.updated` / `project.deleted`
  **prima** di usarli nel service (`AuditAction` è un union chiuso → altrimenti type error).
- `logAudit` accetta già `opts.organizationId` (`audit/index.ts:43`) → nessun lavoro schema audit.

---

## Sezione 4 — Frontend (esempio canonico)

- **Pagina** `app/pages/dashboard/projects/index.vue` (path neutro; allineare al naming finale di 1d):
  Nuxt UI v4 — `UDashboardPanel`/`Navbar`, `UTable` (colonne via `h()`, `UBadge` per `status`),
  `UModal` + `UForm` + `UFormField` per create/edit, `UButton` delete con conferma, `useToast`,
  `useI18n` + `useLocalePath`. `useAsyncData("projects", ..., { server: false })`.
  Modello: `app/pages/dashboard/event/index.vue:23-458` (clonare la struttura, **non** lo store).
- **Composable** `app/composables/useProjects.ts`: `list/create/update/remove` via `$fetch`,
  `isLoading`/`error`, guard `import.meta.server`.
- **Gating UI per ruolo:** member vede CRUD (write = tutti i membri); azioni owner-only nascoste se ce ne fossero. Ruolo dall'`organizationStore` (1d).
- **i18n:** chiavi **funzionali** per la UI projects in `it-IT.json`/`en-US.json` (non marketing — quello è FASE 5).

---

## Sezione 5 — Seeder + Test isolamento

- Arricchire `server/database/seed/index.ts` con i nuovi campi (`description`/`status`) e qualche project in più.
- **Test critico della fase (sicurezza):** oltre a `verify-isolation.ts` (livello repository), aggiungere
  un test a **livello API** che esercita gli endpoint:
  - `GET /api/projects` come membro di org A **non** restituisce mai projects di org B;
  - `GET/PUT/DELETE /api/projects/:id` su un project di org B → **403** (`assertOwnership`).

---

## Sezione 6 — Pattern da rendere espliciti (è l'entità che si clona)

Checklist riproducibile, da scrivere come "ricetta" nel codice/commenti dell'esempio:

1. **Org-da-context** — `organizationId` dal middleware in `event.context`, **mai** dal client.
2. **Query scoped by-construction** — ogni metodo repo porta `WHERE organizationId`.
3. **`assertOwnership`** come 2° guard sui by-id.
4. **Audit-on-write** obbligatorio.
5. **Separazione** thin route → service → repository → schema Zod.

---

## Checkpoint FASE 4

- [ ] CRUD `projects` end-to-end **org-scoped** funziona (lista/create/edit/delete in UI)
- [ ] `GET/PUT/DELETE` su project di un'altra org → **403** (testato a livello API)
- [ ] Query projects di org A non restituisce mai projects di org B (testato)
- [ ] `status` enum renderizzato come `UBadge`; `description` nullable gestito in form e tabella
- [ ] AUDIT `project.created/updated/deleted` registrato su scrittura
- [ ] `pnpm typecheck` verde; migration `description`/`status` applicata
- [ ] Commit: `feat: example domain entity (projects) with multi-tenant pattern`

---

## Cosa esplicitamente NON copre questa spec

- RBAC org / `assertOwnership` / middleware `2.organization.ts` / risoluzione org attiva → **1c** (prerequisito hard).
- `organizationStore` + convenzione pagine dashboard → **1d** (prerequisito hard).
- `planLimit` per projects (`canCreateProject`, `max_projects`) → opzionale, **non** nel core di questa fase.
- Driver Neon / deploy → **FASI 2-3**. Branding/i18n marketing → **FASE 5**.
- Ripristino `docs/pattern/` (rimosso) → **FASE 5** (i pattern qui sono ricostruiti dal codice kept).
