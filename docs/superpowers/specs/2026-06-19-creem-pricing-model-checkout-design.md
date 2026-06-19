# Design — Modello pricing reale Ceremly + checkout per-evento

**Data:** 2026-06-19
**Stato:** approvato (design), in attesa review spec utente → writing-plans
**Autore:** brainstorming session (Claude Code)

---

## 1. Contesto e problema

L'integrazione Creem nel codice è **già completa** (plugin `@creem_io/better-auth@0.0.13`, webhook auto-registrato `/api/auth/creem/webhook`, tabella `creem_subscription` auto-gestita, UI dashboard, plan-limit service). Ma esistono **due modelli di pricing incoerenti**:

- **Backend + dashboard + env** usano il modello boilerplate ereditato: 3 piani ricorrenti `starter`/`premium`/`agency` (€9/€39/€49 × mensile/annuale = 6 prodotti), con limiti `max_organizations`/`team_members`/`storage_mb`.
- **Landing page pubblica** (`app/components/ceremly/CerSitePricing.vue`) vende il modello reale di Ceremly: **Free / Celebrazione / Atelier**, con CTA che NON sono collegate a nessun checkout Creem (`/signup`, `/contact`).

Il modello del sito è la fonte di verità. Questo design **sostituisce** il modello boilerplate con quello reale e costruisce il checkout backend mancante — in particolare il pezzo nuovo e non banale: **Celebrazione è un pagamento one-time legato a un singolo evento**, mentre tutta l'infra esistente assume subscription ricorrenti per-utente.

### Fonte di verità: i tre tier (da `i18n/locales/it-IT.json` → `ceremly.home.pricing`)

| Tier | Prezzo | Modello | Ospiti | Eventi | Feature chiave |
|---|---|---|---|---|---|
| **Free** | €0 "per sempre" | nessun pagamento | fino a 30 | 1 attivo | 3 modelli invito, RSVP via link, dashboard base |
| **Celebrazione** | €39 "una tantum · per evento" | one-time, per-evento | fino a 250 | per-evento | tutti i modelli + brand colors, WhatsApp/email personalizzati, menu/allergie/plus-one, promemoria automatici, export lista catering |
| **Atelier** | €24 "/mese · per planner" | subscription ricorrente | illimitati | illimitati | workspace white-label (logo), domini personalizzati, API & integrazioni catering, account team, supporto prioritario |

Subtitle landing: *"Paghi una volta per evento, oppure un abbonamento se organizzi per lavoro. Mai per RSVP, mai per ospite."*

---

## 2. Decisioni di prodotto (confermate)

1. **Limite ospiti Free = 30** (landing alla lettera; sostituisce una precedente indicazione "5").
2. **Un evento sbloccato (Celebrazione) NON consuma lo slot Free.** Il limite "1 evento attivo" del Free conta solo gli eventi *non sbloccati*. Così, dopo aver pagato €39 per un evento, l'utente può creare un nuovo evento di prova. È la lettura coerente di "una tantum **per evento**". (Va oltre il letterale "1 evento" della landing — scelta esplicita.)
3. **Promemoria per tier (MVP):** Free e Celebrazione max 3 (slot R1/R2/R3 attuali); Atelier illimitati.
4. **Cleanup eventi inattivi:** Free abbandonati → 30 giorni; Celebrazione pagati → 90 giorni dopo la data evento; entrambi con **email di avviso** ~7 giorni prima. Org Atelier escluse dall'auto-cleanup.
5. **Atelier resta sales-led:** CTA "Parla con noi" → `/contact`. Nessun checkout self-serve da costruire; l'attivazione è manuale (link Creem inviato dal sales), catturata da `persistSubscriptions`.
6. **La pagina `/dashboard/subscription` diventa stato-piano + ingresso paywall**, non più una griglia 3-piani con checkout.

---

## 3. Modello dati

### 3.1 Nuovi campi su `events` (Approccio A — campi sull'entità)

File: `server/database/schema/events.ts`

```
tier           text       NOT NULL DEFAULT 'free'   -- 'free' | 'celebration'
unlockedAt     timestamp  NULL                      -- quando l'evento è stato sbloccato
creemOrderId   text       NULL                      -- order Creem del pagamento (match per refund)
```

- Migration Drizzle generata via `pnpm db:generate` (interattiva — richiede TTY).
- `tier` riguarda SOLO lo stato one-time dell'evento. Atelier **non** è un valore di `tier`: è una proprietà dell'org/owner risolta a runtime.
- `creemOrderId` serve a ricollegare un `refund.created` all'evento da re-lockare.

### 3.2 Riscrittura `shared/constants/pricing.ts`

Rimuovere `PRICING_PLANS` (starter/premium/agency), `PlanLimits` boilerplate (`max_organizations`/`team_members`/`storage_mb`) e relativi helper non più usati. Sostituire con il modello Ceremly:

```
export type CeremlyTier = 'free' | 'celebration' | 'atelier'

export const CEREMLY_TIER_LIMITS = {
  free:        { maxGuestsPerEvent: 30,  maxActiveEvents: 1,  maxReminders: 3,  unlimited: false },
  celebration: { maxGuestsPerEvent: 250, maxActiveEvents: -1, maxReminders: 3,  unlimited: false },
  atelier:     { maxGuestsPerEvent: -1,  maxActiveEvents: -1, maxReminders: -1, unlimited: true  },
} as const   // -1 = illimitato
```

`CEREMLY_FREE_LIMITS` esistente viene assorbito da `CEREMLY_TIER_LIMITS.free` (mantenere un alias esportato per non rompere import esistenti durante la migrazione, poi rimuovere).

> **Attenzione a una mescolanza di scope nei limiti.** `maxGuestsPerEvent` e `maxReminders` sono limiti **per-evento** (dipendono dal tier dell'evento). `maxActiveEvents` è invece un limite **per-org** e ha senso solo per i tier che descrivono un'organizzazione: Free (1) e Atelier (∞). `celebration` **non è un tier org** — è lo stato di un singolo evento — quindi il suo `maxActiveEvents` (`-1` nella tabella) è un placeholder non usato dall'enforcement: il conteggio eventi (§5) guarda se l'**org** è Free o Atelier, non il tier del singolo evento. Considerare di documentare questo nel codice o separare i due insiemi (es. `CEREMLY_ORG_LIMITS` per `maxActiveEvents` vs `CEREMLY_EVENT_LIMITS` per ospiti/reminder) in fase di implementazione.

Prezzi (in centesimi, EUR): Celebrazione `3900`, Atelier `2400`/mese.

### 3.3 `creem_subscription` (invariata)

Resta gestita da `persistSubscriptions: true`. Usata **solo** per Atelier (subscription ricorrente). `referenceId = userId` (owner dell'org). I pagamenti one-time **non** creano righe qui.

---

## 4. Risoluzione del tier effettivo di un evento

Nuova funzione (in `server/services/planLimit.service.ts` o nuovo `eventAccess.service.ts`):

```
getEventLimits(event) -> limits
  1. se owner-org ha subscription Atelier attiva           -> CEREMLY_TIER_LIMITS.atelier (illimitato)
  2. altrimenti se event.tier === 'celebration'            -> CEREMLY_TIER_LIMITS.celebration (250)
  3. altrimenti                                            -> CEREMLY_TIER_LIMITS.free (30)
```

- Il check Atelier riusa la catena esistente `resolveOrgOwnerId(organizationId)` → `getUserPlanInfo(ownerId)` → subscription attiva con productId Atelier.
- `getPlanFromProductId` (in `server/utils/creem.ts`) aggiornato per mappare il prodotto Atelier → `'atelier'` (e rimuovere starter/premium/agency).

---

## 5. Enforcement aggiornato

| Risorsa | File attuale | Cambiamento |
|---|---|---|
| **Ospiti** (create) | `server/services/guest.service.ts:144-216` | usa `getEventLimits(event).maxGuestsPerEvent` invece del 30 fisso; `-1` = nessun limite |
| **Ospiti** (import) | `server/services/guest.service.ts:291-387` | `capacity` calcolata da `getEventLimits`; `-1` → `Infinity` |
| **Eventi** (create) | `server/services/event.service.ts:193-222` + `server/repositories/eventRepository.ts` | `countActiveEventsByOrg` → filtro aggiuntivo `tier = 'free'` (gli eventi sbloccati non consumano lo slot); skip del check se owner è Atelier |
| **Reminder** | `server/services/reminder.service.ts:29-119` | `MAX_REMINDERS` diventa tier-aware via `getEventLimits(event).maxReminders`; `-1` (Atelier) → nessun limite. Free/Celebrazione restano 3 |

Le risposte HTTP restano coerenti con l'attuale: **402** (Payment Required) per ospiti/eventi oltre il limite Free (è il segnale che innesca il paywall), **422** per reminder.

> **Nota TOCTOU (rischio noto, accettato):** i check count-then-insert non sono atomici sul driver Neon HTTP serverless. Impatto basso (limit-bypass, nessun leak). Invariato rispetto a oggi.

---

## 6. Checkout Celebrazione (one-time per-evento) — il nuovo pezzo BE

### 6.1 Meccanismo verificato nel plugin `@creem_io/better-auth@0.0.13`

- `CreateCheckoutInput.metadata?: Record<string, unknown>` esiste e include automaticamente `referenceId` (userId).
- È disponibile una `createCheckout` **server-side** da `@creem_io/better-auth/server` (`createCheckout(config, input)`), oltre al client `authClient.creem.createCheckout`.
- Il webhook `checkout.completed` consegna un `CheckoutEntity` con `metadata?: Metadata` e `order?: OrderEntity` (con `id`, `type: 'recurring'|'onetime'`, `product`). Quindi `metadata.eventId` torna indietro nel callback.
- Esistono gli hook `refund.created` e `dispute.created` (`FlatRefundCreated`, `FlatDisputeCreated`).

→ Lo sblocco per-evento è realizzabile in modo affidabile.

### 6.2 Flusso

1. Utente Free su un evento supera 30 ospiti (o vuole feature premium) → enforcement risponde **402**.
2. UI mostra paywall "Sblocca con Celebrazione — €39".
3. `POST /api/events/[id]/unlock` (route thin):
   - `requireAuth(event)`, risolve org-scope dell'evento (`requireEventScoped`), verifica `requireWrite`/owner.
   - rifiuta se l'evento è già `tier='celebration'` o se l'org è Atelier (già illimitato).
   - chiama il service che invoca `createCheckout` **server-side** con: `productId = NUXT_CREEM_PRODUCT_ID_CELEBRATION`, `metadata = { eventId, organizationId }`, `successUrl = {BASE_URL}/dashboard/events/{id}?unlocked=true`.
   - ritorna `{ url }`.
4. Client fa redirect a `url` (checkout Creem hosted).
5. Pagamento → webhook `checkout.completed`.

Il checkout è creato **server-side** (non dal client) così `eventId`/`organizationId` sono legati in modo affidabile e l'ownership è verificata prima di emettere il checkout.

### 6.3 Webhook: sblocco (in `server/utils/creem.ts`)

Riempire `onCheckoutCompleted(data)`:
- se `data.order?.type === 'onetime'` **e** `data.metadata?.eventId` presente (oppure productId === Celebrazione):
  - repository `unlockEvent(eventId, organizationId, creemOrderId)`:
    `UPDATE events SET tier='celebration', unlocked_at=now(), creem_order_id=:orderId WHERE id=:eventId AND organization_id=:orgId AND tier='free'` (idempotente: il `tier='free'` evita doppie scritture).
  - `logAudit(... "event.unlocked" ...)`.

> **Pattern-departure documentata:** oggi i callback Creem sono *solo-audit* (la persistenza è fatta da `persistSubscriptions`). Per i one-time **non** esiste alcuna macchina del plugin che persista lo stato, quindi lo sblocco DEVE avvenire qui. Questa è l'unica eccezione consapevole alla regola "i callback non mutano stato".

### 6.4 Webhook: re-lock su refund/dispute

Aggiungere hook `onRefundCreated` (e `onDisputeCreated` con stessa logica):
- da `refund.order` / `refund.checkout` ricavare il `creemOrderId`;
- repository `relockEventByOrder(creemOrderId)`:
  `UPDATE events SET tier='free', unlocked_at=NULL, creem_order_id=NULL WHERE creem_order_id=:orderId`;
- `logAudit(... "event.relocked" ...)`.

Senza questo, un evento rimborsato resterebbe sbloccato.

---

## 7. Atelier (subscription, sales-led)

- Nessun checkout self-serve dalla landing: CTA `/contact` invariata.
- Attivazione: il sales genera un link checkout Creem per il prodotto Atelier; al pagamento, `persistSubscriptions` scrive `creem_subscription` (referenceId = userId owner).
- `getEventLimits` legge la subscription Atelier attiva → illimitato per tutti gli eventi/ospiti dell'org.
- Gestione (upgrade/cancel) via `creem.createPortal()` già presente in `useSubscription`.

---

## 8. Prodotti Creem + env

### 8.1 Due prodotti (non sei)

| Prodotto | price (cent) | currency | billing_type | billing_period | tax_category |
|---|---|---|---|---|---|
| Celebrazione | 3900 | EUR | one-time | once | saas |
| Atelier | 2400 | EUR | recurring | every-month | saas |

`tax_mode` (inclusive vs exclusive) da decidere al momento della creazione: proposta `inclusive` per Celebrazione (consumer B2C); Atelier da valutare (B2B). Da creare in **test mode** prima del go-live.

### 8.2 Env (`.env`, `.env.example`, `.env.production`, runtimeConfig)

Rimuovere:
```
NUXT_CREEM_PRODUCT_ID_STARTER_MONTH / _YEAR
NUXT_CREEM_PRODUCT_ID_PREMIUM_MONTH / _YEAR
NUXT_CREEM_PRODUCT_ID_AGENCY_MONTH  / _YEAR
```
Aggiungere:
```
NUXT_CREEM_PRODUCT_ID_CELEBRATION   = prod_...   (one-time)
NUXT_CREEM_PRODUCT_ID_ATELIER       = prod_...   (recurring monthly)
```
Aggiornare `server/utils/runtimeConfig.ts` (private + public) e tutti i consumatori (`useSubscription`, `usePricing`, `getPlanFromProductId`, `shared/constants/pricing.ts`).

---

## 9. Cleanup eventi inattivi (cron)

### 9.1 Predicato corretto (correzione critica)

NON basarsi solo su `events.updatedAt` (gli RSVP degli ospiti scrivono su `rsvp_responses`/`guest_activities`, non su `events.updatedAt`; un evento futuro con setup finito sembrerebbe "stale" e verrebbe cancellato **prima della data e dopo il pagamento**).

Un evento è eliminabile se **concluso AND inattivo**:
- **Concluso:** `status = 'closed'` OPPURE `eventDate < now()` OPPURE (`rsvpDeadline IS NOT NULL AND rsvpDeadline < now()`).
- **Inattivo:** nessuna modifica (`events.updatedAt`) e nessuna `guest_activity` da N giorni.
- **Soglia N:** Free → 30 giorni; Celebrazione → 90 giorni dopo `eventDate`.
- **Esclusione:** eventi di org su Atelier (clienti business) — mai auto-eliminati.
- **Edge case `eventDate IS NULL`:** eliminabile solo se `status='closed'` e inattivo 30gg (mai eliminare bozze con data ignota e potenzialmente futura).

### 9.2 Avviso + esecuzione

- Nuovo campo `events.cleanupWarnedAt timestamp NULL`.
- Nuovo cron `GET /api/cron/cleanup-stale-events`, dichiarato in `nuxt.config.ts` (`config.crons`), riusa il pattern di `server/api/cron/send-reminders.get.ts` (auth 3-way: `x-vercel-cron` / `Bearer CRON_SECRET` / `X-Admin-API-Key`). Il cron **non fa lavoro pesante**: marca o accoda.
- Fase 1 (warn): eventi che soddisferanno il predicato tra ~7 giorni → invia email di avviso (nuovo template React Email), setta `cleanupWarnedAt`.
- Fase 2 (delete): eventi che soddisfano il predicato **e** `cleanupWarnedAt` da ≥7gg → cancellazione. Le FK `ON DELETE CASCADE` (guests, rsvp_responses, eventReminders, guestActivities) rimuovono i dati collegati.
- `logAudit` su warn e delete.

---

## 10. UI

- **Paywall per-evento (nuovo):** componente/modal che intercetta il 402 da create-guest/create-event e mostra "Sblocca con Celebrazione €39" → chiama `POST /api/events/[id]/unlock` → redirect.
- **`/dashboard/subscription` (rifatta):** da griglia 3-piani con checkout a "stato piano corrente (Free/Atelier) + lista eventi sbloccati + gestione Atelier via portal (se attivo)". Rimuovere il mapping `slugToProductId` a 6 voci in `app/composables/useSubscription.ts`.
- **Landing `CerSitePricing.vue`:** già corretta (Free/Celebrazione/Atelier). Invariata, salvo eventuale aggancio del CTA Celebrazione al flusso signup→evento→paywall.
- `usePricing` / `app/pages/pricing.vue`: allineare al nuovo modello a 3 tier (rimuovere riferimenti starter/premium/agency e toggle mensile/annuale, non più pertinenti).

---

## 11. Inventario file impattati

**Schema / DB**
- `server/database/schema/events.ts` — +`tier`, +`unlockedAt`, +`creemOrderId`, +`cleanupWarnedAt`
- `drizzle/migrations/` — nuova migration

**Costanti / config**
- `shared/constants/pricing.ts` — riscrittura modello tier
- `server/utils/runtimeConfig.ts` — env Creem (private+public)
- `server/utils/creem.ts` — `getPlanFromProductId`, `onCheckoutCompleted`, +`onRefundCreated`/`onDisputeCreated`
- `nuxt.config.ts` — nuovo cron `cleanup-stale-events`
- `.env`, `.env.example`, `.env.production` — env Creem

**Backend (services/repos/routes)**
- `server/services/planLimit.service.ts` (o nuovo `eventAccess.service.ts`) — `getEventLimits`
- `server/services/guest.service.ts` — limite ospiti tier-aware
- `server/services/event.service.ts` — limite eventi (esclude sbloccati)
- `server/services/reminder.service.ts` — limite reminder tier-aware
- `server/repositories/eventRepository.ts` — `countActiveEventsByOrg` (filtro `tier='free'`), `unlockEvent`, `relockEventByOrder`, query cleanup
- `server/api/events/[id]/unlock.post.ts` — nuovo endpoint checkout
- `server/api/cron/cleanup-stale-events.get.ts` — nuovo cron
- `server/emailTemplates/` — nuovo template avviso cleanup
- `shared/schemas/` — eventuale schema per la route unlock

**Frontend**
- `app/composables/useSubscription.ts` — rimuovere mapping 6-prodotti; aggiungere unlock
- `app/composables/usePricing.ts`, `app/pages/pricing.vue`, `app/pages/dashboard/subscription/index.vue` — nuovo modello
- nuovo componente paywall

---

## 12. Rischi e mitigazioni

1. **Plugin alpha (0.0.13):** verificato che `metadata` passa nel checkout e torna nel webhook. Residuo: formato esatto di `onCheckoutCompleted`/`onRefundCreated` da confermare leggendo i tipi in fase di implementazione (i `Flat*` in `dist/cjs/types.d.ts`).
2. **Mutazione stato nei callback webhook:** eccezione consapevole (§6.3); resa idempotente dal predicato `tier='free'` nell'UPDATE.
3. **Refund non gestito = evento sbloccato gratis:** mitigato da `onRefundCreated` (§6.4).
4. **Cleanup distruttivo:** mitigato dal predicato "concluso AND inattivo" + finestra Celebrazione 90gg + email di avviso + esclusione Atelier (§9).
5. **TOCTOU sui limiti:** invariato, rischio basso accettato.
6. **Migrazione env in produzione:** le env prod sono `Sensitive` su Vercel (vedi memoria `ceremly-vercel-env-sensitive`); source of truth `.env.production`. Rimuovere i 6 vecchi e aggiungere i 2 nuovi su Vercel manualmente.

---

## 13. Prerequisiti

- **API key Creem test** (`creem_test_…`) da `https://creem.io/dashboard/api-keys`. Necessaria per creare i 2 prodotti e ottenere i loro `prod_...` id da mettere negli env. Senza, l'integrazione codice si può completare ma il flusso end-to-end non è testabile.

---

## 14. Out of scope (YAGNI)

- Piani annuali (la landing non li prevede).
- Checkout self-serve Atelier (sales-led).
- License keys, discount codes, multi-seat Atelier (non richiesti dall'MVP).
- Trial period.
- UI admin per `user_custom_limits`.

---

## 15. Criteri di completamento

- I 2 prodotti Creem esistono in test mode; i loro id sono negli env.
- Un evento Free supera i 30 ospiti → 402 → paywall → checkout → pagamento test → webhook → evento `tier='celebration'`, 250 ospiti sbloccati.
- Refund test → evento torna `tier='free'`.
- Subscription Atelier attiva → eventi/ospiti illimitati per l'org.
- Cron cleanup: un evento concluso+inattivo oltre soglia riceve avviso e poi viene eliminato; un evento futuro/attivo no.
- `pnpm typecheck` e `pnpm lint` puliti; nessun riferimento residuo a starter/premium/agency.
