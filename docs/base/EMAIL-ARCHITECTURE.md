# EMAIL ARCHITECTURE — Come funziona Resend nel progetto

> **Mappa dell'integrazione email** (Resend + React Email) in ceremly-v2. Complementa `PHASE-4-email-errors-ratelimit.md` (guida di build) con la fotografia di *com'è* il sistema oggi.
> Convenzione non negoziabile: **tutte** le email passano da un unico entry point. Niente chiamate Resend sparse. Vedi `STACK-AND-CONVENTIONS.md` §provider-abstraction.

---

## 1. Principio: choke point unico

Ogni email del prodotto passa da **`sendEmail()`** in `server/utils/email.ts`. È l'unico punto che chiama l'SDK Resend. Nessun `new Resend()` o `.emails.send()` altrove.

```
Better Auth hooks / Services / Cron
            │
            ├─ inline (await)  ───────────────────────────┐
            │                                              ▼
            └─ QStash dispatch ─► /api/jobs/[job] ─► job handler
                                                          │
                                                 sendEmail(EmailOptions)      ◄── unico entry point
                                                 server/utils/email.ts
                                                          │
                          ┌───────────────────────────────┼──────────────────────┐
                          ▼                                ▼                       ▼
                buildEmailContent()              getResendInstance()        logEmailEvent()
                → server/emailTemplates/         server/utils/drivers.ts     → audit_log
                render() HTML + plain-text       new Resend(apiKey) (singleton)  (post-send)
                @react-email/render              emails.send({from,to,html,text})
```

---

## 2. I tre strati

### 2.1 Provider abstraction
- **`server/utils/drivers.ts`** — `getResendInstance()`: singleton lazy, crea una sola `new Resend(runtimeConfig.resendApiKey)` per processo serverless e la cachea in modulo.
- **`server/utils/email.ts`** — superficie pubblica:
  - `sendEmail(options: EmailOptions): Promise<EmailResult>` — `options` è una union tipizzata: `verification | reset_password | change_email | waiting_list | invitation | custom`.
  - `sendBatchEmails(emails[])` — batch con concorrenza fissa **10**, usa `resend.batch.send()` (1 API call per chunk ≤100, non audita né seedizza correlazioni).
  - `isEmailServiceConfigured()` — true sse `NUXT_RESEND_API_KEY` + `appNotifyEmail` + `appName` presenti.
  - `EmailResult = { success, messageId?, error?, skipped? }`.
  - **From** = `${appName} <${appNotifyEmail}>` via `getDefaultSender()`; per email event-correlate (context.eventId), usa il tracked subdomain (`appEventsNotifyEmail`) per abilitare open+click tracking.
  - **Reply-to**: impostato **solo** per il tipo `custom` se `options.replyTo` è passato; gli altri tipi non hanno reply-to (si risponde al `from`).
  - **Idempotency key Resend** (finestra 24h): opzionale, passato via `EmailOptions.idempotencyKey`; il QStash guest-invite handler usa `invite:<eventId>:<guestId>:<dispatchId>` (dispatchId minted per send-invocation, un uuid condiviso dal batch; distingue re-send deliberati da retry QStash); il reminder handler usa `reminder:<reminderId>:<guestId>`. Key legacy senza dispatchId fallback a `invite:<eventId>:<guestId>`.
  - **Recipient suppresso** (hard bounce / complaint): `sendEmail()` ritorna `{ success: false, skipped: true }` — terminale non-retryable. I job handlers lo trattano come warn + return (no QStash retry).
  - **Niente retry** a questo livello: l'errore Resend torna subito; la policy di retry la decide il chiamante (la coda).

### 2.2 Template (React Email)
- Cartella **`server/emailTemplates/`**: 9 template + `_softMeadow.ts` (design system) + `index.ts` (barrel).
- **File `.ts`, NON `.tsx`**: i componenti usano `const h = React.createElement` invece di JSX, per non confliggere col parser Vue/Nuxt. Componenti importati da `@react-email/components`.
- `index.ts` → `renderBoth(element)` chiama `render(element)` (HTML) e `render(element, { plainText: true })` (testo) di **`@react-email/render`**. Si inviano **entrambe** le versioni a Resend (deliverability).
- **i18n**: lingua (`it` | `en`) passata come prop; default **`it`**.
- **`_softMeadow.ts`**: palette (bone/card/border/accent/ink/wineDeep/muted), font email-safe (fallback perché i brand font non caricano nei client), `styles`, `renderFooter()` (HR + tagline + link legali), `renderFallback()`, `renderMessageLines()` (split su newline → `<br>`, per compatibilità Outlook).

**Template → scopo:**

| Template | Scopo | i18n |
|----------|-------|------|
| `VerificationEmail` | Verifica email signup | it/en |
| `ResetPasswordEmail` | Reset password | it/en |
| `ChangeEmailEmail` | Conferma cambio email | it/en |
| `OrgInviteEmail` | Invito a organizzazione | it/en |
| `WaitingListEmail` | Welcome lista d'attesa | it/en |
| `ContactConfirmationEmail` | Conferma al mittente del form contatti | it/en |
| `ContactNotificationEmail` | Notifica all'admin (form contatti) | **solo it** (hardcoded) |
| `GuestInviteEmail` | Invito ospite a evento | **solo it** |
| `GuestReminderEmail` | Reminder ospite | **solo it** |

> ⚠️ `GuestInviteEmail`/`GuestReminderEmail` **non** importano gli `styles` di `_softMeadow` (solo `colors`/`fonts`): ridefiniscono gli stili inline e duplicano `renderMessageLines()` → rischio drift se cambia il design token. I placeholder `{nome}`/`{link}` arrivano **già sostituiti** dal service layer.

### 2.3 Logging
- Eventi loggati in **`audit_log`** (`server/database/schema/auditLog.ts`) via `logEmailEvent()`: `action='email.sent'|'email.failed'`, `targetType='email'`, `targetId=recipient`, `status`, `details={emailType, error?}`.
- Il log avviene **dopo** la risposta Resend (se il log fallisce, l'email è già partita).
- **NON esiste una tabella `email_logs` dedicata.** ⚠️ `CLAUDE.md` la elenca tra le domain table: è **impreciso** — il tracking email vive in `audit_log`.

---

## 3. Chi invia — sincrono vs asincrono

| Email | Trigger (file) | Modo |
|-------|----------------|------|
| Verification / reset / change-email | Better Auth hooks (`server/utils/auth.ts`) | **inline** (await nella request) |
| Org invite | Better Auth organization plugin (`auth.ts`) | **inline** |
| Contact (conferma utente + notifica admin) | `contact.service.ts` (`Promise.all`) | **inline** |
| Waiting list welcome | `waitingList.service.ts` | **inline** |
| **Guest invite** | `distribution.service.ts` → `dispatch('send-invite-email')` → `sendInviteEmail.handler.ts` | **async QStash** |
| **Guest reminder** | Cron `send-reminders` → `reminder.service.ts` → `dispatch('send-reminder-email')` → `sendReminderEmail.handler.ts` | **async QStash** |
| Test invio evento | `distribution.service.ts` (send-test) | **inline** (preview organizzatore) |

> Gli hook Better Auth **non lanciano** su fallimento email (loggano e proseguono): l'account si crea anche se la mail non parte. Deliberato. Solo l'endpoint esplicito `/send-verification-email` rilancia.
> Billing/subscription: gestite da **Creem** sulla sua infra, **fuori** da Resend.

---

## 4. Coda QStash (solo email async)

- `server/queue/index.ts` → `dispatch(job, payload)`:
  - Se `NUXT_QSTASH_TOKEN` è settato → pubblica su Upstash QStash a `{baseURL}/api/jobs/{job}`.
  - **Dev fallback**: se il token è **vuoto** → il handler gira **in-process con `await`** (l'"async" diventa sincrono in dev). Invisibile se non si legge `queue/index.ts`. Vedi `LOCAL-DEV-SERVICES.md`.
- Consumer: `server/api/jobs/[job].post.ts` — verifica firma **HMAC** sul raw body, esegue `runJob()`, poi setta la chiave di **dedup** su successo.
- **Dedup** via Upstash Redis (header `upstash-message-id`, TTL **24h**) → evita invii doppi sui retry QStash.
- I handler skippano in silenzio (no errore → no retry infinito) se l'ospite non esiste / senza email / rimosso / ha già risposto.

---

## 5. Configurazione & infrastruttura

| Env var | Significato | Prod | Dev |
|---------|-------------|------|-------------|
| `NUXT_RESEND_API_KEY` | Chiave Resend (1 sola, tutti gli env) | (Sensitive) | stessa chiave |
| `NUXT_PUBLIC_APP_NOTIFY_EMAIL` | From transazionale | `noreply@ceremly.com` | `noreply@airowlgasga.dev` |
| `NUXT_PUBLIC_APP_CONTACT_EMAIL` | Contatto (UI + fallback) | `contact@ceremly.com` | `contact@airowlgasga.dev` |
| `NUXT_CONTACT_ADMIN_EMAIL` | Destinatario notifica form contatti | `admin@ceremly.com` | `admin@airowlgasga.dev` |
| `NUXT_PUBLIC_PRIVACY_EMAIL` | Contatto privacy (pagine legali) | `privacy@ceremly.com` | — |
| `NUXT_PUBLIC_LEGAL_EMAIL` | Contatto legale/DPA (pagine legali) | `legal@ceremly.com` | — |

- **1 account Resend Pro**, multi-dominio. **Domini**: prod `ceremly.com`, dev `airowlgasga.dev` (entrambi verificati).
- **Ricezione NON via Resend** (send-only) → **Cloudflare Email Routing** (catch-all) → Gmail.

---

## 6. Webhook Resend & event tracking

### 6.1 Endpoint & verifica firma
- **Route**: `server/api/webhooks/resend.post.ts` — verifica Svix su raw body via `getResendInstance().webhooks.verify()`.
- **Configurazione**: `NUXT_RESEND_WEBHOOK_SECRET` (mandatory; mancanza → 500 startup). Firma non valida → 401.
- **Rate limit**: 120/min per IP (nuxt-security route-level rule).

### 6.2 Dedup & DB-idempotency
- `email_events.svix_id` ha unique index (`email_events_svix_id_uq`) — tollerante ai NULL (seed rows tipo 'sent' non hanno svix_id).
- Webhook handler: `onConflictDoNothing` → solo il primo insert vince. Redis dedup (`cacheClient.set`, TTL 24h) è best-effort short-circuit.

### 6.3 Eventi & suppression
- **Bounce**: solo hard-bounce permanenti sopprimono globalmente (whitelist `HARD_BOUNCE_SUBTYPES`: Permanent, General, NoEmail, Suppressed, OnAccountSuppressionList). Bounce soft/transient loggati solo in `email_events` (no suppression row). Subtype sconosciuto → trattato come soft.
- **Complaint**: sopprime globalmente.
- **Delivered / Failed / Delivery_delayed**: loggati in `email_events`.
- **Opened / Clicked**: loggati in `email_events`; open incrementa il counter del guest (una volta per distinct `svix_id`).

### 6.4 Correlazione entità
- Seed row (type='sent'): scritto subito dopo send in `sendEmail()`, contiene `messageId` + `organizationId|guestId|eventId` se passato `context`.
- Webhook: lookup via `findSeedContext(messageId)` → recupera la correlazione. Se assente (fallback), `organizationId|guestId|eventId` restano NULL nell'evento (no blocco del webhook).
- Org-invite delivery failures: visible in `audit_log` (flag `emailDelivered`, stato failure).

## 7. Gap noti / fragilità

- **Niente retry** sugli invii inline (contact, waiting-list): soft-fail — la risorsa resta in DB, l'utente non vede la mail. Solo le code QStash hanno retry.
- **Guest invite/reminder solo in italiano** (no i18n).
- `ContactNotificationEmail` italiano-only.
- Plain-text generato da React Email: non verificato visivamente su Gmail/Outlook.

---

## 8. Tooling AI Resend (MCP / CLI / skill)

Installato il 2026-06-19 (vedi memoria `resend-ai-tooling`). **Sono aiuti dev/agent, non vanno cablati nel codice app**: la regola resta "Resend solo dietro `email.ts` / `drivers.ts` / `emailTemplates/`".

- **MCP server** `resend` (`resend-mcp`) — local scope, autenticato sull'account (chiave dev).
- **CLI** `resend` v2.5.0 — autenticato su profilo macOS Keychain, account **dev** (`airowlgasga.dev`).
- **Skill** in `.claude/skills/`: `resend`, `react-email`, `resend-cli`, `email-best-practices`.

> ⚠️ **Impedenza `.tsx` vs `.ts`**: la react-email skill e `resend emails send --react-email x.tsx` assumono **`.tsx` con JSX**. Questo progetto usa di proposito **`.ts` con `React.createElement`**. Un template generato dalla skill va **convertito** al pattern `.ts` + `h()` e agganciato a `index.ts` → `renderBoth()` → `sendEmail()`, non droppato com'è.
