# Design — Webhook Resend (Fase 1+2: deliverability hygiene + engagement)

> **Stato**: design approvato in brainstorming, in attesa di review utente prima del piano.
> **Data**: 2026-06-19
> **Scope**: base condivisa (endpoint webhook) + Fase 1 (igiene deliverability) + Fase 2 (engagement open/click). **Inbound `email.received` = Fase 3, spec separato.**
> **Riferimenti**: `docs/base/EMAIL-ARCHITECTURE.md` (com'è oggi), `docs/base/STACK-AND-CONVENTIONS.md` (Strada A), skill `.claude/skills/resend/references/webhooks.md`.

---

## 1. Contesto & obiettivo

Oggi il progetto invia email transazionali via Resend (dietro `server/utils/email.ts` → `sendEmail()`) ma **non riceve alcun feedback**: nessun tracking di consegna, nessuna gestione bounce/complaint, nessuna protezione della reputazione mittente (gap rilevato in `EMAIL-ARCHITECTURE.md §6`). Gli eventi vengono loggati solo in `audit_log` al momento dell'invio.

Obiettivo: ricevere gli eventi Resend in tempo reale per (1) **proteggere la deliverability** — sopprimere indirizzi hard-bounced e chi segnala spam — e (2) **misurare l'engagement** — aperture/click su inviti e reminder ospiti.

## 2. Decisioni (brainstorming)

| # | Decisione | Scelta | Razionale |
|---|-----------|--------|-----------|
| D1 | Scope | Fase 1+2 in un solo spec; inbound rinviato a Fase 3 | Le prime due fasi condividono l'endpoint; l'inbound richiede una decisione infra a sé (MX Cloudflare vs Resend receiving) |
| D2 | Approccio processamento | **A** — inline + tabelle dedicate + correlazione al send | Durevole, query-abile, riusa Redis solo per idempotenza; logica incapsulata in service → migrazione futura a coda (approccio B) è un refactor piccolo |
| D3 | Scope suppression | **Globale** (account-level), non org-scoped | Un hard bounce/complaint è oggettivo; la reputation è account-wide (1 solo account Resend con 2 domini) |
| D4 | Engagement | open+click su inviti/reminder via **sottodominio dedicato tracciato**; transazionali dal dominio attuale con tracking OFF | Il tracking Resend è **domain-wide**; il click-rewrite sui link monouso (verifica/reset) rischia il *token-burn da scanner* → separare i domini è il pattern raccomandato da Resend |
| D5 | Verifica firma | `resend.webhooks.verify()` (usa `svix` interno, già dipendenza) | Nessun pacchetto nuovo |
| D6 | Env isolation | filtro per dominio del `from` nell'handler | Il webhook è account-wide → ogni ambiente processa solo i propri domini |

## 3. Architettura & componenti

Aderisce alla convenzione **thin route → service → repository** (`STACK-AND-CONVENTIONS.md`).

```
server/api/webhooks/resend.post.ts        # thin controller
server/services/emailWebhook.service.ts   # verifica, dispatch per type, env-filter, idempotenza
server/repositories/emailEvent.repository.ts        # insert/query email_events (org-scoped dove serve)
server/repositories/emailSuppression.repository.ts  # upsert/check email_suppressions (globale)
server/utils/email.ts                      # MODIFICATO: enforcement suppression + correlazione + from-by-type
server/utils/runtimeConfig.ts              # MODIFICATO: resendWebhookSecret + appEventsNotifyEmail
server/database/schema/emailEvents.ts      # NUOVO schema
server/database/schema/emailSuppressions.ts# NUOVO schema
nuxt.config.ts                             # MODIFICATO: route rule esenzione security
server/middleware/0.site-mode.ts, 4.block-bots.ts  # MODIFICATO: skip /api/webhooks/resend
```

**Esenzioni** (come il webhook Creem): site-mode gate (`0.site-mode.ts`), bot-block (`4.block-bots.ts`), security headers (route rule `nuxt.config.ts`), rate-limit. La verifica Svix è l'unico gate di autenticazione.

## 4. Modello dati

### `email_suppressions` (GLOBALE — non org-scoped)
| Colonna | Tipo | Note |
|---------|------|------|
| `id` | uuid v7 | PK |
| `email` | text | **UNIQUE**, lowercased |
| `reason` | text | `hard_bounce` \| `complaint` \| `manual` |
| `bounceSubtype` | text? | es. `General`, `NoEmail` |
| `source` | text | `resend_webhook` (default) |
| `createdAt` | timestamptz | |

### `email_events` (ciclo di vita + engagement)
| Colonna | Tipo | Note |
|---------|------|------|
| `id` | uuid v7 | PK |
| `messageId` | text | Resend `email_id` — **indice** |
| `type` | text | sent/delivered/bounced/complained/delivery_delayed/failed/opened/clicked |
| `recipient` | text | |
| `organizationId` | uuid? | FK, per query tenant (nullable per email di sistema) |
| `emailType` | text? | dal contesto di send (verification/invitation/…) |
| `guestId` | uuid? | attribuzione engagement (inviti/reminder) |
| `eventId` | uuid? | attribuzione engagement |
| `clickedUrl` | text? | solo `clicked` |
| `payload` | jsonb | evento Resend completo |
| `occurredAt` | timestamptz | `event.created_at` |
| `createdAt` | timestamptz | |

Indici: `messageId`, `organizationId`, `eventId`, `type`. Tabella **append-only**.

> Sostituisce la tabella fantasma `email_logs` citata erroneamente in `CLAUDE.md` con due tabelle reali e mirate. **TODO**: correggere la riga in `CLAUDE.md §Database Schema`.

### Correlazione `messageId → entità`
Per attribuire open/click a un ospite/evento serve mappare il `messageId` Resend (presente nel webhook) alle entità di dominio. Meccanismo:
- `sendEmail()` riceve un parametro **opzionale** `context?: { organizationId?, guestId?, eventId? }` (additivo a `EmailOptions`).
- Quando presente (inviti/reminder), dopo l'invio scrive una **riga seed** in `email_events` (`type='sent'`, `messageId`, contesto, `emailType`).
- I webhook successivi per quel `messageId` **ereditano** `organizationId`/`guestId`/`eventId` dalla riga seed.
- I caller `distribution.service.ts` / `reminder.service.ts` passano il contesto; i transazionali no (basta delivery/bounce su `recipient`+`messageId`).
- Per `sendBatchEmails()`: insert seed in batch unico (evita N round-trip).

## 5. Sottodominio tracciato (D4)

- **Dominio principale** (`ceremly.com` / `airowlgasga.dev`): `openTracking=false`, `clickTracking=false`. Da qui partono verifica/reset/change-email/org-invite. I link monouso **non** vengono riscritti.
- **Sottodominio eventi** (es. `events.ceremly.com` / `events.airowlgasga.dev`): `openTracking=true`, `clickTracking=true`, verificato in Resend. Da qui partono GuestInvite/GuestReminder.
- `getDefaultSender()` → diventa `getSender(opts)`: usa il **sottodominio tracciato** (`appEventsNotifyEmail`) quando il send è **event-related** — cioè `context.eventId`/`guestId` presente, oppure `emailType` ∈ {guest invite, guest reminder}; altrimenti il dominio principale (`appNotifyEmail`). Si basa sul contesto, non solo su `emailType`, perché gli invii guest potrebbero condividere il tipo `custom` (da confermare nel piano — vedi §12).
- Config dominio via `resend.domains.update({ openTracking, clickTracking })` (one-off, documentato).
- Nuove env per ambiente: `NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL` (es. `Ceremly <inviti@events.ceremly.com>`).

## 6. Data flow

```
SEND
 caller → sendEmail(opts, context?)
   ├─ isSuppressed(recipient)? → sì: skip + audit 'email.suppressed' + return {success:false,error:'suppressed'}
   ├─ from = getSender(opts.type)         # subdomain per inviti/reminder
   ├─ resend.emails.send() → messageId
   ├─ se context: insert email_events seed (type='sent', messageId, org/guest/event, emailType)
   └─ audit 'email.sent' (esistente)

WEBHOOK  POST /api/webhooks/resend
   ├─ readRawBody(event)                  # mai readBody
   ├─ verify svix ───────────────── invalida/headers mancanti → 401
   ├─ dedup svix-id (Redis, TTL 24h) ── duplicato → 200
   ├─ env filter (dominio del from ∈ {dominio, sottodominio} dell'ambiente) → altro env → 200 skip
   ├─ switch(event.type):
   │    bounced (hard)  → upsert suppression(hard_bounce, subtype) + insert event
   │    complained      → upsert suppression(complaint) + insert event
   │    delivered / delivery_delayed / failed → insert event (eredita contesto da seed)
   │    opened / clicked → insert event + eredita guest/event da seed (clicked: salva clickedUrl)
   │    default (sconosciuto) → 200 ack, ignora
   ├─ processing OK → set dedup key
   └─ 200
```
**Lettura engagement**: funzione repo che aggrega `email_events` per `eventId` → open-rate/click-rate per invito (dati pronti; dashboard UI fuori scope).

## 7. Error handling & sicurezza

- Firma invalida / header mancanti → **401**.
- Errore di processing (DB) → **500** → Resend ritenta col backoff (5s→5m→30m→2h→5h→10h). La **chiave di dedup si setta solo a processing riuscito** → un retry post-errore riprocessa, un duplicato vero viene saltato (stesso pattern di `/api/jobs/[job]`).
- Tipo evento non gestito → **200** (ack + ignora).
- `upsert` suppression idempotente (`ON CONFLICT(email) DO NOTHING`). Eventi append-only → ordine fuori-sequenza innocuo; suppression monotona.
- `NUXT_RESEND_WEBHOOK_SECRET` in env **Sensitive** (come gli altri NUXT_* prod, vedi memoria `ceremly-vercel-env-sensitive`). Per-ambiente (ogni webhook ha il suo secret).
- IP allowlist Resend = difesa-in-profondità opzionale (non necessaria: la firma è il gate).

## 8. Idempotenza & isolamento ambienti

- **Idempotenza**: dedup su `svix-id` in Upstash Redis, TTL 24h (riusa l'helper esistente del consumer QStash).
- **Env isolation**: il webhook è account-wide. Ogni ambiente registra il proprio endpoint; l'handler processa solo eventi il cui dominio del `from` appartiene a `{dominioPrincipale, sottodominioEventi}` dell'ambiente corrente. I DB sono già branch Neon separati (prod=main, dev=dev) → nessuna contaminazione incrociata.
- Dev locale (localhost) non ha endpoint pubblico → nessun webhook, salvo uso del CLI `resend webhooks listen --forward-to`.

## 9. Config, secret, registrazione

- `runtimeConfig`: `resendWebhookSecret` (← `NUXT_RESEND_WEBHOOK_SECRET`), `public.appEventsNotifyEmail` (← `NUXT_PUBLIC_APP_EVENTS_NOTIFY_EMAIL`).
- `.env.example` aggiornato (sezione Email).
- **Registrazione webhook**: via API `resend.webhooks.create({ endpoint, events })` (restituisce `signing_secret` **una sola volta** → salvare subito come env). Esposta come script documentato o endpoint admin `/api/admin/...` (protetto da `X-Admin-API-Key`). Un webhook per endpoint-ambiente.
- Eventi sottoscritti: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`, `email.opened`, `email.clicked`. **Non** si sottoscrive `email.sent` (la riga seed `type='sent'` la crea `sendEmail()` al momento dell'invio).

## 10. Testing

- **Unit**: verify firma (valida/invalida/replay svix-id); filtro env-dominio; upsert suppression idempotente; routing per `type`; enforcement suppression in `sendEmail` (recipient soppresso → skip); `getSender(emailType)` sceglie il dominio giusto.
- **Integration**: payload Resend simulati (esempi nel reference skill) → assert scritture `email_events`/`email_suppressions` + status 200/401; idempotenza (stesso svix-id × 2 → un solo effetto).
- **Locale**: `resend webhooks listen --forward-to http://localhost:3000/api/webhooks/resend` (CLI già installato, preserva header Svix) — niente ngrok.

## 11. Fuori scope (Fase 3 / futuro)

- Inbound `email.received` (richiede decisione MX: sottodominio dedicato vs sostituzione Cloudflare Email Routing; + skill `agent-email-inbox` per email non fidate).
- Dashboard analytics engagement (UI) — i dati sono pronti.
- Centro preferenze / gestione unsubscribe, header `List-Unsubscribe`.
- Eventi `domain.*` / `contact.*`.

## 12. Rischi & open question

- **Token-burn**: mitigato da D4 (link di sicurezza dal dominio non-tracciato). Da verificare in QA che gli inviti tracciati non contengano link sensibili.
- **Verifica sottodominio**: richiede record DNS aggiuntivi per ambiente (in `events.<dominio>`) prima del go-live Fase 2.
- **Latenza send**: la riga seed aggiunge 1 insert sul path d'invio degli inviti; mitigata con batch insert in `sendBatchEmails`.
- **Volume**: a volume transazionale l'inline va bene; se cresce → migrazione ad approccio B (coda QStash) — incapsulato nel service.
- **Tipo EmailOptions guest** (open): confermare nel piano quale `type` usano GuestInvite/GuestReminder in `EmailOptions` (dedicato vs `custom`) — determina come `getSender` e la correlazione riconoscono i send event-related. Se è `custom`, ci si basa sulla presenza di `context.eventId`/`guestId`.

## 13. Manifest file (per il piano)

**Nuovi**: `server/api/webhooks/resend.post.ts`, `server/services/emailWebhook.service.ts`, `server/repositories/emailEvent.repository.ts`, `server/repositories/emailSuppression.repository.ts`, `server/database/schema/emailEvents.ts`, `server/database/schema/emailSuppressions.ts`, migrazione Drizzle, script/endpoint registrazione webhook.
**Modificati**: `server/utils/email.ts` (suppression + correlazione + `getSender`), `server/utils/runtimeConfig.ts`, `server/database/schema/index.ts` (barrel), `nuxt.config.ts` (route rule), `server/middleware/0.site-mode.ts` + `4.block-bots.ts` (skip), `.env.example`, `CLAUDE.md` (correzione `email_logs`).
