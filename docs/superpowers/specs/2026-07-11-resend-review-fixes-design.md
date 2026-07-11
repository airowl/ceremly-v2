# Resend — Code Review Fixes (Design Spec)

**Data:** 2026-07-11
**Scope:** Full-stack Resend (invio + webhook + dati + config).
**Copertura fix:** 5 CRITICAL + 6 IMPORTANT. I MINOR sono elencati come follow-up (§9), fuori dai plans.
**Prerequisito lettura:** `docs/base/STACK-AND-CONVENTIONS.md`, `docs/base/EMAIL-ARCHITECTURE.md` (§2.1 e §6 disallineati — vedi F-DOC).

---

## 1. Contesto

Il sistema email Resend è stato costruito in due ondate (invio transazionale + template Soft Meadow; poi webhook Fase 1+2 mergiati in `dev`). Una code review a 4 superfici (path invio, webhook, strato dati, config/integrazione) ha prodotto finding convergenti su **una radice architetturale unica**:

> `email_events` è documentato come "append-only idempotente" ma **non ha alcun vincolo che garantisca l'idempotenza**: nessun `UNIQUE(message_id, type)`, nessun `onConflict` in `insertEmailEvent`. L'`id` è UUID v7 sempre nuovo, quindi ogni insert riesce sempre.

Da questa radice discendono 3 bug distinti (openCount gonfiato, doppia insert su race dedup, dedup che dipende da una cache best-effort). Lo spec risolve la radice **al livello DB** — l'unico affidabile su Vercel serverless, dove la `memoryCache` di fallback è per-istanza e inutile.

I finding sono stati **verificati in prima persona** contro il codice reale (non solo dai report dei subagent): `insertEmailEvent` è un insert puro senza onConflict; il commento in `emailWebhook.service.ts:90-97` che promette idempotenza sul retry è **fattualmente falso**; `sendReminderEmail.handler.ts:66` fa `throw` su esito suppressed; `sendInviteEmail.handler.ts:53` non passa `idempotencyKey`; lo schema suppressions non ha alcuno stato temporaneo.

---

## 2. Principi di design

1. **Idempotenza al DB, non alla cache.** L'invariante "un evento Resend → al più una riga" è un vincolo di database (`UNIQUE`), non una convenzione di codice o un lock Redis. Il dedup Redis resta come short-circuit di ottimizzazione (evita il round-trip DB nel caso comune), ma smette di essere la barriera di correttezza.
2. **Soft-fail visibile.** Un'email che non parte deve lasciare una traccia interrogabile; "success" nell'audit quando l'email non è partita è un bug, non una scelta.
3. **Fail-mode espliciti.** Ogni punto che può fallire (suppression check, seed write, secret mancante) deve avere un comportamento deciso e documentato, non cadere in un catch generico che confonde cause diverse.
4. **Nessuna soppressione di indirizzi validi.** Solo segnali oggettivi e permanenti (hard bounce, complaint) sopprimono. I transitori si loggano.
5. **Minimo cambiamento di superficie.** Nessuna colonna nuova dove un vincolo o un branch bastano. Le decisioni di prodotto (soft-bounce = solo log; race = backfill) sono state scelte apposta per evitare migrazioni di stato complesse.

---

## 3. Le 5 correzioni CRITICAL

### C1 — Unique constraint su `email_events` (la radice)

**Problema.** `insertEmailEvent` (`emailEvent.repository.ts:54-65`) è un `INSERT` puro. Nessun `UNIQUE(message_id, type)`. Ogni consegna ripetuta di `email.opened` (retry Resend, ricarica pixel, consegna concorrente) crea una riga nuova **e** raggiunge `recordGuestOpen` (`emailWebhook.service.ts:96`), che incrementa `openCount`. Il commento a `:90-96` afferma il contrario ed è falso.

**Fix.**
- Migrazione Drizzle: aggiungere un indice **unique** su `email_events(message_id, type)`.
  - Attenzione: i tipi `opened`/`clicked` possono legittimamente ripetersi (aperture multiple reali). Ma ai fini di correttezza `openCount` deve contare **eventi Resend distinti**, non ricariche del pixel. Poiché Resend invia un `email.opened` per apertura, e il dedup a monte è per `svix-id`, l'unicità corretta è **per delivery-event**, non per `(message_id, type)` grezzo — due aperture reali sono due eventi Svix diversi ma stesso `(message_id, opened)`.
  - **Decisione:** il unique è su `(message_id, type)` per gli eventi a **stato singolo** (`sent`, `delivered`, `bounced`, `complained`, `failed`, `delivery_delayed`). Per `opened`/`clicked` (multi-occorrenza) l'idempotenza si àncora invece all'**`svix-id`** già disponibile: aggiungere colonna `svix_id text` a `email_events` e unique su `svix_id` (ogni consegna Svix è unica per definizione). Questo deduplica TUTTI i tipi in modo corretto senza sopprimere aperture reali multiple.
- `insertEmailEvent` usa `.onConflictDoNothing()` sul unique `svix_id`.
- `recordGuestOpen` viene chiamato **solo se l'insert dell'evento ha effettivamente inserito** (l'insert ritorna le righe inserite; se vuoto = duplicato → skip counter). Questo rende `openCount` esattamente = numero di `email.opened` distinti ricevuti.

**Conseguenza a catena.** Con l'unique su `svix_id`, la doppia-insert della race dedup (C3) è impossibile a livello DB indipendentemente da Redis. Il commento falso a `emailWebhook.service.ts:90-97` va riscritto per descrivere la garanzia reale (DB unique), non quella immaginaria (throw sul retry).

**Interfaccia.** `handleResendEvent` deve ricevere lo `svix-id` (oggi si ferma alla route). La route lo passa nel payload verso il service, o il service lo estrae. Nuova firma: `handleResendEvent(event, svixId)`.

### C2 — Soft bounce non deve sopprimere

**Problema.** `emailWebhook.service.ts:77-79`: ogni `email.bounced` chiama `upsertSuppression({ reason: "hard_bounce", ... })` ignorando `data.bounce?.subType`. Un bounce transitorio (mailbox piena, greylisting, `Transient`) sopprime l'indirizzo per sempre. Il test `emailWebhook.service.test.ts:24-27` congela il comportamento sbagliato.

**Decisione di prodotto (presa):** *solo log, mai soppressione per i transitori.* Nessuna colonna nuova, nessuna finestra di scadenza.

**Fix.**
- Introdurre una funzione pura `isHardBounce(subType?: string): boolean` (in `emailWebhook.service.ts` o un util) con whitelist esplicita dei subtype permanenti. Resend usa i subtype in stile SES: `Permanent`/`General`/`NoEmail`/`Suppressed` → hard; `Transient`/`MailboxFull`/`MessageTooLarge`/`ContentRejected`/`AttachmentRejected` → soft. La whitelist va sul lato **hard** (default = soft = non sopprimere), così un subtype sconosciuto non sopprime per errore.
- Branch `email.bounced`:
  - se `isHardBounce(subType)` → `upsertSuppression` + `insertEmailEvent(type: "bounced")`.
  - altrimenti → **solo** `insertEmailEvent(type: "bounced")` (con il subtype nel payload per diagnosi), niente suppression.
- Aggiornare il test: il caso `subType: "General"` resta hard (corretto); aggiungere un caso `subType: "Transient"` che verifica **nessuna** suppression.

### C3 — Dedup atomico → risolto dal DB (C1)

**Problema.** `resend.post.ts:25-36`: `get` → elabora → `set`, senza SET NX. Due consegne concorrenti dello stesso `svix-id` passano entrambe il `get` prima di qualunque `set`. Il fallback `memoryCache` è per-istanza → su serverless due consegne su istanze diverse non si vedono mai.

**Fix.** **Nessun SET NX necessario** una volta che C1 è in vigore: l'unique su `svix_id` in `email_events` rende la doppia elaborazione innocua (la seconda insert è no-op, il counter non scatta). Il dedup Redis resta come short-circuit di performance (fail-open accettabile: nel peggiore dei casi si arriva al DB che rifiuta il duplicato). Va aggiornato il commento nella route per chiarire che **la correttezza è garantita dal DB, non dal dedup Redis** (che è best-effort).

> Razionale della scelta: su serverless un lock Redis atomico è comunque fragile (TTL, partizioni, fail-open); spostare l'invariante sul DB è più forte e non aggiunge round-trip nel caso comune. È coerente con la nota trasversale di 3 report su 4.

### C4 — Poison-message sul reminder (suppression sopravvenuta)

**Problema.** `sendReminderEmail.handler.ts:66`: `if (!result.success) throw`. Se tra il 1° invio e un retry QStash il guest diventa `hard_bounce`, `sendEmail` ritorna `{success:false, error:'suppressed'}` → il handler fa throw → QStash ritenta → sempre suppressed → **poison message** fino a scadenza retry. Lo stesso vale per il caso "send già riuscito, era il DB write a fallire" trasformato in fallimento perpetuo. Identico rischio latente sull'invite handler.

**Fix.**
- `sendEmail` distingue l'esito **suppressed** da un errore di invio: aggiungere a `EmailResult` un discriminante, es. `skipped?: boolean` (o `reason: 'suppressed'`). Suppressed non è un fallimento ritentabile.
- Gli handler QStash (reminder + invite) trattano `skipped` come **terminale non-errore**: non fanno throw (nessun retry), loggano e ritornano. Solo un `success:false` **senza** `skipped` (errore di invio reale) fa throw → retry.
- Coerenza: applicare lo stesso pattern a entrambi gli handler.

### C5 — Webhook secret vuoto in prod = perdita silenziosa

**Problema.** `emailWebhook.service.ts:38` passa `resendWebhookSecret as string`. Con secret vuoto, svix **non bypassa** (lancia "Secret can't be empty") ma la route cattura tutto → 401 su ogni evento. Conseguenza: nessun bounce/complaint mai scritto in `email_suppressions`, `isEmailSuppressed` sempre falso, si continua a inviare a indirizzi che bounciano bruciando la reputation — **senza alcun allarme** (nessun log distingue "firma malformata" da "secret non configurato").

**Fix.**
- **Startup guard** (nitro plugin o check in `runtimeConfig`): se `isProdDeployment` e `resendWebhookSecret` è vuoto → log di errore prominente (livello error, non warn) all'avvio. Estendere il guard alle altre env email critiche in prod: `resendApiKey`, `appNotifyEmail`, `appEventsNotifyEmail`.
- **Diagnostica nella route:** distinguere nel catch il caso "secret mancante/vuoto" (config error → log error, 500 così è visibile in monitoring) dal caso "firma non valida" (401 legittimo, no allarme). In pratica: se `resendWebhookSecret` è falsy prima di chiamare verify, loggare esplicitamente `[webhook:resend] SECRET NOT CONFIGURED` e rispondere 500 (non 401), così il fallimento non si maschera da traffico ostile.

---

## 4. Le 6 correzioni IMPORTANT

### I1 — Race seed-vs-webhook → backfill

**Problema.** `insertEmailSeed` è scritto DOPO `emails.send()` (`email.ts:277-286`). Resend può consegnare `delivered`/`opened` prima che il seed sia committato → `findSeedContext` ritorna `undefined` → l'evento è scritto con `organizationId/guestId/eventId = null` e **nessun retry lo recupera**.

**Decisione di prodotto (presa):** *backfill quando il seed arriva.*

**Fix.**
- Il branch webhook scrive l'evento anche con contesto null (comportamento attuale, invariato).
- `insertEmailSeed` (nel path invio), dopo aver scritto la riga `sent`, esegue un **UPDATE** degli eventi orfani: `UPDATE email_events SET organization_id=…, guest_id=…, event_id=…, email_type=… WHERE message_id=? AND organization_id IS NULL` (ricorrela tutte le righe già arrivate per quel `message_id`).
- Se tra gli eventi ricorrelati c'è un `opened` con `guestId` ora noto, valutare il backfill del counter guest. **Decisione:** per semplicità e per non riaprire il problema di idempotenza del counter, il backfill dell'`openCount` è **fuori scope** (l'apertura resta registrata in `email_events`, che è la fonte di verità; il counter derivato può divergere di 1 in questo caso di bordo raro). Documentato come limite noto.

### I2 — Invite handler senza `idempotencyKey`

**Problema.** `sendInviteEmail.handler.ts:53` non passa `idempotencyKey`, a differenza del reminder (`:65`). Send-ok → fallimento a valle (es. `insertEmailSeed`) → throw → retry QStash → `emails.send` re-eseguito senza key → **doppia email di invito**. Il commento in `distribution.service.ts:157-160` si affida al dedup consumer-side, ma quello protegge solo il retry dello stesso messaggio dopo fallimento del handler, non la finestra send-ok/DB-fail.

**Fix.** Passare una `idempotencyKey` stabile all'invite: `invite:${event.id}:${guest.id}`, coerente col pattern reminder (`reminder:${reminder.id}:${guest.id}`). Chiude la finestra alla fonte via replay idempotente Resend (finestra 24h).

### I3 — `insertEmailSeed` non transazionale dopo send-ok

**Problema.** Se `insertEmailSeed` lancia (DB down) DOPO che Resend ha accettato il messaggio, l'eccezione risale al catch di `sendEmail` (`email.ts:292`), che logga `email.failed` e ritorna `{success:false}` **pur avendo inviato l'email**. Esito falso + su invite → duplicato (mitigato da I2, ma la falsità dell'esito resta).

**Fix.** Rendere `insertEmailSeed` **best-effort**: try/catch che logga senza far fallire l'invio già completato (l'audit `email.sent` è già scritto a `:260`, l'email è partita). La correlazione persa in questo caso è recuperata dal backfill (I1) quando/se una riga seed successiva viene scritta — oppure resta null (accettabile, degradazione soft). L'esito ritornato deve riflettere che **l'email è partita** (`success:true` con `messageId`), non `failed`.

> Nota: I1 e I3 sono complementari. I3 evita che un fallo del seed rovesci l'esito dell'invio; I1 recupera il contesto se il seed arriva più tardi.

### I4 — Webhook Resend senza rate-limit

**Problema.** `nuxt.config.ts:177-183` esenta `/api/webhooks/resend` da `rateLimiter: false` (come Creem). Rotta pubblica che per OGNI richiesta esegue `readRawBody` (fino a 1MB) + verifica HMAC svix prima di poter rifiutare → DoS/amplificazione crypto per un attaccante che conosce l'URL.

**Fix.** Sostituire `rateLimiter: false` con un limiter **dedicato e generoso** per-IP sulla rotta webhook (i retry legittimi Resend sono a bassa frequenza). Va tarato sopra il burst legittimo di Resend ma sotto la soglia di abuso. Verificare che `requestSizeLimiter` (già attivo, cap 1MB globale) resti in vigore. Stessa valutazione applicabile alla rotta Creem, ma **fuori scope** (non è Resend) — annotata come follow-up.

### I5 — Soft-fail org-invite invisibile

**Problema.** `auth.ts:376-380`: su fallimento invio invito → solo `console.error` + prosegue; l'hook `afterCreateInvitation` (`:383-391`) scrive l'audit `team.member_invited` con `status:"success"`. L'invito risulta "inviato" ma l'utente non riceve nulla e non c'è alcun segnale. Diverso da verification/reset/change (che rilanciano 500).

**Fix.** Propagare lo stato reale dell'invio nell'audit dell'invito: se `sendEmail` ritorna `success:false`, l'audit deve riflettere `status:"failure"` (o un campo `emailDelivered:false` nei details) legato all'`invitationId`. Obiettivo: l'organizzatore/operatore può interrogare quali inviti non sono partiti. (L'esposizione UI di un "reinvia invito" è fuori scope — qui basta la visibilità nell'audit.)

### I6 — `sendBatchEmails` senza rate-limit/backoff

**Problema.** `email.ts:325-341`: `Promise.all` a chunk di 10 di `emails.send()` singole → 10 richieste HTTP simultanee vs limite Resend (2 req/s free) → 429 come `response.error`, loggati `email.failed`, ritornati `success:false` **senza retry né backoff** → email perse. Nessun chiamante ad alto volume oggi (il path evento usa 1 job QStash per guest), ma è una trappola latente per qualunque futuro uso.

**Fix.** Riscrivere `sendBatchEmails` su `resend.batch.send()` (fino a 100 messaggi per chiamata, 1 richiesta HTTP → niente 429 da concorrenza). Se un chiamante deve superare 100, chunk sequenziali. In alternativa minima: introdurre un limiter (riuso `cacheClient.increment`) con retry/backoff su 429. **Preferenza:** `resend.batch.send()` — è la primitiva giusta. Da verificare la firma dell'API batch nell'SDK resend installato (§7).

---

## 5. Superfici e interfacce toccate

| Unità | File | Modifica |
|-------|------|----------|
| Schema eventi | `server/database/schema/emailEvents.ts` | + colonna `svixId`, + unique index su `svix_id` |
| Migrazione | `drizzle/migrations/00XX_*.sql` | generata da Drizzle (colonna + unique) |
| Repo eventi | `server/repositories/emailEvent.repository.ts` | `insertEmailEvent` onConflictDoNothing + ritorna inserito?; `insertEmailSeed` best-effort + backfill UPDATE; `findSeedContext` ORDER BY |
| Repo suppression | `server/repositories/emailSuppression.repository.ts` | (eventuale escalation — vedi MINOR, fuori scope plans) |
| Service webhook | `server/services/emailWebhook.service.ts` | `isHardBounce`; branch bounced condizionale; firma `handleResendEvent(event, svixId)`; commento idempotenza riscritto; counter solo su insert reale |
| Route webhook | `server/api/webhooks/resend.post.ts` | passa `svixId` al service; diagnostica secret-mancante (500 vs 401); commento dedup |
| Invio | `server/utils/email.ts` | `EmailResult.skipped`; suppressed→skipped non-errore; seed best-effort; esito corretto |
| Handler reminder | `server/queue/handlers/sendReminderEmail.handler.ts` | skipped = terminale, no throw |
| Handler invite | `server/queue/handlers/sendInviteEmail.handler.ts` | + idempotencyKey; skipped = terminale, no throw |
| Batch | `server/utils/email.ts` | `sendBatchEmails` su `resend.batch.send()` |
| Config sicurezza | `nuxt.config.ts` | rate-limit dedicato su `/api/webhooks/resend` |
| Startup guard | nitro plugin / `runtimeConfig.ts` | check env email critiche in prod |
| Auth invite | `server/utils/auth.ts` | audit invito riflette esito invio reale |
| Test | `*.test.ts` | soft-bounce, unique/idempotenza, skipped, backfill |

---

## 6. Testing

- **Unit (Vitest, già configurato in `dev`):**
  - `isHardBounce`: hard subtypes → true; transient/unknown → false.
  - Branch `email.bounced`: transient → nessuna suppression, evento scritto; hard → suppression + evento.
  - `insertEmailEvent` onConflictDoNothing: seconda insert stesso `svix_id` = no-op; `recordGuestOpen` non scatta sul duplicato.
  - `sendEmail`: suppressed → `{success:false, skipped:true}`; seed failure → esito resta `success:true`.
  - Handler reminder/invite: esito `skipped` → nessun throw; esito errore reale → throw.
  - Invite: `idempotencyKey` presente e stabile.
  - Backfill: evento orfano + seed successivo → UPDATE ricorrela.
- **Regressione test esistenti:** aggiornare `emailWebhook.service.test.ts` (il caso che congela soft=hard) e i test invio/suppression.
- **E2E manuale (fuori CI):** `resend webhooks listen --forward-to` per un bounce transitorio reale + doppia consegna dello stesso evento (verifica no doppio openCount).

---

## 7. Rischi e verifiche prima dell'implementazione

1. **Subtype dei bounce Resend:** confermare i valori reali di `data.bounce.subType` emessi da Resend (la whitelist hard dipende da questo). Verificare su doc Resend / payload reale. Se ignoto a design-time, la scelta "default = soft = non sopprimere" è il fail-safe corretto.
2. **API `resend.batch.send()`:** confermare firma e limiti nell'SDK `resend` installato (versione in `package.json`). Se non disponibile, fallback al limiter con backoff.
3. **`svix-id` disponibile end-to-end:** la route ha già gli header svix (li usa per dedup); confermare che lo `svix-id` sia passabile al service senza rompere la firma di test.
4. **Migrazione unique su tabella con dati esistenti in `dev`:** se `email_events` in dev ha già righe con `svix_id` null (colonna nuova), l'unique su una colonna nullable in Postgres **tollera più NULL** — ma le righe storiche non avranno `svix_id`. Valutare: backfill `svix_id` non possibile per righe vecchie (dato non ricostruibile) → l'unique protegge solo gli eventi futuri. Accettabile. Confermare che `pnpm db:generate` è interattivo (needs TTY, known issue).
5. **`db:migrate:prod` gotcha:** noto che migra dev non prod senza URL inline (memory `ceremly-db-migrate-prod-gotcha`). La migrazione va applicata a prod con l'accorgimento documentato.
6. **Intersezione review Upstash/QStash:** i fix su handler reminder/invite toccano codice già rivisto in review precedenti (idempotency QStash). Verificare di non regredire `hasReminderActivity` / consumer-side dedup.

---

## 8. Fuori scope (esplicito)

- Inbound `email.received` (Fase 3 separata).
- Esposizione UI di stato invii/reinvia-invito (solo visibilità audit qui).
- Backfill `openCount` per il caso di bordo I1 (limite noto documentato).
- Rate-limit sulla rotta **Creem** (stesso pattern di I4 ma non è Resend).
- Retention/partizionamento `email_events` (MINOR, §9).

## 9. Follow-up MINOR (non nei plans, elencati)

- `findSeedContext` `.limit(1)` senza `ORDER BY` → aggiungere `ORDER BY created_at` (parzialmente coperto dal fix I1/seed).
- `emailOpenedAt` retrocede su eventi fuori-ordine → guardia `GREATEST`/`WHERE occurredAt > emailOpenedAt` in `recordGuestOpen`.
- `upsertSuppression` `onConflictDoNothing` → `onConflictDoUpdate` per escalation bounce→complaint.
- PII: email in chiaro in audit (`targetId`) e `console.log` → mascheramento/hashing.
- `List-Unsubscribe` header su reminder/invito (deliverability Gmail/Yahoo bulk) + verifica SPF/DKIM/DMARC sul sottodominio `events.`.
- Fallback hardcoded `@ceremly.com` in `runtimeConfig.ts` (privacy/legal) → rimuovere, trattare assenza come misconfig.
- `isEmailServiceConfigured()` mai chiamato → usarlo nel guard di startup o rimuovere codice morto.
- Retention `email_events` (crescita illimitata) → policy di cancellazione/rollup oltre 90-180gg.
- **F-DOC:** `docs/base/EMAIL-ARCHITECTURE.md` §2.1 ("niente idempotency key") e §6 ("niente webhook Resend") sono disallineati dal codice → aggiornare.

---

## 10. Punti di forza confermati (non toccare)

- Verifica firma su **raw body** (`readRawBody`, mai `readBody`) con `xssValidator` disattivato per non mutare il body — trappola n.1 dei webhook, gestita bene.
- Secret mancante = **fail-closed** (svix lancia → rifiuta tutto), non bypass. Replay protection (300s) e header mancanti già coperti da svix.
- Semantica HTTP retry corretta (400 body vuoto, 401 firma, 200 dedup/foreign, 5xx bug → retry).
- `text/plain` sempre presente (stesso elemento React, `renderBoth`) — deliverability.
- Nessun XSS nei template (campi utente come children React, no `dangerouslySetInnerHTML`; pixel su URL token).
- `email_suppressions` **globale** (non org-scoped) — corretto: bounce/complaint sono proprietà oggettive dell'indirizzo.
- `firstOpenedAt` idempotente con `COALESCE`.
- Isolamento multi-ambiente via `isOwnDomain` (post-verifica firma) + difesa in profondità `hasReminderActivity` + `idempotencyKey` sul reminder.
