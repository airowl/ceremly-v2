# Business logic e API di dominio in Convex (Task 11)

Questo documento registra quello che il codice esegue: la mappa dei moduli, le
regole portate **alla lettera** dal legacy, le deviazioni dichiarate (compresa una
deriva trovata leggendo il legacy e chiusa qui) e ciò che resta deliberatamente
fuori dal task.

Riferimenti: `convex/events.ts`, `convex/guests.ts`, `convex/rsvp.ts`,
`convex/reminders.ts`, `convex/projects.ts`, `convex/lib/domain.ts`,
`convex/domain.test.ts`.

## La mappa

| Legacy | Convex | Nota |
|---|---|---|
| `server/services/event.service.ts` | `events.list/get/create/update/remove/stats` | stessi controlli, stesso ordine, stessi messaggi |
| `server/services/guest.service.ts` | `guests.list/get/create/update/softDelete/importRows` | `importRows` prende righe già normalizzate, come `importGuests` |
| `distribution.service.markWhatsappSent` | `guests.markSent` | bozza → `active`, attività `invite_sent` per ospite, audit `invite.sent` |
| `publicInvite.service.getPublicInvite` | `rsvp.publicInvite` | **mutation** (vedi deviazioni) |
| `publicInvite.service.submitRsvp` | `rsvp.submit` | validazione autoritativa + sanificazione |
| `publicInvite.service.trackEmailOpen` | `rsvp.trackEmailOpen` | pixel `emailOpenedAt`, idempotente |
| `reminder.service.listReminders/saveReminders` | `reminders.list/save` | il cron resta fuori (Task 13) |
| `server/services/project.service.ts` | `projects.list/get/create/update/remove` | |
| `shared/constants/templates.ts` | `convex/lib/inviteTemplates.ts` | **spostato**, e `shared/` lo ri-esporta |
| `shared/constants/rsvpPresets.ts` | `convex/lib/rsvpPresets.ts` | idem |
| `shared/utils/rsvpLogic.ts` | `convex/lib/rsvpLogic.ts` | idem: la validazione gira dove scrive il dato |

Il re-export (`export * from "../../convex/lib/..."`) non è una copia: c'è **una**
sorgente per ciascun modulo, quindi client ed editor non possono divergere dal
backend. I tre moduli importano solo *tipi* da `shared/types/ceremly.ts`, quindi
entrano nel bundle client senza trascinare codice Convex; il build di Nuxt e del
Worker è stato eseguito dopo lo spostamento (vedi verifica).

## Le regole portate alla lettera

Sono le regole che rendono sicuro un endpoint pubblico o che l'organizzatore usa
come dato di lavoro. Ognuna è pinnata in `convex/domain.test.ts`.

1. **404 indistinguibile** per token inesistente, ospite rimosso ed evento in
   bozza: nessuna enumerazione di token, nessuna differenza osservabile.
2. **Payload campo per campo**, mai spread della riga: dal payload pubblico non
   escono `organizationId`, email, telefono, note, token, id interni.
3. **No answer injection**: si persistono solo le risposte delle domande
   *visibili* secondo la logica condizionale, e solo per chiavi presenti nella
   config. Una risposta di un ramo nascosto non entra nel database.
4. **Un solo ospite attivo per `(evento, email)`**, con email normalizzata in
   scrittura; rimuovere l'ospite libera l'indirizzo.
5. **Limite ospiti del tier effettivo** (Free 30, Celebrazione 250, Atelier ∞).
6. **Soft-delete**: il link muore, la risposta resta. Le statistiche dell'evento
   non contano più l'ospite; `rsvpResponses` conserva la riga.
7. **Deadline e chiusura**: l'invito resta visibile, la submission è rifiutata con
   il messaggio configurato (`DEFAULT_RSVP_CLOSED_MESSAGE` come fallback).
8. **Upsert della risposta**: `submittedAt` è la *prima* compilazione e non cambia
   agli aggiornamenti; `declineMessage` esiste solo su `attending='no'` ed è
   azzerato cambiando risposta; attività `rsvp_submitted` / `rsvp_updated`.
9. **Reminder**: massimo 3 (Free/Celebrazione) contando **anche i già inviati** —
   contarli come cancellati permetterebbe di superare il limite svuotando il form;
   un reminder inviato è immutabile (skip silenzioso, come il legacy); `pending` è
   il derivato di `enabled && !sentAt`.
10. **mark-sent**: bozza → `active`; evento chiuso → rifiutato; audit `invite.sent`;
    una attività `invite_sent` per ospite, come il legacy.

Trasversali, dal Task 10/11: l'organizzazione non arriva **mai** dall'input
(`requireActiveOrganization`), ogni by-id passa da `requireOwnedEvent` /
`requireOwnedGuest` e un record altrui è "non trovato", non "vietato"; l'audit è
scritto **nella stessa transazione** della scrittura; il delete di un evento
cascata sull'intero grafo (ospiti, risposte, attività, reminder).

## La deriva trovata (e chiusa)

**`sentAt` è il primo invio, non l'ultimo.** Il port scriveva `sentAt: now` a ogni
marcatura; il legacy usa `COALESCE(sent_at, now())` in
`distributionRepository.ts`, quindi un reinvio aggiorna il canale ma **non**
cancella la data del primo invito. È il tipo di differenza che nessun tipo segnala
e che l'organizzatore nota solo quando non sa più quando ha invitato qualcuno.
Corretto in `guests.markSent`, con un test che **fallisce senza la correzione**
(verificato rimuovendola: `expected 1790025297065 to be 111`). Il test usa un
valore sentinella invece di `Date.now()`: due mutation nello stesso millisecondo
darebbero lo stesso timestamp e il test passerebbe anche con il bug.

## Le deviazioni dichiarate

1. **`rsvp.publicInvite` è una mutation, non una query.** Il GET del legacy aveva
   side effect (`openCount`, `firstOpenedAt`, attività `link_opened`) e una query
   Convex non può scrivere. Il contatore è un dato che l'organizzatore legge, e
   spostarlo in una mutation separata che il client può non chiamare lo
   renderebbe una bugia.
2. **`guests.list` non è paginata**: restituisce l'elenco completo più il
   `summary` (totali, confermati, in attesa, rimossi). Il piano proponeva
   `{ cursor, limit }`, ma la pagina ospiti lavora sull'aggregato dell'evento; il
   limite del tier (250) rende il full-scan una scelta, non un incidente.
3. **`importRows` invece di `importCsv`** (nome del piano): il legacy
   `importGuests` riceve righe già validate da `importGuestsSchema`, e il parsing
   CSV non è mai stato del servizio. Il nome dice cosa fa la mutation.
4. **`projects.list({ paginationOpts })`**: la convenzione di paginazione di
   Convex, non `{ cursor, limit }`.
5. **Il token ospite è verificato per unicità in scrittura.** Il legacy si
   affidava a un indice UNIQUE e ritentava sul `23505`; Convex non ha indici
   unici, quindi la collisione è cercata e il token rigenerato (fino a 5
   tentativi). Una collisione non risolta darebbe due ospiti con lo stesso link —
   cioè un invito che apre la pagina di un altro.
6. **Un audit che non si può scrivere annulla la scrittura.** Nel legacy
   `logAudit` inghiottiva l'errore per non rompere la richiesta; qui l'audit è
   nella transazione, quindi non esiste una modifica senza traccia.
7. **Nessuna funzione pubblica accetta un `organizationId`.** Il validator degli
   argomenti **rifiuta** la chiave extra (pinnato da un test che verifica il
   messaggio d'errore), quindi non esiste un percorso di codice che possa
   leggerla.
8. **Il limite di eventi attivi Free non ha più TOCTOU.** Era un check-then-insert
   su HTTP; una mutation Convex è serializzabile, quindi due create concorrenti
   non possono più leggere lo stesso conteggio.

## Cosa non è in questo task (dichiarato, non silenzioso)

| Non portato | Dove vive | Perché |
|---|---|---|
| `processDueReminders` | `server/services/reminder.service.ts` | dispatcha un job per ospite: la coda è il Task 13. Qui c'è lo **stato** che quel job leggerà (`pending`) |
| `sendInvites`, `sendTest`, `applyInvitePlaceholders`, `buildGuestInviteLink`, `buildGuestPixelUrl`, `getPublicBaseUrl` | `distribution.service.ts` | invio email/WhatsApp → Task 13 |
| `getGuestQrPng` | `guest.service.ts` | generazione immagine/R2 → task media |
| `exportGuestsCsv` | `guest.service.ts` | flusso di export → task export |
| `recordGuestOpen` (apertura email via webhook Resend) | `emailEvent.repository.ts` | Task 13. **Non è la stessa cosa del pixel**: il webhook fa `openCount+1`, `emailOpenedAt` = *ultima* apertura, `firstOpenedAt` = prima; il pixel fa solo `emailOpenedAt` alla prima apertura. Il port copre il pixel, quindi oggi l'ospite che apre solo l'email non entra in `firstOpenedAt` |
| `ipAddress`/`userAgent` su `auditLogs`/`guestActivities` | — | una mutation Convex non vede l'IP del chiamante; il valore verrà dal bridge Worker (Task 12) |

## Verifica

| Comando | Esito |
|---|---|
| `vitest run convex/domain.test.ts` | **38 PASS** (characterization: eventi, tenant isolation, ospiti, invito pubblico, RSVP, reminder, audit/progetti, statistiche) |
| `vitest run convex/` | 161 PASS (7 file) |
| `pnpm test:migration` | 252 passati / 27 saltati |
| `pnpm typecheck:convex` | pulito |
| `eslint convex/ shared/ test/migration/` | 0 errori (2 warning in `_generated/`, preesistenti) |
| `pnpm build` | successo — il re-export `shared/ → convex/lib/` entra nel bundle client e server |

I 38 casi sono scritti **dal comportamento legacy**, non dal codice nuovo: le
asserzioni sui messaggi di errore riportano il testo del legacy
(`La risposta a «…» è obbligatoria.`), i conteggi replicano le `FILTER (WHERE …)`
del repository, e l'ordine della lista eventi è fissato su `createdAt` con un
patch esplicito perché due eventi creati nello stesso millisecondo non ordinano.
Dove un'asserzione non poteva fallire, il test è stato reso deterministico: è la
lezione del Task 9, dove un gate verde non poteva diventare rosso.
