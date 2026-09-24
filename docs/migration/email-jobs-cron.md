# Task 13 — scheduler, cron, Resend e retry persistito

La coda QStash sparisce e il lavoro asincrono diventa una **tabella**: ogni consegna
è una riga in `jobExecutions` con stato, tentativi, errore e prossima scadenza. Il
criterio delle asserzioni è quello dei Task 10–12 — il comportamento legacy, non il
codice nuovo — e dove il port si discosta il test lo dichiara nel nome o nel commento.

Verifiche di chiusura (2026-09-22, albero locale):

| Comando | Esito |
|---|---|
| `vitest run convex/` | 241 passed |
| `pnpm test:migration` | 362 passed / 27 skipped |
| `pnpm typecheck:convex` | pulito |
| `pnpm typecheck` | 23 errori, **tutti** in file non toccati da questo task (`server/utils/auth.ts`, `checkout.service`, `permissions.ts`, `login.vue`, `site-mode-middleware.test.ts`) — baseline preesistente |
| `pnpm build` | ok (client + Worker) |
| `eslint` sui file toccati | pulito |

Il backoff è verificato con un'uguaglianza **esatta** (`nextAttemptAt - updatedAt ===
retryDelayMs(attempt)`), non con un ordine di grandezza, e il test è stato verificato
**rosso** sostituendo `2 ** attempts` con `attempts`: `expected 60000 to be 120000`.

---

## 1. Il difetto che ha trovato il primo run: un campo scritto e non dichiarato

Il primo giro di `convex/jobs.test.ts` è finito con tutti i job `dead` dopo cinque
tentativi, e `lastError` diceva:

```
Validator error: Unexpected field `providerId` in object
```

`recordOutcome` accettava `providerId` e lo scriveva sulla riga del job, ma lo schema
non dichiarava il campo: **ogni** esecuzione falliva, sempre per la stessa ragione, e
la retry chain rendeva l'errore invisibile finché non si è andati a leggere la riga.

Il rimedio è una riga in `convex/schema.ts`. La parte che vale la pena tenere è il
metodo: la macchina a stati ha reso diagnosticabile un guasto che con un `console.log`
sarebbe stato cinque righe di log identiche, e il test che *aspettava* `succeeded` è
ciò che ha trasformato un "sembra funzionare" in un rosso immediato.

## 2. `retrying` è uno stato, non un sinonimo di `pending`

Il piano elenca `running→retrying→running` e la tentazione è riusare `pending`: è la
stessa condizione operativa — una riga che aspetta di essere eseguita. Non lo è per la
domanda che un operatore fa guardando la coda: "questo job è nuovo o ha già consumato
quattro tentativi?". Collassando gli stati la risposta è la stessa per entrambi, e con
essa sparisce la sola informazione che distingue un ritardo fisiologico da un guasto
che sta escalando.

`failed` resta nella union perché il Task 12 lo scriveva e togliere un valore dal
validatore renderebbe illeggibile una riga storica; nessun percorso nuovo lo scrive, e
`markRunning` lo tratta come terminale.

## 3. Il cron che non era nell'elenco, e perché serve

Lo Step 4 elenca cinque cron. Il sesto — `recoverStalledJobs`, ogni ora — è l'unico
modo di mantenere la promessa di "retry persistito": senza di esso il retry è
*pianificato* ma non *durevole*, perché `recordOutcome` affida il prossimo tentativo
allo scheduler, e una consegna persa (o un'istanza morta a metà di un job `running`)
non verrebbe mai ripresa. La riga in tabella sarebbe una promessa non mantenuta.

Tre casi, uno per stato, e tutti passano dal lease già esistente:

- `pending`/`retrying` con `nextAttemptAt` passato → la consegna è andata persa.
- `running` con lease scaduto → l'esecuzione è morta.
- `running` con lease valido → **non si tocca**: è in volo.

Riconsegnare un job ancora in volo è innocuo perché `markRunning` rifiuta la seconda
consegna finché il lease è valido. La proprietà è verificata da un test dedicato, non
dedotta dal codice.

## 4. Il rilascio del lease, trovato dal test

Alla prima stesura `releaseOrphanFile` riportava `presignExpiresAt` a `leaseAt - 1`
("è nel passato, quindi è candidabile"). Il test ha mostrato che non lo è: il
predicato del claim è `presignExpiresAt < now - graceHours`, quindi `now - 1` è nel
passato rispetto ad *adesso* ma non rispetto alla finestra di grace. Conseguenza: un
oggetto che non si riesce a cancellare sarebbe tornato in coda **una grace period dopo
ogni fallimento**, cioè la pulizia di un bucket con problemi R2 sarebbe rallentata di
un fattore pari alla grace stessa.

Il rilascio scrive `0`: "scaduto da sempre". Il lease serve solo a impedire che due
giri si sovrappongano, ed è già stato speso quando si rilascia.

## 5. Due trappole evitate prima di scriverle

**Range su campi opzionali.** La scansione degli eventi stale usa `by_updated_at` e un
campo *obbligatorio*: ogni ramo del predicato legacy richiede `updatedAt` vecchio,
quindi l'insieme dei candidati è un sottoinsieme esatto di "inattivi da 30 giorni", e
nessun documento resta fuori dall'indice. È la lezione del Task 12 (`by_purge_at` che
cancellava account appena creati) applicata in fase di progetto invece che in fase di
debug.

**Il filtro che resta anche quando l'indice dovrebbe bastare.** `claimOrphanFiles` fa
un range su `uploadStatus`/`presignExpiresAt` e **poi** verifica in JS che
`presignExpiresAt` esista e sia davvero oltre la grace. Il range è la parte
efficiente, il filtro è la parte che non dipende dalla semantica dei documenti senza
il campo indicizzato — che è l'unica cosa su cui il Task 12 ha dimostrato di non
potersi fidare.

Stessa logica, in piccolo, su `pendingGuests`: la finestra è limitata (`limit * 2`
ospiti letti) e il limite è dichiarato nel codice, così un evento molto grande viene
sollecitato in più giri invece di far fallire il cron o di fare un `collect` senza
tetto.

## 6. Svix in V8: perché reimplementarlo, e come non fidarsi

La verifica della firma era `resend.webhooks.verify`, cioè un pacchetto Node. Un
`httpAction` di Convex gira in V8: non può importarlo, e spostare tutto il webhook
dietro una Node action pagherebbe un cold start su ogni consegna per un HMAC.

`convex/lib/svix.ts` è quindi la reimplementazione su Web Crypto — ed è esattamente il
tipo di codice che "sembra giusto" e rifiuta ogni consegna vera. Per questo
`convex/lib/svix.test.ts` è un **differenziale**: firma con l'SDK `svix` e verifica con
la nostra implementazione, poi firma con la nostra e verifica con l'SDK. Più i rifiuti
nominati (corpo alterato, segreto diverso, timestamp fuori tolleranza, header
mancante, `v2,` sconosciuto) e il caso delle firme multiple nell'header, che è la forma
che Svix usa durante la rotazione della chiave.

Il seed è accettato con e senza prefisso `whsec_`: il dashboard lo mostra in due forme
a seconda di dove si copia, e rifiutarne una sarebbe una trappola di deploy senza
alcun guadagno di sicurezza.

## 7. Verificare i retry con i timer finti: un tentativo per volta

`finishAllScheduledFunctions(() => vi.runAllTimers())` — il modo in cui il Task 12 fa
girare la coda — **esaurisce l'intera catena di retry** dentro l'orologio finto: un
job che fallisce arriva a `dead` in una sola chiamata, e `expect(status).toBe
("retrying")` non è scrivibile.

I test di questo task usano perciò `vi.runAllTimers()` seguito da
`finishInProgressScheduledFunctions()`: il primo fa scattare i `runAfter(0)`, il
secondo aspetta che finiscano, e il retry pianificato due minuti dopo resta in attesa.
È ciò che rende ogni tentativo osservabile separatamente — inclusa l'affermazione sul
ritardo esatto.

## 8. Perché le email di auth, contatto e waiting list non sono job

Lo Step 3 dice "tipi esatti" e ne elenca sei. Verifica, reset password, cambio email,
invito organizzazione, conferma e notifica del form contatti e benvenuto in waiting
list **non** hanno un tipo di job: sono action schedulate direttamente dalla mutation
che le origina.

La ragione non è il rispetto letterale dell'elenco: è che il valore di un job durevole
è che qualcuno a valle attende il risultato. Per un invito o un reminder c'è un ospite
che aspetta il link; per una verifica email l'utente la richiede di nuovo, e il
fallimento è già un record di audit `email.failed`. Dare loro un tipo significherebbe
un tipo che il piano non prevede per un beneficio che non c'è.

## 9. Due cose che cambiano significato, dichiarate

**`emailSent`.** Il Task 12 lo restituiva `false` perché "l'invio è del Task 13". Ora è
`true`, e significa "consegnata al percorso di invio nella stessa transazione della
scrittura", non "il provider ha risposto 200": una mutation non può attendere
un'action, e il legacy che attendeva Resend inline poteva riportare l'esito solo perché
bloccava la risposta del form su una chiamata di rete. Il vantaggio è che un
fallimento diventa un audit con retry invece di un booleano che nessuno guarda — e il
test pinna il valore nuovo **e** i due rami anti-bot, dove `emailSent: true` fa parte
del finto successo per i bot (come nel legacy: un bot non deve poter dedurre la
detection dal corpo della risposta).

**`submittedAtMs`.** La notifica del form contatti porta l'istante in millisecondi, non
una data formattata: `toLocaleString('it-IT', …)` è un'operazione da Node, e farla in
una mutation V8 significherebbe dipendere dal suo supporto delle locale per il
contenuto di un'email. La formattazione avviene nell'action, un passo prima del
renderer.

## 10. La cancellazione di un evento è un drain, non un `DELETE`

Convex non ha `ON DELETE CASCADE`: i figli (`rsvpResponses`, `guestActivities`,
`eventReminders`, `guests`) si eliminano in blocchi di 100 e la riga dell'evento
sparisce nel passaggio in cui i figli sono finiti. Un evento con 3000 ospiti non entra
in una transazione, e fingere che ci entri significherebbe un cron che fallisce sempre
sul caso che conta.

La conseguenza è visibile e va detta: durante i passaggi intermedi l'evento esiste con
meno ospiti di prima. È accettabile perché la fase di delete lavora solo su eventi
**già avvisati sette giorni prima** e conclusi, quindi nessuno li sta guardando — ma è
una differenza reale rispetto al `DELETE` atomico del legacy.

I file R2 dell'evento non vengono toccati: la tabella `files` non ha un `eventId`
(decisione del Task 7/10), quindi non esiste un insieme di oggetti "di quell'evento" da
cancellare. Il legacy si comportava allo stesso modo.

## 11. Buchi dichiarati, non nascosti

- **Nessuna run live.** Job, cron, Resend e webhook sono verificati ermeticamente
  (fetch finto per il bridge e per l'API Resend, `t.fetch` reale per la route
  `/resend/events`). Il rehearsal end-to-end è il Task 16.
- **L'invito a un'organizzazione non parte da Convex — handoff G06→Task 13, ancora
  aperto, e va detto con precisione.** Il ledger del gate G06 scriveva: *"`inviteMember`
  returns the plaintext token for Task 13 to deliver, and the `expired` invitation
  status is reserved for that task's cron sweep"*. Nessuna delle due metà è
  implementata qui, e non per dimenticanza:
  - *Consegna.* Nel legacy l'email la manda un hook di Better Auth
    (`organization({ sendInvitationEmail })` in `server/utils/auth.ts`), che costruisce
    `${baseURL}/invite/${data.id}` — l'**id dell'invito del plugin**. In Convex il plugin
    organization non esiste per scelta (Task 4/5) e `inviteMember` restituisce
    `{ invitationId, token }`: mandare l'email significa decidere **quale** URL riceve
    l'invitato, cioè il contratto della pagina `/invite/*`, che è frontend (Task 14).
    Spedire un link prima che quella pagina esista sarebbe un'email che porta a un 404.
  - *Sweep delle scadute.* `isInvitationPending` valuta la scadenza **in lettura**, quindi
    un invito scaduto non è accettabile anche senza il cambio di stato. Lo sweep è
    igiene del dato, non correttezza: nessun percorso lo richiede oggi.
  Il template `org-invite` è comunque spostato e raggiungibile via `sendTemplate`, così
  quando il contratto dell'URL sarà deciso l'email è una riga di codice. Va scritto a
  chiare lettere che **fino ad allora un invito creato dal backend Convex è silenzioso**:
  è una divergenza reale fra i due backend, non un dettaglio interno.
  **Aggiornamento 2026-09-24 (Task 14, part b):** la consegna è chiusa — job
  `send-org-invite-email`, URL `{SITE_URL}/invite/{token}`, token derivato (HMAC del
  segreto Better Auth sull'id). Resta aperto solo lo sweep delle scadute. Vedi
  `docs/migration/frontend-convex.md` §4ter.
- **`auditLogs.ipAddress`/`userAgent`** restano copiati dal legacy e non popolati dalle
  mutation Convex (una mutation non vede l'IP del chiamante) — invariato dal Task 10.
- **`G04` e `G10` restano `NOT_RUN`.** La regola del checkpoint dello Step 5 del Task 9
  è stata sospesa dalle istruzioni esplicite dell'utente, non ammorbidita: i due
  requisiti sono invariati e non è stata toccata una riga per farli passare.

## File

Codice: `convex/email.ts` (action Node: rendering + Resend + soppressione),
`convex/emailEvents.ts` (stato e ingestione del webhook), `convex/emailTemplates/*` (i
template spostati + `index.ts` puro), `convex/lib/emailSubjects.ts`,
`convex/lib/svix.ts`, `convex/lib/jobQueue.ts`, `convex/jobs.ts`, `convex/crons.ts`,
`convex/http.ts`, `convex/auth.ts`, `convex/schema.ts`, `convex/files.ts`,
`convex/media.ts`, `convex/reminders.ts`, `convex/publicForms.ts`,
`server/emailTemplates/index.ts` (adapter), `server/utils/emailWebhookBridge.ts`,
`server/utils/runtimeConfig.ts`, `server/api/webhooks/resend.post.ts`.

Test: `convex/jobs.test.ts` (30), `convex/lib/svix.test.ts` (8),
`test/migration/email-webhook-bridge.test.ts` (5), più le asserzioni aggiornate in
`convex/auxiliaryFlows.test.ts` e `convex/emailTemplates/EventCleanupWarning.test.ts`
(riscritto sul renderer puro).

Variabili d'ambiente lato Convex (nessuna `NUXT_*`: le funzioni leggono `process.env`
del deployment): `SITE_URL`, `APP_NAME`, `RESEND_API_KEY`, `EMAIL_FROM`,
`EVENTS_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `CONTACT_ADMIN_EMAIL`,
`STORAGE_BRIDGE_URL`, `STORAGE_BRIDGE_SECRET`, `PUBLIC_FORMS_SECRET`. Documentate in
`.env.example`. I mittenti sono anche l'elenco dei domini "propri" per il webhook: una
sola fonte per "chi siamo", non due liste da tenere allineate.
