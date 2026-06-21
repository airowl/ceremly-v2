# Dev services & isolamento ambienti — QStash locale, Redis/R2 cloud per-ambiente

> **Nota (2026-06-21):** lo "staging" descritto qui è stato eliminato — vedi 2026-06-21-consolidamento-ambienti-dev-prod-design.md. I riferimenti sotto sono storici.

**Data**: 2026-06-18 (rev. 2026-06-19)
**Branch**: `feat/local-dev-services`
**Stato**: design approvato, pronto per implementazione

## Problema

1. **I background job non si eseguono in dev.** `dispatch()` pubblica sul cloud QStash, che fa callback a `NUXT_PUBLIC_BASE_URL=http://localhost:3000` → il cloud non può raggiungere `localhost` → i job sono pubblicati ma mai consegnati. Il path firma/retry non è mai testato in dev.
2. **R2 in dev**: `NUXT_CF_R2_PUBLIC_URL` è un placeholder (`cdn.yourdomain.com`).
3. **Isolamento risorse cloud**: in passato gli ambienti non-prod e prod condividevano lo stesso bucket R2 → i file si mescolavano (problema storico; obiettivo: un bucket per ambiente, bucket R2 di dev ancora da configurare).

## Decisioni di architettura

### Modello a 2 account (set) + risorse dedicate per ambiente

- **Account non-prod**: contiene le risorse di **dev** e **dev (Preview)**.
- **Account prod**: risorse di **prod**, separate.

Dentro ciascun account, **ogni ambiente ha risorse dedicate** (sono gratis):
- **Redis**: Upstash dà fino a **10 database gratis** per account → un database Redis per ambiente (dev/test/prod), URL+token propri. Isolamento fisico di sessioni/cache/rate-limit, nessun prefisso. Già così oggi (URL Redis separato per ambiente).
- **R2**: un **bucket per ambiente** (entro i 10GB free). Ogni ambiente ha il proprio bucket isolato.
- **QStash**: token + signing keys già separati per ambiente. In dev si usa il **dev server locale** (vedi sotto), non il cloud.

### Ambiente dev: ibrido

| Servizio | dev | Perché |
|---|---|---|
| **QStash** | **dev server locale** via `npx -y -p @upstash/qstash-cli qstash dev` (porta 8080) | Il cloud QStash — qualunque account — non può fare callback a `localhost`. Il dev server gira sull'host e *può* chiamare `localhost:3000`, quindi i job si eseguono davvero (firma + retry reali). |
| **Redis** | cloud, database dedicato dev | Outbound, raggiungibile, gratis, isolato. |
| **R2** | cloud, bucket dedicato dev | Outbound, raggiungibile. Bucket dedicato → non sporca prod. |

**Niente Docker**: l'unico componente locale è il dev server QStash via `npx`.

### Gotcha che vincola il design

**Match URL publish↔verify.** `dispatch()` firma `${baseURL}/api/jobs/{job}`; il consumer `server/api/jobs/[job].post.ts` verifica lo **stesso URL byte-identico** (claim `sub` del JWT). Con QStash sull'host e `NUXT_PUBLIC_BASE_URL=http://localhost:3000`, publish e verify combaciano.

## Valori confermati (osservati dal banner del dev server, v2.37.18)

```
QSTASH_URL=http://127.0.0.1:8080
QSTASH_TOKEN=eyJVc2VySUQiOiJkZWZhdWx0VXNlciIsIlBhc3N3b3JkIjoiZGVmYXVsdFBhc3N3b3JkIn0=
QSTASH_CURRENT_SIGNING_KEY=sig_7kYjw48mhY7kAjqNGcy6cr29RJ6r
QSTASH_NEXT_SIGNING_KEY=sig_5ZB6DVzB1wjE8S6rZ7eenA8Pdnhs
```

Deterministici per l'utente di default. Comando CLI corretto: `npx -y -p @upstash/qstash-cli qstash dev` (la forma `npx @upstash/qstash-cli dev` **fallisce** — pacchetto multi-bin). Flag: `-port` (default 8080), `-log-port` (8081), `-quota payg|pro`.

## Modifiche al codice (env-driven, prod identica a oggi)

In prod `NUXT_QSTASH_URL` resta vuota → `baseUrl: undefined` → publish al cloud, comportamento attuale invariato.

| File | Modifica |
|---|---|
| `server/utils/runtimeConfig.ts` | `qstashUrl: process.env.NUXT_QSTASH_URL` (top-level, accanto a `qstashToken`) |
| `server/queue/index.ts` | `getQStashClient`: `new Client({ token, baseUrl: runtimeConfig.qstashUrl \|\| undefined })`. Il fallback in-process (token vuoto) resta intatto. |
| `server/api/jobs/[job].post.ts` | **nessuna** — il Receiver usa già `qstashCurrentSigningKey`/`qstashNextSigningKey` dalle env |

Nessuna patch a R2 (resta cloud).

## Script `package.json`

- `qstash:dev` → `npx -y -p @upstash/qstash-cli qstash dev`
- `dev:local` → override inline + `nuxt dev --host 127.0.0.1`:
  - `NUXT_QSTASH_URL=http://127.0.0.1:8080`
  - `NUXT_QSTASH_TOKEN=` + `NUXT_QSTASH_CURRENT_SIGNING_KEY=` + `NUXT_QSTASH_NEXT_SIGNING_KEY=` (valori pubblici del dev server)
  - `NUXT_PUBLIC_BASE_URL=http://127.0.0.1:3000`

Redis e R2 restano quelli di `.env` (cloud dev). Le env inline sovrascrivono `.env`.

### Gotcha IPv4/IPv6 (verificato empiricamente)

Nuxt dev di default ascolta solo su `[::1]` (IPv6); il QStash dev server consegna le
callback su **IPv4**. Con `localhost` finiscono su interfacce diverse → callback non
recapitata. Fix: forzare tutto su IPv4 — `nuxt dev --host 127.0.0.1` (Nuxt ascolta su
`127.0.0.1:3000`) + `NUXT_PUBLIC_BASE_URL=http://127.0.0.1:3000` (publish e verify usano
lo stesso URL IPv4). Browser su `http://127.0.0.1:3000`. Test e2e del giro completo
(publish via dev server → callback firmata → `Receiver.verify`): **PUBLISH_OK + VERIFY_OK**.

### Differenza tra i due comandi

- `pnpm dev` → QStash cloud non-prod (i job NON si eseguono: callback a localhost). Redis/R2 cloud dev. Per editing rapido che non tocca i job.
- `pnpm dev:local` → QStash dev server locale (i job si eseguono). Redis/R2 cloud dev. Richiede `pnpm qstash:dev` attivo.

### Flusso d'uso (test dei job)

1. `pnpm qstash:dev` (term. 1, resta vivo)
2. `pnpm dev:local` (term. 2)

## Config env (azioni manuali utente — non committate)

I file `.env*` contengono segreti reali e non si committano; le modifiche sono documentate, non applicate dal codice.

- **`.env` (dev)**: creare un bucket R2 dedicato dev su Cloudflare → impostare `NUXT_CF_R2_BUCKET_NAME` + `NUXT_CF_R2_PUBLIC_URL` reali (rimuovere il placeholder). `NUXT_PUBLIC_BASE_URL=http://localhost:3000` (già ok).
- **`.env.example`**: documentare `NUXT_QSTASH_URL` (vuoto in prod, `http://localhost:8080` in dev-locale) + nota sul modello a 2 account.

## Ambienti

| | dev (macchina) | dev (Vercel Preview) | prod (Vercel) |
|---|---|---|---|
| account cloud | non-prod | non-prod | prod |
| QStash | dev server locale | cloud non-prod | cloud prod |
| Redis | DB dev (cloud) | DB dev (cloud) | DB prod (cloud) |
| R2 | bucket dev (cloud) | bucket dev (cloud) | bucket prod (cloud) |

Stato isolamento attuale (verificato): DB, Redis, QStash, base URL, R2 **tutti separati**.

## Kit copiabile (altri progetti)

Pattern portabile su repo con stack analogo (Upstash QStash + Better Auth): la patch `baseUrl` env-driven (~2 righe) + gli script `qstash:dev`/`dev:local` + la doc. Nessun file Docker da copiare.

## Incertezze da verificare in implementazione

1. **Path della config R2 nei call-site** (basso): confermare se i route leggono `config.fileManager.storage` o `config.storage`; non impatta questo spec (R2 invariato) ma utile per il fix bucket.
2. **Backoff retry del dev server** (basso): non documentato. NON assumere la formula cloud. Osservare i log (`-log-port 8081`) se serve.

## Verifica manuale (definition of done)

- `pnpm qstash:dev` + `pnpm dev:local` → azione che fa `dispatch()` (es. invito) → job consegnato al dev server → handler eseguito → firma verificata (no 401), visibile nei log del dev server.
- `pnpm dev` (senza override) → comportamento cloud invariato (job non eseguiti, come oggi).
- `pnpm typecheck` verde.
- (Azione utente) bucket R2 dev/test creati e public URL non più placeholder.
