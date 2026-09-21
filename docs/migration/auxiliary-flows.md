# Task 12 — profilo, GDPR, form pubblici, coda di job e site mode

Porting dei flussi ausiliari in Convex. Il criterio è quello dei Task 10–11: le
asserzioni vengono dal comportamento legacy, non dal codice nuovo, e dove il port si
discosta il test lo dichiara nel nome o nel commento.

Verifiche di chiusura (2026-09-22, albero locale):

| Comando | Esito |
|---|---|
| `vitest run convex/` | 197 passed |
| `pnpm test:migration` | 313 passed / 27 skipped |
| `pnpm typecheck:convex` | pulito |
| `pnpm typecheck` | solo gli errori legacy preesistenti (`login.vue`, `checkout.service`, `permissions.ts`, …) — nessuno nei file di questo task |
| `pnpm build` | ok (client + Worker) |
| `eslint` sui file toccati | pulito |

---

## 1. Il difetto che questo task ha trovato, e che vale la pena conoscere

**Lo sweep del purge cancellava ogni account appena creato.**

`dueAccounts` selezionava i candidati con un range sull'indice `by_purge_at`:

```ts
.withIndex("by_purge_at", (q) => q.lte("purgeAt", now))   // sbagliato
```

In convex-test quel range restituisce **anche i documenti che non hanno il campo**:
misurato con tre `appUsers`, di cui due senza `purgeAt` — tutti e tre tornavano dal
`lte`. Il seguito è peggiore della premessa: `.take(limit)` taglia la scansione
*prima* di qualunque filtro applicato dopo, quindi con un lotto di 20 i documenti
senza `purgeAt` occupavano i posti e lo sweep non trovava più nemmeno gli account
davvero dovuti (misurato: `scanned: 0` con un account scaduto e presente).

La correzione ha due parti, e nessuna delle due è ridondante:

```ts
.withIndex("by_purge_at", (q) => q.gte("purgeAt", 0).lte("purgeAt", now))
.take(limit);
// ...
.filter((row) => typeof row.purgeAt === "number")
```

- `gte("purgeAt", 0)` esclude i documenti senza campo **dalla scansione** (un
  timestamp epoch non è mai negativo, quindi non toglie nulla di legittimo);
- il filtro esplicito è l'ultima rete, perché una query che può cancellare un
  account che non ha mai chiesto la cancellazione non deve dipendere dalla semantica
  di un indice.

Il test che lo pinna comincia con un account **mai programmato**: senza la
correzione fallisce (`expected [] to have a length of 1 but got +0`), con la
correzione passa. Verificato togliendo la correzione, non dedotto.

## 2. La coda di job

`enqueueJob` scrive il record `pending` e chiama
`ctx.scheduler.runAfter(0, internal.jobs.run, { jobId })` come prescrive il piano; il
runner vive in `convex/jobs.ts` e i due job del task sono `data-export` e
`account-purge`.

Tre proprietà, tutte misurate:

1. **Una consegna duplicata non è un nuovo tentativo.** Con lo scheduler reale la
   stessa `jobId` può arrivare due volte mentre la prima è in volo (misurato:
   `attempt: 2` su un export completato, e una seconda `put` sullo stesso oggetto).
   `markRunning` rivendica il job con un **lease** di 10 minuti: una seconda consegna
   con lease valido è uno scarto, non un tentativo — contarli esaurirebbe
   `maxAttempts` senza che nulla sia mai fallito. Il lease **scade**, quindi un job
   `running` orfano (processo morto a metà) torna riprendibile: è la stessa
   proprietà che serve al retry persistito del Task 13.
2. **Il cron accoda, non esegue.** `internal.jobs.enqueueDuePurges` è il passo che nel
   legacy era un worker in polling: guarda se ci sono account scaduti e, solo in quel
   caso, accoda. Uno sweep non processa account — un account con molti eventi e
   oggetti non entra nella finestra di un cron — quindi il job processa un lotto.
   Nessuna `dedupeKey` sullo sweep, ed è una scelta: due sweep in coda sono innocui
   (la scansione è idempotente), mentre una chiave di dedup farebbe **perdere** uno
   sweep ogni volta che il precedente resta `pending` per un guasto.
3. **La registry dei tipi è chiusa.** `enqueueJob({ type: "email:welcome" })` è
   `JOB_TYPE_UNKNOWN`, non una riga `pending` che nessuno consumerà.

### L'harness dei test, e perché è così

I timer sono finti per tutta la durata del test con
`vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] })`
e **`Date` non lo è**: `Date.now()` governa ogni scadenza di questa suite (grace
window, TTL dell'export, timestamp del form), e il tempo deve restare reale mentre i
timer no. `drainJobs(t)` fa due cose: chiama il passo del cron e poi
`finishAllScheduledFunctions(() => vi.runAllTimers())`, che fa girare i job
**davvero**, attraverso il runner, come farebbe lo scheduler. Gli stati si leggono
dalla tabella, non dal valore di ritorno di `run`: il contratto è lo stato finale del
job, non quale consegna l'ha portato a termine.

Con i timer veri, invece, una consegna può partire *dopo* la fine del test che l'ha
accodata e scrivere su R2 durante il successivo: le asserzioni sulle chiamate al
bridge diventano affermazioni sull'ordine dei test. È esattamente quello che si è
visto prima di fissare i timer.

## 3. Profilo e cancellazione

- I campi sono divisi fra chi li possiede: `name`/`image` nel componente Better Auth
  (è la sua tabella a servirli nella sessione), `phone`/`bio`/`timezone`/`locale` in
  `appUsers`. `email` e `role` **non sono aggiornabili da qui**: il primo è un flusso
  Better Auth con verifica, il secondo sarebbe un'elevazione di privilegi. Non
  vengono "ignorati": il validator li rifiuta.
- `requestDeletion` conserva la data già fissata. Ricalcolarla a ogni richiesta
  spostava la scadenza in avanti di qualche millisecondo per click — la grace window
  dichiarata diventava una coincidenza che dipende da quanto due mutation ci mettono
  a girare (il test era rosso a intermittenza: 876 vs 877 ms).
- **Lo stato non è un commento**: `requireAppUser` rifiuta un account con
  `deletionRequestedAt` (misurato: `ACCOUNT_SCHEDULED_FOR_DELETION` su ogni chiamata
  autenticata). Nel legacy la grace window era una stringa dentro `banReason` e
  "programmato" e "usabile" non erano mutuamente esclusivi.
- Il purge elimina R2 **prima** delle righe: se un delete fallisce, le righe restano e
  il riferimento agli oggetti non si perde — il legacy lo diceva nel commento e poi
  cancellava l'utente comunque, rendendo il residuo irraggiungibile per sempre. Un
  account in quella condizione viene saltato e riprovato al giro successivo.
- L'eredità: un'organizzazione con altri membri non perde i dati, cambia proprietario
  (admin più anziano, altrimenti membro più anziano). Il test verifica l'organizzazione
  **per id**, non il totale: il provisioning dà a ogni utente un workspace, quindi il
  totale di due organizzazioni non direbbe nulla su cosa è successo a quella dell'owner.

## 4. Export GDPR

Il JSON non finisce più in una colonna: il legacy lo salvava come
`data:application/json;base64,…` dentro `download_url`, cioè un documento che cresce
fino a diventare la riga più grande del database, senza scadenza applicata da nessuno.
Qui il file vive su R2 (`exports/{appUserId}/{yyyy-MM}/{exportId}.json`, chiave
deterministica: una ri-esecuzione riscrive lo stesso oggetto), la riga tiene chiave,
dimensione e scadenza, e l'unico modo di leggerlo è un URL firmato per 5 minuti
generato dopo un controllo di proprietà.

Due note dichiarate:

- `downloadToken` non serve più. Esiste nel modello per parità con i record migrati,
  ma non viene popolato: un segreto di lunga durata in una riga è esattamente ciò che
  si vuole non avere.
- `subscriptions` è **vuoto per costruzione**. Nel legacy `creem_subscription.referenceId`
  era l'utente (modello B2C); nel modello B2B la subscription è dell'organizzazione
  (Task 6), quindi esportare lo stato di fatturazione di un'organizzazione come dato
  personale di un membro sarebbe esportare un contratto che non è suo.

## 5. Form pubblici: il bridge, e cosa attraversa

Contact, waiting list e RSVP pubblico hanno tre parti che cambiano di posto:

| Prima | Adesso |
|---|---|
| validazione Zod nella route | schema e regole in Convex (`publicForms.ts`, `rsvp.submit`) |
| honeypot/timing/disposable nel service Nuxt | `convex/lib/spam.ts`, soglie identiche al legacy (3s, stessa lista) |
| rate limit Redis nel middleware | limiter Convex, per IP e per indirizzo, chiavi come digest |
| IP passato ai service | **l'IP non attraversa il bridge** |

L'indirizzo resta nel Worker: viene calcolato `HMAC-SHA256(secret, "ceremly:public-forms:ip:v1\n" + ip)`
e viaggia solo il digest a 64 esadecimali. HMAC e non SHA puro perché lo spazio degli
indirizzi è enumerabile in minuti: senza chiave il digest sarebbe reversibile per
forza bruta. Il digest sta **dentro** i byte firmati, quindi un chiamante che lo
sostituisce invalida la firma — per questo il rate limit non è aggirabile
costruendo il body a mano.

La firma è la stessa del bridge storage (Task 7): `METHOD \n PATH \n TIMESTAMP \n
NONCE \n SHA256(canonical body)`. Il test di contratto carica l'implementazione del
Worker **e** il verificatore Convex, e verifica che quest'ultimo accetti la richiesta
che il primo firma; poi che una firma valida per `/public/contact` **non** valga per
`/public/rsvp`, e che sostituire il digest invalidi la firma.

Cosa non deve mai sembrare un successo: backend non raggiungibile, segreto assente e
configurazione incompleta sono tutti `503`, mai `200` — un invio che non è avvenuto
non deve leggersi come avvenuto. Un rifiuto del dominio conserva invece status e
messaggio (429 dal limiter, 400 dall'indirizzo usa-e-getta), e il messaggio arriva
al client in `statusMessage`, che è il campo che la UI legge già.

Il percorso completo ha anche un test al livello della porta (`t.fetch("/public/contact",
…)` in `convex/auxiliaryFlows.test.ts`): richiesta firmata accettata e riga scritta,
richiesta non firmata **e** richiesta firmata per un'altra path rifiutate con `401`,
`ipHash` in chiaro (o troncato) rifiutato con `400 IP_HASH_REQUIRED` **prima** di
toccare il dominio, e doppia iscrizione che resta una riga sola.

**Una cosa che il bridge non fa, e va detta**: il verificatore Convex non consuma i
nonce — il tracciamento single-use è del Worker, che è l'unico a vedere ogni
richiesta (dichiarato in `convex/lib/bridgeHmac.ts`). Un replay *della richiesta
firmata* dentro la finestra di 60s non è quindi rifiutato dalla firma: lo assorbono
l'idempotenza di dominio (dedup della waiting list, upsert dell'RSVP) e i limiti per
IP e per indirizzo. Il test della doppia iscrizione è la verifica di quella rete.

### Deviazioni dichiarate

- **Il ramo `convex` delle route non usa gli schemi Zod.** Il piano vuole la
  validazione di dominio solo in Convex, e due validatori sulla stessa richiesta sono
  due posti dove il contratto può divergere: la route legge il body e lo firma. Il
  ramo `legacy` resta intatto (schemi + service) fino al cutover.
- **`rsvp.submit` è una mutation pubblica** (il Task 11 aveva già motivato il perché:
  il GET legacy aveva side effect, e una query Convex non scrive). Il bridge la chiama
  aggiungendo la dimensione IP alla chiave del limite.
- **Il contract test dei domini usa-e-getta confronta i comportamenti, non le liste.**
  La lista legacy non è esportata: il test verifica che ogni dominio della copia Convex
  sia riconosciuto usa-e-getta anche dall'implementazione legacy. Il commento in
  `convex/lib/spam.ts` dichiarava un contratto che non esisteva; adesso esiste.

## 6. Site mode

Quattro modalità, e la quarta è nuova: `maintenance-readonly` chiude **solo le
scritture**. Serve al caso che il legacy non copriva — un intervento che richiede di
fermare le scritture senza togliere il sito a chi lo sta guardando — e la direzione
della lista è deliberata: non è un elenco di metodi bloccati ma un rovescio
dell'allowlist di lettura (`GET`/`HEAD`/`OPTIONS`), quindi un metodo nuovo o ignoto
resta **bloccato** per default.

`/api/auth/**` è l'unica eccezione alle scritture: crea sessioni, ma senza di essa
"le letture passano" sarebbe falso per la dashboard — un utente con la sessione
scaduta non potrebbe riaprirla.

L'enforcement è coperto da una matrice eseguibile (`test/migration/site-mode-middleware.test.ts`,
8 casi): ogni modalità × letture/scritture/pagine, i percorsi che nessuna modalità può
chiudere (inviti già recapitati, job, cron, il kill-switch stesso) e il caso che
sarebbe stato facile sbagliare — un metodo HTTP che non conosciamo (`PROPFIND`) non è
una lettura e si chiude. Il test carica il middleware vero con i tre polyfill Nitro
(`defineEventHandler`, `sendRedirect`, `useRuntimeConfig`) e verifica che senza il ramo
`maintenance-readonly` vada **rosso** — fatto, non dedotto.

La sorgente autorevole è la tabella `siteSettings` (una riga per chiave, valore
pubblico, scrittura solo superAdmin con audit), letta dal middleware con un timeout
di 800ms. **Fail-closed** significa una regola sola, ed è quella che il test pinna:
se la lettura non riesce si conserva l'ultima modalità **osservata** quando era una
modalità chiusa, e non si ricade mai su `active`. La regola vive in una funzione
pura (`resolveUnreachableSiteMode`) proprio per poterla verificare in tutti i casi —
quattro modalità osservate × l'env — invece che in un solo caso scelto da un test di
integrazione. L'integrazione verifica che la strada sia quella: una lettura riuscita
`maintenance`, l'orologio oltre il TTL della cache, poi un guasto → `maintenance`, non
l'env `active`. Verificato togliendo la regola (il test va rosso: `expected 'active' to
be 'maintenance'`).

**Buco residuo, dichiarato**: un'istanza **fredda** che non ha mai letto con successo
non può sapere cosa c'era e ricade sull'env. Coprirlo richiederebbe di trattare
"sconosciuto" come chiuso, cioè di mandare il sito in maintenance al primo hiccup di
Convex di ogni istanza nuova: un rimedio peggiore del problema, per un caso in cui la
env non può essere più permissiva di quanto l'operatore abbia configurato.

## 7. Cosa resta fuori, dichiarato

- **Nessuna run live di questo task.** Il bridge anonimo e la lettura del site mode
  sono verificati ermeticamente (firma, rifiuti, fail-closed); una run contro il
  Worker costruito e lo staging appartiene al rehearsal (Task 16), insieme allo script
  di export di dominio che oggi non esiste.
- **L'invio email non c'è**: `emailSent: false` è la verità di questo task, non un
  TODO nascosto. Le email dei form pubblici e della waiting list sono il Task 13.
- **`auditLogs.ipAddress`/`userAgent`** sono copiati dai record migrati ma **non
  popolati** dalle mutation Convex: una mutation non vede l'IP del chiamante. Per i
  form pubblici arriva il digest dell'IP (che è ciò che serve al limiter), per il
  resto serve una decisione del Task 13.
- **I flussi `events`/`guests`/`rsvp`/`reminders` del modello di costo** (Task 9)
  restavano `derived` perché non esistevano; adesso esistono e una loro run li
  trasforma in misure.
