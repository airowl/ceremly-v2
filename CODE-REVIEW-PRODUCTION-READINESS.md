# Code Review Produzione — Ceremly

> Review multi-agente (53 agent, verifica adversariale di ogni finding) — 2026-06-17
> 41 finding confermati, 3 refutati. **0 bloccanti · 22 should-fix · 13 nice-to-have**

La codebase è solida sulle dimensioni più critiche per un SaaS multi-tenant: l'isolamento tra tenant è stato verificato end-to-end ed è **pulito** su tutte le rotte autenticate (ogni query filtra per `organizationId` letto dalla sessione, mai dal payload del client), la verifica HMAC dei job QStash è corretta, le rotte cron falliscono in modo chiuso, e il modello di capability a token per gli inviti pubblici non consente write cross-tenant. **Non esiste alcun difetto di classe BLOCCANTE** (nessun data leak cross-tenant, nessun auth bypass, nessuna esposizione di segreti, nessuna perdita dati, nessun crash sul percorso comune). Tuttavia il prodotto **NON è pronto per la produzione così com'è**: ci sono 22 problemi should-fix che insieme compromettono affidabilità e fiducia sui flussi monetizzati e di comunicazione. Il singolo motivo più importante: **il check dei limiti di piano risolve il piano dall'utente richiedente invece che dall'organizzazione, quindi i teammate di un'organizzazione B2B pagante vengono bloccati con un 402 "passa a Celebrazione"** — il percorso monetizzato core è rotto per le organizzazioni multi-membro (day-one, non latente).

## Verdetto

| | |
|---|---|
| **Stato** | 🟠 **NON PRONTO** (nessun bloccante assoluto, ma 22 should-fix prima di un lancio serio) |
| **BLOCCANTI** | **0** |
| **should-fix** | **22** |
| **nice-to-have** | **13** |
| **Test automatici** | **0** (vedi Copertura) |

Verdetto operativo: nessun difetto di sicurezza che imponga lo stop, ma diversi bug di correttezza su monetizzazione, distribuzione email e GDPR che vanno chiusi prima di onboardare clienti paganti e inviare inviti reali.

## 🏗️ Build health (ground-truth, exit code reali)

| Check | Comando | Esito |
|-------|---------|-------|
| Type checking | `pnpm typecheck` | ✅ **verde** (exit 0, zero errori TS) |
| Production build | `pnpm build` | ✅ **verde** (nitro completato, output 59.7 MB / 19 MB gzip; sharp incluso per la target arch) |
| Lint | `pnpm lint` | ❌ **rosso** (exit 1) — **82 errori, 15 warning su 47 file** |

I 82 errori lint sono **stilistici, non runtime**: `@typescript-eslint/no-explicit-any` (62×), `no-unused-vars` (14×), `vue/require-default-prop` (14×), `ban-ts-comment` (5×). Non bloccano il funzionamento, ma se la CI fa girare `pnpm lint` il pipeline è rosso → vanno ripuliti prima di un gate CI serio (concentrati in `organizationStore.ts`, `feedbackStore.ts`, pagine `[id].vue`/`[slug].vue`, componenti `CerSite*`).

## 🔴 BLOCCANTI

**Nessuno.** La review adversariale non ha confermato alcun difetto di classe BLOCKS. In particolare, l'isolamento tra tenant, la verifica firma QStash, l'autenticazione cron e la prevenzione della write-injection sul percorso RSVP pubblico sono stati verificati e risultano corretti. Diversi candidati BLOCKS iniziali (limiti di piano, idempotenza email, re-send reminder) sono stati declassati a should-fix perché si attivano solo in condizioni di fallimento/concorrenza o in over-restrizione fail-closed, non come leak/bypass/crash sul percorso comune.

## 🟡 Da sistemare (should-fix)

### Monetizzazione e limiti di piano

1. **Il piano è risolto dall'USER, ma le risorse sono ORG-scoped → org B2B paganti finiscono sui limiti Free**
   `server/services/event.service.ts:61-68`
   `isFreePlan(event)` legge `event.context.user?.id` e interroga `creem_subscription` per quel singolo utente. Un teammate (admin/member) di un'org pagante non ha una subscription personale → trattato come Free → bloccato a 1 evento attivo / 30 ospiti con 402 "passa a Celebrazione" pur pagando l'org. Flusso multi-membro live e raggiungibile (`auth.ts:319` + `invite/[id].vue:91` accept invitation).
   **Fix**: risolvere il piano dall'owner dell'organizzazione (pattern già esistente in `canAddTeamMember` → `getEffectiveLimits(ownerId)`). Centralizzare in un helper `isOrgFreePlan(organizationId)` usato da create event/guest/import. *(Nota out-of-scope segnalata dal verificatore: esiste anche il sibling fail-OPEN — un utente pagante è trattato come pagante su OGNI org cui appartiene; lo stesso fix risolve entrambi.)*

2. **TOCTOU sui limiti di piano in createEvent/createGuest/importGuests**
   `server/services/event.service.ts:219-261`; `server/services/guest.service.ts:143-172,266-308`
   Check-then-insert senza transazione né constraint DB: due richieste concorrenti possono entrambe leggere il count sotto soglia e inserire, bypassando i limiti Free. Org-scoping presente e corretto (non è un leak), impatto limitato a limit-bypass.
   **Fix**: accettare come rischio basso e documentarlo, o enforcing a livello DB (indice parziale per "un evento attivo per org" / count atomico).

### Distribuzione email e reminder

3. **Gli handler email non hanno idempotency key → QStash at-least-once invia inviti/reminder duplicati**
   `server/queue/handlers/sendInviteEmail.handler.ts:23-57`; `server/queue/handlers/sendReminderEmail.handler.ts:24-67`
   Nessun guard a livello di messaggio: se `sendEmail` riesce ma la function va in timeout/cold-start prima del 200 a QStash, il retry (`retries:3`) reinvia lo stesso messaggio → email duplicata al guest reale. `contentBasedDeduplication` dedup solo i PUBLISH identici nella finestra di publish, non i retry.
   **Fix**: guard prima del send (controllo activity `invite_sent`/`reminder_sent` esistente, o `Upstash-Deduplication-Id` deterministico su guestId+reminderId).

4. **processDueReminders: un singolo dispatch fallito aborta l'intero run cron → re-send di massa il giorno dopo**
   `server/services/reminder.service.ts:135-142`
   `dispatch(...)` è dentro il loop per-guest senza try/catch; `markReminderSent` gira solo DOPO il loop completo. Se un dispatch lancia, la funzione esce prima del mark, il reminder resta `sentAt IS NULL` e il cron successivo re-dispatcha a tutti i non-rispondenti — l'handler non ha guard di idempotenza, quindi sono email duplicate reali. Il commento del codice promette "markReminderSent SUBITO dopo l'enqueue (idempotenza)" ma il codice non lo onora.
   **Fix**: try/catch per-dispatch (come fa `sendInvites`) e/o mark dentro il loop, indipendente dal fallimento del dispatch.

5. **sendInvites marca i guest come "Inviato" + scrive `invite_sent` PRIMA del dispatch; i fallimenti sono silenziati**
   `server/services/distribution.service.ts:143-163`
   `markSent` (COALESCE, persistente) e `insertActivities` girano incondizionatamente per tutti i guest con email, prima del loop di dispatch. Il loop swallowa i fallimenti (`console.error`) e incrementa `queued` solo on success. La dashboard mostra "Inviato" (`g.sentAt === null` in `distribution.vue:117,126`) per guest che non riceveranno mai email, senza retry → under-delivery silenziosa presentata come successo.
   **Fix**: dispatchare prima e marcare sent solo per gli enqueue riusciti, o raccogliere i `failedToQueue` e non marcarli.

6. **Dispatch seriale per-guest dentro una singola invocation serverless → rischio timeout su liste grandi**
   `server/services/distribution.service.ts:156-163`; `server/services/reminder.service.ts:130-144`
   `await dispatch(...)` in loop serializza N round-trip HTTP QStash in una function. Il percorso comune è limitato (Free: 30 guest/evento), ma le org paganti via import bulk arrivano a centinaia → alta latenza e rischio di hit del timeout Vercel (nessun `maxDuration` configurato), invio parziale.
   **Fix**: batch via `qstash batchJSON` o `Promise.all` su chunk con concorrenza limitata; mantenere l'isolamento per-item.

### Sicurezza e abuso superficie pubblica

7. **Token guest pubblico a 60 bit + percorso RSVP pubblico senza rate limiting**
   `server/utils/guestToken.ts:36-38`; `server/api/public/invite/[token]/rsvp.post.ts:11-26`; `server/middleware/` (nessun `3.rate-limit.ts`)
   Token = 10 char base62 (~59.5 bit) è l'unica capability; il GET e il POST RSVP pubblici sono non autenticati e senza throttle. No write-injection (gli ID derivano dal lookup del token), ma il rischio reale è brute-force/enumeration dei token validi cross-tenant (leak nomi guest + inviti, RSVP forgiati). Non deterministico → non bloccante, ma manca la mitigazione principale.
   **Fix**: rate limiting per-IP su `/api/public/invite/*` e/o token a ~16-22 char (≥96 bit).

8. **Form contatti senza honeypot/timing/disposable-email; il limite per-email è banalmente aggirabile**
   `server/services/contact.service.ts:42-61`; `shared/schemas/contact.ts:4-10`
   Endpoint non autenticato che invia email a ogni chiamata, senza rate-limit IP, senza bot trap. L'unico throttle (`MAX_MESSAGES_PER_DAY=3` su `email`) si aggira variando l'email → email-bombing della inbox admin (`contact.service.ts:116-124`) e burn di quota/reputazione Resend illimitati. Gli util `spamProtection` esistono ma sono cablati solo in `waitingList.service.ts`.
   **Fix**: aggiungere `website` (honeypot) e `_t` (loadedAt) a `contactSchema` e cablare `isHoneypotTriggered`/`isSubmittedTooFast`/`isEndpointRateLimited(clientIP,'contact')`/`isDisposableEmail`; chiavare il limite anche su IP.

9. **Rate limiter anti-spam è una Map in-process → inefficace su Vercel serverless**
   `server/utils/spamProtection.ts:68-109`; `nuxt.config.ts:333-336`
   `isEndpointRateLimited` usa una Map module-level; su preset `vercel` non è condivisa tra istanze cold/concorrenti. Il `rateLimiter` di nuxt-security (100/min) non ha storage driver configurato → stesso fallback in-memory. Il `3.rate-limit.ts` Upstash dichiarato in CLAUDE.md **non esiste**. Il RSVP pubblico non chiama nemmeno `isEndpointRateLimited`.
   **Fix**: backare il rate limiter con `@upstash/ratelimit`/Upstash Redis condiviso, o ripristinare il middleware `3.rate-limit.ts`.

10. **Rate limiting per-istanza (in-memory), non condiviso → protezione brute-force/scraping debole su Vercel**
    `nuxt.config.ts:333-336,363-411`; `server/utils/auth.ts:47-313`
    Ogni istanza cold tiene il proprio counter (reset al cold start, non condiviso). `/api/auth/**` (sign-in/password-reset) NON è esentato ma è soggetto solo a questo limiter in-memory; Better Auth non ha key `rateLimit` (usa il default in-memory); `secondaryStorage` Upstash è usato solo per sessioni, non per i counter. Limite effettivo ben sopra i 100/min dichiarati.
    **Fix**: cablare il `rateLimiter` di nuxt-security a un driver unstorage Redis/Upstash e configurare `rateLimit` di Better Auth con storage Redis custom.

### Auth / RBAC

11. **Il ban admin scrive `banned=true` direttamente in DB e non revoca la sessione del target → utente bannato resta autenticato**
    `server/api/admin/users/[id].patch.ts:42-67`
    La rotta admin fa una write Drizzle raw e non revoca/cancella le sessioni. Nessun hook ri-valuta il flag `banned` DOPO la creazione della sessione (l'admin plugin lo enforce solo in `session.create.before`, cioè al sign-in). Un utente abusivo già loggato resta pienamente autenticato fino alla scadenza naturale della sessione — esattamente la popolazione che l'admin deve tagliare subito. Gated da `requireAdminApiKey`, quindi non un bypass → should-fix.
    **Fix**: usare `auth.api.banUser({ body: { userId } })` o seguire la write con `auth.api.revokeUserSessions({ body: { userId } })` (NON la variante self `revokeSessions({headers})`).

12. **trustedOrigin Cloudflare tunnel hardcoded + localhost nella config auth di produzione**
    `server/utils/auth.ts:38`
    `trustedOrigins: ["http://localhost:8787", baseURL, "https://scholarships-adoption-cadillac-expanded.trycloudflare.com"]`, senza branching su env → presenti anche in prod. `trustedOrigins` gate i check CSRF/origin e i target di redirect/callback. Un subdomain `trycloudflare.com` è effimero e riassegnabile: se rivendicato da un attaccante diventa origine permanentemente trusted (superficie CSRF/open-redirect latente).
    **Fix**: derivare `trustedOrigins` da env (solo `baseURL` in prod; localhost/tunnel solo dietro `import.meta.dev`).

### Webhook / billing

13. **Il webhook Creem viene bloccato con 503 in maintenance/waitinglist mode → eventi di pagamento persi**
    `server/middleware/0.site-mode.ts:34-49` (lista esenzioni) + `66-69`/`79-83` (throw 503); path webhook in `server/api/auth/[...all].ts:8`
    `0.site-mode.ts` esenta solo `/api/jobs`, `/api/cron`, `/api/public/`, `/api/admin/`, `/_*` — **non** `/api/auth/**`. Il webhook Creem è a `/api/auth/creem/webhook`. In maintenance/waitinglist il middleware throwa 503 prima del handler; con `persistSubscriptions:true` il webhook è la source-of-truth della tabella `creem_subscription` → un evento perso lascia lo stato disallineato (pagante mostrato come non-pagante, o accesso non revocato). Il catch-all auth esenta il webhook dal proprio gate, ma il middleware precedente vince.
    **Fix**: esentare il path webhook all'inizio di `0.site-mode.ts`: `if (path.startsWith('/api/auth/creem/webhook')) return;`.

### Validazione / file upload

14. **Allowlist MIME e size limit applicativi sono config morta — ogni check viene saltato**
    `server/utils/runtimeConfig.ts:58-70`; `server/api/file/upload.post.ts:57,65`; `server/api/file/presign.post.ts:18,26`
    `fileManager` non assegna mai `maxFileSize` né `allowedMimeTypes`, quindi le guard `if (config.maxFileSize && ...)` / `if (config.allowedMimeTypes && ...)` sono sempre falsy: un utente autenticato può caricare content-type arbitrari. `validateMagicBytes` ritorna true per ogni MIME senza regola (text/html, octet-stream passano). Cap reale residuo: solo i 5MB di nuxt-security (`nuxt.config.ts:329`) e i magic-byte per i pochi tipi noti — entrambi incidentali. R2 serve da origin `r2.dev` separato (XSS off-app), ma resta hosting di contenuto malevolo.
    **Fix**: popolare `runtimeConfig.fileManager` con `maxFileSize` (es. 5_000_000) e `allowedMimeTypes` espliciti; rimuovere `image/svg+xml` o sanitizzarlo.

15. **Stored XSS via `mapsUrl` non validato renderizzato in `:href` sulla pagina invito pubblica non autenticata**
    `shared/schemas/ceremly.ts:59`; `app/components/ceremly/InviteRenderer.vue:154,351`; `app/pages/e/[slug]/[token].vue:25-27,572`
    `mapsUrl: z.string().max(1000)` — solo cap di lunghezza, nessuna validazione schema. `mapsHref()` ritorna il valore verbatim in `:href` (Vue non sanitizza i binding di attributo). Un organizer malevolo/compromesso (o sub-account agency) può piantare un link `javascript:` che esegue nel browser del guest al click. La CSP corrente (`script-src` con `unsafe-inline`, nessun nonce) **non lo blocca**. Click-gated → should-fix.
    **Fix**: `z.string().url()` + allowlist scheme http(s) su `mapsUrl`; difensivamente `mapsHref()` rifiuta scheme non-http(s).

### Config / secrets

16. **CSP permette `'unsafe-inline'` in script-src**
    `nuxt.config.ts:271-277`
    Vanifica la protezione core della CSP contro `<script>` inline iniettati, su superfici SSR pubbliche (`/e/**`) che renderizzano contenuto guest. Nessun sink di first-order XSS oggi (zero `v-html`/`innerHTML`, tutto via interpolazione auto-escaped), ma la CSP è proprio il backstop di defense-in-depth.
    **Fix**: rimuovere `unsafe-inline` e adottare CSP nonce-based (supportata da nuxt-security; mantenere `wasm-unsafe-eval` per sharp-wasm).

17. **Nessuna validazione env a boot-time — i secret mancanti falliscono silenziosamente per-richiesta, non al boot**
    `server/utils/runtimeConfig.ts:15-91`
    `generateRuntimeConfig()` mappa ogni secret da `process.env` senza presence check (R2 con `!` che a runtime danno `undefined`). Un deploy con secret mancante parte verde e rompe alla prima richiesta che lo usa (`neon(undefined)` throwa al primo query, `betterAuthSecret: undefined` rompe il signing sessione) → 500 opachi sparsi invece di un errore chiaro al boot.
    **Fix**: schema zod validato una volta allo startup (Nitro plugin o cima di `generateRuntimeConfig`) che throwa elencando le chiavi mancanti.

18. **cleanup-files cron rifiuta l'invocazione Vercel se `CRON_SECRET` non prefissato non è settato (incoerente con send-reminders)**
    `server/api/cron/cleanup-files.get.ts:20-23`
    `cleanup-files` accetta UN solo path auth (`Bearer ${cronSecret}`); `send-reminders` ne accetta TRE (header `x-vercel-cron`, Bearer, admin key). Se il deployer setta solo `NUXT_CRON_SECRET`, `cleanup-files` ritorna 401 a ogni run schedulato e non è ri-triggerabile → upload pending orfani su R2 si accumulano (cost/storage leak silenzioso). `.env.example:107` istruisce di settare entrambi, quindi il bug scatta solo ignorando le istruzioni.
    **Fix**: replicare il fallback di send-reminders (accettare `x-vercel-cron` e/o admin key).

### Data layer / GDPR

19. **File orfani alla cancellazione org (`ON DELETE set null`) e nessun link agli eventi → leak storage R2 + righe DB**
    `server/database/schema/file.ts:21`
    `file` è l'unica tabella org-scoped che non fa cascade. Alla cancellazione org le righe file restano con `organization_id=NULL` (invisibili a ogni query org-scoped) e gli oggetti R2 non vengono mai puliti. `deleteOrganization` non enumera file né cancella R2; `cleanupOrphanFiles` filtra solo su `uploadStatus='pending'`, quindi non li prende mai. Storage leak + retention GDPR.
    **Fix**: FK `onDelete:'cascade'` (o purge R2 esplicito in `deleteOrganization`) + job di cleanup per le righe orfane.

20. **Cancellazione account è solo soft-delete (flag ban) — nessun cascade, erasure GDPR incompleta**
    `server/services/user.service.ts:204-211`
    `deleteAccount()` fa solo `set({ banned: true })` + revoke sessione; nessuna riga viene cancellata. Il macchinario di cascade nello schema esiste ma è dead code su questo percorso: PII (nome, email, telefono, bio + PII guest caricate) persiste indefinitamente dopo la "cancellazione". Right-to-erasure non soddisfatto.
    **Fix**: hard-delete reale dietro grace window (gestendo il caso org-owner con altri membri + purge R2), o documentare ban=anonimizzazione + job di purge schedulato.

21. **Export GDPR omette tutti gli eventi/guest/RSVP (stub) ed è materialmente incompleto**
    `server/services/dataExport.service.ts:121-123,176`
    `const allEvents: ExportEvent[] = []` ("STUB phase 1a"): l'array `events` è sempre vuoto, nessuna raccolta guest/RSVP. Per un prodotto eventi/guest/RSVP l'export GDPR è non conforme alla portabilità dati e l'utente riceve un file ingannevolmente vuoto. Inoltre il payload viene base64-encodato e salvato inline come `data:` URL in una colonna `text` unbounded (`dataExport.ts:24`) → bloat righe DB invece di R2.
    **Fix**: ripuntare l'export sullo schema corrente (join `events`/`guests`/`rsvpResponses`/`guestActivities` org-scoped); salvare il blob su R2 con URL/token firmato; spostare le query in un repository.
    *(⚠️ Probabile rinvio intenzionale: il codice è marcato «STUB phase 1a» e c'è una decisione di scoping Phase 2/3 a PRD. Confermare contro il PRD — se è un rinvio deciso resta un gap di produzione GDPR da chiudere prima dei paganti, ma non è un bug accidentale.)*

22. **Nessun guard di unicità su email guest per evento — guest/inviti duplicati possibili**
    `server/database/schema/guests.ts:42-46`; `server/services/guest.service.ts:283-308,136-184`
    Nessun unique su `(event_id, email)`; `importGuests` deduplica solo su nome (warning ma inserisce comunque), `createGuest` non deduplica affatto, il bulk insert gestisce solo il 23505 del token. Re-import CSV o doppio add silenziosamente crea righe duplicate → inviti/reminder duplicati allo stesso ospite e count gonfiato sui limiti di piano.
    **Fix**: indice unique parziale `ON guests (event_id, lower(email)) WHERE email IS NOT NULL AND removed_at IS NULL` + gestione 23505; o confermare che i duplicati sono intenzionali.

> Nota: 22 voci should-fix, tutte adversarialmente confermate con file:line distinti. Alcune condividono la stessa root cause e si chiudono insieme: **#7, #9, #10** ricadono tutte su «manca rate limiting durevole backed-Upstash» (emerse da dimensioni di review diverse — superficie pubblica e auth/RBAC — e citano code-path distinti); **#19, #20, #21** sono il cluster GDPR/data-retention. Chiudendo per root cause il lavoro effettivo è ~18 interventi. Vedi il blocco Go/No-Go per l'ordine consigliato.

## 🟢 Nice-to-have

- **GET `/api/organizations/:id` si affida al check membership del plugin invece di un `getOrgRole` esplicito** — `server/api/organizations/[id].get.ts:14-15`. Nessun leak oggi (Better Auth `checkMembership` blocca i non-membri), ma incoerente con la rotta members. Aggiungere un `getOrgRole` esplicito per defense-in-depth.
- **`secureCompare` rivela la lunghezza dell'operando via early return** — `server/utils/requireAdminApiKey.ts:42-44`. Side-channel timing marginale (la chiave è ad alta entropia). Usare `crypto.timingSafeEqual` su hash di lunghezza fissa.
- **Download data-export è token-bearer-only e salta l'expiry quando `expiresAt` è null** — `download/[token].get.ts:24` + `dataExport.ts:26`. Fail-open latente: oggi `processExport` setta sempre `expiresAt`, ma un futuro percorso senza set darebbe download pubblico permanente di un dump GDPR. Rendere fail-closed (null = scaduto, o NOT NULL).
- **`updateEventSchema.blocks` e `rsvpConfig` senza `.max()`** — `shared/schemas/ceremly.ts:171-172`. Unbounded (solo cap body 1MB), incoerente con gli altri array del file. Aggiungere `.max(30)`.
- **Rotte admin list usano `getQuery` + cast invece di `parseQueryParams`** — `server/api/admin/users/index.get.ts:33-45`. Dietro `requireAdminApiKey`, nessuna injection (tutti i valori sono bound), ma bypassa il layer di validazione standard. Definire uno schema Zod.
- **Cron `findDueReminders` senza indice su `(enabled, sent_at)` e join su `status/rsvp_deadline` non indicizzati** — `server/repositories/reminderRepository.ts:145-167`. Seq scan cross-org sull'hot path cron giornaliero; trascurabile a volume MVP, reale a scala. Indice parziale `ON event_reminders (sent_at) WHERE enabled AND sent_at IS NULL`.
- **Sentry assente nonostante sia componente di stack documentato** — `nuxt.config.ts:22-33`. Nessun error tracking in prod (errori server, job QStash falliti, cron crashati invisibili). Aggiungere `@sentry/nuxt` con DSN server-only e scrubbing PII, oppure rimuovere la riga da CLAUDE.md.
- **`console.log` della base URL al boot** — `server/utils/auth.ts:22`. Non sensibile (baseURL è pubblico) ma rumore su ogni cold start. Rimuovere o gateare su dev.
- **CORS in conflitto su `/api/**` (Nitro `cors:true` vs `corsHandler` nuxt-security)** — `nuxt.config.ts:82-84` e `344-352`. Policy CORS emessa ambigua; non sfruttabile per session theft (nessun `allow-credentials`). Scegliere una sola autorità CORS.
- **Open redirect via `?redirect` non validato al login (`reloadNuxtApp`)** — `app/pages/login.vue:79`. `reloadNuxtApp({ path: route.query.redirect })` fa una navigazione hard: `/login?redirect=//evil.com` manda l'utente appena autenticato su un sito attaccante (phishing post-auth). Richiede auth reale prima → nice-to-have. Validare same-origin relativo (`^/(?!/)`). *(I sink `callbackURL` sono mitigati server-side da Better Auth `trustedOrigins`.)*
- **Middleware `plan-required` morto/errato (modello piano sbagliato, `/upgrade` inesistente, no localePath)** — `app/middleware/plan-required.ts:52-64`. Dead code non referenziato che misrappresenta il modello piano. Eliminare o riscrivere contro `pricing.ts`.
- **Nav dashboard e vari link auth usano path hardcoded non localizzati** — `app/pages/dashboard.vue` (vari), `invite/[id].vue:94,148`, `login.vue:104,138`. Con `prefix_except_default` un utente EN perde il prefisso `/en`. Avvolgere con `useLocalePath()`; sistemare il link forgot-password che punta a `/`.
- **Stringa inglese hardcoded sulla schermata callback OAuth** — `app/pages/auth/callback.vue:29` (`Verifying login...`). Localizzare con `$t()`.

## ✅ Cosa è solido

La review (lettura diretta dei file, non per nome) ha **confermato corretto** il nucleo critico:

- **Isolamento tenant — PULITO su tutte le rotte autenticate.** Ogni rotta event/guest/reminder/distribution/project chiama `requireAuth` + `requireMember/requireWrite`; l'`organizationId` è SEMPRE letto da `event.context.organization.id` (da `session.activeOrganizationId`), mai da body/query/header (grep su `body/query.organizationId` vuoto). Tutti i repository filtrano per `organizationId` (ed `eventId` dove rilevante) in ogni WHERE; i servizi applicano `assertOwnership` come secondo guard. Le risorse figlie passano per `requireEventScoped`.
- **RSVP pubblico (token-as-capability) — niente write-injection.** `upsertResponse` deriva `organizationId/eventId/guestId` dal lookup del token, mai dal payload. Il GET costruisce la risposta campo-per-campo (no spread, no cross-guest leak). Il 404 è generico/indistinguibile (no oracle di enumeration). Lookup esatto `eq(guests.token, token)`, parametrizzato.
- **QStash job consumer — HMAC corretto.** `server/api/jobs/[job].post.ts` fail-closed 401 se manca la firma, verifica `receiver.verify` sul raw body PRIMA del `JSON.parse`, allowlist dei job, URL pinnato nella firma (no replay cross-endpoint). `xssValidator` disabilitato su `/api/jobs/**` proprio per non mutare il body.
- **Cron — fail-closed.** `send-reminders` e `cleanup-files` verificano `CRON_SECRET`/`x-vercel-cron`/admin key correttamente; nessun percorso raggiunge l'elaborazione senza auth.
- **Admin gate reale e centralizzato.** Tutte le 15 rotte admin chiamano `requireAdminApiKey` (grep loop, zero miss) + enforce path-wide in `1.auth.ts`; constant-time compare (eccetto leak di lunghezza, nice-to-have).
- **Auth config sana.** Email verification richiesta, 2FA abilitato, sessioni in Upstash Redis secondaryStorage, signup→org + self-heal sessione presenti. `getFullOrganization` enforce `checkMembership` (verificato nei sorgenti node_modules).
- **No SQL injection.** Sweep su repository/servizi: ogni `sql` template interpola Drizzle column object (parametrizzato), nessun `sql.raw`, nessuna concatenazione. Body sempre via `parseBody(event, schema)` su rotte non-admin.
- **Secrets puliti.** Nessun secret nel blocco `NUXT_PUBLIC_` (solo baseURL, appName, Creem PRODUCT IDs che sono identificatori pubblici); nessun `process.env` in routes/services; nessun secret hardcoded; `.env` non tracciato; nessun leak di stack-trace nei 500.
- **Integrità schema/migrazioni.** `drizzle-kit check` passa, zero drift schema-vs-migrazione. Ogni tabella tenant ha `organizationId NOT NULL` + indice + cascade verso organization; `guests.token` UNIQUE; `events.slug` UNIQUE; `rsvp_responses.guest_id` UNIQUE; UUID v7.
- **Frontend.** Gotcha `'@'` i18n correttamente escapato in entrambi i locale; parità chiavi locale (2407=2407, zero mancanti); no SSR state leakage; guard double-submit RSVP; nessun `v-html`.
- **Build verde.** `pnpm typecheck` e `pnpm build` passano puliti (vedi Build health).
- **3 finding refutati** dalla verifica adversariale: pixel di tracking email injection/SSRF-safe (sempre 200); header di sicurezza duplicati che nuxt-security riconcilia deterministicamente (HSTS prende il valore più forte, decoy X-Powered-By rimosso da hidePoweredBy); `signup.vue` callbackURL mitigato server-side da Better Auth `originCheckMiddleware`/`trustedOrigins`.

## Copertura & limiti della review

**Letto in pieno o in parte rilevante**: tutte le rotte/servizi/repository di event, guest, reminder, distribution, RSVP pubblico, project; le rotte unauth (jobs, cron, public invite/rsvp/pixel, contact, waiting-list, data-export download); `auth.ts`, `permissions.ts`, tutti i middleware presenti, `requireAdminApiKey.ts`, `guestToken.ts`, `spamProtection.ts`; tutte le rotte admin; `nuxt.config.ts` (route rules, CSP, HSTS, nuxt-security, cron); `runtimeConfig.ts`, `.env.example`; tutti gli schema DB + 5 migrazioni (`drizzle-kit check` passato, zero drift); composables/store/pagine frontend chiave. Verifica firma plugin Better Auth confermata nei sorgenti `node_modules`. Build/typecheck/lint eseguiti con exit code reali.

**NON coperto (esplicito, nessun cap silenzioso)**:
- Nessuna esecuzione a runtime: comportamento serverless del rate-limiter in-memory e timeout reali su liste grandi valutati per config/codice, non testati live.
- Verifica HMAC del webhook Creem delegata a `@creem_io/better-auth`: valutata via wiring config + esenzioni route-rule, **non** letta dall'implementazione `node_modules`.
- Internals del pipeline `imageProcessor`/sharp, injection nei template email React (auto-escape assunto), e `rsvpLogic.ts` non approfonditi.
- Semantica day-boundary timezone per utenti IT (cron 07:00 UTC vs `now()` SQL): internamente consistente ma non validata a fondo; le colonne usano `timestamp` senza timezone (uniforme, non flaggato).
- Nessun EXPLAIN/index bloat su DB reale (no credenziali).

**Test automatici: 0.** Non esiste alcuna suite di test nel repository. Per un SaaS multi-tenant che gestisce PII di ospiti, billing e distribuzione email, questo è di per sé un **gap di produzione**: tutti i bug di correttezza sopra (limiti di piano org-vs-user, idempotenza email, re-send reminder, mark-sent ottimistico) sono esattamente la classe di regressioni che una suite di test catturerebbe, e oggi nulla protegge da regressioni su tenant-isolation o sui flussi monetizzati.

## Go / No-Go

**NO-GO** per un lancio con clienti paganti finché non sono chiusi almeno i should-fix su limiti di piano (#1), idempotenza/re-send email (#3, #4, #5), webhook Creem in maintenance (#13), erasure/export GDPR (#20, #21) e rate-limiting durevole (#9, #10) — nessun bloccante di sicurezza, ma troppi difetti di correttezza sui flussi core per considerarlo production-ready.
