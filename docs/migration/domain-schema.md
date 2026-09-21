# Modello di dominio Convex e import domain-safe (Task 10)

Questo documento registra quello che il codice esegue, non quello che si intendeva
fare: la mappa delle tabelle, le regole di traduzione, il protocollo di import e —
la parte che conta di più — **le deviazioni dal piano e i buchi dichiarati**.

Riferimenti: `convex/schema.ts`, `convex/model/validators.ts`,
`convex/migrations/domainImport.ts`, `shared/migration/domainBatch.ts`,
`convex/lib/domainBatchDigest.ts`.

## La mappa

Ogni riga è una tabella del database Neon che diventa una tabella Convex. `legacyId`
è su **ogni** record migrato: senza, una riga non è deduplicabile, non è
riferibile e una ri-esecuzione la duplica.

| Legacy (Neon) | Convex | Note |
|---|---|---|
| `user` | `appUsers` | solo il profilo applicativo. `authUserId` è l'id del **componente** Better Auth (importato nel Task 4, quindi gli id sono cambiati): risolto per email. Le colonne auth (name, image, emailVerified, createdAt, updatedAt, twoFactorEnabled) restano del componente; `banned`/`banReason`/`banExpires` non hanno equivalente (plugin admin non attivo); `creemCustomerId` è del componente Creem; `hadTrial`, `tosAcceptedAt`, `phone`, `bio`, `timezone` non hanno consumatore oggi |
| `organization` | `organizations` | `metadata` ignorato (mai letto dall'app) |
| `member` | `memberships` | |
| `invitation` | `invitations` | la tabella legacy **non ha colonna token**: vedi "deferral" |
| `events` | `events` | completata; `tier`/`creemOrderId`/`creemCheckoutId`/`unlockedAt` erano già lì dal Task 6 e **non** sono state rinominate |
| `projects` | `projects` | |
| `guests` | `guests` | `email` memorizzata normalizzata; `removedAt` resta il soft-delete |
| `event_reminders` | `eventReminders` | `pending` sostituisce l'indice parziale `enabled AND sent_at IS NULL` |
| `rsvp_responses` | `rsvpResponses` | una riga per ospite (upsert su `guestId`) |
| `guest_activities` | `guestActivities` | `meta.reminderId` promosso a colonna indicizzata |
| `file` | `files` | `basePath` derivato dal path; `fileName`/`storageProvider`/`variantsGeneratedAt` ignorati |
| `email_suppressions` | `emailSuppressions` | globale, non org-scoped (un bounce è oggettivo) |
| `email_events` | `emailEvents` | append-only; reference risolte *best-effort* |
| `audit_log` | `auditLogs` | `ipAddress`/`userAgent` copiati; attore/org *best-effort* |
| `contact_messages` | `contactMessages` | la chiave `serial` diventa `legacyId` |
| `waiting_list` | `waitingList` | email univoca normalizzata |
| `data_exports` | `dataExports` | |
| `user_custom_limits` | — | **non migrata**: la tabella è stata eliminata (modello B2B legacy) — vedi deviazioni |
| `creem_subscription` | — | proprietà del componente Creem (`persistSubscriptions`), non dello schema applicativo |
| `site_settings` (chiave Redis `site:mode`) | `siteSettings` | nuova: un override in cache volatile non è ispezionabile. Il lettore arriva col Task 12 |
| — | `jobExecutions` | nuova (Task 13: retry/backoff/DLQ). Nel legacy non esisteva alcuna tabella di job |
| — | `migrationRecords` | nuova: il journal che rende l'ordine verificabile |

## Le quattro regole di traduzione

1. **Timestamp → epoch millisecondi** (`v.number()`), la rappresentazione che il
   file usa già da `files`/`auditLogs`.
2. **Colonna nullable → campo opzionale**, con l'API che materializza `null` in
   uscita: una colonna nullable non ha un terzo stato da distinguere.
3. **JSON validato alla scrittura, non solo in TypeScript.** `blocks`,
   `rsvpConfig`, `answers`, `theme`, `distribution` hanno validators runtime
   (`convex/model/validators.ts`): un blocco invito malformato fallisce
   all'inserimento invece di esplodere nel renderer — cosa che nel legacy era
   possibile, perché il tipo esisteva solo nel compilatore.
   Eccezione misurata: `distribution` ha tutti i campi opzionali perché la colonna
   legacy è `jsonb DEFAULT '{}'`, quindi righe con `{}` esistono davvero e un
   validator stretto **bloccherebbe l'import** su dati che l'app accetta.
4. **Vincoli che Convex non esprime → sostituto dichiarato**, mai abbandonati:
   - `slug UNIQUE` → indice `by_slug` + controllo nel dominio (`create`/`update`/import).
   - `UNIQUE (event_id, lower(email)) WHERE …` → `email` normalizzata + indice
     `by_event_email`, con il filtro sul soft-delete applicato dal chiamante.
   - `UNIQUE (event_id, days_before) WHERE sent_at IS NULL` → controllo nel dominio.
   - indice parziale `WHERE enabled AND sent_at IS NULL` → campo esplicito `pending`.
   - indice su espressione `(meta->>'reminderId')` → colonna `reminderId` indicizzata.

## L'import

`internal.migrations.domainImport.importBatch` è l'unico ingresso. Un batch = una
tabella + indici di batch; l'intera chiamata è **una mutation, quindi una
transazione**: un record rifiutato annulla il suo batch, e non esiste uno stato
"mezzo importato".

- **Ordine topologico applicato.** Un batch può partire solo se ogni tabella che
  i suoi record *effettivamente referenziano* è già stata importata (una riga in
  `migrationRecords`). Le tabelle referenziate si derivano dalla stessa
  dichiarazione `refs` usata per risolvere, quindi il cancello non può
  contraddire ciò che sorveglia. Conseguenza operativa: **anche una tabella vuota
  va inviata** — è la riga di journal che prova che il prerequisito è stato
  gestito.
- **Idempotenza per chiavi naturali.** Non per watermark: le chiavi sono quelle
  che lo schema legacy vincolava davvero (`slug`, `token`, `(eventId,email)`,
  `(organizationId,userId)`, `downloadToken`, `(organizationId,sha256)`…). Un
  batch ri-tagliato con watermark successivo non duplica nulla, e una riga già
  esistente (profilo creato al primo login) viene **adottata** e le si attacca il
  `legacyId` invece di affiancarle un duplicato.
- **Foreign key logiche con politica esplicita.** `strict` per le chiavi
  tenant-critical (`organizationId`, `eventId`, `guestId`, `userId`,
  `variantOf`): un valore presente ma non risolvibile rifiuta il batch.
  `best-effort` per provenienza e telemetria (`uploadedBy`, reference di
  `emailEvents`, attore/org di `auditLogs`): degradano ad assente e vengono
  **contate** in `danglingRefs`.
- **Coerenza di tenant.** Risolvere un riferimento prova che il padre *esiste*,
  non a chi appartiene: il legacy aveva lo stesso punto cieco (ogni tabella
  portava il proprio `organization_id` e nessuno li confrontava). Guest/reminder/
  RSVP/activity/variante devono appartenere all'organizzazione e all'evento
  giusti, o il batch è rifiutato con `INCOHERENT_TENANT_REFERENCE`.
- **Digest verificato.** `sha256` copre i byte canonici di
  `{version, table, batchIndex, watermark, records}`; l'importer lo ricalcola e
  rifiuta il batch se non combacia, quindi un export troncato o modificato non
  scrive nulla. Il formato è in `shared/migration/domainBatch.ts` e il mirror
  Convex è pinnato da `test/migration/domain-batch-contract.test.ts` (12 casi:
  parità di ordine e dipendenze, byte identici, ordine delle chiavi, `undefined`,
  `Date`).

## Deferral: due record che NON vengono importati

Sono fatti sui dati, non corruzione, e in entrambi i casi servono una decisione
umana prima del cutover. Sono contati e nominati per batch (`deferred`), mai persi
in silenzio.

- **`pendingInvitation`** — la tabella `invitation` del legacy non ha colonna
  token (verificato in `server/database/schema/auth.ts`): Better Auth non
  memorizzava il token da nessuna parte, quindi un invito in attesa **non è
  migrabile**. Va riemesso. Inventare un hash sarebbe peggio di non migrarlo:
  sarebbe una credenziale che nessuno ha mai ricevuto, e se derivabile sarebbe
  anche indovinabile. Per coerenza `invitations.tokenHash` è diventato opzionale:
  un invito importato in stato terminale non ha token, e resta fuori
  dall'indice `by_token_hash` (non accettabile, per costruzione).
- **`globalFileWithoutOrganization`** — `file.organization_id` era nullable
  (`ON DELETE SET NULL`) e il modello Convex richiede un tenant: un file senza
  organizzazione richiede una decisione di collocazione, non un default.

## Deviazioni dal piano (misurate)

1. **`customLimits` non esiste più.** Il piano lo elenca (Step 1), ma la tabella
   `user_custom_limits` è stata eliminata con il modello pricing B2B legacy
   (`drizzle/migrations/manual/drop_user_custom_limits.sql`) e lo schema Drizzle
   non la contiene: non c'è nulla da migrare. Non è stata ricreata.
2. **`organizationInvitations` → `invitations`.** Il piano nomina la tabella con
   il nome del plugin; il Task 5 l'ha già creata come `invitations` ed è quella
   che il codice usa: mantenuta, non rinominata.
3. **`siteSettings`, `jobExecutions`, `migrationRecords` sono nuove**, come il
   piano prevede: non hanno un corrispettivo legacy da importare.
4. **`guests.email` normalizzata all'import** (trim + lowercase), come il Task 4
   aveva già fatto per le email di account: è la regola con cui il vincolo legacy
   `lower(email)` confrontava, quindi due indirizzi che Postgres considerava
   uguali restano uguali qui.
5. **`files` richiede un'organizzazione** e `variantOf` è `strict` (il piano:
   "rifiutare … variante senza parent").
6. **`auditLogs.ipAddress`/`userAgent` sono copiati ma non popolati dalle
   mutation Convex**: una mutation non vede l'IP del chiamante. Le righe nuove
   avranno l'audit completo su attore/org/target/dettagli ma non l'origine; è una
   lacuna dichiarata, non un campo nascosto.

## Cosa non è ancora provato

- **L'import live non è stato eseguito**: nessun batch reale è passato su staging.
  La suite ermetica (30 casi in `convex/migrations/domainImport.test.ts`) gira sul
  runtime Convex reale e sui validators reali, e il contratto del protocollo è
  pinnato, ma la prova end-to-end su una copia dei dati di produzione appartiene
  al Task 16 — insieme allo script di export che oggi **non esiste** (esiste solo
  `scripts/migration/export-auth.ts`, per le credenziali).
- **Il tetto di 3 reminder per evento** e l'unicità `(eventId, daysBefore)` sono
  applicati nel codice di dominio, che è il Task 11: qui la tabella è pronta, la
  regola no.
- **`waitingList.ipAddress`/`userAgent`** sono copiati per parità: la finalità e
  la retention di quei dati personali richiedono una decisione prima del cutover.
