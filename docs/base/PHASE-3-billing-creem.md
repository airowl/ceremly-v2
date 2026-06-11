# PHASE 3 — Billing con Creem

> **Obiettivo della fase.** Trasformare l'app in un vero SaaS: incassare denaro e gestire abbonamenti. Questo significa molto più di "collegare Creem": serve la **logica di subscription** (stato sul DB, webhook come fonte di verità, gating delle feature per piano). È la fase a più alto rischio tecnico perché Creem è giovane — quindi si lavora **sulla documentazione ufficiale, non sulla memoria**.
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`** e assicurati che la Fase 2 (auth + organization) abbia passato il checkpoint.

---

## ⚠️ Regola speciale per questa fase (leggere prima di tutto)

Creem è un Merchant of Record giovane e poco diffuso. **NON dare per scontati endpoint, nomi di eventi webhook, formati di payload, o nomi di variabili dalla conoscenza pregressa: vanno verificati sulla documentazione ufficiale.** Prima di implementare, consulta via web:

- **Better Auth — plugin Creem:** `https://better-auth.com/docs/plugins/creem` (percorso consigliato)
- **Creem — Webhooks reference:** `https://docs.creem.io/skills/creem-api/WEBHOOKS`
- **Creem — docs generali, Subscriptions, Free Trials, Customer Portal:** `https://docs.creem.io`

**Decisione architetturale di questa fase:** usare il **plugin Creem ufficiale di Better Auth** invece dell'SDK Creem grezzo. Motivo: lo stack ha già Better Auth (Fase 2), e il plugin gestisce nativamente customer sync, checkout, customer portal, subscription management, e — soprattutto — il **webhook processing con verifica della firma**. Integrare l'SDK a mano sarebbe più codice e più rischio. Verifica comunque sulla doc che il plugin copra ciò che serve; se un pezzo manca, integralo con l'SDK Creem SOLO per quel pezzo, dentro il modulo `server/billing/`.

**Trappole note da rispettare (confermate dalla doc — non improvvisare):**
- Per **concedere l'accesso** usa l'evento **`subscription.paid`** (copre primo pagamento e rinnovi). NON usare `subscription.active` per concedere accesso: quello è per sincronizzazione.
- I webhook sono la **fonte di verità**. Il redirect post-pagamento è sincrono e può non avvenire (utente chiude il browser) → "lost order". Non basarti sul redirect per aggiornare lo stato: basati sul webhook.
- I prodotti/piani si creano nel **dashboard Creem** e si referenziano per **product ID** (in Creem si ragiona per product ID, non price ID). Il mapping piano→productId vive nella config dell'app.
- Le chiavi distinguono test/produzione (prefisso tipo `creem_test_*` vs `creem_*`). Gestisci entrambi gli ambienti via `env`.

---

## Scope

### ✅ In questa fase
- Modulo di astrazione `server/billing/` che incapsula Creem (via plugin Better Auth). L'app chiama l'interfaccia interna, mai l'SDK Creem direttamente.
- Tabelle DB per lo **stato di subscription** legato all'**organization** (non al singolo utente — il tenant è l'organization, Fase 1): piano corrente, stato (trialing/active/past_due/canceled), periodo, customer/subscription id Creem.
- **Checkout**: creazione sessione di checkout per un'organization che sottoscrive un piano.
- **Customer portal**: endpoint per mandare l'utente a gestire il proprio abbonamento (cambio piano, metodo di pagamento, cancellazione) sul portale Creem.
- **Webhook endpoint** (`server/api/webhooks/creem...`): riceve gli eventi, verifica la firma, aggiorna lo stato di subscription sul DB. Gestisce almeno: pagamento riuscito (concessione accesso), cancellazione, pagamento fallito/past_due, rinnovo.
- **Gating per piano**: estende l'authorization della Fase 2 con il livello "questa feature richiede il piano X". Un helper `requirePlan(...)` / `hasFeature(...)` usato dai service.
- Mapping piani→productId Creem in config (`server/billing/plans.ts`).
- Gestione **free trial** (un trial per account, se il plugin lo supporta in database mode).

### ❌ NON in questa fase
- Le email di notifica billing (pagamento fallito, trial in scadenza, ricevuta) → **Fase 4** (qui scattano i trigger verso un `sendEmail` placeholder; l'implementazione Resend è Fase 4)
- L'admin dashboard per vedere le subscription → Fase 6
- Usage-based billing → fuori scope (il modello è subscription ricorrente)

---

## Task dettagliati

### 3.1 — Studio doc (obbligatorio, prima di scrivere codice)
- Leggi i tre riferimenti in cima. Annota in `server/billing/README.md`: eventi webhook che userai, quale evento concede accesso, formato del payload che ti serve, variabili d'ambiente richieste dal plugin.

### 3.2 — Schema subscription (legato all'organization)
- Aggiungi tabelle Drizzle (`server/db/schema/billing.ts`):
  - `subscriptions`: id, `organizationId` (FK), creemCustomerId, creemSubscriptionId, plan, status, currentPeriodEnd, trialEnd, timestamps.
  - Eventuale `payments`/`transactions` per storico (se utile; il plugin offre searchTransactions, valuta se duplicare).
- Genera + applica migration. **Lo stato di subscription è per-organization**, coerente con la tenancy della Fase 1.

### 3.3 — Configura il plugin Creem in Better Auth
- Aggiungi il plugin Creem alla config di Better Auth (Fase 2), con chiavi da `env` (test/prod), webhook secret, e database mode per il sync.
- Aggiungi a `env.ts` e `.env.example`: `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET` (nomi esatti da verificare sulla doc del plugin).

### 3.4 — Modulo di astrazione `server/billing/`
- `plans.ts`: definizione dei piani dell'app (nome, feature incluse, productId Creem per ogni intervallo/valuta). **Single source of truth** dei piani.
- `index.ts`: interfaccia interna — `createCheckout(org, plan)`, `getSubscription(org)`, `openCustomerPortal(org)`, `hasFeature(org, feature)`. Sotto, delega al plugin Creem. **Il resto dell'app importa solo da qui.**

### 3.5 — Checkout
- Rotta/azione per avviare il checkout di un piano per l'organization attiva.
- Associa il customer Creem all'organization (customer sync).

### 3.6 — Webhook (CRITICO)
- Endpoint `server/api/webhooks/creem.post.ts` (fuori dal middleware auth — i webhook non hanno sessione).
- **Verifica la firma** prima di processare (il plugin dovrebbe offrirlo; se no, implementala secondo la doc Creem).
- Mappa gli eventi → aggiornamenti DB:
  - pagamento riuscito (`subscription.paid`) → stato active, concedi accesso, set periodo.
  - cancellazione → stato canceled (ma l'accesso resta fino a fine periodo — vedi nota access-until-period-end).
  - pagamento fallito → stato past_due (trigger email in Fase 4).
  - rinnovo → aggiorna currentPeriodEnd.
- **Idempotenza:** i webhook possono arrivare più volte (retry policy di Creem). Gestisci la rielaborazione senza duplicare effetti.

### 3.7 — Gating per piano
- Estendi l'authorization della Fase 2: oltre al ruolo, controlla il piano.
- Helper `requirePlan(org, minPlan)` / `hasFeature(org, feature)` chiamati dai service prima di eseguire funzionalità premium.
- Frontend: nascondi/segnala le feature non incluse nel piano corrente (upgrade prompt).

### 3.8 — Free trial
- Se il plugin supporta la prevenzione abuso trial (un trial per account in database mode), abilitala e documentala.

---

## Checkpoint di verifica

> Usa il **Test Mode / Sandbox** di Creem e le chiavi `*_test_*` per tutti i test.

- [ ] La doc Creem + plugin Better Auth è stata letta e `server/billing/README.md` documenta eventi e payload usati
- [ ] Esistono le tabelle subscription legate a `organizationId` (non allo user)
- [ ] Un'organization può avviare il checkout di un piano (sandbox) e completarlo
- [ ] Dopo il pagamento, il **webhook** (non il redirect) aggiorna lo stato a active e concede accesso
- [ ] L'accesso si concede su `subscription.paid` (verificato che NON si usi `subscription.active` per quello)
- [ ] La firma del webhook è verificata; un payload non firmato viene rifiutato
- [ ] Il webhook è idempotente: ricevere lo stesso evento due volte non duplica effetti
- [ ] Una cancellazione mette `canceled` ma l'accesso resta fino a `currentPeriodEnd`
- [ ] Un pagamento fallito mette `past_due` (e predispone il trigger email per Fase 4)
- [ ] `hasFeature`/`requirePlan` bloccano le feature premium per un'org sul piano free — testato
- [ ] Il customer portal si apre e permette di gestire l'abbonamento
- [ ] Tutto passa per il modulo `server/billing/`; nessuna chiamata SDK Creem sparsa altrove
- [ ] `npm run typecheck` e `npm run lint` passano
- [ ] Commit: `feat: phase 3 — billing with Creem`

> ⚠️ Il test più importante: **stacca il redirect e verifica che lo stato si aggiorni SOLO via webhook.** È così che eviti i "lost order" in produzione.
