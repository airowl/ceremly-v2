# PHASE 4 — Email, Error Handling & Rate Limiting

> **Obiettivo della fase.** Rendere il boilerplate robusto in produzione: le email transazionali standard di ogni SaaS (cablate per davvero, non più placeholder), la gestione centralizzata degli errori con observability (Sentry), e il rate limiting che protegge le rotte costose. Queste tre cose insieme sono la differenza tra "funziona sul mio pc" e "regge utenti veri".
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`.** Le fasi 2 e 3 hanno lasciato trigger email come placeholder: qui si implementano davvero.

---

## Scope

### ✅ In questa fase
- **Resend** integrato dietro il modulo `server/emails/`. Email come componenti riutilizzabili (`vue-email`), non HTML inline.
- I **flussi email standard** di ogni SaaS, cablati ai trigger già predisposti in Fase 2/3:
  - Verifica email (Fase 2)
  - Reset password (Fase 2)
  - Benvenuto / welcome (post-signup)
  - Invito a un'organization (Fase 2 — il member invitato riceve l'email)
  - Ricevuta / conferma pagamento (Fase 3)
  - Notifiche subscription: pagamento fallito (past_due), trial in scadenza (Fase 3)
- **Error handling centralizzato**: handler globale per le rotte Nitro, errori applicativi tipizzati con `createError`, nessun try/catch ad-hoc sparso.
- **Sentry** integrato: cattura errori server (e client), con contesto utile (utente/org, senza dati sensibili). Observability su serverless dove non hai i log di un processo persistente.
- **Rate limiting** con Upstash Redis: middleware riutilizzabile, applicato in particolare alle rotte costose (AI, invio email, auth) per evitare abusi e svuotamento del credito API.

### ❌ NON in questa fase
- i18n delle email (le email multilingua) → si predispone l'aggancio, ma la traduzione completa IT/EN è coordinata in Fase 5
- Analytics → Fase 6
- Testing formale → Fase 7 (qui test manuali)

---

## Task dettagliati

### 4.1 — Modulo email (`server/emails/`)
- Installa Resend + `vue-email` (verifica via web l'integrazione aggiornata con Nuxt/Nitro).
- Crea i **template** come componenti: `WelcomeEmail`, `VerifyEmail`, `ResetPasswordEmail`, `OrganizationInviteEmail`, `PaymentReceiptEmail`, `PaymentFailedEmail`, `TrialEndingEmail`.
- Crea `sendEmail(template, props, to)`: l'UNICA funzione che chiama Resend. Aggiungi `RESEND_API_KEY` a `env.ts` e `.env.example`.
- **Sostituisci tutti i placeholder** lasciati in Fase 2/3 con chiamate reali a `sendEmail`.

### 4.2 — Aggancio ai trigger esistenti
- Fase 2: verifica email e reset password ora inviano per davvero.
- Fase 2: l'invito a un'organization invia l'email all'indirizzo invitato con il link/token.
- Fase 3: il webhook `subscription.paid` → ricevuta; `past_due` → email pagamento fallito; trial in scadenza → email di avviso.

### 4.3 — Error handling centralizzato
- Definisci una gerarchia di errori applicativi (es. `AppError` con code, statusCode, messaggio safe per il client) e usa `createError` di Nitro coerentemente.
- Aggiungi un **error handler globale** (Nitro `error` hook / plugin nitro) che: logga, manda a Sentry, e restituisce al client un payload pulito (senza stack trace o dettagli sensibili in produzione).
- **Regola:** le rotte non fanno try/catch ad-hoc per gestire errori di business; lanciano errori tipizzati, l'handler centrale li cattura.

### 4.4 — Sentry
- Integra Sentry (verifica via web il setup aggiornato per Nuxt/Nitro su Vercel).
- Cattura errori server e client. Aggiungi contesto: id utente e id organization (NON email/dati sensibili).
- Aggiungi `SENTRY_DSN` a `env.ts` e `.env.example`.
- Verifica che un errore lanciato di proposito appaia in Sentry.

### 4.5 — Rate limiting (Upstash)
- Integra Upstash Redis (HTTP) + l'helper di rate limiting (verifica via web l'SDK aggiornato).
- Crea un **middleware riutilizzabile** `server/middleware/` parametrizzabile (finestra, limite, chiave per utente/org/IP).
- Applica rate limiting a:
  - rotte auth (login, signup, reset) — anti brute-force
  - rotte di invio email
  - **rotte AI / costose** (predisponi il pattern anche se la prima rotta AI vera la aggiungerai nei singoli progetti)
- Aggiungi `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` a `env.ts` e `.env.example`.

---

## Checkpoint di verifica

- [ ] Tutti i template email esistono come componenti riutilizzabili; nessun HTML email inline
- [ ] `sendEmail` è l'unico punto che chiama Resend; nessuna chiamata Resend sparsa
- [ ] I placeholder email di Fase 2/3 sono stati sostituiti con invii reali (verifica: signup → welcome+verify arrivano; invito → email arriva; pagamento sandbox → ricevuta arriva)
- [ ] Esiste un error handler centrale; le rotte lanciano errori tipizzati invece di gestirli ad-hoc
- [ ] Un errore lanciato di proposito viene catturato, loggato, e appare in Sentry con contesto utente/org (senza dati sensibili)
- [ ] In produzione il client riceve errori puliti (niente stack trace esposto)
- [ ] Il middleware di rate limiting funziona: superata la soglia, la rotta risponde 429
- [ ] Il rate limiting è applicato a auth, email, e predisposto per le rotte AI
- [ ] `npm run typecheck` e `npm run lint` passano
- [ ] Commit: `feat: phase 4 — email, error handling, rate limiting`
