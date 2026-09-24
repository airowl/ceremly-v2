# Rehearsal di migrazione (Task 16)

**Data:** 2026-09-24
**Commit del codice eseguito:** `6fbe3c5` (`feat(migration): add encrypted rehearsal pipeline`)
**Sorgente:** Neon, branch dev, endpoint `ep-mute-fire-a2bap0v4` (`NUXT_DATABASE_URL` di `.env`) — mai `.env.prod`, mai `ep-dark-dream*`
**Target:** Convex `dev:wary-spaniel-466` (team `airowl`, progetto `ceremly-staging`, `.env.local`)
**Chiave:** `MIGRATION_ENCRYPTION_KEY` effimera (`openssl rand -base64 32`), viva solo nella shell del rehearsal, mai scritta su disco né committata. `NUXT_MIGRATION_EXPORT_KEY` di `.env` è una passphrase esadecimale da 64 caratteri, non una chiave base64 da 32 byte: non è stata usata.
**Artefatti:** `.migration-rehearsal/` (git-ignored, directory `0700`, file `0600`): bundle cifrati, manifest, inventario, stdout. Nessuna riga in chiaro su disco.

## Verdetto

**NON PASS — rehearsal live BLOCCATO (`NEEDS_CONTEXT`).**

La parte che non scrive su Convex è eseguita e verde (inventario, due full export, un delta
export, verifica integrale dei bundle, prove di manomissione). L'import e il reconcile live
**non sono stati eseguiti**: il codice dei Task 10–16 non è deployabile su staging senza una
scelta distruttiva che questo task non è autorizzato a fare da solo (sotto). Anche a
blocco rimosso il rehearsal non potrà dichiararsi `PASS` finché `G04` e `G10` restano `NOT_RUN`.

### Il blocco, misurato

`npx convex dev --once` (deploy del codice corrente su `wary-spaniel-466`) fallisce la
validazione dello schema:

```
✖ Schema validation failed.
Document … in table "events" does not match the schema: Object is missing the required field `blocks`.
```

Staging contiene **8 documenti `events` con la forma del Task 6** — solo
`organizationId`, `tier`, `creemCheckoutId`, (6/8) `creemOrderId` — scritti dal gate G07
(`order_gate_*`, `checkout_gate_*`). Lo schema del Task 10 rende obbligatori `blocks`,
`title`, `slug`, `type`, … e Convex rifiuta di deployare uno schema che i dati esistenti
violano. Conseguenza più ampia del blocco stesso: **il deployment di staging esegue ancora il
codice dell'era Task 6–9**. Nessuna funzione dei Task 10–15 (import di dominio, API di
dominio, job, console admin) è mai stata live: `migrations/reconcileSnapshot:tablePage`
risponde `FUNCTION_NOT_FOUND`.

Censimento dello staging (forme dei documenti, nessun contenuto): `events` 8 (tutti stub
G07), `appUsers` 29, `organizations` 29, `memberships` 37, `invitations` 8, `auditLogs` 138,
`webhookEvents` 22, `rateLimitBuckets` 9, `migrationHealth` 2; componente Better Auth: 7
utenti, 28 account, 2 righe 2FA, 47 sessioni. Nessuna riga con `legacyId`, `migrationRecords`
vuoto: nessun import di dominio è mai avvenuto.

**Decisione richiesta (una delle due):**

1. cancellare gli 8 stub `events` del gate G07 su `wary-spaniel-466` (dati sintetici, nessun
   figlio: non esistono `guests`/`eventReminders` su staging), poi deployare; oppure
2. il reset completo dello staging che l'evidenza G03–G05 aveva già previsto per questo task
   ("Staging leftovers to purge at the rehearsal … Task 16's rehearsal reset removes all of it").

Il design dell'import **non** richiede un target pulito (idempotente, reconcile limitato alle
righe con `legacyId`): serve solo a sbloccare il deploy dello schema.

## Comandi eseguiti

```bash
export MIGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)"   # effimera, solo in memoria
npx tsx scripts/migration/inventory.ts   --out .migration-rehearsal/inventory.json
npx tsx scripts/migration/export-neon.ts --out .migration-rehearsal/full-1
npx tsx scripts/migration/export-neon.ts --out .migration-rehearsal/full-2
npx tsx scripts/migration/export-neon.ts --out .migration-rehearsal/delta-1 \
  --mode delta --since 2026-09-24T21:37:31.828Z                # watermark di full-1
npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/<full-1|full-2|delta-1> --verify-only
# prove negative: un byte alterato in una copia di full-1; full-2 con un'altra chiave
MIGRATION_ENCRYPTION_KEY=… pnpm test:gate:g03-g05             # regressione del formato bundle, live
npx convex dev --once                                          # FALLITO: vedi "Il blocco"
```

## Inventario (sorgente reale, snapshot `2026-09-24T21:37:31Z`)

Versione schema sorgente: 12 righe in `drizzle.__drizzle_migrations`, ultimo hash `e8571305…`.
Checksum = SHA-256 del JSON canonico di tutte le righe ordinate per id (prefisso di 16).

| Tabella | Classe | Destino | Righe | Checksum |
|---|---|---|---:|---|
| `user` | production | imported → `betterAuth.user` + `appUsers` | 5 | `7daccaaa1cd2ef92` |
| `account` | production | imported → `betterAuth.account` | 6 | `781408eb2414cb91` |
| `two_factor` | production | imported → `betterAuth.twoFactor` | 2 | `2e8f48cdaa7d1df9` |
| `session` (Redis) | ephemeral | not-imported | — | — |
| `verification` | ephemeral | not-imported | — | — |
| `organization` | production | imported | 1 | `ff250a6448a5d4f7` |
| `member` | production | imported | 1 | `b4b711577c964c7d` |
| `invitation` | production | imported (pending → deferred) | 0 | `4f53cda18c2baa0c` |
| `events` | production | imported (tier/ordini Creem inclusi) | 1 | `8e23909ba8c3c7a7` |
| `projects` | production | imported | 0 | `4f53cda18c2baa0c` |
| `guests` | production | imported | 1 | `9b7410d659545764` |
| `event_reminders` | production | imported | 3 | `7bd007206171c166` |
| `rsvp_responses` | production | imported | 0 | `4f53cda18c2baa0c` |
| `guest_activities` | production | imported | 1 | `103d4459e77943da` |
| `file` | production | imported | 0 | `4f53cda18c2baa0c` |
| `email_suppressions` | production | imported | 0 | `4f53cda18c2baa0c` |
| `email_events` | production | imported | 0 | `4f53cda18c2baa0c` |
| `data_exports` | production | imported | 0 | `4f53cda18c2baa0c` |
| `audit_log` | production | imported | 502 | `ed3f935eb3adbe77` |
| `contact_messages` | production | imported | 0 | `4f53cda18c2baa0c` |
| `waiting_list` | production | imported | 0 | `4f53cda18c2baa0c` |
| `creem_subscription` | production | not-imported (esportato, riconciliato) | 0 | `4f53cda18c2baa0c` |
| oggetti R2 | production | manifest-only | — | — |
| Redis rate limit | ephemeral | not-imported | — | — |
| Redis `site:mode` | regenerable | not-imported (lo imposta il runbook) | — | — |
| `drizzle.__drizzle_migrations` | regenerable | solo `manifest.schemaVersion` | 12 | — |

Tabelle solo-Convex (nessuna sorgente legacy), classificate in `scripts/migration/inventory.ts`
e pinnate da un test che fallisce su una tabella nuova non classificata:
`organizationLimitOverrides` e `webhookEvents` **production** (mai da azzerare dopo il
cutover), `inviteTestRequests`, `rateLimitBuckets`, `migrationHealth` **ephemeral**,
`jobExecutions`, `siteSettings`, `migrationRecords` **regenerable**.

## Export e verifica (eseguiti)

| Passo | Risultato | Tempo (processo / lavoro) |
|---|---|---|
| inventario | 26 voci, count/checksum dalla sorgente | 2,0 s |
| full export 1 | 26 file cifrati + manifest, watermark `2026-09-24T21:37:31.828Z` | 1,0 s / 272 ms |
| full export 2 | 26 file, **checksum per tabella identici** a full-1 | 1,0 s / 303 ms |
| delta export (da full-1) | 27 file: auth/org/member reinviati interi (per design), 0 righe cambiate nelle tabelle con `updatedAt`/`createdAt`, 21 liste id cifrate | 0,9 s / 272 ms |
| verify-only full-1 / full-2 / delta-1 | digest file = manifest, tag GCM valido, digest batch valido | 0,3 / 0,5 / 0,3 s |
| byte alterato in un batch | rifiutato prima di decifrare: `File digest mismatch` | — |
| chiave diversa | rifiutato: `Migration bundle failed authentication` | — |
| scansione plaintext dei `.enc` | 0 file contengono `createdAt`, `organizationId`, `scrypt`, `@gate`, `example.com` | — |
| `pnpm test:gate:g03-g05` (formato bundle nuovo) | **6/6 PASS** live su `wary-spaniel-466` (seed → export cifrato → import → login) | 12,9 s |

Il gate G03–G05 è l'unico import live di questo task: usa `migrations/authImport:importBatch`
già deployato (Task 4) e prova che il nuovo formato `CEREMLY-MIGRATION-V1` porta le
credenziali fino al login reale. Ha ruotato i backup code di `gate-two-factor-v2@`, come
previsto dal gate.

## Scoperte sulla sorgente (reali, non ipotesi)

1. **Drift di schema sul branch dev.** Il registro Drizzle ha 12 righe ma le colonne della
   `0011_reliability_guards` non esistono: mancano `event_reminders.processing_at` e
   `file.variants_generated_at`. Un export guidato dallo schema Drizzle falliva
   (`column "processing_at" does not exist`); `export-neon.ts` ora legge `SELECT *` e scrive
   il drift nel manifest invece di fallire o perdere colonne.
2. **Colonna in più:** `email_events.svix_id` esiste nel DB dev (fix Resend) ma non nello
   schema Drizzle di questo branch. Viene esportata col nome DB e l'import la segnalerebbe in
   `unknownColumns`: la spec `emailEvents` del Task 10 **non** la mappa su `svixId`, quindi al
   cutover l'id Svix delle righe storiche andrebbe perso (dedup dei webhook ripetuti). 0 righe su
   dev; da decidere prima del cutover (Task 17).
3. Prima di un rehearsal su una copia di produzione va misurato lo stesso drift su prod: il
   manifest lo riporta, non lo corregge.

## Risultati per voce

| # | Voce | Stato | Evidenza / motivo |
|---|---|---|---|
| 1 | cifratura autenticata (formato, round trip, chiave errata, byte alterato, niente plaintext) | **PASS** | `test/migration/crypto.test.ts` 13/13; prove negative sopra |
| 2 | inventario dalla sorgente reale | **PASS** | tabella sopra; `reconcile.test.ts` › inventory |
| 3 | export a watermark consistente (REPEATABLE READ, batch ≤100, `fill(0)`) | **PASS** | 2 full + 1 delta, checksum stabili |
| 4a | import: verifica tag/checksum prima di scrivere | **PASS** | `--verify-only` × 3, manomissione rifiutata |
| 4b | import live (auth + dominio topologico) — full #1 | **NOT_RUN** | bloccato dal deploy |
| 4c | import live — full #2 (replay idempotente) | **NOT_RUN** | bloccato dal deploy |
| 4d | import live — delta (upsert + prune) | **NOT_RUN** | bloccato dal deploy; ermetico: 7 casi in `domainImport.test.ts`, 4 in `auth-import.test.ts` |
| 4e | reconcile live (count/checksum, riferimenti, R2, piani, Creem, exit code) | **NOT_RUN** | `tablePage` non deployata; ermetico: `reconcile.test.ts` 21/21, `reconcileSnapshot.test.ts` 3/3 |
| 5a | password (G03) | **PASS** | gate G03–G05 live 6/6 |
| 5b | Google linking (G04) | **NOT_RUN** | nessun client Google di staging; la riga account `google` sopravvive (caso 6 del gate), il round trip OAuth no |
| 5c | 2FA (G05) | **PASS** | gate G03–G05 live |
| 5d | isolamento tenant | **NOT_RUN** live | ermetico verde (`pnpm test:gate:g06` nella suite `convex/`); live richiede il deploy |
| 5e | RSVP, checkout, webhook replay (G07 live, incl. caso aggiornato dopo i cambi di ruolo del Task 14b) | **NOT_RUN** | richiede il codice Task 10+ deployato |
| 5f | file legacy, varianti, CORS R2 e upload presign → PUT R2 → confirm (Task 14) | **NOT_RUN** | richiede deploy + 0 file nella sorgente dev |
| 5g | job retry | **NOT_RUN** live | ermetico verde (`convex/jobs.test.ts`) |
| 5h | admin (`pnpm test:e2e:admin`, Task 15) | **NOT_RUN** | richiede deploy, un'origine Nuxt su `NUXT_AUTH_BACKEND=convex` e due credenziali di staging |
| 5i | realtime a due browser (Task 14) | **NOT_RUN** | richiede deploy e un'origine app |
| 6a | delta + reconcile ≤ 15 min | **NOT_RUN** | misurato solo l'export delta (0,9 s); import e reconcile non eseguiti |
| 6b | maintenance simulata ≤ 30 min | **NOT_RUN** | — |
| G10 | alert di budget | **NOT_RUN** | fuori da questo task, invariato |

## Stima dei tempi (non una misura)

Su questa sorgente (5 utenti, 502 righe di audit) l'import costa circa una chiamata
`convex run` per batch: 1 chiamata auth + 22 batch di dominio in full, ~8 in delta (auth,
org, membri e tabelle senza `updatedAt` sono reinviati interi), più una lettura paginata per
tabella nel prune e nel reconcile. È un'ordine di grandezza di minuti, non la misura che il
gate chiede: **il gate 6a/6b resta `NOT_RUN` finché i tempi non sono cronometrati live.**

## Ripresa (dopo la decisione sul blocco)

```bash
npx convex dev --once                                            # deploy Task 10–16 su wary-spaniel-466
export MIGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)"
npx tsx scripts/migration/export-neon.ts   --out .migration-rehearsal/full-1
npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/full-1
npx tsx scripts/migration/reconcile.ts     --manifest .migration-rehearsal/full-1/manifest.json --out .migration-rehearsal/reconcile-full-1.json
npx tsx scripts/migration/export-neon.ts   --out .migration-rehearsal/full-2
npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/full-2   # replay: 0 imported
npx tsx scripts/migration/export-neon.ts   --out .migration-rehearsal/delta-1 --mode delta --since <watermark full-2>
time npx tsx scripts/migration/import-convex.ts --bundle .migration-rehearsal/delta-1
time npx tsx scripts/migration/reconcile.ts --manifest .migration-rehearsal/delta-1/manifest.json --out .migration-rehearsal/reconcile-delta-1.json
```

Il reconcile scrive l'elenco completo dei mismatch (id legacy + colonna, mai valori) nel
report `--out`; lo stdout porta count, prefissi dei checksum e l'exit code.

## Limiti dichiarati del pipeline

- **Plaintext in memoria.** I buffer JSON cifrati sono azzerati (`fill(0)`); le stringhe
  JavaScript delle righe no (immutabili, gestite dal GC). Su disco non arriva nulla in chiaro.
- **Argomenti di `convex run`.** I record viaggiano come argomento della CLI (l'unica porta
  verso le funzioni `internal*`), quindi sono visibili a `ps` sulla macchina che esegue
  l'import. Batch limitati a 350 KB per stare sotto `ARG_MAX`.
- **Delta basato su `updatedAt`.** Le tabelle senza colonna di modifica sono reinviate intere;
  un `updatedAt` non aggiornato dal legacy lascerebbe una riga vecchia — il reconcile la vede
  (`field_mismatch`, exit 1) e la cura è un full in modalità delta.
- **Prune.** Cancella solo righe con `legacyId`, figli prima dei padri; non propaga alle tabelle
  solo-Convex (`inviteTestRequests`, `organizationLimitOverrides`), vuote prima del cutover. Un
  utente cancellato nel legacy perde `appUsers` ma non la credenziale del componente (che non
  ha `legacyId`): il reconcile auth la conta come `only_in_target`.
- **`creem_subscription`** non ha un percorso d'import nel componente Creem: è esportata e
  riconciliata (una subscription legacy mancante fa fallire il reconcile). 0 righe su dev.
- **R2:** si confrontano chiave, dimensione e SHA-256 delle righe `files`; l'HEAD di ogni
  oggetto nel bucket non è eseguito (stesso bucket, chiavi invariate) — verifica del Task 17.
