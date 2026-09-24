# Task 14 — frontend da `$fetch` a Convex

**Stato: parziale, e in modo dichiarato.** Tre vertical slice su cinque sono
completi (progetti, eventi + statistiche, ospiti/RSVP/invito pubblico — quest'ultimo
chiuso il 2026-09-24, §4bis), il gate anti-CRUD esiste e sta in piedi.
Organizzazione/billing e profilo/export/form pubblici **non sono iniziati**. La
sezione 4 dice esattamente cosa resta e da cosa dipende.

Verifiche di chiusura (2026-09-22, albero locale):

| Comando | Esito |
|---|---|
| `vitest run convex/` | 244 passed |
| `pnpm test:migration` | 374 passed / 27 skipped |
| `pnpm typecheck` | 5 errori, **tutti** preesistenti (`login.vue`, `signup.vue`, `site-mode-middleware.test.ts`) — baseline, nessuno nei file toccati |
| `eslint` sui file toccati | pulito (e la pagina progetti passa da 3 errori a 1: due `catch (err: any)` sono spariti) |
| `pnpm build` | ok (client + Worker) |

Commit: `e6bfe5d` progetti + install del client, `e936cc5` eventi, `c23d033` il
gate, `2fa0258` statistiche vive.

Seconda metà dello Step 3 (2026-09-24, albero locale): `vitest run convex/` **261
passed** (+17, `convex/distribution.test.ts`; 19 dopo il fix round 1), `pnpm test:migration` **399 passed /
27 skipped**, gate `frontend-data-layer.test.ts` 16 casi, `pnpm typecheck` identico
alla baseline (stesso numero di righe `error TS` misurato con le modifiche in stash,
nessuna nei file toccati), `eslint` pulito sui file toccati, `pnpm build` ok. Commit:
`7ebbb70` (produttori Convex + status del bridge RSVP), `9601f04` (UI).

---

## 1. Prima di tutto: il client Convex non era installato

`app/plugins/convex.client.ts` forniva l'URL e lasciava un commento — *"the actual
client initialization with auth will happen in useAuth composable"* — che non
corrispondeva a nulla: `installConvex` era chiamato solo dai test. Nessun
`useConvexQuery` in applicazione poteva funzionare. Il primo passo del task non
è stato migrare una pagina, è stato **accendere il client**.

Il browser installa il client con il token fetcher di Better Auth
(`createConvexTokenFetcher`), che non rigetta mai e conserva l'ultimo token noto
attraverso un guasto transitorio — due proprietà misurate durante G02.

Il server no, e la ragione è nel bundle, non nell'opinione. `installConvex`
costruisce un `ConvexClient`; il costruttore di `BaseConvexClient` costruisce un
`WebSocketManager`, e il **costruttore di quest'ultimo chiama `connect()`**
(`node_modules/convex/dist/browser.bundle.js`, `WebSocketManager` → `connect`),
che fa subito `new this.webSocketConstructor(uri)`. Su Node è un socket reale per
ogni render; su un Worker `WebSocket` non esiste nemmeno come globale. Da qui
`installConvexHttp`: contesto creato con `manualInit` e **solo** `httpClientRef`
riempito, `clientRef` volutamente `undefined`. Il test lo pinna
(`test/migration/frontend-data-layer.test.ts`), perché è una proprietà che si
perde in silenzio: basta che qualcuno "semplifichi" tornando a `installConvex`.

### Un secondo inciampo, trovato dal build

`app/plugins/convex.ts` non conteneva un plugin — non aveva default export — ma
viveva nella cartella che Nuxt considera tale. Finché nessuno lo importava a
runtime non si notava; al primo `import { installConvex } from "~/plugins/convex"`
il build è morto con *"installConvex is not exported by app/plugins/convex.ts"*.
Gli helper sono ora in `app/lib/convexInstall.ts`. Un file in `app/plugins/` non è
un modulo: è un plugin.

---

## 2. Cosa è diventato vivo, e cosa no

**Vivo** significa: una query Convex che si ri-esegue quando i dati cambiano,
anche per una scrittura che arriva da un'altra scheda.

| Superficie | Prima | Ora |
|---|---|---|
| Lista progetti | `useAsyncData` + `refresh()` dopo ogni scrittura | `api.projects.listAll` viva |
| Lista eventi (home, abbonamento) | `listEvents()` in `onMounted` | `api.events.listAll` viva |
| Evento singolo (dettaglio, ospiti, reminder) | GET una-tantum, ricaricata a mano | `api.events.get` viva (`useEvent`) |
| Statistiche | `GET /api/events/:id/stats` + polling 30s | `api.events.stats` viva |
| Lista ospiti (ospiti, distribuzione, reminder, andamento) | GET una-tantum + `refreshGuests()` dopo ogni scrittura | `api.guests.list` viva |
| Dettaglio ospite (drawer) | GET all'apertura | `api.guests.get` vivo **mentre il drawer è aperto** |
| Reminder | `GET /api/events/:id/reminders` nel componente | `api.reminders.list` viva, copiata nel form solo senza modifiche in corso |

**Non vivo, per scelta.** Editor, configurazione RSVP e distribuzione copiano
l'evento in stato editabile (blocchi, tema, font, domande). Lì una query viva
sarebbe un **difetto**: riscriverebbe i campi sotto le dita dell'utente a ogni
scrittura, comprese quelle di un'altra scheda. Quei tre usano
`useEventActions().getEventOnce` — una `client.query` imperativa, letta una volta
— e scrivono con mutation. Il default è vivo dove il dato è di sola lettura, e
una-tantum dove il dato diventa un form.

Il polling delle statistiche è sparito insieme al suo timer: era il compromesso
dichiarato del Task 11 ("entro 30 secondi"), e con una query viva non c'è più
niente da dichiarare. La pagina evento ha ora **un timer in meno** (resta il tick
da 1s dell'etichetta "aggiornato Ns fa").

---

## 3. Le conversioni che nessuno vede, e perché stanno in un punto solo

La UI è nata su Postgres via Drizzle: `timestamp` → stringa ISO, e c'è un punto in
cui due date si confrontano con `localeCompare` (stringhe). Convex memorizza
**millisecondi** (`v.number()`). Il confine si attraversa due volte per entità, e
sta in funzioni pure esportate:

- `timestampOrNull` (ISO → numero, `null` = azzera) e `isoOrNull` (numero → ISO);
- `toEventStatus` / `toProjectStatus` — lo schema dichiara `v.string()`, la union
  la applica la scrittura, quindi **la lettura deve restringere**: un valore
  inatteso degrada su `active` invece di entrare in un tipo che mente;
- `toEventDistribution` — nello schema `distribution` ha i quattro campi
  opzionali (scelta dell'import: le righe parziali esistono, un validator stretto
  le rifiuterebbe in blocco), mentre la UI li lega a quattro input di testo. Il
  fallback è `""` e non un default inventato dal client, che divergerebbe da
  quello del server (`getDefaultDistribution`).

`timestampOrNull` **lancia** su una data non valida invece di restituire `NaN`:
un `NaN` salvato è un numero che nessuna query troverà mai.

Un dettaglio non ovvio: `toEventStatus` non è simmetrica a `toProjectStatus`. Nel
primo il legacy distingueva `draft`/`active`/`closed`, nel secondo solo
`active`/`archived`; unificarle "per pulizia" avrebbe inventato uno stato.

---

## 4. Cosa resta (e cosa serve per farlo)

### Step 3, seconda metà — fatta, vedi §4bis

`useEventGuests.ts` e `usePublicInvite.ts` sono usciti dalla lista del debito;
restano `profileStore.ts` (Step 5) e `useSubscription.ts` (Step 4).

### Step 4 — organizzazione e billing

(Nota di confine: `POST /api/events/:id/reconcile-unlock` nella pagina di andamento
è billing e resta allo Step 4; lo Step 3 non l'ha toccato.)


`organizationStore` parla ancora al **client plugin di Better Auth**
(`client.organization.*`), non a `$fetch`: il gate non lo vede e non lo vedrà mai,
perché non è una chiamata `/api/**`. Le funzioni Convex esistono già
(`organizations.listMyOrganizations`, `setActive`, `listMembers`, `inviteMember`,
`cancelInvitation`, `removeMember`, `updateMemberRole`, `deleteOrganization`) e
`billing.checkoutsCreate` / `customersPortalUrl` / `planForActiveOrganization`
coprono `unlockEvent`, `openCustomerPortal` e `refreshSubscription`. Restano da
ricablare lo store, `useSubscription` e i consumatori (layout `ceremly`,
paywall, home admin, pagina abbonamento, pagine organizzazione, `members.vue`).

### Step 5 — profilo, export, form pubblici, upload

`profileStore` (profilo, cambio email/password, cancellazione account),
`DataExportSection`/`DataExportHistory` (`api.profile`, `api.dataExports`), i tre
bridge anonimi già esistenti, e gli upload avatar/galleria che devono passare a
presign Convex → PUT su R2 → confirm.

### Quelle che restano Worker, e perché

Non sono debito, sono vincoli di trasporto: `GET /api/events/:id/export` (CSV) e
`/guests/:id/qr` (PNG) sono **download binari** aperti in una nuova scheda;
`/api/user/data-export/download/:token` è un URL firmato; `/api/file/upload` è
il percorso di upload ancora legacy. `feedbackStore` (`/api/suggestions*`) è
**fuori dal piano**: le suggestions non hanno una controparte Convex.

### Nessuna run live

Il port è verificato ermeticamente (query, mutation, gate, adattatori) ma **non è
mai stato eseguito contro un deployment**: "la lista si aggiorna da sola" è
un'affermazione sulla forma del codice, non un'osservazione. La verifica che il
piano chiede — due browser context, una scrittura vista dall'altro — è lavoro di
rehearsal (Task 16), o di una sessione con un deployment raggiungibile.

---

## 4bis. Ospiti, RSVP e invito pubblico (2026-09-24)

### Il produttore che mancava

`guests.sendInvites` (mutation) è il port di `distribution.service.sendInvites`, nello
stesso ordine: evento chiuso → `EVENT_CLOSED`; bozza → attivata nella stessa
scrittura; subject/body **fusi** in `event.distribution` prima che i job esistano
(il consumatore li legge dall'evento quando gira, quindi il payload resta `{ guestId }`
— solo id); solo ospiti attivi di quell'evento e di quell'organizzazione (gli id fuori
scope sono omessi, non un errore); un job `send-invite-email` per ospite con email;
"Inviato" (`sentAt`, il primo si conserva: `COALESCE` del legacy) e attività
`invite_sent` solo per ciò che è stato accodato; audit `invite.sent` con i conteggi.
RBAC con `requireRole(DOMAIN_WRITE_ROLES)` come `requireWrite` del legacy; gli args
non contengono mai `organizationId`.

Due differenze, entrambe conseguenza del runtime e dichiarate nei test:

- **`failed` è sempre 0.** Il legacy accodava su QStash via rete e poteva perdere una
  parte del lotto; qui i job sono righe nella stessa transazione, quindi o tutti gli
  ospiti della chiamata sono accodati o la mutation fallisce e non lo è nessuno. Il
  campo resta per il contratto della pagina.
- **Un secondo clic non accoda una seconda email.** `dedupeKey` per ospite: finché il
  suo job è `pending`/`retrying`/`running` viene riusato (e legge il testo appena
  salvato), senza una seconda attività, ed è contato in `alreadyQueued` — **non** in
  `queued` (fix round 1 della review: prima `queued` era `withEmail.length`, e audit
  e UI potevano dire "50 accodati" quando 49 erano già in volo). A job concluso un
  nuovo invio è un nuovo invito, voluto.

Validazione con i limiti dello schema legacy (1–200 ospiti, subject ≤ 200, body ≤
5000), con una differenza minima: un testo di soli spazi è `INVALID_INPUT` (il legacy
`min(1)` senza trim lo accettava; la dashboard faceva già il trim, quindi nessuna
richiesta reale cambia esito).

`guests.sendTest` è una **mutation che accoda un job** (fix round 1 della review). La
prima versione era un'action che inviava subito e auditava l'esito dopo: un effetto
esterno senza tentativi, backoff né stato terminale persistiti, e un errore arrivato
*dopo* che il provider aveva accettato l'email si leggeva come "non inviata". Ora la
mutation autorizza (`requireRole`), valida l'override, salva la richiesta in
`inviteTestRequests` (il testo di prova non salvato vive lì, **non** nel payload) e
accoda `send-test-invite-email` con payload `{ testRequestId }`; audit
`invite.test_requested` all'accodamento. Il job (`convex/jobs.ts`) risolve
destinatario e testo quando gira, invia con il mittente transazionale (legacy `type:
"custom"`) e una **chiave di idempotenza Resend per richiesta** (`invite-test/<id>`:
un retry dopo un timeout in cui il provider aveva accettato non spedisce due volte);
tentativi (5, budget email), backoff e `dead` sono quelli della macchina a stati.
Richiesta il cui evento è stato cancellato → skip silenzioso, e la riga va via con il
grafo dell'evento (`deleteEventGraph`). La UI dice "in coda", non "inviata".

È un **settimo tipo di job**, fuori dai sei del piano (Task 13): dichiarato qui e nel
commento della registry (`convex/lib/jobQueue.ts`). E una tabella nuova
(`inviteTestRequests`), additiva.

### L'anteprima firmata

`rsvp.previewInvite` (query) sostituisce `GET /api/public/preview`. La firma è il port
byte per byte di `server/utils/previewToken.ts` — `{exp}.{HMAC-SHA256(secret,
"preview:{slug}:{exp}")}`, TTL 30 giorni — **con lo stesso segreto** (il Better Auth
secret, `BETTER_AUTH_SECRET` nella deployment Convex): un link di test firmato dal
runtime legacy durante il blue-green deve verificare qui, e viceversa. Il test lo
pinna ricalcolando il digest legacy con `node:crypto`. Web Crypto e non `node:crypto`
perché firma e verifica girano nel runtime V8 (query e action). **Presupposto
operativo**: `BETTER_AUTH_SECRET` di Convex e `NUXT_BETTER_AUTH_SECRET` del runtime
legacy devono coincidere, altrimenti i link di test inviati da uno dei due runtime
sono 404 nell'altro.

### L'invito pubblico, e perché passa dal client HTTP

`usePublicInvite` apre l'invito con `api.rsvp.publicInvite` sul **client HTTP** di
Convex dentro `useAsyncData`. È una *mutation* (conta l'apertura), e deve girare nel
render server: l'HTML porta l'anteprima OG che WhatsApp e Telegram leggono. Il server
ha solo il client HTTP (§1), il browser idrata dal payload e non la richiama — un'apertura
conta una volta, come col legacy. L'anteprima usa lo stesso client (una lettura
pubblica senza sessione non ha niente da tenere vivo). Gli adattatori
millisecondi → ISO stanno in `app/lib/publicInvite.ts`, fuori dal composable perché
quello usa le global di Nuxt che il progetto TypeScript dei test non ha.

Il **submit** resta sul bridge anonimo del Worker (Task 12): è lì che l'IP diventa un
digest firmato. Portarlo in pagina ha fatto emergere un difetto del bridge: le
`ConvexError` di `rsvp.submit` non avevano `status`, e `runPublicForm` ricade su
`500` — quindi sul percorso Convex "risposte chiuse" (410) e gli errori di
validazione (422) arrivavano alla pagina come errore generico, e il rate limit come
500 invece di 429. Ora `INVITE_NOT_FOUND` porta 404, `RSVP_CLOSED` 410,
`RSVP_INVALID` 422 (e l'elenco completo `errors`, che il Worker inoltra in
`data.errors`, dove la pagina lo legge), il limiter 429 con il messaggio legacy.
Verificato dalla porta (`t.fetch("/public/rsvp")`) e dal lato Worker
(`public-forms-bridge.test.ts`).

**Coerenza di configurazione, da sapere al cutover**: il frontend ora legge l'invito
da Convex. Il submit va a Convex solo con `NUXT_PUBLIC_FORMS_BACKEND=convex`; con
`legacy` scrive su Postgres una risposta che la pagina — e la dashboard — non
vedranno. Le due cose vanno accese insieme. `toPublicRsvpResponse` accetta comunque
entrambe le forme di `updatedAt` (millisecondi da Convex, ISO dal service legacy),
così la pagina non si rompe nella finestra di transizione.

### Letture vive, e l'unica sottoscrizione a mano

Lista ospiti viva ovunque (le pagine non chiamano più `refreshGuests()` dopo una
scrittura: la riga "Inviato", l'esclusione dai reminder, un RSVP arrivato compaiono
da soli). Il dettaglio del drawer è vivo ma **opzionale**: `useConvexQuery` sottoscrive
sempre e `convex-vue` non ha uno "skip", quindi `useGuestDetail` apre e chiude a mano
una `client.onUpdate` quando cambia l'ospite selezionato. Due scelte "una volta sola",
per la stessa ragione dei form: il canale iniziale della distribuzione (WhatsApp se
nessuno ha email) e l'ospite di default del drawer nell'andamento — rieleggerli a ogni
aggiornamento sposterebbe la UI sotto l'utente.

La pagina reminder è migrata insieme (`useEventReminders`): leggeva e scriveva con
`$fetch` **nel componente**, dove il gate non guarda — senza questo passaggio sarebbe
rimasta sul legacy senza che nessun test lo dicesse. I reminder del form seguono la
query viva solo senza modifiche in corso (la sentinella è la stessa del pulsante
Salva).

Restano Worker per vincolo di trasporto: il QR (`/guests/:id/qr`, PNG) aperto in una
nuova scheda. Le route legacy (`/api/events/:id/{send,send-test,mark-sent,guests/**,reminders}`,
`/api/public/{invite,preview}`) **non sono state cancellate**: il runtime Vercel
continua a funzionare (blue-green).

### Nessuna run live

Come il resto del task: tutto verificato ermeticamente (convex-test con lo scheduler
reale per il job accodato, porta HTTP del bridge, gate, adattatori), **mai eseguito
contro un deployment**. `convex codegen` ha contattato la deployment di sviluppo per
rigenerare i tipi (come fa `typecheck:convex`), che non è una verifica del
comportamento.

---

## 5. Il gate, e perché non è un elenco di permessi

`test/migration/frontend-data-layer.test.ts` scansiona `app/composables` e
`app/stores` e fallisce su ogni `/api/**` che non sia `/api/auth`. Tre asserzioni:

1. **niente violazioni fuori dall'allowlist**;
2. **ogni voce dell'allowlist è ancora vera** — chi migra un file senza togliere
   la riga rompe il test. La lista può solo accorciarsi;
3. **nessuna `useConvexClient()` manuale** fuori da `useEvents.ts` e
   `useEventGuests.ts` — la via per reintrodurre una lettura una-tantum al posto di
   una query viva. Il secondo è ammesso solo per `client.onUpdate` (il dettaglio
   opzionale), e un'asserzione dedicata vieta lì `client.query(...)`.

Dal 2026-09-24 il gate ammette, oltre a `/api/auth`, **un solo** bridge anonimo con
una regex esatta (`/api/public/invite/${…}/rsvp`): la GET dell'invito ha lo stesso
prefisso, ed è proprio la strada che il gate deve chiudere. Un'asserzione dedicata
verifica che `usePublicInvite` usi `api.rsvp.publicInvite`/`previewInvite` sul client
HTTP e che il submit sia il suo unico `/api/**`.

La terza cecità della regex (dopo `{`/`}`): i percorsi con `(` e `)` —
`` `/api/public/invite/${encodeURIComponent(token)}` `` — erano invisibili, quindi
`usePublicInvite` stava in allowlist per una sola chiamata su tre. Verificato rosso
con una sonda (una GET dell'invito in un composable nuovo fa fallire l'asserzione 1)
e ripristinando il vecchio `useEventGuests.ts` (asserzione 1 rossa).

L'asserzione 2 ha pagato subito, due volte. La prima: la regex dei percorsi non
ammetteva `{` e `}`, quindi **non vedeva** i template literal
(`` `/api/events/${id}/guests` ``, cioè quasi tutte le chiamate reali); senza
l'asserzione 2 il gate sarebbe stato verde e cieco. La seconda: migrando le
statistiche, la voce `useEventStats.ts` nel debito è diventata falsa e il test è
diventato rosso da solo.

Verificato **rosso** con una sonda: un file nuovo con una chiamata di dominio
fuori allowlist fa fallire l'asserzione 1. Un gate che non è mai stato visto
fallire non è un gate.

---

## 6. File

Codice: `app/lib/convexInstall.ts` (nuovo, `installConvex` + `installConvexHttp`),
`app/plugins/convex.client.ts`, `app/plugins/convex.server.ts` (nuovo),
`app/composables/useConvexError.ts` (nuovo), `app/composables/useProjects.ts`,
`app/composables/useEvents.ts`, `app/composables/useEventStats.ts`,
`convex/projects.ts` (`listAll`), `convex/events.ts` (`listAll`, `countsOf`), più
le pagine consumatrici (`dashboard/index.vue`, `dashboard/subscription/index.vue`,
`dashboard/events/new.vue`, `events/[id]/{index,editor,guests,reminders,distribution,rsvp}.vue`,
`dashboard/projects/index.vue`), `i18n/locales/*` (la chiave `projects.truncated`).

Rimosso: `app/composables/useConvexResource.ts`.

Test: `test/migration/frontend-data-layer.test.ts` (9 casi), più i tre casi
`listAll` in `convex/domain.test.ts`.

Step 3, seconda metà: `convex/guests.ts` (`sendInvites`, `sendTest`,
`testEmailContext`, `buildTestInviteEmail`), `convex/rsvp.ts` (`previewInvite`, status HTTP
dei rifiuti), `convex/http.ts` (inoltro di `errors`), `convex/lib/previewToken.ts`
(nuovo), `convex/lib/audit.ts` (`invite.test_requested`), `convex/lib/jobQueue.ts` e
`convex/jobs.ts` (`send-test-invite-email`), `convex/schema.ts` (`inviteTestRequests`),
`convex/events.ts` (cascata),
`server/utils/publicFormsBridge.ts` (`data.errors`), `app/composables/useEventGuests.ts`,
`app/composables/usePublicInvite.ts`, `app/composables/useEventReminders.ts` (nuovo),
`app/composables/useConvexError.ts` (`convexErrorCode`), `app/lib/publicInvite.ts`
(nuovo), le pagine `events/[id]/{guests,distribution,reminders,index}.vue`. Test:
`convex/distribution.test.ts` (19 casi, nuovo), +7 casi nel gate, +1 in
`test/migration/public-forms-bridge.test.ts`.

### Perché `useConvexResource` è stato cancellato

Era inutilizzato e **non poteva funzionare**: decideva se una reference era una
query o una mutation leggendo `query.__type`, ma `api` è generato come `anyApi`,
un proxy il cui handler restituisce `undefined` per qualunque proprietà che non
sia il simbolo `functionName`. Ogni chiamata sarebbe morta con *"Invalid
query/mutation reference"*. Il codice era verde perché nessuno lo chiamava. Il
punto non è il file: è che `api.x.y` **non** porta a runtime l'informazione che i
suoi tipi portano a compile time, e chi scrive un wrapper deve saperlo.
