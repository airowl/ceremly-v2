# Task 14 — frontend da `$fetch` a Convex

**Stato: parziale, e in modo dichiarato.** Il task è consegnato a metà: due
vertical slice su cinque sono completi (progetti, eventi + statistiche), il gate
anti-CRUD esiste e sta in piedi. Ospiti/RSVP, organizzazione/billing e
profilo/export/form pubblici **non sono iniziati**. La sezione 4 dice esattamente
cosa resta e da cosa dipende.

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

### Step 3, seconda metà — ospiti, RSVP, invito pubblico

`useEventGuests.ts` e `usePublicInvite.ts` sono ancora sulla lista del debito nel
gate, insieme a `profileStore.ts` e `useSubscription.ts`.

Ostacolo reale, non stimato: **il fan-out degli inviti non esiste in Convex.** Il
tipo di job `send-invite-email` ha un consumatore completo (Task 13) ma nessuna
mutation lo accoda per un insieme di ospiti — i produttori esistenti sono solo i
cron (`enqueueDuePurges`, reminder, cleanup, varianti). Nel legacy quel produttore
è `POST /api/events/:id/send`. Quindi lo Step 3 non è solo ricablaggio del
frontend: richiede `guests.sendInvites` (fan-out + `{queued, skippedNoEmail,
failed}`) e l'equivalente di `send-test`, con i test che ne derivano.

### Step 4 — organizzazione e billing

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

## 5. Il gate, e perché non è un elenco di permessi

`test/migration/frontend-data-layer.test.ts` scansiona `app/composables` e
`app/stores` e fallisce su ogni `/api/**` che non sia `/api/auth`. Tre asserzioni:

1. **niente violazioni fuori dall'allowlist**;
2. **ogni voce dell'allowlist è ancora vera** — chi migra un file senza togliere
   la riga rompe il test. La lista può solo accorciarsi;
3. **nessuna `useConvexClient()` manuale** fuori da `useEvents.ts` — la via per
   reintrodurre una lettura una-tantum al posto di una query viva.

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

### Perché `useConvexResource` è stato cancellato

Era inutilizzato e **non poteva funzionare**: decideva se una reference era una
query o una mutation leggendo `query.__type`, ma `api` è generato come `anyApi`,
un proxy il cui handler restituisce `undefined` per qualunque proprietà che non
sia il simbolo `functionName`. Ogni chiamata sarebbe morta con *"Invalid
query/mutation reference"*. Il codice era verde perché nessuno lo chiamava. Il
punto non è il file: è che `api.x.y` **non** porta a runtime l'informazione che i
suoi tipi portano a compile time, e chi scrive un wrapper deve saperlo.
