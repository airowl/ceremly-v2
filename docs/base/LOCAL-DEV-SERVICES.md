# Servizi esterni & isolamento ambienti (QStash / Redis / R2)

Come si comportano e come si isolano i servizi esterni nei 3 ambienti. In sintesi:
**Redis e R2 girano sul cloud anche in dev**; i background job **non si eseguono in
dev** (vedi sotto); staging e prod sono tutto cloud.

## Background job in dev

I background job passano dal **cloud QStash**, che consegna la callback a
`{NUXT_PUBLIC_BASE_URL}/api/jobs/*`. In dev quel base URL è `localhost`, e **il cloud
non può raggiungere `localhost`** → in dev i job **non vengono consegnati** (atteso).

Per lavorare in dev senza dipendere dai job:

- **`pnpm dev`** con `NUXT_QSTASH_TOKEN` valorizzato (default in `.env`) → `dispatch()`
  pubblica sul cloud, ma la callback verso `localhost` non arriva. Va bene per tutto ciò
  che non dipende dall'esecuzione del job.
- **Token vuoto** in `.env` → `dispatch()` esegue l'handler **in-process** (sincrono,
  senza HTTP né firma). È il fallback per provare la logica del job in locale.

Redis e R2 invece sono chiamate *in uscita* dall'app → sul cloud funzionano benissimo
anche in dev. Si tengono sul cloud, con risorse dedicate per ambiente (gratis).

## Matrice ambienti

| | dev (macchina) | test/staging (Vercel) | prod (Vercel) |
|---|---|---|---|
| account cloud | non-prod | non-prod | prod |
| QStash | cloud non-prod (job non consegnati a localhost) | cloud non-prod | cloud prod |
| Redis | database dev (cloud) | database test (cloud) | database prod (cloud) |
| R2 | bucket dev (cloud) | bucket test (cloud) | bucket prod (cloud) |

I job non girano in dev: Vercel/QStash cloud non raggiungono `localhost`.

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
   - dev: `NUXT_CF_R2_BUCKET_NAME` + `NUXT_CF_R2_PUBLIC_URL` reali (no più `cdn.yourdomain.com`).
   - staging: bucket + public URL **test**, distinti da prod.
3. Stesso account R2 basta per separare i *dati*. Per separare anche la *quota*
   servirebbe un account distinto (opzionale, fuori scope).
