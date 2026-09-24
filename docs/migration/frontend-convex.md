# Task 14 — frontend da `$fetch` a Convex

**Stato: completato (2026-09-24), verificato ermeticamente.** I cinque vertical
slice sono chiusi: progetti, eventi + statistiche, ospiti/RSVP/invito pubblico
(§4bis), organizzazione/billing (§4ter), profilo/export/form pubblici/upload
(§4quater). Il registro del debito del gate contiene **solo** vincoli di trasporto
(bridge anonimi, download CSV/PNG) e `feedbackStore`, fuori dal piano. **Nessuna
run live**: la verifica con due browser context, e il CORS del bucket R2 per il
`PUT` diretto, appartengono al rehearsal (Task 16).

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

Step 4 (2026-09-24, albero locale): `vitest run convex/` **279 passed** (+11,
`convex/orgInvites.test.ts`), `pnpm test:migration` **425 passed / 27 skipped**, gate
`frontend-data-layer.test.ts` **24 casi**, `pnpm typecheck` a **23 righe `error TS`**,
identico alla baseline e nessuna nei file toccati, `pnpm typecheck:convex` pulito,
`eslint` sui file toccati pulito salvo i `@ts-ignore` preesistenti su
`definePageMeta`/`useSeoMeta`, `pnpm build` ok. Commit: vedi §4ter.

Step 5 e verifica finale del task (2026-09-24, albero locale): gate
`frontend-data-layer.test.ts` **33 casi**, `vitest run convex/` **288 passed**,
`pnpm test:migration` **444 passed / 27 skipped**, `pnpm test` **573 passed / 27
skipped**, `pnpm typecheck` a **23 righe `error TS`** (baseline, nessuna nei file
toccati), `pnpm typecheck:convex` pulito (esegue `convex codegen`, che contatta la
deployment di sviluppo — non è una verifica di comportamento), `eslint` pulito sui
file toccati, `pnpm build` ok. Commit: vedi §4quater.

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
`useSubscription.ts` ne è uscito con lo Step 4; resta `profileStore.ts` (Step 5).

### Step 4 — organizzazione e billing — fatto, vedi §4ter

### Step 5 — profilo, export, form pubblici, upload — fatto, vedi §4quater

### Quelle che restano Worker, e perché

Non sono debito, sono vincoli di trasporto: `GET /api/events/:id/export` (CSV) e
`/guests/:id/qr` (PNG) sono **download binari** aperti in una nuova scheda; contact,
waiting list e submit RSVP sono i **bridge anonimi** (Task 12), dove l'IP diventa un
digest firmato. `feedbackStore` (`/api/suggestions*`) è **fuori dal piano**: le
suggestions non hanno una controparte Convex.

`/api/user/data-export/download/:token` **non** è più chiamato: un export Convex non
ha token (§4quater), l'URL firmato lo conia `api.dataExports.downloadUrl`.
`/api/file/upload` non è più chiamato: gli upload vanno dal browser a R2.

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

`inviteTestRequests` è coperta da **ogni** percorso di cancellazione (fix round 2,
un test per percorso in `convex/distribution.test.ts`): cancellazione dell'evento,
cleanup automatico degli eventi stale, purge dell'organizzazione di un utente unico
membro, purge dell'account in un'organizzazione che sopravvive (le righe con
`requestedBy` = l'utente si **cancellano**, non si anonimizzano: oggetto e corpo sono
una sua bozza) ed eliminazione dell'organizzazione. Non entra nell'export GDPR: l'export
non include nemmeno le righe analoghe per evento (reminder, attività), e la richiesta è
già tracciata dall'audit `invite.test_requested`, che l'export include (righe con
l'utente come attore). Debito **preesistente**, non introdotto qui:
`organizations.deleteOrganization` non cancella gli eventi dell'organizzazione (restano
orfani con i loro figli); le richieste di test invece ora spariscono.

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

## 4ter. Organizzazione e billing (2026-09-24)

### Il gate non poteva vederlo

`organizationStore` non ha mai chiamato `$fetch`: parlava al **client plugin
organization di Better Auth** (`client.organization.*`), e `useSubscription` al
client plugin Creem (`creem.hasAccessGranted()`, `creem.createPortal()`). Sono
chiamate HTTP a `/api/auth/*` — l'unico prefisso che il gate ammette — quindi il
gate era verde mentre tenancy e billing giravano ancora sui plugin legacy, che il
piano vieta ("Better Auth resta l'identity provider … non usare il plugin
Organization").

Il gate ha ora un blocco dedicato che scansiona **tutto `app/`** (pagine,
componenti, layout: la pagina `/invite` chiamava il plugin direttamente) e rifiuta
quattro forme: `.organization.<metodo>(`, `creem.<metodo>(`, `{ organization }` /
`{ creem }` presi da `useAuth()`, e l'installazione stessa di
`organizationClient()`/`creemClient()`. Nessuna allowlist. Visto **rosso** prima
della migrazione su quattro file reali (`useSubscription.ts`, `auth-client.ts`,
`invite/[id].vue`, `organizationStore.ts`), poi con due sonde dopo (un composable
con `client.organization.list()`, un componente con `const { creem } = useAuth()`).
Una seconda asserzione pinna il rilevatore stesso sulle forme legacy e sull'API
Convex (che non deve scattare), per la lezione dei `{`/`}` del §5.

I due client plugin sono **rimossi dal browser** (`app/lib/auth-client.ts`,
`useAuth` non espone più `organization`/`creem`). La config server del legacy
(`server/utils/auth.ts`) resta intatta: il runtime Vercel continua a funzionare
durante il blue-green, è solo il frontend che ha smesso di chiamarla.

### Lo store: letture vive, ruolo del server

`organizationStore` tiene quattro query vive — `listMyOrganizations`,
`getActiveOrganization`, `listMembers`, `listPendingInvitations` — e le scritture
sono mutation `organizations.*`. Cambiano tre cose per chi lo usa:

- `loadOrganizations`/`loadCurrentOrganization` **non esistono più** (niente da
  ricaricare); `provide('refreshOrgs')` della lista e il suo `inject` nel modale di
  creazione sono spariti.
- Il **ruolo** viene da `getActiveOrganization` (membership ri-verificata dal
  server), non più cercando l'utente nella lista membri confrontando id sul client
  — confronto che fra un id Better Auth e un id `appUsers` non sarebbe nemmeno
  possibile. Per la stessa ragione `listMembers` restituisce `isSelf`.
- Le scritture sui membri usano `member.userId` (`Id<"appUsers">`), non l'id della
  riga di membership.

Le pagine di dettaglio aprono su un id di rotta: `ensureActiveOrganization` cambia
organizzazione **solo se diversa** dall'attiva, perché `setActive` scrive un audit
`organization.activated` e il legacy lo faceva a ogni montaggio. `deleteOrganization`
è **una sola mutation atomica** (fix round 1): accetta un `organizationId` bersaglio
opzionale, verificato come in `setActive` (membership del chiamante, ruolo `owner`),
cancella e riposiziona **nella stessa transazione** l'organizzazione attiva di
chiunque la stesse usando (la membership più vecchia rimasta, il fallback "primo in
lista" del legacy). La prima versione faceva attiva→cancella→attiva fallback con tre
mutation dal client: un guasto a metà poteva cambiare organizzazione senza cancellare,
o cancellare e riportare errore. `createOrganization` in Convex rende
attiva la nuova organizzazione (il plugin no): differenza voluta, la mantengo.

Tre letture additive nel backend, perché la UI non aveva dove prenderle:
`listMembers` aggiunge `name`/`image` (vivono nel componente Better Auth, Task 12) e
`isSelf`; `listMyOrganizations` aggiunge `createdAt` (colonna della tabella).
L'errore dello store include anche la query degli inviti (un guasto non si presenta
più come "nessun invito pendente") e la pagina membri aspetta entrambe le liste
(`isTeamLoading`). Gli
adattatori (ms → ISO, forma `member.user` del plugin, nome mancante → email) sono in
`app/lib/organizations.ts`, testati nel gate.

### Il billing: il piano è vivo, l'entità è del server

`useSubscription` espone la stessa superficie (`currentTier`, `isAtelier`,
`hasActiveSubscription`, `subscription`, `unlockEvent`, `openCustomerPortal`,
`refreshSubscription`, `isUpdating`) più `canManageBilling`. Il piano è
`billing.planForActiveOrganization`, **viva**: cambia da sola quando atterra il
webhook Creem, quindi `refreshSubscription()` è un **no-op dichiarato** tenuto per
compatibilità dell'API; nessuna UI lo chiama più (fix round 1): il bottone
"sincronizza" della pagina abbonamento, che diceva sempre "sincronizzato" dopo una
funzione vuota, è sostituito da un badge "Aggiornato in tempo reale". Sul caricamento o su un errore il tier è
`free`: il client non concede mai un piano che il server non ha dichiarato.

Checkout e portale sono **action** (chiamano Creem), e `convex-vue` 0.1.5 non ha un
composable per le action: `app/composables/useConvexAction.ts` è il fratello mancante
di `useConvexMutation`. È in `MANUAL_CLIENT_ALLOWED` e il gate verifica che chiami
solo `client.action` (mai `query`/`mutation`/`onUpdate`). Nessun argomento nomina
l'organizzazione né un prodotto: l'entità di billing è l'organizzazione attiva
risolta dal server, il mapping tier → product id è configurazione server, nessun
segreto Creem nel browser (il gate verifica anche che `useSubscription` non contenga
`organizationId`).

**Ruoli (fix round 1–2, decisione del controller).** La regola finale:
lo **sblocco Celebrazione** è aperto a ogni ruolo di scrittura (owner | admin | member),
come il legacy `POST /api/events/:id/unlock` (`requireWrite`); **checkout Atelier e
portale sono solo owner**. Il legacy li raggiungeva dal plugin Creem, che controllava
solo la sessione, ma lì l'entità di billing era l'**utente**; qui è l'organizzazione, e
la stessa apertura permetterebbe a un semplice membro di abbonare o cancellare per
tutta l'organizzazione — un'escalation che il legacy non consentiva. (Il round 1 aveva
aperto tutto a tutti per parità letterale; il round 2 lo corregge.) Costanti
`CELEBRATION_CHECKOUT_ROLES` / `SUBSCRIPTION_BILLING_ROLES` in `convex/billing.ts`,
`canUnlockEvents` / `canManageBilling` da `planForActiveOrganization` con le stesse
liste, un caso convex-test per ruolo, nota corretta nell'evidenza G07. Nella pagina
abbonamento **ogni** controllo del portale (gestisci, metodi di pagamento, storico
fatture) segue `canOpenPortal` (Atelier attivo e owner); chi non è owner vede un
messaggio informativo e nessun invito ad Atelier, né da Free né già su Atelier.

`userStore` non espone più `subscription`/`getSubscription`/`fetchSubscription`
(inutilizzati): chiamavano `useSubscription()` dentro un `computed`, che con una
query Convex (serve un contesto di setup) non può funzionare.

### `reconcile-unlock` non è portato, e perché

La pagina andamento chiamava `POST /api/events/:id/reconcile-unlock` al ritorno dal
checkout con `?unlocked=true`. Il motivo era un difetto del legacy: l'handler del
webhook rispondeva sempre 200 e ingoiava gli errori, quindi Creem non ritentava mai
uno sblocco fallito. Il webhook Convex è exactly-once e risponde non-2xx sul
fallimento (Creem ritenta, G07), e `events.get` è viva: il tier cambia da solo quando
il webhook atterra. La chiamata è rimossa, il `successUrl` non porta più
`?unlocked=true`. Un webhook perso **definitivamente** (URL sbagliato in Creem) non
ha più un recupero lato utente: lo copre la riconciliazione operatore
(`scripts/migration/reconcile-creem.ts`). Va saputo, non è nascosto.

### L'invito a un'organizzazione non è più silenzioso

Il ledger G06 (`gates.md`, "G06 handoff") diceva: un invito creato dal backend
Convex è silenzioso, perché consegnarlo significava decidere il contratto URL di
`/invite/*`. Deciso qui:

- **URL: `{SITE_URL}/invite/{token}`**, con `token` il credential di 64 hex che
  `acceptInvitation` già prende. Il legacy linkava l'id dell'invito del plugin; quei
  link (inviti pendenti legacy) non sono migrati (Task 10) e la pagina li mostra come
  "invito non valido" senza nemmeno interrogare Convex (`isInvitationToken`).
- **Consegna: un job durevole** `send-org-invite-email`, accodato da `inviteMember`
  nella stessa transazione, payload `{ invitationId }` e nient'altro, `dedupeKey`
  `org-invite:{id}`, idempotency key Resend `org-invite/{id}`, 5 tentativi. Template
  `org-invite` già spostato dal Task 13, mittente transazionale, nome dell'invitante
  (fallback: nome dell'organizzazione) e lingua dal locale dell'invitante, come
  l'hook legacy. Un invito annullato, accettato o scaduto prima della consegna è uno
  skip silenzioso.
- **Il token è derivato, non salvato.** Un job con payload solo id non può conoscere
  un token casuale che dopo la mutation non esiste da nessuna parte. Quindi
  `token = hex(HMAC-SHA256(BETTER_AUTH_SECRET, "org-invite:{invitationId}"))`
  (`convex/lib/invitationToken.ts`): producer e job calcolano lo stesso valore,
  sull'invito resta solo lo SHA-256 (come prima) e nel job **nessun** plaintext. Un
  database trafugato continua a non bastare per coniare un token: serve il segreto,
  che già firma le sessioni e non deve ruotare al cutover (handoff G05). Se ruota fra
  accodamento e consegna, il token derivato non corrisponde più all'hash salvato: il
  job lo verifica e fa uno skip terminale `token_mismatch` invece di spedire un link
  morto. Presupposto operativo nuovo: **`inviteMember` richiede `BETTER_AUTH_SECRET`
  nella deployment Convex** (c'è già: lo usa l'auth).
- La pagina legge `organizations.getInvitationByToken` (**pubblica**: chi non ha
  sessione vede chi lo ha invitato e dove, come prima; il token da 256 bit è la
  credenziale; token ignoto e vuoto sono lo stesso `null`; nessun id interno né hash
  in uscita; la scadenza è valutata in lettura come in `acceptInvitation`). Dopo il
  login la pagina fa un reload completo (come `login.vue`): il client Convex
  installato prima dell'accesso non ha token, la pagina ricaricata accetta da sola.

È un **ottavo tipo di job**, fuori dai sei del piano, dichiarato qui e nella
registry (`convex/lib/jobQueue.ts`, dove il commento che elencava l'invito org fra
le email "senza coda" è corretto). Resta aperto solo lo **sweep** degli inviti
`expired`: igiene del dato, non correttezza (la scadenza è valutata in lettura
ovunque).

### Un residuo dello Step 3, e il gate che non lo vedeva (fix round 1)

`app/layouts/ceremly.vue` leggeva titolo/tipo dell'evento con
`$fetch("/api/events/${id}")`. Ora lo fa `CerEventContextSync` (un componente montato
dal layout solo con un id, perché `useConvexQuery` non ha uno "skip") con `useEvent`,
la stessa query viva della pagina (una sola sottoscrizione per query+args). Il gate ha
un secondo scan `/api/**` su `app/layouts`, `app/pages`, `app/components`, con un
registro diviso per motivo — trasporto (bridge anonimi, download CSV/PNG), debito
Step 5 (upload, export), una pagina morta del template (`profile/members.vue`, rotta
inesistente) — e l'asserzione "ogni voce è ancora vera". Visto **rosso** con tre
sonde: il vecchio layout, un componente nuovo con `$fetch` a `/api/organizations/…`,
e una voce del registro resa falsa.

### Commit

`a440b31` (backend: consegna dell'invito org + letture per la UI), `0a08636` (UI,
gate), più il commit del fix round 1 (parità ruoli billing, delete atomico, portale,
layout, gate UI).

### Nessuna run live

Verificato ermeticamente (convex-test con lo scheduler reale e Resend finto per il
job, gate, adattatori, typecheck, build). **Mai eseguito contro un deployment.**
`pnpm typecheck:convex` ha eseguito `convex codegen`, che ha contattato la deployment
di sviluppo per rigenerare i tipi (il suo output dice anche "Uploading functions"):
non è una verifica del comportamento.

---

## 4quater. Profilo, export GDPR, form pubblici e upload (2026-09-24)

### Profilo: letto una volta, scritto con mutation

`profileStore` usa `api.profile.current` con una `client.query` **una-tantum** —
la regola dei form (§2): la pagina copia il profilo nei campi, una query viva li
riscriverebbe sotto le dita. Per questo lo store è in `MANUAL_CLIENT_ALLOWED` e,
con `useEvents.ts`, nell'elenco `READ_ONCE_ALLOWED` del gate. Le scritture:

- `updateProfile` → `api.profile.update`. La mutation risponde solo `{ success }`
  (il legacy restituiva la riga intera), quindi lo store applica alla copia locale
  la patch accettata, con lo stesso trim del server.
- `deleteAccount` → `api.profile.requestDeletion`: cancellazione differita di 30
  giorni, account bloccato subito, sessioni revocate, audit — poi `signOut`
  best-effort come prima (la sessione è già invalidata).
- Cambio email e password **restano Better Auth** (`client.changeEmail`,
  `client.changePassword`, e la verifica della password corrente con
  `signIn.email`): verifica e hashing sono dell'identity provider.

La pagina ora controlla l'esito di `updateProfile` anche per l'avatar: prima un
salvataggio fallito dopo un upload riuscito mostrava "aggiornato".

### Export GDPR: stato vivo, URL firmato al clic

`DataExportSection` e `DataExportHistory` leggono `api.dataExports.status` e
`history` **vive**: il polling a 3 secondi è sparito col suo timer, la riga passa
`pending → processing → completed` da sola quando il job la scrive. La richiesta è
`api.dataExports.request` (idempotente lato server: un export in volo viene
riusato). Gli adattatori (ms → ISO, status sconosciuto → `failed`, non uno spinner
eterno) sono in `app/lib/dataExports.ts`, testati nel gate.

Il download **non** passa più da `/api/user/data-export/download/:token`: quella
route legge Postgres per token, e un export Convex non ha token **per scelta** (Task
12: un segreto di lunga durata in una riga è ciò che non si vuole). L'URL lo conia
al clic l'action `api.dataExports.downloadUrl` (5 minuti, solo il proprietario,
solo `completed` non scaduto). Siccome arriva dopo un `await`, un `window.open` a
quel punto non è più legato al clic e viene bloccato come popup: `openSignedDownload`
apre la scheda **in modo sincrono** sul clic, poi la naviga (e le toglie `opener`),
o la chiude se l'action fallisce.

### Upload: presign → PUT → confirm, e l'URL pubblico che mancava

`useStorageUpload().uploadPublicFile(file)` (il nome `useFileUpload` è già un
auto-import di Nuxt UI e lo collideva) fa i tre passi: `api.files.presignUpload`
(autorizza, valida tipo e dimensione, budget di presign), `PUT` del file
all'URL firmato (R2, già in `connect-src`), `api.files.confirmUpload` (magic bytes,
dedup SHA-256, varianti). Il file non passa più dal runtime Nuxt. Lo usano avatar e
galleria dell'editor; il layout delle chiavi resta quello legacy (`global/…`, non
per evento).

Portarlo in pagina ha fatto emergere un buco del Task 7: **nessun file Convex aveva
un URL pubblico** — `insertPendingUpload` scriveva `url: null` e nessuno lo
riempiva, quindi avatar e galleria non avrebbero avuto niente da mostrare. Il
bridge di presign (che possiede la configurazione R2, base pubblica compresa)
restituisce ora anche `publicUrl` con la stessa regola del legacy
(`storage.getUrl`), `insertPendingUpload` lo conserva **solo per un file
pubblico** (un file privato esce solo firmato), e `confirmUpload` restituisce
`url` — dopo un dedup quello del file **sopravvissuto**, perché l'oggetto del
duplicato viene cancellato. Due casi in `convex/media.test.ts`. Un bridge vecchio
che non manda `publicUrl` produce `url: null` e la UI lo tratta come upload fallito,
non come un'immagine vuota.

**Prerequisito operativo nuovo**: il bucket R2 deve ammettere un CORS `PUT` dall'origine
del sito con header `Content-Type`, altrimenti il secondo passo fallisce nel browser.
Non verificabile da qui.

### Form pubblici

Contact e waiting list (landing, home, blog) chiamavano già soltanto
`/api/contact` e `/api/waiting-list/subscribe`, cioè i bridge del Task 12 dietro
`NUXT_PUBLIC_FORMS_BACKEND`; le shape di risposta (`success`, `alreadySubscribed`)
coincidono sui due rami. Il gate ora lo **asserisce** (solo quei percorsi, nessun
import Convex: una chiamata diretta salterebbe il digest dell'IP e il limiter per
IP). Unica modifica: `Contact.vue` leggeva l'errore da `error.context.body.error`
(un residuo Supabase) e poi dal `message` di ofetch (la riga della richiesta); ora
legge `data.statusMessage`, dove il bridge mette il testo (429, 400, 503).

### La CSP bloccava il client Convex

Trovato in verifica: `connect-src` ammetteva R2 ma **non** `wss://*.convex.cloud`.
Nessuna run live l'aveva mai visto, ma in produzione ogni query viva del browser
sarebbe stata bloccata dalla CSP della pagina stessa. Aggiunti `wss://*.convex.cloud`
e `https://*.convex.cloud`, pinnati in `test/migration/security-headers.test.ts`
(visto rosso prima della correzione).

### Il registro del debito, alla fine

`PENDING`, `UI_PENDING` e `UI_DEAD` sono **vuoti**, e un'asserzione lo pretende.
`UI_DEAD` conteneva `profile/members.vue`, pagina del template Nuxt UI mai linkata
che chiamava `/api/members` (una route mai esistita): cancellata. Restano
`UI_TRANSPORT` (bridge anonimi, CSV, QR) e `OUT_OF_SCOPE` (`feedbackStore`).

Le route legacy (`/api/user/**`, `/api/file/**`) **non sono cancellate**: il runtime
Vercel continua a funzionare durante il blue-green.

### Commit

Un solo commit, `feat(migration): move profile, export and public forms UI to
Convex` (profilo, export, form, upload, gate, CSP): upload e profilo condividono la
pagina profilo e il file del gate, e separarli avrebbe lasciato un commit col gate
rosso.

### Nessuna run live

Come il resto del task: verificato ermeticamente (convex-test, gate, adattatori,
typecheck, build), **mai eseguito contro un deployment**.

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
   opzionale), e un'asserzione dedicata vieta lì `client.query(...)`. Dopo lo
   Step 4 si è aggiunto `useConvexAction.ts` (solo `client.action`), dopo lo Step 5
   `profileStore.ts` (lettura una-tantum del form profilo, in `READ_ONCE_ALLOWED`
   con `useEvents.ts`).

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

Rimosso: `app/composables/useConvexResource.ts`; con lo Step 5
`app/pages/dashboard/profile/members.vue` (pagina template morta).

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

Step 4: `convex/organizations.ts` (`getInvitationByToken`, `orgInviteEmailContext`,
consegna in `inviteMember`, campi additivi in `listMembers`/`listMyOrganizations`),
`convex/lib/invitationToken.ts` (nuovo), `convex/lib/jobQueue.ts` e `convex/jobs.ts`
(`send-org-invite-email`), `app/stores/organizationStore.ts`,
`app/composables/useSubscription.ts`, `app/composables/useConvexAction.ts` (nuovo),
`app/lib/organizations.ts` (nuovo), `app/lib/auth-client.ts`, `app/composables/useAuth.ts`,
`app/stores/userStore.ts`, le pagine `dashboard/organization/{index,[id]/index,[id]/members}.vue`,
`dashboard/subscription/index.vue`, `dashboard/events/[id]/index.vue`, `invite/[id].vue`,
`layouts/ceremly.vue`, i componenti `admin/orgs/AddOrgModal.client.vue` e
`ceremly/CerCelebrationPaywall.vue`, `ceremly/CerEventContextSync.vue` (fix round 1),
`i18n/locales/*` (`subscription.realtime`, `subscription.noBillingPermission`).
Test: `convex/orgInvites.test.ts` (11 casi, nuovo), +8 casi nel gate; `BETTER_AUTH_SECRET`
impostato nelle suite che invitano (`organizations`, `billing`, `auxiliaryFlows`).

Step 5: `app/stores/profileStore.ts`, `app/composables/useStorageUpload.ts` (nuovo),
`app/lib/dataExports.ts` (nuovo), `app/components/profile/DataExport{Section,History}.vue`,
`app/components/landing/Contact.vue`, le pagine `dashboard/profile/index.vue` e
`dashboard/events/[id]/editor.vue`, `convex/files.ts` (`publicUrl`/`url`),
`server/api/internal/storage/presign.post.ts` (`publicUrl`), `nuxt.config.ts`
(`connect-src`), `i18n/locales/*` (`dataExport.downloadError`). Test: +7 casi nel gate,
+2 in `convex/media.test.ts`, +1 in `test/migration/security-headers.test.ts`.

### Perché `useConvexResource` è stato cancellato

Era inutilizzato e **non poteva funzionare**: decideva se una reference era una
query o una mutation leggendo `query.__type`, ma `api` è generato come `anyApi`,
un proxy il cui handler restituisce `undefined` per qualunque proprietà che non
sia il simbolo `functionName`. Ogni chiamata sarebbe morta con *"Invalid
query/mutation reference"*. Il codice era verde perché nessuno lo chiamava. Il
punto non è il file: è che `api.x.y` **non** porta a runtime l'informazione che i
suoi tipi portano a compile time, e chi scrive un wrapper deve saperlo.
