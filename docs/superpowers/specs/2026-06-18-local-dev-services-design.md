# Local Dev Services — QStash, Redis, R2 in locale

**Data**: 2026-06-18
**Branch**: `feat/local-dev-services`
**Stato**: design approvato, pronto per implementazione

## Problema

In dev il `.env` punta a tutte risorse **cloud** (QStash, Upstash Redis, R2). Conseguenze concrete:

1. **I background job non si eseguono in dev.** `dispatch()` pubblica sul cloud QStash, che fa callback a `NUXT_PUBLIC_BASE_URL=http://localhost:3000` → il cloud non può raggiungere `localhost` → i job sono pubblicati ma mai consegnati. Il path firma/retry non è mai testato.
2. **R2 in dev sporca la prod / è rotto.** Gli upload di test finiscono sul bucket reale; per di più `NUXT_CF_R2_PUBLIC_URL` è un placeholder (`cdn.yourdomain.com`).
3. **Le free-tier sono per-account, condivise tra 3 ambienti × più progetti.** Quota QStash (1.000 msg/giorno), comandi Redis e 10GB R2 sono risorse scarse condivise: il dev che tocca il cloud consuma ciò che serve a staging/prod.

Nota: oggi NON c'è fallback per R2 (a differenza di QStash/Redis che hanno fallback in-process/in-memory). La validazione env in dev è solo `console.warn`.

## Obiettivo

Far girare **QStash, Redis e R2 in locale per il solo ambiente dev**, così che: i job si eseguano davvero (firma + retry reali), lo storage sia isolato e funzionante, e il dev consumi **zero** quota cloud. Confezionare il tutto come **kit copiabile** su altri progetti con stack analogo (Upstash + R2).

I servizi locali valgono **solo per dev** — staging e prod sono deploy Vercel serverless, dove `localhost` è irraggiungibile: restano cloud.

## Architettura

Principio di split: **in Docker ciò che è outbound (Redis, MinIO); sull'host ciò che fa una callback inbound (QStash)**.

| Servizio | Locale | Perché |
|---|---|---|
| QStash | dev server ufficiale via `npx -y -p @upstash/qstash-cli qstash dev` (porta 8080), **sull'host** | In Docker su macOS la callback verso l'app sull'host richiede `host.docker.internal` + `NUXT_PUBLIC_BASE_URL` riscritto + riga `/etc/hosts` + `pnpm dev --host`: 4 fix accoppiati e fragili. Sull'host `localhost` è coerente ovunque. |
| Redis | `serverless-redis-http` (SRH) + `redis` in docker-compose | Drop-in con `@upstash/redis` (REST), nessuna patch al codice. Outbound → nessun problema di rete. |
| R2 | **MinIO** in docker-compose (S3-compatible) | Il codice usa `aws4fetch` (SigV4) + **path-style**, già compatibile MinIO. Outbound + presigned URL → `localhost:9000`, raggiungibili dal browser. |

### Gotcha che vincola il design

**Match URL publish↔verify.** `dispatch()` firma `${baseURL}/api/jobs/{job}`; il consumer `server/api/jobs/[job].post.ts` verifica lo **stesso URL byte-identico** (claim `sub` del JWT, confronto stretto). Con QStash sull'host e `NUXT_PUBLIC_BASE_URL=http://localhost:3000`, publish e verify combaciano. È la ragione per cui QStash sta sull'host.

## Valori confermati (osservati dal banner del dev server, v2.37.18)

```
QSTASH_URL=http://127.0.0.1:8080
QSTASH_TOKEN=eyJVc2VySUQiOiJkZWZhdWx0VXNlciIsIlBhc3N3b3JkIjoiZGVmYXVsdFBhc3N3b3JkIn0=
QSTASH_CURRENT_SIGNING_KEY=sig_7kYjw48mhY7kAjqNGcy6cr29RJ6r
QSTASH_NEXT_SIGNING_KEY=sig_5ZB6DVzB1wjE8S6rZ7eenA8Pdnhs
```

Deterministici per l'utente di default. Comando CLI corretto: `npx -y -p @upstash/qstash-cli qstash dev` (la forma `npx @upstash/qstash-cli dev` **fallisce** — pacchetto multi-bin). Flag: `-port` (default 8080), `-log-port` (8081), `-quota payg|pro`.

## Modifiche al codice (env-driven, prod identica a oggi)

In prod le nuove env restano vuote → comportamento attuale invariato (zero rischio).

| File | Modifica |
|---|---|
| `server/utils/runtimeConfig.ts` | `qstashUrl: process.env.NUXT_QSTASH_URL` (top-level, accanto a `qstashToken`); `endpoint: process.env.NUXT_CF_R2_ENDPOINT` dentro `fileManager.storage` |
| `server/queue/index.ts` | `getQStashClient`: `new Client({ token, baseUrl: runtimeConfig.qstashUrl || undefined })`. Il fallback in-process (token vuoto) resta intatto. |
| `server/services/file/types.ts` | `R2Config` += `endpoint?: string` |
| `server/services/file/storage/r2.ts` | costruttore: `this.endpoint = config.endpoint || \`https://${config.accountId}.r2.cloudflarestorage.com\`` |
| `server/api/jobs/[job].post.ts` | **nessuna** — il Receiver usa già `qstashCurrentSigningKey`/`qstashNextSigningKey` dalle env |

## `docker-compose.dev.yml`

Servizi: `redis` (7-alpine), `serverless-redis-http` (porta `8079:80`, `SRH_MODE=env`, `SRH_TOKEN=dev_token`, `SRH_CONNECTION_STRING=redis://redis:6379`), `minio` (`9000` API + `9001` console, root user/password dev), `minio-init` (container `minio/mc` one-shot che crea il bucket `ceremly-dev` e lo rende leggibile, poi esce). Volumi opzionali per persistenza Redis/MinIO tra restart. Immagini pinnate a un tag in CI (non `latest`).

## Script `package.json`

- `docker:dev:up` → `docker compose -f docker-compose.dev.yml up -d`
- `docker:dev:down` → `docker compose -f docker-compose.dev.yml down`
- `qstash:dev` → `npx -y -p @upstash/qstash-cli qstash dev`
- `dev:local` → env inline (override verso i servizi locali) + `nuxt dev`

`dev:local` esporta inline: `NUXT_QSTASH_URL`, `NUXT_QSTASH_TOKEN` + le due signing key (valori pubblici del dev server), `NUXT_UPSTASH_REDIS_REST_URL=http://localhost:8079` + `NUXT_UPSTASH_REDIS_REST_TOKEN=dev_token`, `NUXT_CF_R2_ENDPOINT=http://localhost:9000` + access/secret MinIO + `NUXT_CF_R2_BUCKET_NAME=ceremly-dev` + `NUXT_CF_R2_PUBLIC_URL=http://localhost:9000/ceremly-dev`, `NUXT_PUBLIC_BASE_URL=http://localhost:3000`. Le env inline (process.env) sovrascrivono quelle di `.env`.

### Gestione env

`.env` resta cloud → `pnpm dev` funziona com'è oggi (editing rapido che non tocca job/storage). `pnpm dev:local` accende il path 100% locale. Un solo interruttore, nessun file env nuovo, `.env` mai mutato.

### Flusso d'uso

1. `pnpm docker:dev:up` (term. 1, una volta)
2. `pnpm qstash:dev` (term. 2, resta vivo)
3. `pnpm dev:local` (term. 3)

## Ambienti

| | dev (macchina) | staging (Vercel) | prod (Vercel) |
|---|---|---|---|
| QStash | dev server locale | cloud | cloud |
| Redis | SRH locale | cloud | cloud |
| R2 | MinIO locale | cloud | cloud |

Stato isolamento staging↔prod (verificato): DB, Redis, QStash, base URL **già separati**. Da correggere: **R2 condiviso** — staging e prod usano lo **stesso bucket** → i file si mescolano.

**Fix R2 staging** (incluso nello scope): in `.env.staging`, bucket dedicato (`ceremly-staging`) + relativo `NUXT_CF_R2_PUBLIC_URL`. Stesso account R2 basta per separare i *dati*; per separare anche la *quota* servirebbe un account distinto (fuori scope, solo nota). Richiede creare il bucket lato Cloudflare (azione manuale dell'utente).

## Kit copiabile (altri progetti)

Pattern portabile su repo con stack analogo (Upstash + R2 + `aws4fetch`/S3). Artefatti da copiare: `docker-compose.dev.yml`, le ~6 righe di patch (baseUrl + endpoint env-driven), gli script. La doc include una sezione "porta il kit su un altro progetto".

## Incertezze da verificare in implementazione

1. **MinIO + `aws4fetch` SigV4 con `region:'auto'`** (media): MinIO di norma accetta; se rifiuta la firma, impostare `MINIO_REGION=auto` (o `us-east-1`) nel compose. Verifica empirica: un upload via `pnpm dev:local`.
2. **Backoff retry del dev server** (bassa): non documentato. NON assumere la formula cloud. Se la logica retry è critica, osservare i log (`-log-port 8081`).
3. **`minio-init`**: confermare che `mc` crei il bucket prima del primo upload (dipendenza d'ordine nel compose).

## Verifica manuale (definition of done)

- `pnpm dev:local` → upload file → comparsa in MinIO console (`localhost:9001`).
- Azione che fa `dispatch()` (es. invito) → job consegnato al dev server → handler eseguito → firma verificata (no 401), visibile nei log.
- Restart app senza perdere sessione (Redis SRH persistente).
- `pnpm dev` (senza override) → comportamento cloud invariato.
- `pnpm typecheck` verde.
