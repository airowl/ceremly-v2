# FASE 2 — Driver DB: node-postgres → Neon HTTP serverless Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il driver TCP `node-postgres` (`pg.Pool`, processo persistente) con il driver Neon HTTP/serverless (`drizzle-orm/neon-http` + `@neondatabase/serverless`), requisito del runtime Vercel serverless, mantenendo invariati i ~30 call site di `getDB()`/`useDB()`.

**Architecture:** Il runtime usa `neon()` (fetch HTTPS stateless, 1 round-trip per query) come client Drizzle, con singleton module-level sicuro (nessuna connessione da gestire). Le migrazioni/DDL (drizzle-kit, `db:reset`) usano l'endpoint Neon **unpooled** (`-DIRECT`); il runtime usa l'endpoint **pooled** (`-pooler`). L'atomicità multi-statement, dove servisse in futuro, si ottiene con `db.batch([...])`; `db.transaction()` throwa esplicitamente su neon-http (guardrail).

**Tech Stack:** Nuxt 4 + Nitro, Drizzle ORM `^0.45.0` (`drizzle-orm/neon-http`), `@neondatabase/serverless ^1.0.2`, Better Auth `^1.4.5` (drizzleAdapter), drizzle-kit `^0.31.8`, tsx, PostgreSQL su Neon.

---

## Prerequisiti / Gate (cosa deve essere landed/configurato PRIMA)

1. **FASE 1a landed** (già committato): schema org-tenancy (`organization`/`member`/`invitation`/`projects`), repository org-scoped, seed + `verify-isolation.ts`. Il driver è agnostico allo schema — 1a è l'unica baseline richiesta. **1b/1c/1d NON sono prerequisiti.**
2. **Connection string Neon configurata in `.env`** (gate bloccante per i gate runtime di questo piano). Il default attuale `.env` punta a `127.0.0.1:54322` (Postgres TCP locale): `neon()` parla **HTTPS** e NON raggiunge un Postgres TCP locale. Prima di eseguire i task con gate runtime (`db:reset`, `db:seed`, `db:migrate`, smoke), in `.env` devono essere valorizzati:
   - `NUXT_DATABASE_URL` = endpoint Neon **pooled** (host contiene `-pooler`), usato dal runtime `neon()`.
   - `NUXT_DATABASE_URL_DIRECT` = endpoint Neon **unpooled** (host senza `-pooler`), usato da drizzle-kit e da `db:reset` per il DDL.
   Si crea una branch Neon dedicata allo sviluppo (convenzione Neon). Senza questo, i gate runtime falliscono per timeout/connessione — è atteso, non un bug del codice.
3. **`@neondatabase/serverless ^1.0.2`** è già in `package.json` (verificato: `package.json:26`). `drizzle-orm ^0.45.0` (`package.json:45`) supporta `neon-http`. Nessun `pnpm install` extra necessario prima di iniziare.

## Dipendenze a valle

- **FASE 3** (preset `vercel`, `vercel.json`, deploy) poggia su questa fase: mettere `preset: 'vercel'` sul `pg.Pool` TCP attuale sarebbe rotto. **FASE 2 prima di FASE 3.**
- La distinzione connection string pooled/unpooled introdotta qui è consumata anche da FASE 3.
- **Fuori scope di FASE 2** (NON toccare): `cacheClient`/ioredis e `useServerAuth` (entrambi gated su `preset == "node-server"`, restano funzionanti in dev `node-server`, li affronta FASE 3 con Upstash Redis HTTP); `nitro.preset = vercel`; rebranding env marketing (FASE 5); entità `projects` (FASE 4).

---

## File Structure (file creati/modificati e responsabilità)

| File | Azione | Responsabilità dopo la modifica |
|---|---|---|
| `server/utils/db.ts` | **Modify** (riscrittura nucleo) | `createDB()` usa `drizzle({ client: neon(runtimeConfig.databaseUrl), schema })`; `getDB()` singleton module-level semplice (no branching preset); `useDB()` alias `async` di `getDB()` (no cache su `event.context.db`); type firma `NeonHttpDatabase<typeof schema>`. Non importa più nulla da `./drivers`. |
| `server/utils/drivers.ts` | **Modify** (rimozione TCP) | Rimossi `import pg`, `import type Hyperdrive`, le declare globali Hyperdrive, `getDatabaseUrl()`, `createPgPool()`, `getPgPool()`, var `pgPool`. Restano invariati `cacheClient`/ioredis e `getResendInstance()` (fuori scope FASE 2). |
| `server/database/seed/reset.ts` | **Modify** (toglie `pg`) | DDL di reset (`DROP/CREATE SCHEMA`, GRANT, count) via `neon()` HTTP su endpoint DIRECT invece di `pg.Client`. Unico consumer di `pg` oltre a `drivers.ts`. |
| `server/utils/auth.ts` | **Verify** (nessuna modifica di codice) | `drizzleAdapter(getDB(), {...})` accetta il nuovo tipo `NeonHttpDatabase`. NON aggiungere `transaction:true`. Arbitro: `pnpm typecheck`. |
| `server/database/drizzle.config.ts` | **Verify** (nessuna modifica di codice) | drizzle-kit ha il proprio connettore pg interno e gira solo da CLI; resta su `NUXT_DATABASE_URL_DIRECT || NUXT_DATABASE_URL`. Si verifica solo che raggiunga l'endpoint DIRECT senza la dependency `pg` di root. |
| `package.json` | **Modify** (pulizia deps) | Rimossi `pg ^8.16.3` da `dependencies` e `@types/pg ^8.15.6` da `devDependencies`. `pnpm install` rigenera il lock. |
| `.env.example` | **Modify** (env DB + rimozione CF) | Documentate `NUXT_DATABASE_URL` (pooled) + `NUXT_DATABASE_URL_DIRECT` (unpooled) Neon; rimossi `NUXT_CF_HYPERDRIVE_ID` e la menzione `cloudflare-module`; `NUXT_NITRO_PRESET=node-server` **mantenuto** (serve a cacheClient/useServerAuth, lo cambia FASE 3). |

**File invariati ma consumer del driver (NON modificati, devono solo continuare a compilare/funzionare):** `server/database/seed/index.ts`, `server/database/seed/verify-isolation.ts`, tutti i `server/repositories/*`, `server/services/*` (incl. i ~9 call site `useDB()` in `file/fileService.ts` e `file/cleanup.ts`), `server/api/admin/*`, `server/utils/audit/index.ts`.

---

## Vincoli per le fasi a valle (da rispettare da qui in poi)

1. **MAI `db.transaction()`** — throwa `Error("No transactions support in neon-http driver")` (verificato: `node_modules/drizzle-orm/neon-http/session.cjs:177`).
2. Atomicità multi-statement → **`db.batch([...])`** (atomico, single round-trip; verificato `session.cjs:142` + `driver.cjs:90`).
3. `db.batch` **non** è una tx interattiva (niente logica JS condizionale tra statement con rollback). Se una fase futura ne avesse bisogno e non fosse esprimibile come batch, **escalare all'opzione Pool WebSocket on-demand** (`neon-serverless`) **in quella fase**, non globalmente.

---

## Task 1 — `server/utils/db.ts`: swap nucleo a neon-http

**Files:**
- Modify `server/utils/db.ts:1-40` (import driver, `createDB`, `getDB`, `useDB`)
- Verify: `pnpm typecheck`

Razionale decisione di design (vs spec 4.1/4.2): `getDatabaseUrl()` in `drivers.ts:11` **non è esportato**, quindi `db.ts` non può importarlo. Si usa direttamente `runtimeConfig.databaseUrl` (già importato in `db.ts:7`) e si elimina del tutto `getDatabaseUrl()` da `drivers.ts` (Task 2). Questo rimuove anche l'import `import { getPgPool } from "./drivers"` (`db.ts:6`), decouplando i due file.

`useDB()`: rimosso il caching su `event.context.db` (inutile con HTTP stateless e mai tipizzato in `H3EventContext` — compila oggi solo via index signature di h3). Resta `async` e ritorna `getDB()` (i ~9 call site fanno `await useDB()`, la firma regge). Il parametro diventa `_event` (non usato).

- [ ] Sostituire l'intero contenuto di `server/utils/db.ts` con:

```ts
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../database/schema";
import { runtimeConfig } from "./runtimeConfig";

const createDB = () => {
    return drizzle({ client: neon(runtimeConfig.databaseUrl), schema });
};

// HTTP stateless → singleton module-level sempre sicuro (nessuna connessione da gestire).
let db: ReturnType<typeof createDB>;

export const getDB = () => {
    if (!db) {
        db = createDB();
    }
    return db;
};

/**
 * Alias legacy di getDB(). Con neon-http (HTTP stateless) non serve più cachare
 * un'istanza su event.context.db: getDB() è già singleton. Mantenuto async +
 * stessa firma per non toccare i ~9 call site (`await useDB()`) di fileService/cleanup.
 */
export const useDB = async (
    _event?: H3Event<EventHandlerRequest>,
): Promise<NeonHttpDatabase<typeof schema>> => {
    return getDB();
};

export type TableNames = keyof typeof schema;

export function isValidTable(table: string): table is TableNames {
    return table in schema;
}
```

- [ ] Verificare che `db.ts` non importi più nulla da `./drivers` né da `drizzle-orm/node-postgres`:

```bash
grep -nE "node-postgres|getPgPool|from \"./drivers\"" server/utils/db.ts
```

Output atteso: **nessuna riga** (exit code 1).

- [ ] NON eseguire ancora `pnpm typecheck` qui: `drivers.ts` esporta ancora `getPgPool` (non più importato) ma `db.ts` non lo usa più — è ok. Il typecheck si esegue alla fine del Task 2 quando anche `drivers.ts` è pulito (i due file sono interdipendenti sul decoupling). Procedere al Task 2.

---

## Task 2 — `server/utils/drivers.ts`: rimozione driver TCP + Hyperdrive

**Files:**
- Modify `server/utils/drivers.ts:1-41` (rimozione import pg/Hyperdrive, `getDatabaseUrl`, `createPgPool`, `getPgPool`, var `pgPool`)
- Verify: `pnpm typecheck`

Restano invariati: `cacheClient` (ioredis + memory fallback, righe ~43-170 nel file attuale) e `getResendInstance()` (righe ~172-179). Sono fuori scope FASE 2 (li affronta FASE 3). Si rimuove **solo** il blocco DB TCP/Hyperdrive in testa al file.

- [ ] Aprire `server/utils/drivers.ts`. Rimuovere le righe 1-41 (dall'`import type { Hyperdrive }` fino alla chiusura `}` di `getPgPool`) e sostituirle con il solo blocco import rimasto. Il nuovo inizio del file deve essere esattamente:

```ts
import Redis from "ioredis";
import { Resend } from "resend";
import { runtimeConfig } from "./runtimeConfig";

// Cache Client
let redisClient: Redis | undefined;
let redisDisabled = false;
```

(la riga `// Cache Client` e tutto ciò che segue — `redisClient`, `redisDisabled`, `memoryCache`, `getRedisClient`, `cacheClient`, `getResendInstance` — restano **identici** a com'erano; si è solo eliminato il blocco DB TCP che le precedeva e l'import `pg`/`Hyperdrive`.)

- [ ] Verificare che `drivers.ts` non contenga più riferimenti TCP/Hyperdrive:

```bash
grep -nE "pg\.Pool|getPgPool|createPgPool|Hyperdrive|node-postgres|@cloudflare/workers-types|import pg" server/utils/drivers.ts
```

Output atteso: **nessuna riga** (exit code 1).

- [ ] Gate grep globale (server + shared) — deve essere a 0:

```bash
grep -rIE "node-postgres|getPgPool|pg\.Pool|Hyperdrive" server/ shared/
```

Output atteso: **nessuna riga** (exit code 1). (Nota: `reset.ts` importa ancora `pg` → lo gestisce il Task 3; il gate qui usa pattern specifici che NON includono il bare `import pg` di reset.ts, quindi passa già. Il bare-`pg` lo cattura il Task 5.)

- [ ] Eseguire il typecheck (ora `db.ts` e `drivers.ts` sono entrambi coerenti):

```bash
pnpm typecheck
```

Output atteso: **0 errori**. In particolare: nessun errore in `db.ts` (tipo `NeonHttpDatabase`), nessun errore in `auth.ts` (`drizzleAdapter` accetta il nuovo tipo), nessun errore nei ~30 consumer (`db.select/insert/update/delete` e relational queries sono identiche tra `NodePgDatabase` e `NeonHttpDatabase`, entrambe estendono `PgDatabase`). Se compaiono errori in `fileService.ts` sulla firma `useDB`, verificare che il return type sia `Promise<NeonHttpDatabase<typeof schema>>`.

- [ ] Commit:

```bash
git add server/utils/db.ts server/utils/drivers.ts
git commit -m "refactor: swap runtime driver node-postgres -> neon-http (phase 2)"
```

---

## Task 3 — `server/database/seed/reset.ts`: DDL reset via neon-http

**Files:**
- Modify `server/database/seed/reset.ts:1-47` (rimuove `import pg`, usa `neon()`)
- Verify: `pnpm typecheck` + `pnpm db:reset` (DISTRUTTIVO — vedi nota) contro la branch Neon di sviluppo

`reset.ts` è l'unico consumer di `pg` oltre a `drivers.ts` (verificato via grep). Si riscrive il DDL con `neon()` HTTP per coerenza col driver runtime e per poter rimuovere `pg` da `package.json` (Task 5). `neon()` esegue una query per chiamata tagged-template: `DROP SCHEMA`, `CREATE SCHEMA`, `GRANT`, `count` sono statement singoli → eseguibili in sequenza via HTTP. Si usa l'endpoint **DIRECT** (`NUXT_DATABASE_URL_DIRECT`) per il DDL.

- [ ] Sostituire l'intero contenuto di `server/database/seed/reset.ts` con:

```ts
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { execSync } from "node:child_process";

const envFile = process.env.NUXT_ENV === "prod" ? ".env.production" : ".env";
config({ path: envFile });

// Prefer direct (unpooled) connection for DDL operations
const databaseUrl = process.env.NUXT_DATABASE_URL_DIRECT || process.env.NUXT_DATABASE_URL;

if (!databaseUrl) {
    console.error("❌ No database URL found. Set NUXT_DATABASE_URL_DIRECT (or NUXT_DATABASE_URL) in your .env file.");
    process.exit(1);
}

const sql = neon(databaseUrl);

async function reset() {
    console.log("⚠️  Dropping public schema...");
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await sql`GRANT ALL ON SCHEMA public TO PUBLIC`;

    // Verify drop worked
    const rows = await sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`;
    const tableCount = Number(rows[0].count);
    if (tableCount > 0) {
        console.error(`❌ Drop failed — ${tableCount} tables still exist. Use a direct (non-pooled) connection URL.`);
        process.exit(1);
    }
    console.log("✅ Schema reset — 0 tables remaining.");

    console.log("🔄 Pushing schema...");
    execSync("pnpm db:push", { stdio: "inherit" });
    console.log("✅ Done.");
}

reset().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Reset failed:", message);
    process.exit(1);
});
```

- [ ] Verificare che `reset.ts` non importi più `pg`:

```bash
grep -nE "import pg|from \"pg\"|from 'pg'" server/database/seed/reset.ts
```

Output atteso: **nessuna riga** (exit code 1).

- [ ] Eseguire il typecheck:

```bash
pnpm typecheck
```

Output atteso: **0 errori**.

- [ ] **NOTA DISTRUTTIVA — solo su branch Neon di sviluppo.** Verificare che `.env` punti a una branch Neon (NON produzione) con `NUXT_DATABASE_URL_DIRECT` (unpooled) impostato, poi eseguire il reset (DROP SCHEMA public CASCADE → ricrea + push schema):

```bash
pnpm db:reset
```

Output atteso (in sequenza): `⚠️  Dropping public schema...` → `✅ Schema reset — 0 tables remaining.` → `🔄 Pushing schema...` (output di drizzle-kit push) → `✅ Done.`. Questo prova che il DDL single-statement via HTTP funziona su Neon. Se appare `❌ Drop failed — N tables still exist`, l'URL usato è pooled → impostare `NUXT_DATABASE_URL_DIRECT` all'endpoint unpooled.

- [ ] Commit:

```bash
git add server/database/seed/reset.ts
git commit -m "refactor: reset script DDL via neon-http instead of pg.Client (phase 2)"
```

---

## Task 4 — `server/database/seed/index.ts` + `verify-isolation.ts`: gate seed/isolamento contro Neon

**Files:**
- Verify (nessuna modifica di codice): `server/database/seed/index.ts`, `server/database/seed/verify-isolation.ts`
- Verify: `pnpm db:seed` + `npx tsx server/database/seed/verify-isolation.ts` contro Neon

Questi file consumano `getDB()` via tsx CLI e usano solo `insert`/`select`/relational queries — compatibili con neon-http senza modifiche. Si esegue come gate runtime per provare che il seed gira over HTTPS (no pool TCP).

- [ ] Confermare che `index.ts` e `verify-isolation.ts` NON contengano `db.transaction(` né `tx.`:

```bash
grep -nE "\.transaction\(|tx\.|trx" server/database/seed/index.ts server/database/seed/verify-isolation.ts
```

Output atteso: **nessuna riga** (exit code 1).

- [ ] Eseguire il seed (richiede `db:reset` già fatto nel Task 3, oppure schema già migrato sulla branch Neon):

```bash
pnpm db:seed
```

Output atteso: `[seed] start` → `[seed] done — orgB2C=<uuid> orgB2B=<uuid>` (exit 0). Prova che `insert` multipli girano via HTTP.

- [ ] Eseguire il gate isolamento tenant (script tsx assertivo già presente — è il "test eseguibile" di runtime per il driver):

```bash
npx tsx server/database/seed/verify-isolation.ts
```

Output atteso: `[verify-isolation] OK — B2C=1 projects, B2B=2 projects, nessun leak cross-tenant` (exit 0). Prova che `select` org-scoped e relational queries (`findProjectsByOrg`, `findOrganizationsForUser`) girano corrette via neon-http.

- [ ] (Nessun commit — solo verifica, i file non sono modificati.)

---

## Task 5 — `package.json`: rimozione `pg` + `@types/pg`

**Files:**
- Modify `package.json:48` (rimuove `pg`), `package.json:62` (rimuove `@types/pg`)
- Verify: `pnpm install` + grep bare-pg=0 + `pnpm typecheck` + `pnpm db:migrate` (drizzle-kit senza pg)

Ordine critico: questo task viene **dopo** Task 1-3 (tutti gli `import pg` rimossi). Se eseguito prima, `pnpm install`/typecheck fallirebbero per import non risolti.

- [ ] Rimuovere la riga `"pg": "^8.16.3",` da `dependencies` (`package.json:48`).

- [ ] Rimuovere la riga `"@types/pg": "^8.15.6",` da `devDependencies` (`package.json:62`).

- [ ] Verificare che nessun `import pg` (bare) resti nel codice sorgente:

```bash
grep -rInE "from \"pg\"|from 'pg'|require\(['\"]pg['\"]\)|^import pg" server/ shared/ app/
```

Output atteso: **nessuna riga** (exit code 1).

- [ ] Rigenerare il lockfile:

```bash
pnpm install
```

Output atteso: install completato senza errori; `pnpm-lock`/`pnpm-lock.yaml` aggiornato (rimossi `pg`/`@types/pg`). Lo warning pre-esistente `sharp-wasm32` durante `nuxt prepare` (postinstall) è ignorabile (Known Issue).

- [ ] Typecheck dopo la rimozione delle deps:

```bash
pnpm typecheck
```

Output atteso: **0 errori**. (Conferma che nessun file importava i tipi di `@types/pg`.)

- [ ] **Gate empirico drizzle-kit-senza-pg** (lo spec *afferma* che drizzle-kit ha il proprio connettore pg interno; qui si verifica, non si assume). Con `.env` puntato alla branch Neon e `NUXT_DATABASE_URL_DIRECT` (unpooled) impostato, eseguire la migrate sull'endpoint DIRECT:

```bash
pnpm db:migrate
```

Output atteso: drizzle-kit si connette all'endpoint DIRECT e applica/conferma le migrazioni (es. `No migrations to apply` se già allineato, oppure l'elenco delle migrazioni applicate). **Se fallisce** con un errore di modulo `pg` mancante (improbabile: drizzle-kit bundla il proprio connettore), il fallback è ripristinare `pg` come **devDependency** soltanto (NON dependency runtime; reset.ts non lo usa più) e rieseguire `pnpm install` + `pnpm db:migrate`. La verifica `db:migrate` (non `db:generate`) è quella corretta: FASE 2 NON cambia lo schema, quindi non c'è nulla da generare e il problema TTY di `db:generate` è irrilevante qui.

- [ ] Commit:

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: drop pg + @types/pg deps (replaced by neon-http) (phase 2)"
```

---

## Task 6 — `.env.example`: env DB Neon pooled/unpooled + rimozione Hyperdrive

**Files:**
- Modify `.env.example:14-15` (rimuove `cloudflare-module`/`NUXT_CF_HYPERDRIVE_ID`, mantiene preset), `.env.example:40-42` (sezione Database)
- Verify: ispezione manuale + grep

Decisione (allineata all'advisor): `NUXT_NITRO_PRESET=node-server` **resta** — `cacheClient` (`drivers.ts:54,104,138,162`) e `useServerAuth` (`auth.ts:241`) branzano ancora su `preset == "node-server"` e sono fuori scope FASE 2 (FASE 3 imposterà `vercel`). Si rimuovono solo i residui Cloudflare (la menzione `cloudflare-module` nel commento e `NUXT_CF_HYPERDRIVE_ID`).

- [ ] Sostituire le righe 14-15 di `.env.example`:

Da:
```
NUXT_NITRO_PRESET=node-server                    # node-server | cloudflare-module
NUXT_CF_HYPERDRIVE_ID=your-cloudflare-hyperdrive-id  # Required for cloudflare-module
```

A:
```
NUXT_NITRO_PRESET=node-server                    # node-server (dev). Vercel preset configurato in FASE 3.
```

- [ ] Sostituire la sezione Database (righe 40-42 attuali, da `NUXT_DATABASE_URL=...` a `NUXT_REDIS_URL=...`):

Da:
```
NUXT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NUXT_REDIS_URL=redis://localhost:6379            # Optional: session caching
```

A:
```
# Neon Postgres — usa due endpoint:
#   - POOLED   (host con "-pooler"): runtime serverless via neon() HTTP. Tollera connessioni effimere.
#   - UNPOOLED (host senza "-pooler"): drizzle-kit (migrazioni/DDL) e pnpm db:reset. Il DDL richiede sessione diretta.
# Dev: crea una branch Neon dedicata. neon() parla HTTPS → NON si connette a un Postgres TCP locale.
NUXT_DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
NUXT_DATABASE_URL_DIRECT=postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/DB?sslmode=require
NUXT_REDIS_URL=redis://localhost:6379            # Optional: session caching (dev node-server)
```

- [ ] Verificare la rimozione dei residui Cloudflare e la presenza delle due env DB:

```bash
grep -nE "NUXT_CF_HYPERDRIVE_ID|cloudflare-module" .env.example
```

Output atteso: **nessuna riga** (exit code 1).

```bash
grep -nE "NUXT_DATABASE_URL=|NUXT_DATABASE_URL_DIRECT=|NUXT_NITRO_PRESET=" .env.example
```

Output atteso: tre righe (le due URL DB + il preset `node-server`).

- [ ] Commit:

```bash
git add .env.example
git commit -m "docs: env.example Neon pooled/unpooled + drop Hyperdrive residue (phase 2)"
```

---

## Task 7 — `server/utils/auth.ts` + `drizzle.config.ts`: verifica tipo adapter e migrazioni (no code change)

**Files:**
- Verify (nessuna modifica): `server/utils/auth.ts:25-31`, `server/database/drizzle.config.ts:9-21`
- Verify: `pnpm typecheck` + smoke manuale

`drizzleAdapter(getDB(), { provider: "pg", schema })` accetta qualsiasi drizzle db: il cambio tipo `NodePgDatabase` → `NeonHttpDatabase` non rompe (entrambe estendono `PgDatabase`). NON aggiungere `transaction:true` (org plugin e adapter non usano transazioni — verificato in `node_modules`). `drizzle.config.ts` resta invariato.

- [ ] Confermare che `auth.ts` NON passi `transaction: true` all'adapter:

```bash
grep -n "transaction" server/utils/auth.ts
```

Output atteso: **nessuna riga** (exit code 1).

- [ ] Typecheck finale globale:

```bash
pnpm typecheck
```

Output atteso: **0 errori** — in particolare `auth.ts` compila con `getDB()` che ora ritorna `NeonHttpDatabase<typeof schema>`.

- [ ] **Smoke manuale end-to-end** col nuovo driver (richiede `.env` su branch Neon, schema migrato e seed eseguito). Avviare il dev server:

```bash
pnpm dev
```

Poi su `http://localhost:3000` verificare i flussi critici che toccano il DB via neon-http:
  - **Auth**: signup nuovo utente (email/password) → email verification flow → login. (Better Auth scrive `user`/`account`/`session` via adapter neon-http; `secondaryStorage`/cacheClient resta su memory fallback in dev `node-server`, atteso.)
  - **Org 1a**: dopo login, creazione/lettura organizzazione e membership (plugin `organization`) — niente errore "No transactions support" (conferma 0 tx).
  - **Billing**: apertura pagina pricing/subscription (lettura `creem_subscription` via DB).

Output atteso: tutti i flussi funzionano; nei log del server **nessun** `Error("No transactions support in neon-http driver")` e nessun errore di connessione TCP. Se appare il throw "No transactions support", una operazione sta usando `db.transaction()` → va riscritta come `db.batch([...])` (vedi Vincoli a valle).

- [ ] (Nessun commit — solo verifica; `auth.ts` e `drizzle.config.ts` non sono modificati.)

---

## Checkpoint finale FASE 2 (riepilogo gate)

- [ ] `db.ts` importa `drizzle-orm/neon-http`; `getDB()` ritorna `NeonHttpDatabase<typeof schema>` (singleton module-level, no branching preset)
- [ ] `getPgPool`/`createPgPool`/`getDatabaseUrl`/`import pg`/Hyperdrive rimossi da `drivers.ts`; `grep -rIE "node-postgres|getPgPool|pg\.Pool|Hyperdrive" server/ shared/` → 0 hit
- [ ] `reset.ts` usa `neon()` HTTP (no `pg.Client`); `pnpm db:reset` verde sulla branch Neon
- [ ] `pg` + `@types/pg` rimossi da `package.json`; `pnpm install` rigenera il lock; bare-`import pg` → 0 hit
- [ ] `pnpm typecheck` verde (tipo adapter Better Auth + firma `useDB`)
- [ ] `pnpm db:seed` + `verify-isolation.ts` verdi via tsx contro Neon (HTTPS, no pool TCP)
- [ ] `pnpm db:migrate` funziona sull'endpoint DIRECT senza la dependency `pg` di root (drizzle-kit connettore interno)
- [ ] `.env.example` aggiornato: `NUXT_DATABASE_URL` pooled + `NUXT_DATABASE_URL_DIRECT` unpooled; rimossi `NUXT_CF_HYPERDRIVE_ID`/`cloudflare-module`; `NUXT_NITRO_PRESET=node-server` mantenuto
- [ ] Smoke manuale end-to-end (auth, org 1a, billing) col nuovo driver — nessun throw "No transactions support", nessun errore TCP

---

## Cosa questa fase esplicitamente NON copre

- `nitro.preset = vercel`, `vercel.json`, deploy Vercel → **FASE 3**.
- `cacheClient`/Redis serverless (Upstash) + rimozione `setInterval` rate-limit + `useServerAuth` branching → **FASE 3**.
- Migrazione job async/cron, astrazione `server/queue/` → **FASE 3**.
- Rebranding `.env.example` (naming prodotto) e rimozione var marketing → **FASE 5** (qui solo var infra DB + residui Hyperdrive).
- Entità-esempio `projects` → **FASE 4**.
