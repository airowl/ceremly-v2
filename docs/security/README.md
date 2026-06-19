# `docs/security/`

Reference per-secret della piattaforma: cosa fa ogni credenziale, dove vive nel codice, come usarla, come generarla e metterla in sicurezza. Un file per segreto.

## Documenti

| Documento | Segreto | In una frase |
|-----------|---------|--------------|
| [`NUXT_ADMIN_API_KEY.md`](./NUXT_ADMIN_API_KEY.md) | `NUXT_ADMIN_API_KEY` | Chiave del proprietario per gli endpoint admin (`/api/admin/*`) e il trigger manuale dei job cron. |
| [`NUXT_CRON_SECRET.md`](./NUXT_CRON_SECRET.md) | `NUXT_CRON_SECRET` | Segreto condiviso che fa riconoscere lo scheduler (Vercel Cron) agli endpoint `/api/cron/*`. |

## Le due credenziali a confronto

|  | `NUXT_ADMIN_API_KEY` | `NUXT_CRON_SECRET` |
|--|----------------------|--------------------|
| **Chi la usa** | Il proprietario / un pannello admin esterno | Vercel Cron (automatico) |
| **Header HTTP** | `X-Admin-API-Key` | `Authorization: Bearer <segreto>` |
| **Protegge** | `/api/admin/*` (sempre) + trigger manuale cron | `/api/cron/*` (una delle 3 vie) |
| **Obbligatoria?** | **Sì** — boot fallito in prod se manca | **No** — opzionale, fallback su `x-vercel-cron` |
| **Validata al boot** | Sì (`server/plugins/0.validate-env.ts`) | No |
| **Tipo di confronto** | Constant-time, hash SHA-256 (anti-timing) | `===` semplice |
| **Mapping runtime** | `config.adminApiKey` | `config.cronSecret` |

## Concetti chiave

- **Auth server-to-server.** Nessuna di queste credenziali passa dal login utente (Better Auth): autenticano richieste senza una sessione umana.
- **Auth cron a 3 vie.** Gli endpoint `/api/cron/*` accettano `x-vercel-cron` (piattaforma) **oppure** `Authorization: Bearer ${CRON_SECRET}` **oppure** `X-Admin-API-Key` (trigger manuale). Dettagli in `NUXT_CRON_SECRET.md`.
- **Trabocchetto `CRON_SECRET` vs `NUXT_CRON_SECRET`.** Per usare il Bearer servono **entrambe** le env sul deploy Vercel, stesso valore: Vercel legge `CRON_SECRET` (senza prefisso) per decidere se inviare l'header, il nostro codice legge `NUXT_CRON_SECRET`. Vedi `NUXT_CRON_SECRET.md` §3.
- **Mai nel client.** Nessuna ha il prefisso `NUXT_PUBLIC_`: restano lato server, fuori dal bundle del browser.

## Vedi anche

- `.env.example` — placeholder e documentazione inline di tutte le env
- `CLAUDE.md` → sezione *Security* — riepilogo dell'auth admin e cron
- `server/utils/requireAdminApiKey.ts` — il gate admin condiviso
