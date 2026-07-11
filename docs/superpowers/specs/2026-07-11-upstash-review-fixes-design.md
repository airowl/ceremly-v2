# Upstash Redis review — design dei fix

**Data**: 2026-07-11
**Branch**: `dev`
**Origine**: code review max-effort del sottosistema Upstash Redis (10 finder + verify + sweep), 14 finding verificati.
**Predecessori**: `b47c91d`, `f10b53a` (prima tornata review, 2026-06-30), `0166dab` (QStash semantics hardening, 2026-07-11).

---

## 1. Contesto e principio guida

Il sottosistema Upstash Redis di Ceremly usa un unico wrapper `cacheClient` (`server/utils/drivers.ts`) per cinque scopi con requisiti di fallimento **opposti**:

| Consumer | Requisito su errore Upstash |
|----------|-----------------------------|
| Rate-limit app (spamProtection, UploadRateLimiter) | **fail-soft OK** (fail-open deliberato — degrada a per-istanza) |
| Cache generica | **fail-soft OK** |
| Session store Better Auth (`secondaryStorage`) | **fail-loud richiesto** — le sessioni vivono SOLO in Redis |
| Kill-switch site-mode | **fail-loud richiesto** — un outage non deve mentire sullo stato |
| Marker dedup/idempotenza (jobs, webhook) | **fail-loud richiesto** — un marker perso = doppio side-effect |

Oggi `cacheClient` fa fail-soft **per tutti**: ad ogni errore Upstash ripiega in silenzio su una `Map` per-istanza e **riporta successo**. Questo è la **root cause** dei finding più gravi.

**Fatto verificato contro il source di Better Auth 1.4.5** (`node_modules/better-auth/dist/`):
- Le sessioni sono lette SEMPRE e SOLO da `secondaryStorage.get(token)` (`get-migration-Bf0TuCzm.mjs:403,505`), a prescindere da `storeSessionInDatabase` (che controlla solo la *scrittura*). → `storeSessionInDatabase:true` **non** risolve il logout di massa.
- `getSession` su `secondaryStorage.get` che **ritorna null** esegue `deleteSessionCookie` (`session-AaRl3_x-.mjs:171-179`) → cookie cancellato.
- `getSession` su `secondaryStorage.get` che **lancia** ritorna un 500 non distruttivo (`session-AaRl3_x-.mjs:220`) → nessun cookie cancellato.
- Better Auth valida le sessioni per `expiresAt` dal payload in lettura (`get-migration:236,289`) → il TTL Redis è solo cleanup, **non** l'autorità di scadenza. Una chiave senza TTL non è una sessione immortale.

**Principio**: separare i due comportamenti. Un **client strict fail-loud** per i consumer autoritativi; il fail-soft resta invariato per rate-limit/cache. I nodi "storage" e "idempotenza" sono **accoppiati**: l'idempotenza deve poggiare sullo storage affidabile, altrimenti un marker evapora proprio nell'outage che deve sopravvivere.

---

## 2. Ordine di implementazione (dipendenze)

```
Cluster 1 (storage strict) ──> Cluster 2 (idempotenza, usa strict) ──> Cluster 3 (GDPR + rate-limit)
Cluster 4 (quick-win) e Cluster 5 (cleanup) sono indipendenti — in coda o in parallelo.
```

---

## 3. Cluster 1 — Storage strict per consumer autoritativi

**Finding coperti**: #2 (mass-logout), #3 (ghost session), #7 (kill-switch mente), #8 (ban bypass /api/auth), + `delete()`/`set()` non puliscono `memoryCache`.

### 3.1 Client strict fail-loud
- Aggiungere in `server/utils/drivers.ts` un percorso **strict** che **propaga** l'errore Upstash invece di ripiegare sulla `Map`. Forma concreta (decisa in fase di plan): un secondo oggetto `strictCacheClient` con la stessa interfaccia (`get`/`set`/`delete`/`increment`), oppure un flag `{ strict: true }` per metodo. Preferenza: **oggetto separato** `strictCacheClient` — interfaccia esplicita, nessun parametro booleano che confonde i call site.
- Lo strict client **non** ha fallback in memoria: un errore Upstash → `throw`.
- Il fail-soft `cacheClient` resta **identico** (fail-open deliberato per rate-limit/cache — vedi nota memoria `ceremly-upstash-review-fixes`).

### 3.2 Consumer che passano a strict
- **Better Auth `secondaryStorage`** (`auth.ts:179`) → `strictCacheClient`. Effetto: un blip Upstash diventa un 500 transitorio non distruttivo invece di un logout di massa della flotta.
- **Kill-switch site-mode** (`siteMode.ts` — `getServerSiteMode`, `setServerSiteMode`, `clearServerSiteModeOverride`, `getSiteModeStatus`) → `strictCacheClient`. Effetto: `set`/`clear` che falliscono **lanciano** → l'endpoint admin ritorna errore invece di 200 fasullo; il `get` in lettura può distinguere "nessun override" da "Upstash giù" e **tenere il valore sicuro** (env, mai forzare "active"). Il `catch` a `siteMode.ts:50`, oggi dead code, diventa raggiungibile e corretto.
- **Marker dedup/claim** (jobs + webhook) → vedi Cluster 2.

### 3.3 Fix mirati ortogonali allo storage
- **#3 ghost session** — `banStatus.ts:38`: `if (!row) return true` (nessuna riga utente = account cancellato = revocato). Oggi ritorna `false` → sessione fantasma autenticata fino al TTL dopo una cancellazione GDPR.
- **#8 ban bypass** — il ban re-check di `getAuthSession` non gira sugli endpoint `/api/auth/*` perché `1.auth.ts:15` li esclude e il catch-all chiama `serverAuth.handler` diretto. Estendere il fresh-ban check a coprire questo path. Opzioni in plan: (a) un hook `before` di Better Auth che verifica `isUserBannedFresh` sulla sessione risolta; (b) un controllo nel catch-all `[...all].ts` prima di delegare all'handler per i path sensibili del plugin organization. Preferenza: (a) se l'API di BA lo consente in modo pulito, altrimenti (b).
- **`delete()`/`set()` memory leak** — `drivers.ts:104`: aggiungere `memoryCache.delete(key)` **incondizionato** in `delete()` (e coerentemente in `set()`) prima del return anticipato, così un valore cancellato/sovrascritto non viene resuscitato da un get error successivo sul ramo fail-soft.

### 3.4 Fail-open ban re-check: invariato
Il fail-open di `getAuthSession` (un errore del DB check → si lascia passare) resta **deliberato** (un hiccup Neon non deve fare 401 di massa — decisione registrata in `f10b53a`). Non toccato.

### 3.5 Test
- Nuovo test: `strictCacheClient.get/set/delete` **lancia** su errore Upstash (mock che rigetta), mentre `cacheClient` ripiega in memoria.
- `banStatus`: `isUserBannedFresh` ritorna `true` quando la riga non esiste.

---

## 4. Cluster 2 — Idempotenza (poggia su Cluster 1)

**Finding coperti**: #6 (dedup non atomico jobs + webhook), #10 (doppio invito).
**Principio dell'advisor**: NON una singola primitive universale — tre casi con chiavi diverse, tre fix.

### 4.1 #10 — doppio invito (content-keyed)
- **Causa**: `findGuestsForSend` (`distributionRepository.ts:19`) filtra solo `removedAt`, **non** `sentAt`; due submit concorrenti (due tab, retry HTTP) producono due job con message-id diversi → né il dedup message-id né una claim message-keyed li collassano. La guardia UI (`distribution.vue`) è solo client-side.
- **Fix**: nell'invite handler (`sendInviteEmail.handler.ts`), passare `idempotencyKey: 'invite:${event.id}:${guest.id}'` alla `sendEmail`. `idempotencyKey` è **già esposto** in `email.ts:49` e passato a Resend (`email.ts:257`); è **esattamente** il pattern applicato ai reminder in `0166dab` (`reminder:{id}:{guestId}`). Resend deduplica lato suo entro 24h. Zero nuova infrastruttura.

### 4.2 #6-webhook — email_events duplicati (durevole, DB)
- **Causa**: il marker dedup Redis get-then-set (`resend.post.ts:25`) è l'**unica** protezione; su un blip evapora e su retry Svix concorrenti entrambi passano il `get` prima del `set` → riga `email_events` duplicata + `recordGuestOpen` (openCount+1) doppio.
- **Fix (scelta utente: indice unique DB)**:
  - **Schema attuale** (`schema/emailEvents.ts`, verificato): `email_events` ha `messageId` (id del messaggio Resend) ma **nessuna colonna svix-id**. `messageId` da solo **non è unico** — uno stesso messaggio genera N eventi (sent/delivered/opened/clicked). Quindi l'indice unique NON può stare su `messageId`.
  - **Migrazione 0011**: aggiungere colonna **`providerEventId`** (text, nullable) che persiste lo `svix-id` (id univoco della *consegna* webhook) + **indice unique** su `providerEventId`. Nota nullable: le righe `type:'sent'` seed sono create dal path di invio email (non dal webhook) e non hanno uno svix-id → restano `NULL`; l'indice unique su Postgres **ammette NULL multipli**, quindi i seed non collidono tra loro e non serve backfill.
  - Il webhook (`resend.post.ts` / `handleResendEvent`) passa lo `svix-id` a `insertEmailEvent`, che lo scrive in `providerEventId`.
  - `insertEmailEvent` → `onConflictDoNothing` sull'indice unique `providerEventId`.
  - L'update del contatore aperture reso condizionale (solo se l'insert ha effettivamente creato la riga) per non gonfiare su replay.
  - Il marker Redis resta come **fast-path** (evita il round-trip DB nel caso comune), ma non è più l'unica correttezza.
- **Workflow migrazione**: `pnpm db:generate` (interattivo, serve TTY) → applicare a dev + prod. **Gotcha noto** (`ceremly-db-migrate-prod-gotcha`): `pnpm db:migrate:prod` migra DEV per dotenv `override:false` → migrare prod solo con URL inline `ep-dark-dream`. Prod è a 0010 → 0011 è la prossima.

### 4.3 #6-jobs — doppio job generico (claim-lease atomica strict)
- **Causa**: `jobs/[job].post.ts:73` usa get-then-set con chiave scritta solo dopo il successo; retry QStash sovrapposti dello stesso message-id (job lungo che supera il timeout HTTP) → entrambi leggono null → doppia esecuzione.
- **Fix**: sostituire con una **claim-lease atomica** su `strictCacheClient`:
  - `SET job:dedupe:{messageId} '1' NX EX {lease}` prima di `runJob`.
  - Se la claim **fallisce** (chiave già presente) → `return { deduped: true }`.
  - Se `runJob` **lancia** → **rilasciare** la chiave (`DEL`) → QStash ritenta legittimamente (preserva il retry-on-throw **intenzionale**, documentato in `0166dab`).
  - Se `runJob` **completa** → estendere il TTL della chiave al valore finale (`JOB_DEDUPE_TTL_SECONDS`) per assorbire retry tardivi.
  - `lease` dimensionato sulla finestra di retry QStash (~35 min).
- Nota: `@upstash/redis` supporta `set(key, val, { nx: true, ex })`. La `INCR_WINDOW_LUA` non serve qui (è per i contatori, non per il lease).

### 4.4 Test
- `sendInviteEmail`: la `sendEmail` riceve `idempotencyKey` deterministico.
- `email_events`: doppio insert con stesso svix-id → una sola riga (test su repository con onConflictDoNothing).
- jobs claim-lease: claim vince una volta; job che lancia rilascia la chiave; seconda consegna concorrente viene dedupata.

---

## 5. Cluster 3 — Export GDPR (#9) e Rate-limit atomico (#4)

### 5.1 #9 — export GDPR bloccato — ✅ GIÀ CHIUSO da 0166dab (fuori scope)
- **Correzione post-verifica**: al momento della prima stesura risultava "scritta ma non agganciata". **Riverifica contro HEAD**: `failStaleExports(userId)` **È già agganciata** in `user.service.ts:282` (dentro `requestDataExport`, esattamente prima di `hasPendingExport`) e anche a `:95`. Il grep iniziale aveva cercato solo dentro `dataExport.service.ts`, mancando i call site in `user.service.ts`.
- **Conclusione**: il finding #9 è **completamente risolto** da 0166dab (funzione + wiring + test `dataExport.service.test.ts`). **Nessun task** — rimosso dal piano. Resta qui solo per tracciabilità.

### 5.2 #4 — rate-limit Better Auth non atomico
- **Causa**: `auth.ts:188` — `rateLimit.storage: "secondary-storage"` fa get→check→set non atomico; `/sign-in/email` (3 per 10s) è aggirabile con richieste parallele.
- **Fix**: agganciare la `INCR_WINDOW_LUA` atomica (già in `drivers.ts`, via `cacheClient.increment`) al limiter di Better Auth. Due strade, decise in plan contro l'interfaccia reale di BA 1.4.5:
  - (a) **`rateLimit.customStorage`** di Better Auth che internamente usa `cacheClient.increment` — preferita se l'interfaccia BA lo consente in modo pulito.
  - (b) **Front-end nel catch-all**: `cacheClient.increment` su `/api/auth/sign-in*` in `[...all].ts` prima di delegare, con le finestre strette (10s/3), lasciando a BA solo la regola globale coarse.
- **Nota**: qui è corretto usare `cacheClient` (fail-soft), non strict — un blip Upstash sul rate-limit deve fail-open (deliberato), non bloccare i login.

### 5.3 Test
- `failStaleExports` chiamata nel path di richiesta sblocca un utente con export `processing` stantio.
- rate-limit: N richieste concorrenti a `/sign-in/email` non superano il cap (test sul conteggio atomico).

---

## 6. Cluster 4 — Quick-win di correttezza

### 6.1 #11 — `ttl=0` → chiave permanente
- `drivers.ts:83` e `:96`: `if (ttl)` tratta lo `0` legale come "mai scadere". Better Auth passa davvero `0` per sessioni con <1s di validità residua (`cookies-D72PbWdz.mjs:396`).
- **Fix**: `if (ttl != null && ttl > 0)` → SET con `ex`. `ttl === 0` → skip-write oppure `ex: 1` (mai permanente). `ttl < 0` → skip-write (non passare `ex: -N` a Upstash → errore). Applicare a **entrambi** i rami (Upstash e fallback memoria).
- **Test**: `set(key, val, 0)` non crea una chiave permanente. (Oggi `rateLimiter.test` copre solo il fallback memoria — colmare.)

### 6.2 #12 — clock-skew scarta submit legittimi
- `spamProtection.ts:104`: `isSubmittedTooFast` fa `Date.now() - loadedAt` dove `loadedAt` è un `Date.now()` **del browser** (`Contact.vue:30`) → skew client avanti → falso "troppo veloce" → `contact.service.ts:53-55` ritorna finto successo, messaggio scartato in silenzio.
- **Fix**: eliminare il falso positivo. Variante minima preferita: **clampare** — una differenza **negativa** (client avanti rispetto al server) non deve mai contare come "troppo veloce"; trattarla come tempo non determinabile → non bloccare per timing (le altre difese honeypot/disposable/rate-limit restano). Alternativa più robusta valutata in plan: timestamp **firmato lato server** (HMAC) emesso al render del form invece del `Date.now()` client. Scegliere la minima che chiude il falso positivo senza indebolire l'anti-bot.
- **Test**: `loadedAt` nel futuro (skew) → non classificato "troppo veloce".

### 6.3 #13 — audit password-reset mai loggato
- `auth.ts:272`: `AUTH_PATH_MAP` mappa `/forget-password` ma l'endpoint reale BA 1.4.x è `/request-password-reset`; inoltre `"forget-password"` a `:287` è senza slash iniziale.
- **Fix**: correggere la chiave della map in `/request-password-reset` e lo slash a `:287`. Lo stesso file usa già il nome giusto nelle `customRules` (`:197`) — allineamento.
- **Test**: verifica che l'azione audit `auth.password_reset_requested` sia mappata sull'endpoint corretto (unit sulla map, senza dipendere dal runtime BA).

### 6.4 #14 — REQUIRED_ENV incompleto
- `0.validate-env.ts:13`: mancano `NUXT_GOOGLE_CLIENT_ID`, `NUXT_GOOGLE_CLIENT_SECRET` (usati con `!` in `auth.ts:258-259`) e `NUXT_RESEND_WEBHOOK_SECRET` (usato in `emailWebhook.service.ts:38`).
- **Fix**: aggiungerli a `REQUIRED_ENV`. Effetto voluto: se sono placeholder su prod (segnalato in memoria), il boot fail-fast li fa emergere subito invece di 401/500 sparsi a runtime.
- **Attenzione operativa**: prima del merge in prod, assicurarsi che questi tre siano effettivamente valorizzati su Vercel, altrimenti il boot fallirà (che è lo scopo, ma va coordinato col deploy).

---

## 7. Cluster 5 — Efficienza e cleanup

### 7.1 `useServerAuth()` rebuild (efficienza, alto impatto)
- `auth.ts:448`: sul preset vercel ricostruisce l'intera istanza Better Auth ad ogni chiamata (2+ volte per request autenticata + 1 per ogni /api/*).
- **Fix**: memoizzazione incondizionata — `if (!_auth) _auth = createBetterAuth(); return _auth;`, eliminando il branch sul preset. Coerente con gli altri singleton (`getDB`, `upstashClient`, `_resendInstance`). Elimina anche la dipendenza dalla runtimeConfig key `preset` per questo scopo.

### 7.2 Cleanup minori (task singoli, leggeri)
- `drivers.ts:79`: rimuovere il ternary morto `JSON.stringify(value)` (`value` è già `string`).
- `runtimeConfig.ts`: rimuovere config keys morte `githubClientId`/`githubClientSecret` (`:30-31`) e `openaiApiKey` (`:53`) — zero consumer.
- `siteMode.ts`: estrarre `readOverride(): Promise<SiteMode | null>` condiviso tra `getServerSiteMode` e `getSiteModeStatus` (oggi duplicato → l'admin diagnostico può divergere dal middleware).
- `rateLimiter.ts`: `UploadRateLimiter.getCurrentCount` è dead code (zero call site) → rimuovere; valutare se il parametro `by`/`incrementBy` (sempre 1 in prod) va tenuto.
- `jobs/[job].post.ts`: `new Receiver(...)` istanzia l'SDK QStash direttamente nella route → viola "provider abstraction" (CLAUDE.md). Spostare la verifica firma dietro `server/queue/`.
- `verify-rate-limit.ts`: `config({ path })` gira dopo gli import hoisted (prod inerte, stessa classe del gotcha `db:migrate:prod`) → spostare dotenv prima dell'import di `drivers`, `override:true`; correggere il commento IT `// cleanup sempre` → inglese (convenzione per-file).

### 7.3 Cosa NON facciamo (YAGNI)
- **NON** unificare i tre rate limiter (Better Auth customRules, `isEndpointRateLimited`, `UploadRateLimiter`) in una primitive unica: chiavi/finestre/semantiche diverse — forzare un'astrazione unica non calza (confermato dall'advisor).
- **NON** creare una "primitive idempotenza universale": i tre casi di idempotenza (content-keyed invito, DB webhook, claim-lease job) sono legittimamente diversi.
- **NON** `storeSessionInDatabase:true`: non risolve il mass-logout (read path resta su Redis) e aggiunge una scrittura DB per sessione.
- **NON** toccare il fail-open del ban re-check (deliberato).

---

## 8. Finding già chiusi da 0166dab (fuori scope, per tracciabilità)
- **#9 Export GDPR bloccato**: `failStaleExports()` scritta E agganciata in `user.service.ts:282` prima di `hasPendingExport` (+ test). Chiuso. (Vedi §5.1 per la correzione post-verifica.)
- **Reminder race**: `markReminderSent` ora immediatamente dopo enqueue (`reminder.service.ts:160`) + `idempotencyKey Resend reminder:{id}:{guestId}` in `email.ts`. Chiuso.
- **Reminder all-fail**: se tutti i dispatch falliscono (outage QStash durante cron), il reminder resta non-sent per il retry al giro successivo; fallimento parziale marca comunque sent (no re-send di massa). Chiuso.

## 9. Finding scartati come noti/trade-off (per tracciabilità)
- **Chiave orfana senza TTL** (`drivers.ts:36-37`): documentata come trade-off accettato ("simply never gets re-armed; the atomic eval cannot create new ones"). Non un bug.
- **Sign-in 18/min sustained** (3/10s vs vecchio 10/min): tuning trade-off, non bug. Il valore attuale è più stretto sul burst (era lo scopo del fix precedente).

---

## 10. Riepilogo mapping finding → fix

| # | Finding | Cluster | Fix |
|---|---------|---------|-----|
| 2 | Mass-logout su outage | 1 | strictCacheClient su secondaryStorage |
| 3 | Ghost session post-cancellazione | 1 | `banStatus !row → true` |
| 7 | Kill-switch mente | 1 | strictCacheClient su siteMode |
| 8 | Ban bypass /api/auth | 1 | fresh-ban check esteso agli endpoint auth |
| — | delete/set memory leak | 1 | `memoryCache.delete` incondizionato |
| 6-invito | (via #10) | 2 | idempotencyKey invito |
| 6-webhook | email_events duplicati | 2 | col `providerEventId` + indice unique 0011 + onConflictDoNothing |
| 6-jobs | doppio job | 2 | claim-lease SET NX strict, release-on-throw |
| 10 | Doppio invito | 2 | `idempotencyKey invite:{eventId}:{guestId}` |
| ~~9~~ | ~~Export GDPR bloccato~~ | — | ✅ già chiuso da 0166dab (`failStaleExports` wire in `user.service.ts:282`) |
| 4 | Rate-limit BA non atomico | 3 | `cacheClient.increment` agganciato a BA |
| 11 | `ttl=0` chiave permanente | 4 | `ttl > 0` guard su entrambi i rami |
| 12 | Clock-skew scarta submit | 4 | clamp differenza negativa / timestamp firmato |
| 13 | Audit password-reset assente | 4 | endpoint `/request-password-reset` |
| 14 | REQUIRED_ENV incompleto | 4 | +Google OAuth +Resend webhook secret |
| — | useServerAuth rebuild | 5 | memoizzazione incondizionata |
| — | cleanup vari | 5 | ternary/config/readOverride/Receiver/dotenv |

---

## 11. Verifica finale (prima del merge)
- `pnpm typecheck` verde.
- Suite Vitest verde (inclusi i nuovi test: strict path, ttl=0, claim-lease, idempotencyKey invito, banStatus !row, failStaleExports wiring, rate-limit atomico, clock-skew).
- Migrazione 0011 applicata a dev **e** prod (URL inline `ep-dark-dream` per prod — gotcha noto).
- Tre env var (`NUXT_GOOGLE_CLIENT_ID/SECRET`, `NUXT_RESEND_WEBHOOK_SECRET`) valorizzate su Vercel prima del deploy prod (altrimenti boot fail-fast).
- Push manuale (mai automatico — convenzione progetto).
