# FASE 3 — Deploy Vercel serverless + background (QStash + Vercel Cron) (Design)

> **Spec di input per `writing-plans`.** Deriva da `IMPLEMENTATION.md` FASE 3 (righe 166-184),
> verificata contro il codice post-1a + ground truth esterno su Upstash QStash, Vercel Cron e il
> preset Nitro `vercel` (doc 2025/2026, non a memoria). Obiettivo: configurare il deploy serverless
> e spostare **ogni** lavoro background su coda HTTP (QStash) o Vercel Cron, rispettando il vincolo
> duro: serverless ⟹ mai TCP pool, mai worker in-process.

---

## Convenzioni già chiuse (NON rivalutare)

- **Deploy = Vercel serverless**; **coda = Upstash QStash**; **cron = Vercel Cron** (`IMPLEMENTATION.md`).
- **FASE 2 (Neon HTTP) assunta FATTA** — dipendenza dura (vedi sotto).
- Webhook Creem **già esente** dall'auth middleware (verificato) → nessuna azione.
- **Decisione utente:** migrare **tutti e 3** i job async reali (non solo scaffold).

## Stato di partenza onesto (prerequisiti & dipendenze)

- **Dipendenza dura su FASE 2:** mettere `preset: 'vercel'` sul `pg.Pool` TCP attuale (`drivers.ts:22-41`,
  `max:90`) è rotto sul serverless. Neon HTTP **prima**. La coda HTTP + lo swap driver insieme
  eliminano ogni connessione TCP persistente.
- **Indipendente dalla tenancy:** il lavoro async esiste già oggi e non dipende da org/member →
  procedibile senza 1b/1c/1d. (L'export GDPR gira con `allEvents: []` stub finché 1c non ripristina il
  lookup — irrilevante per il meccanismo coda.)
- **Cross-fase con FASE 5:** `.env.example` e `nuxt.config.ts` contengono ancora residui Cloudflare/branding;
  qui si toccano **solo** le voci infra (preset, QStash, Upstash, cron); il rebranding è FASE 5.

---

## Sezione 1 — Inventario lavoro async/background reale OGGI

### Candidati coda (fire-and-forget non-awaited → droppati al freeze della function)

| # | Cosa | `path:riga` | Payload job (solo ID) |
|---|---|---|---|
| 1 | Export GDPR | `server/services/user.service.ts:251` `processExport(...).catch(...)` non-awaited → logica in `server/services/dataExport.service.ts:284-313` | `{ exportId, userId }` |
| 2 | Variant immagine (upload diretto) | `server/services/file/fileService.ts:189` `generateAndStoreVariants(...).catch(...)` | `{ fileId }` (re-fetch da R2) |
| 3 | Variant immagine (confirm presigned) | `server/services/file/fileService.ts:451` idem | `{ fileId }` (re-fetch da R2) |

**Decisione utente: migrare tutti e 3.** Sono rotture concrete sul runtime target, non gold-plating.

### Candidato Cron (oggi trigger manuale, idempotente)

| Cosa | `path:riga` | Endpoint cron |
|---|---|---|
| `cleanupOrphanFiles` (delete file R2 orfani per cutoff temporale) | `server/services/file/cleanup.ts:17-53`, esposto da `server/api/admin/cleanup-files.post.ts` (admin API key) | `server/api/cron/cleanup-files.get.ts` |

### NON candidati (anti-errore — da NON accodare)

| Cosa | `path:riga` | Perché | Azione |
|---|---|---|---|
| `setInterval` + Map in-memory rate-limit | `server/middleware/3.rate-limit.ts:7-14` | Timer per-istanza incompatibile col serverless **e** ridondante con `nuxt-security` rateLimiter (`nuxt.config.ts:266-269`) | **Rimuovere/riscrivere** (non è un job) |
| `sendBatchEmails` | `server/utils/email.ts:229-245` | Predisposto "for cron jobs" ma **nessun chiamante** oggi (verificato) | Lasciare; non cablare ora |
| Email transazionali auth | `server/utils/auth.ts:74,96` | Sincrone nel flow auth (verifica/reset) — corrette così | Nessuna azione |

---

## Sezione 2 — Fatto load-bearing: i crons sotto preset `vercel`

**Verificato:** il preset Nitro `vercel` scrive `.vercel/output/config.json` (Build Output API v3) ed è
**l'autorità** della config di deploy. Un `vercel.json` di root con `crons` **non è documentato come
merge-ato** da Nitro → la dicitura letterale di `IMPLEMENTATION.md` ("`vercel.json: crons`") va
riconciliata.

| # | Opzione cron | Pro | Contro | Scelta |
|---|---|---|---|---|
| A | `nitro.vercel.config.crons` → rotte `server/api/cron/*` | Concilia con `IMPLEMENTATION.md` (rotte `/api/cron/*` thin); merge affidabile nel `config.json` BOA; predisposizione `crons:[]` vuota banale | Da verificare a deploy la shape esatta del merge BOA | ✅ |
| B | `scheduledTasks` + `server/tasks/*` (Nitro-native) | Meccanismo più verificato sotto `vercel` | Diverge dal wording (`server/tasks/` invece di rotte); richiede `experimental.tasks:true` | ❌ |
| C | `vercel.json` di root `crons` (match letterale) | Match testuale con `IMPLEMENTATION.md` | **Non verificato** che Nitro `vercel` onori un `vercel.json` di root → rischio a deploy | ❌ |

**Scelta: A.** Le rotte `/api/cron/*` restano (come da design `IMPLEMENTATION.md`), i crons si registrano
via `nitro.vercel.config`. Documentare in chiaro che **l'autorità è il `config.json` BOA**, non un
`vercel.json` di root.

---

## Sezione 3 — Astrazione `server/queue/`

```
server/queue/index.ts
  dispatch<K extends JobName>(job: K, payload: JobPayload<K>): Promise<void>
```

- Implementazione: `@upstash/qstash` `Client.publishJSON({ url: `${baseURL}/api/jobs/${job}`, body: payload, deduplicationId | contentBasedDeduplication, retries })`. QStash **ritenta automaticamente**.
- `baseURL` da `useRuntimeConfig()` (URL pubblico dell'app); **mai** `process.env` nelle route.
- **Payload = SOLO ID** (mai buffer/base64): supera altrimenti i limiti body QStash. Il consumer
  re-fetcha da R2/DB.
- **Tipizzazione:** un registry `JobName` → `JobPayload` (union chiuso) così `dispatch` è type-safe e i
  consumer conoscono la shape.
- **Fallback dev:** se `QSTASH_TOKEN` assente, esegui il consumer **in-process con `await`** (mai
  promise droppata). Documentare (QStash è HTTP, non raggiunge `localhost`).
- **Migrazione:** sostituire i 3 `.catch()` fire-and-forget (Sez. 1) con `await dispatch(...)`.

---

## Sezione 4 — Consumer `server/api/jobs/[job].post.ts`

Pattern (ordine obbligatorio):

1. `const signature = getHeader(event, "upstash-signature")`
2. `const body = await readRawBody(event)` — **`readRawBody`, mai `readBody`** (la verifica HMAC è sul raw).
3. `new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body, url })` — `401` se invalido. Due chiavi → rotazione.
4. **Solo dopo verify:** `JSON.parse(body)` e dispatch interno per `job`.
5. **Idempotenza:** controllare lo stato prima di lavorare (es. export già `completed` → no-op). QStash può consegnare più volte.

I consumer **non** dipendono dalla sessione utente (passano da `1.auth.ts:16-25` che inietta sessione
non-bloccante per `/api/*`) → l'autorizzazione è la **firma QStash**, non la sessione.

---

## Sezione 5 — Cron `server/api/cron/*`

- `server/api/cron/cleanup-files.get.ts`: Vercel Cron invoca via **HTTP GET** con header
  `Authorization: Bearer ${CRON_SECRET}` → verificare l'header, `401` altrimenti.
- Lavoro **idempotente** (delete per cutoff) e **leggero**: se diventasse pesante, **accodare** su QStash
  invece di lavorare in-line (Vercel Cron è no-retry, best-effort, e ha `maxDuration`).
- Limiti piano Vercel: Hobby = max 1 run/giorno; Pro = precisione al minuto. Documentare.
- Registrazione: `nitro.vercel.config.crons` con `{ path: "/api/cron/cleanup-files", schedule: "..." }`.
  Predisporre l'array `crons` (anche con la sola voce cleanup, o vuoto come scaffold).

---

## Sezione 6 — `nuxt.config.ts` + nuxt-security + functionRules

- `nitro: { preset: 'vercel' }`. Mantenere le route rules SSR/CSR esistenti.
- **Esenzioni `nuxt-security` (speculari a Creem):**
  - `"/api/jobs/**": { security: { xssValidator: false, rateLimiter: false, corsHandler: false } }` —
    `xssValidator` **muta** il body POST e invaliderebbe la firma HMAC QStash.
  - `"/api/cron/**": { security: { rateLimiter: false } }`.
- `functionRules` (o `nitro.vercel.functions`) per `/api/jobs/*`: `maxDuration`/memoria adeguati
  (export/variant possono essere lenti).
- Webhook Creem: già esente (`nuxt.config.ts:108-115`) → confermare invariato.
- *(Nota per FASE 5)* `vite.manualChunks` referenzia `grapesjs` (riga 313, dep rimossa) = chunk morto — **non** scope FASE 3.

---

## Sezione 7 — `cacheClient` + rate-limit su serverless (forzati dal vincolo)

- `cacheClient` (`server/utils/drivers.ts:50-170`) è gated su `preset == "node-server"` e usa **ioredis (TCP)**.
  Sotto `vercel` diventa no-op silenzioso → Better Auth `secondaryStorage` (`auth.ts:68`) degrada su Neon.
  **Forzato dal vincolo no-TCP:** sostituire con **Upstash Redis HTTP** (`UPSTASH_REDIS_REST_URL/TOKEN`)
  nel ramo non-`node-server`. (Non è una scelta: ioredis TCP è vietato dal target.)
- `server/middleware/3.rate-limit.ts`: **rimuovere/riscrivere** affidandosi al `rateLimiter` di
  `nuxt-security` (già attivo, `nuxt.config.ts:266-269`).

---

## Sezione 8 — Env e runtimeConfig

Aggiungere a `server/utils/runtimeConfig.ts` (e `.env.example`), accesso via `useRuntimeConfig()`:

| Var | Uso |
|---|---|
| `QSTASH_TOKEN` | `dispatch` (publish) |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | `Receiver.verify` (rotazione) |
| `CRON_SECRET` | verifica header Vercel Cron |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | `cacheClient` HTTP |
| `NUXT_NITRO_PRESET=vercel` | allineare `.env.example` (FASE 2 ha rimosso i residui Cloudflare) |

---

## Sezione 9 — Rischi e mitigazioni

| Rischio | Dove | Mitigazione |
|---|---|---|
| `vercel.json` root crons non onorato | preset Nitro `vercel` possiede il BOA `config.json` | Usare `nitro.vercel.config.crons`; verificare il merge a deploy |
| Firma QStash invalidata | `xssValidator` muta il body POST | Route rule `xssValidator:false` su `/api/jobs/**` |
| Verifica HMAC rotta | uso di `readBody` invece di `readRawBody` | `readRawBody` → `verify` → `JSON.parse` |
| Cache no-op silenziosa | `cacheClient` ioredis TCP gated `node-server` | Upstash Redis HTTP |
| Cron duplicato/mancato | Vercel Cron no-retry, best-effort; Hobby 1/giorno | Operazioni idempotenti; cron accoda su QStash se pesante; valutare piano Pro |
| Body troppo grande | inviare buffer/base64 nel payload | Payload = **solo ID**, re-fetch nel consumer |
| Deploy rotto su TCP | `preset vercel` sul `pg.Pool` attuale | **FASE 2 prima** (dipendenza dura) |
| Dev locale | QStash HTTP non raggiunge `localhost` | Fallback in-process se `QSTASH_TOKEN` assente; documentare |
| Worker per-istanza | `setInterval` rate-limit gira su ogni istanza | Rimuovere; usare `nuxt-security` rateLimiter |
| Consumer e sessione | `1.auth.ts` inietta sessione per `/api/*` | jobs/cron autorizzati da firma QStash / `CRON_SECRET`, non da sessione |

---

## Checkpoint FASE 3

- [ ] `pnpm build` produce build Vercel (preset `vercel`)
- [ ] `crons` predisposti via `nitro.vercel.config` (rotte `/api/cron/*` colpibili da Vercel Cron)
- [ ] I 3 job async passano per `server/queue/` → `server/api/jobs/[job].post.ts` (no in-process); firma QStash verificata su **raw body**; consumer idempotenti
- [ ] `cleanupOrphanFiles` disponibile via `/api/cron/cleanup-files` con `CRON_SECRET`
- [ ] Nessun worker persistente / connessione TCP in attesa: `cacheClient` su Upstash HTTP, `setInterval` rate-limit rimosso, `grep -rIE "ioredis|setInterval|new pg" server/` → 0 hit residuo
- [ ] Esenzioni `nuxt-security` su `/api/jobs/**` e `/api/cron/**`; webhook Creem invariato/esente
- [ ] Env QStash/Upstash/CRON_SECRET in `runtimeConfig.ts` + `.env.example`
- [ ] Commit: `feat: vercel serverless deploy + qstash background jobs`

---

## Cosa esplicitamente NON copre questa spec

- Swap driver Neon HTTP → **FASE 2** (prerequisito).
- Entità-esempio `projects` → **FASE 4**.
- Rebranding/pulizia naming in `.env.example` e `nuxt.config.ts` (chunk grapesjs morto, site name) → **FASE 5**.
- Ripristino del lookup org nell'export GDPR (`allEvents`) → **1c** (qui si migra solo il *meccanismo* di esecuzione).
