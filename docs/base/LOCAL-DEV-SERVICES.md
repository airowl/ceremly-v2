# Servizi in dev & isolamento ambienti (QStash / Redis / R2)

Come eseguire e isolare i servizi esterni nei 3 ambienti. In sintesi: **dev usa il
QStash dev server locale + Redis/R2 sul cloud**; staging e prod sono tutto cloud.

## Perché

I background job **non si eseguono in dev** se passano dal cloud QStash: `dispatch()`
pubblica un job la cui callback è `{NUXT_PUBLIC_BASE_URL}/api/jobs/*` =
`http://localhost:3000/...`, e **il cloud non può raggiungere `localhost`**. L'unico
modo per eseguirli in locale è il **dev server QStash**, che gira sulla tua macchina e
*può* chiamare `localhost`.

Redis e R2 invece sono chiamate *in uscita* dall'app → sul cloud funzionano benissimo
anche in dev. Si tengono sul cloud, con risorse dedicate per ambiente (gratis).

## Eseguire i job in dev

Lo script `dev:local` **carica `.env.local`** (gitignored) col flag `--dotenv` di Nuxt
(parser sicuro: gestisce `&`, spazi, `$` nei valori — a differenza del `source` di shell)
e avvia `nuxt dev --host 127.0.0.1`:

```jsonc
// package.json
"dev:local": "nuxt dev --dotenv .env.local --host 127.0.0.1"
```

### 1. Una volta — prepara `.env.local`

Parti da `cp .env.example .env.local` e riempi la config dev (DB, auth, Redis/R2 cloud
dev). Per **testare i job**, aggiungi il blocco del dev server QStash (valori pubblici e
fissi, stampati dal banner di `pnpm qstash:dev`):

```bash
# .env.local — blocco QStash dev server (IPv4!)
NUXT_QSTASH_URL=http://127.0.0.1:8080
NUXT_QSTASH_TOKEN=eyJVc2VySUQiOiJkZWZhdWx0VXNlciIsIlBhc3N3b3JkIjoiZGVmYXVsdFBhc3N3b3JkIn0=
NUXT_QSTASH_CURRENT_SIGNING_KEY=sig_7kYjw48mhY7kAjqNGcy6cr29RJ6r
NUXT_QSTASH_NEXT_SIGNING_KEY=sig_5ZB6DVzB1wjE8S6rZ7eenA8Pdnhs
NUXT_PUBLIC_BASE_URL=http://127.0.0.1:3000
```

I valori del dev server sono deterministici: se un giorno cambiassero, aggiornali in
`.env.local` (non nello script). Redis e R2 in `.env.local` puntano al **cloud dev**.

### 2. Due terminali

```bash
# Terminale 1 — avvia il QStash dev server (porta 8080, resta attivo)
pnpm qstash:dev

# Terminale 2 — avvia l'app caricando .env.local
pnpm dev:local
```

**Apri il browser su `http://127.0.0.1:3000`** (non `localhost`).

`pnpm dev` "liscio" resta valido per l'editing che non tocca i job: usa il QStash cloud
(i job NON vengono consegnati a localhost — atteso) e Redis/R2 cloud.

> **Perché `127.0.0.1` e non `localhost`.** Nuxt dev di default ascolta solo su `[::1]`
> (IPv6), mentre il dev server QStash consegna le callback su IPv4. Con `localhost` i due
> finiscono su interfacce diverse → la callback non arriva (connection refused). Forzando
> tutto su IPv4 (`--host 127.0.0.1` + base URL `127.0.0.1`) il giro si chiude. Verificato
> end-to-end: publish → callback firmata → `Receiver.verify` = OK.

> Nota: il comando corretto è `npx -y -p @upstash/qstash-cli qstash dev`. La forma
> `npx @upstash/qstash-cli dev` **fallisce** (pacchetto multi-bin).

## Matrice ambienti

| | dev (macchina) | test/staging (Vercel) | prod (Vercel) |
|---|---|---|---|
| account cloud | non-prod | non-prod | prod |
| QStash | **dev server locale** | cloud non-prod | cloud prod |
| Redis | database dev (cloud) | database test (cloud) | database prod (cloud) |
| R2 | bucket dev (cloud) | bucket test (cloud) | bucket prod (cloud) |

I servizi locali valgono **solo per dev**: Vercel non raggiunge `localhost`.

## Isolamento delle risorse cloud

Modello a **2 account**: uno *non-prod* (dev + test/staging), uno *prod* separato.
Dentro ciascun account, **ogni ambiente ha risorse dedicate** — sono gratis:

- **Redis**: Upstash dà fino a **10 database gratis** per account. Usa un database per
  ambiente (URL + token propri) → sessioni, cache e rate-limit fisicamente isolati.
  Nessun prefisso, nessuna collisione.
- **R2**: un **bucket per ambiente** (entro i 10 GB free, egress gratis).
- **QStash**: token + signing keys per ambiente.

### Da sistemare (azioni su Cloudflare)

Verificato: DB, Redis, QStash e base URL sono già separati per ambiente. **Eccezione:
staging e prod condividono lo stesso bucket R2** → i file si mescolano. Inoltre in dev
il public URL R2 è un placeholder.

1. Crea un bucket R2 **dev** e uno **test** (oltre a quello prod esistente).
2. Aggiorna le env:
   - `.env.local` (dev): `NUXT_CF_R2_BUCKET_NAME` + `NUXT_CF_R2_PUBLIC_URL` reali (no più `cdn.yourdomain.com`).
   - staging: bucket + public URL **test**, distinti da prod.
3. Stesso account R2 basta per separare i *dati*. Per separare anche la *quota*
   servirebbe un account distinto (opzionale, fuori scope).

## Portare il pattern su un altro progetto

Serve solo (stack Upstash QStash + Better Auth):

1. Aggiungi `qstashUrl: process.env.NUXT_QSTASH_URL` in `runtimeConfig`.
2. Nel client QStash: `new Client({ token, baseUrl: runtimeConfig.qstashUrl || undefined })`.
3. Copia gli script `qstash:dev` e `dev:local` in `package.json`.

Nessun file Docker. In prod `NUXT_QSTASH_URL` resta vuoto → comportamento cloud invariato.
