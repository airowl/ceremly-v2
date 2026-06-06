# FASE 2 — Driver DB: node-postgres → Neon HTTP serverless (Design)

> **Spec di input per `writing-plans`.** Deriva da `IMPLEMENTATION.md` FASE 2 (righe 145-162),
> riconciliata con lo stato reale del codice (post-1a) e con la verifica del comportamento del driver
> letto direttamente in `node_modules`. Obiettivo: sostituire il driver TCP `node-postgres`
> (`pg.Pool`, processo persistente) con il driver **Neon HTTP/serverless** (`drizzle-orm/neon-http` +
> `@neondatabase/serverless`), requisito del runtime Vercel serverless, mantenendo invariati i ~30
> call site di `getDB()`/`useDB()`.

---

## Convenzioni già chiuse (NON rivalutare)

- **Provider DB = Neon**, **hosting = Vercel serverless** (decise in `IMPLEMENTATION.md`).
- **Coerenza dura serverless:** mai TCP pool, mai worker/connessione persistente.
- `@neondatabase/serverless ^1.0.2` è **già in `package.json`** (presente, mai importato finora).
- `drizzle-orm ^0.45.0` supporta `neon-http`.

## Stato di partenza onesto (prerequisiti)

- Questa fase è **in larga parte indipendente dalla tenancy**: il driver è agnostico allo schema.
  È procedibile sulla baseline attuale (solo 1a committato) — **non** richiede 1b/1c/1d.
- **Dipendenza a valle:** FASE 3 (preset `vercel`) poggia su questa. Mettere `preset: 'vercel'` sul
  `pg.Pool` TCP attuale è rotto → **FASE 2 prima di FASE 3**. La connection string pooled/unpooled
  introdotta qui è consumata anche da FASE 3 (cross-fase 2↔3).

---

## Sezione 1 — Stato attuale verificato

| Artefatto | Stato (`path:riga`) |
|---|---|
| Driver | `server/utils/db.ts:1-3` importa `drizzle-orm/node-postgres`; `createDB()` (9-11) = `drizzle({ client: getPgPool(), schema })` |
| Singleton | `getDB()` (15-24) singleton **solo se** `preset == "node-server"`, altrimenti nuova istanza ogni chiamata (ramo `else`, 22) |
| Legacy | `useDB(event)` (27-40) cacha su `event.context.db` (~9 call site in `file/fileService.ts`) |
| Pool TCP | `server/utils/drivers.ts:22-41` `getPgPool()` = `new pg.Pool({ max: 90, idleTimeoutMillis: 30000 })`; `getDatabaseUrl()` (11-20) branzia su Hyperdrive (Cloudflare) vs `runtimeConfig.databaseUrl` |
| Migrazioni | `server/database/drizzle.config.ts:9` usa `NUXT_DATABASE_URL_DIRECT \|\| NUXT_DATABASE_URL`, dialect `postgresql` |
| Deps | `pg ^8.16.3` + `@types/pg ^8.15.6` presenti; `@neondatabase/serverless ^1.0.2` presente ma inutilizzato |
| Preset | nessun `nitro.preset` in `nuxt.config.ts` (default `node-server`). `.env.example:14-15` ha `NUXT_NITRO_PRESET=node-server \| cloudflare-module` + `NUXT_CF_HYPERDRIVE_ID` |
| Consumer | 30+ call site (`server/repositories/*`, `server/services/*`, `server/api/admin/*`, `server/utils/audit/*`, `server/database/seed/*`) — tutti solo `select/insert/update/delete` + relational queries |

**Branching su `preset == "node-server"`:** presente in `drivers.ts`/`db.ts` (6 occorrenze) e in `cacheClient`.
Sotto `vercel` cade nei rami `else` (oggi pensati per Cloudflare) → vanno semplificati.

---

## Sezione 2 — Il (non-)problema transazioni

`IMPLEMENTATION.md` FASE 2 segnala come rischio #1 "il driver HTTP non supporta tutte le transazioni
interattive". **Verificato: è moot sulla baseline.**

| Fatto | Prova (`path:riga`) |
|---|---|
| Transazioni applicative = **ZERO** | `grep '\.transaction(' / 'tx\.' / 'trx'` su `server/` e `shared/` → nessun hit |
| Better Auth adapter: transazioni **OFF** di default | `node_modules/better-auth/dist/adapters/drizzle-adapter/index.mjs:271` → `transaction: config.transaction ?? false`. Il progetto chiama `drizzleAdapter(getDB(), { provider:"pg", schema })` (`server/utils/auth.ts:25-31`) **senza** `transaction:true` |
| Plugin `organization`: nessuna tx interna | nessun riferimento `transaction`/`adapter.transaction` in `node_modules/better-auth/dist/plugins/organization/*` → create org+owner-member come statement separati |
| `neon-http` `db.transaction()` **throwa** | `node_modules/drizzle-orm/neon-http/session.cjs:177` → `Error("No transactions support in neon-http driver")` (fail-fast, non silenzioso) |
| `neon-http` `db.batch([...])` **supportato** | `session.cjs:142` + `driver.cjs:90` → internamente `client.transaction(builtQueries)` = batch HTTP atomico single round-trip |

**Conclusione:** `neon-http` puro è sufficiente. L'atomicità multi-statement (oggi non necessaria) si
ottiene con `db.batch([...])`. Il throw di `db.transaction()` è un **guardrail**: se una fase futura la
usa per errore, fallisce subito in test.

---

## Sezione 3 — Decisione driver

| # | Opzione | Pro | Contro | Scelta |
|---|---|---|---|---|
| A | **`neon-http` puro** (`drizzle-orm/neon-http` + `neon()`) | Latenza minima serverless (1 round-trip HTTPS/query, no handshake, no connessioni da gestire); singleton module-level sicuro (HTTP stateless); `db.batch` per atomicità; `db.transaction` throwa esplicito; codice attuale 100% compatibile (0 tx); migrazioni invariate | Niente tx interattive (logica JS condizionale tra statement con rollback) | ✅ |
| B | `neon-serverless` Pool (WebSocket) | Tx interattive complete, drop-in node-postgres | Handshake WebSocket per cold invocation; va creato/chiuso in ogni handler con `ctx.waitUntil` (scomodo in Nitro); latenza maggiore per query singole; over-engineering con 0 tx | ❌ |
| C | Ibrido (http default + Pool on-demand dove servono tx) | HTTP veloce + Pool solo dove serve tx | Due code path, helper extra con lifecycle, complessità non giustificata oggi (0 consumer tx) — YAGNI | ❌ |

**Scelta: A.** Razionale basato su evidenza (Sezione 2), non su teoria. Se una fase futura
dimostrasse di aver bisogno di una tx interattiva reale non esprimibile come `batch`, si escala a C
**in quella fase** (vedi Sezione 7).

---

## Sezione 4 — Modifiche file (il cuore)

### 4.1 `server/utils/db.ts` — riscrittura nucleo
- Import: `drizzle-orm/node-postgres` → **`drizzle-orm/neon-http`**; aggiungere `import { neon } from "@neondatabase/serverless"`.
- `createDB()`: `drizzle({ client: neon(getDatabaseUrl()), schema })`.
- `getDB()`: **singleton module-level semplice** — rimuovere il branching su `preset` (HTTP stateless è sempre singleton-safe).
- `useDB(event)`: **mantenere come alias** di `getDB()` (il caching su `event.context.db` è inutile ma innocuo con HTTP stateless; tenerlo alias evita di toccare i ~9 call site di `fileService`). Aggiornare il type import: `NodePgDatabase` → `NeonHttpDatabase` nella firma.

### 4.2 `server/utils/drivers.ts` — rimozione TCP
- Rimuovere `getPgPool()` + `createPgPool()` (22-41) e `import pg` (3).
- Rimuovere type/var **Hyperdrive** (1, 8-9) e il branching relativo.
- `getDatabaseUrl()` (11-20): ridurre a ritornare `runtimeConfig.databaseUrl` (connection string Neon **pooled**, endpoint `-pooler`).
- `cacheClient`/ioredis: **non oggetto di FASE 2** → lasciato com'è qui (lo affronta FASE 3, Upstash Redis HTTP). Nota incrociata, non azione.

### 4.3 `server/utils/auth.ts` — nessuna modifica funzionale
- `drizzleAdapter(getDB(), {...})` (25-31): **non** aggiungere `transaction:true`. `drizzleAdapter` accetta qualsiasi drizzle db → il cambio tipo (`NeonHttpDatabase`) non rompe. Verifica solo via `pnpm typecheck`.

### 4.4 `package.json` — pulizia deps
- Rimuovere `pg` (^8.16.3) da `dependencies` e `@types/pg` (^8.15.6) da `devDependencies`.
- `@neondatabase/serverless` già presente. `pnpm install` per rigenerare il lock.

### 4.5 `server/database/drizzle.config.ts` — invariato + nota
- **Nessuna modifica di codice.** drizzle-kit ha il proprio connettore `pg` interno, gira solo da CLI.
- Resta su `NUXT_DATABASE_URL_DIRECT || NUXT_DATABASE_URL`. **Nota operativa:** `NUXT_DATABASE_URL_DIRECT` deve puntare all'endpoint Neon **-unpooled** (il DDL richiede sessione diretta, non il pooler PgBouncer in transaction mode).

### 4.6 `.env.example` — connection string + rimozione CF
- Documentare `NUXT_DATABASE_URL` = endpoint Neon **pooled** (`-pooler`) per il runtime serverless.
- Documentare `NUXT_DATABASE_URL_DIRECT` = endpoint Neon **unpooled** per drizzle-kit (migrazioni/DDL).
- Rimuovere `NUXT_NITRO_PRESET=... cloudflare-module` e `NUXT_CF_HYPERDRIVE_ID` (residui Cloudflare). *(Il valore `preset=vercel` lo imposta FASE 3; FASE 2 toglie solo i residui Hyperdrive.)*

---

## Sezione 5 — Connection string Neon (pooled vs unpooled)

| Uso | Endpoint | Env | Perché |
|---|---|---|---|
| Runtime serverless (`neon()` http) | **pooled** (`-pooler`) | `NUXT_DATABASE_URL` | Raccomandato per serverless; tollera molte connessioni effimere |
| Migrazioni/DDL (drizzle-kit) | **unpooled** (direct) | `NUXT_DATABASE_URL_DIRECT` | Il DDL richiede sessione diretta; PgBouncer in transaction mode rompe alcune DDL |

`drizzle.config.ts:9` già supporta `NUXT_DATABASE_URL_DIRECT` con fallback su `NUXT_DATABASE_URL` →
basta **popolare** `NUXT_DATABASE_URL_DIRECT`. Si conferma il pattern a **due env** (già in atto).

---

## Sezione 6 — Sviluppo locale

`neon-http` parla HTTPS verso l'endpoint Neon → **non** si connette a un Postgres TCP locale
(`127.0.0.1:5432`). Decisione (allineata alla convenzione Neon):

- **Dev usa una branch Neon dedicata** (connection string Neon in `.env`). Documentarlo in `.env.example`.
- *(Opzionale, non in scope FASE 2)* chi vuole un Postgres 100% locale può usare il proxy `neon-local`
  via `neonConfig.fetchEndpoint` — citato come nota, non implementato qui (YAGNI per uso personale).

Conseguenza: rimosso il fallback "Postgres TCP locale" del vecchio branching `node-server`.

---

## Sezione 7 — Vincoli per le fasi a valle (da scrivere in chiaro)

1. **MAI `db.transaction()`** — throwa su `neon-http`.
2. Atomicità multi-statement → **`db.batch([...])`** (atomico, single round-trip).
3. `db.batch` **non** è una tx interattiva: non c'è logica JS condizionale tra statement con rollback.
   Se una fase futura (es. 1b create-org+member+invitation atomico) ne avesse bisogno e non fosse
   esprimibile come batch, **escalare all'opzione C** (Pool WebSocket on-demand) **in quella fase**,
   non globalmente.

---

## Sezione 8 — Rischi e mitigazioni

| Rischio | Dove | Mitigazione |
|---|---|---|
| MEDIO — DDL su endpoint pooled fallisce | `drizzle.config.ts:9` fallback su pooled se `_DIRECT` non impostato | Impostare `NUXT_DATABASE_URL_DIRECT` = endpoint **unpooled**; documentare |
| BASSO — cambio tipo TS | `db.ts` import `NodePgDatabase` usato nella firma `useDB` | Aggiornare a `NeonHttpDatabase`; `drizzleAdapter` accetta il nuovo tipo; `pnpm typecheck` arbitro |
| BASSO — dev locale TCP | rimozione branching `node-server` | Dev punta a branch Neon (Sez. 6); documentare in `.env.example` |
| BASSO — `useDB` cache inutile | `db.ts:31-37` | Tenere come alias (no-op innocuo) per non toccare i ~9 call site `fileService` |
| BASSO (beneficio) — niente pool da esaurire | `pg.Pool max:90` su serverless esploderebbe | `neon-http` = fetch HTTPS per query, nessuna connessione da saturare — dichiarare come razionale |
| BASSO (cross-fase) — `cacheClient` no-op su serverless | `drivers.ts` ioredis gated `node-server` | **Non** scope FASE 2 → Upstash Redis HTTP in FASE 3; segnalato per non documentarlo funzionante |

---

## Checkpoint FASE 2

- [ ] `db.ts` importa `drizzle-orm/neon-http`; `getDB()` ritorna `NeonHttpDatabase<schema>` (singleton module-level)
- [ ] `getPgPool`/`createPgPool`/`import pg`/Hyperdrive rimossi; `grep -rIE "node-postgres|getPgPool|pg\.Pool|Hyperdrive" server/` → 0 hit
- [ ] `pg` + `@types/pg` rimossi da `package.json`; `pnpm install` rigenera il lock
- [ ] `pnpm typecheck` verde (tipo adapter Better Auth + firma `useDB`)
- [ ] `pnpm db:seed` funziona via `tsx` contro Neon (HTTPS, no pool TCP)
- [ ] `pnpm db:generate` / `pnpm db:migrate` funzionano sull'endpoint **DIRECT** (unpooled)
- [ ] `.env.example` aggiornato: `NUXT_DATABASE_URL` pooled + `NUXT_DATABASE_URL_DIRECT` unpooled; rimossi `cloudflare-module`/`NUXT_CF_HYPERDRIVE_ID`
- [ ] App end-to-end col nuovo driver (auth, org 1a, billing) — fumo manuale
- [ ] Commit: `refactor: switch to Neon HTTP serverless driver`

---

## Cosa esplicitamente NON copre questa spec

- `nitro.preset = vercel`, `vercel.json`, deploy Vercel → **FASE 3**.
- Migrazione job async/cron, astrazione `server/queue/` → **FASE 3**.
- `cacheClient`/Redis serverless (Upstash) e rimozione `setInterval` rate-limit → **FASE 3**.
- Rebranding `.env.example` (naming prodotto) e rimozione var marketing → **FASE 5** (qui si toccano
  solo le var infra DB e i residui Hyperdrive).
- Entità-esempio `projects` → **FASE 4**.
