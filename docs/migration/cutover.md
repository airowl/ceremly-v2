# Runbook di cutover blue-green (Task 17)

**Stato:** runbook scritto, **non eseguito**. L'esecuzione è il Task 18 e richiede un GO umano
esplicito, che oggi non esiste. Nessun passo di questo documento è stato applicato a un sistema
esterno (DNS, webhook, callback, Vercel, Convex, Neon, Creem): il Task 17 codifica, non esegue.

**Blu (legacy):** Nuxt su Vercel, Neon/Drizzle, Upstash (site mode, sessioni, rate limit), QStash,
Vercel Cron, webhook Creem su `/api/auth/creem/webhook`.
**Verde (target):** Nuxt su Cloudflare Workers (`cloudflare-module`), Convex (dati, auth, job,
cron, billing), stesso bucket R2, webhook Creem su `https://<prod>.convex.site/creem/events`.

Regola di fondo: **nessuna doppia scrittura**. In ogni istante un solo stack accetta scritture di
dominio. La finestra fra "il blu smette" e "il verde comincia" è `maintenance-readonly`: pagine,
login e letture pubbliche restano su, ogni scrittura riceve `503` + `Retry-After: 1800`.

Rollback: [`rollback.md`](./rollback.md). Il punto di non ritorno automatico è la **prima write
Convex** (definita lì in modo misurabile).

---

## 0. Prerequisiti (prima del GO)

Il GO non si chiede finché la sezione non è interamente vera. I punti marcati **BLOCCANTE** sono
aperti al 2026-09-25.

### 0.1 Bloccanti aperti

| # | Prerequisito | Stato |
|---|---|---|
| B1 | Gate `G04` (Google) e `G10` (alert di costo) `PASS` in `gates.md` | **BLOCCANTE** — entrambi `NOT_RUN` |
| B2 | Rehearsal live `PASS` < 24 h, stesso codice (blocco machine-readable di `rehearsal.md`) | **BLOCCANTE** — `BLOCKED` (staging da ripulire, vedi `rehearsal.md`) |
| ~~B3~~ | Import verso produzione. **Chiuso (fix round 1):** `convex-target.ts` ha una modalità produzione guardata (`resolveProductionTarget`): mai di default, richiede `--production`, `--confirm-deployment <prod:nome>` digitato uguale al `deployments.convexProduction` di un report di preflight `PASS` firmato (HMAC con la chiave di migrazione), non parziale, di produzione, stesso commit di HEAD, < 24 h; sanitizzazione env del Task 16 invariata; solo credenziali esplicite `MIGRATION_CONVEX_ADMIN_KEY` (`prod:<nome>\|…`) + `MIGRATION_CONVEX_URL`, nessun fallback sul login CLI. 20 casi ermetici, uno per rifiuto, più il caso positivo (`test/migration/convex-target.test.ts`). Mai eseguita | chiuso |
| ~~B4~~ | Read-only sul verde. **Chiuso (fix round 1):** ogni mutation/action pubblica Convex passa dai builder di `convex/lib/functions.ts`, che rifiutano con `SITE_READ_ONLY` secondo la matrice di `convex/lib/writeGuard.ts` (`domain` solo in `active`; `guest` — RSVP — in `active` e `waitinglist`; il cambio di modalità del superAdmin in ogni modalità, break-glass). Un test **enumera** le funzioni pubbliche e fallisce su una senza guardia (`convex/writeGuard.test.ts`). Anche **ogni endpoint Better Auth** chiamato direttamente sull'host `.convex.site` (fix round 2: `hooks.before` con la stessa allowlist del Worker — login password, verifica TOTP, logout e letture; sign-up, modifiche account, 2FA, OAuth, verifica email → `503`, provato attraverso il vero handler) e i form pubblici HTTP seguono la stessa matrice. Il passo 10 è quindi il vero interruttore | chiuso |
| B5 | Approvazione umana del runbook (GO) e della finestra | **BLOCCANTE** — Task 18 |

### 0.2 Prerequisiti operativi (verificati dal preflight o dalla checklist)

1. **Deploy legacy con la read-only del Task 17.** La produzione Vercel deve eseguire un build
   del commit di cutover con i flag legacy (`NUXT_NITRO_PRESET` assente → `vercel`,
   `NUXT_AUTH_BACKEND`/`NUXT_PUBLIC_FORMS_BACKEND`/`NUXT_SITE_MODE_BACKEND`/`NUXT_EMAIL_BACKEND`
   assenti → `legacy`). Una produzione che non contiene il middleware aggiornato **non ha** la
   modalità del passo 1: lì `maintenance-readonly` lascerebbe passare RSVP e job. Registrare
   l'id del deployment e taggare il commit (`git tag legacy-vercel-final <sha>`): è il target del
   rollback (`deployments.legacyVercelDeployment` / `legacyRollbackRef` nel blocco evidenze).
2. **Build del Worker di produzione.** Variabili di build/runtime:
   `NUXT_NITRO_PRESET=cloudflare`, `NUXT_AUTH_BACKEND=convex`, `NUXT_SITE_MODE_BACKEND=convex`,
   `NUXT_EMAIL_BACKEND=convex` e **`NUXT_PUBLIC_FORMS_BACKEND=convex` insieme al frontend
   Convex**: il frontend del Task 14 usa i bridge del Worker per contact/waiting list/RSVP; un
   frontend Convex con i form su `legacy` scriverebbe su Neon dopo il cutover.
   `NUXT_PUBLIC_CONVEX_URL`/`NUXT_PUBLIC_CONVEX_SITE_URL` del deployment di produzione: l'origine
   Convex è **cotta nella CSP al build** (`connect-src`), quindi cambiare URL = rifare il build
   (lo smoke lo verifica).
3. **Env del deployment Convex di produzione.** `BETTER_AUTH_SECRET` **uguale** a
   `NUXT_BETTER_AUTH_SECRET` (link di anteprima firmati, token d'invito org derivati HMAC, payload
   2FA cifrati — non va ruotato al cutover); `CREEM_*` live, `CREEM_WEBHOOK_SECRET` del nuovo
   endpoint, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `STORAGE_BRIDGE_URL`/`_SECRET`,
   `PUBLIC_FORMS_SECRET` (= `NUXT_PUBLIC_FORMS_SECRET`), `SITE_URL`, `GOOGLE_CLIENT_ID`/`_SECRET`,
   `SUPER_ADMIN_EMAIL_ALLOWLIST`. Il preflight verifica presenza dei segreti webhook e parità di
   `BETTER_AUTH_SECRET` (per digest, mai in chiaro).
4. **R2 CORS**: il bucket deve ammettere `PUT` dall'origine del sito (upload presign → PUT diretto
   → confirm, Task 14). Verificato dal preflight (`GetBucketCors`, sola lettura).
5. **Chiave di migrazione**: `MIGRATION_ENCRYPTION_KEY="$(openssl rand -base64 32)"`, 32 byte
   base64, viva solo nella shell del cutover, **la stessa** per full e delta. Non è
   `NUXT_MIGRATION_EXPORT_KEY` (passphrase esadecimale da 64 caratteri: rifiutata dal parser).
6. **Neon**: branch di backup della `main` di produzione creato < 24 h prima
   (`neonctl branches create --project-id <id> --parent main --name pre-cutover-<data>`),
   verificato dal preflight via API (GET). **Gotcha:** `pnpm db:migrate:prod` migra **DEV**
   (dotenv `override: false`): non usarlo mai nella finestra; se la produzione ha bisogno di una
   migrazione Drizzle, farla prima, con l'URL inline, e rimisurare il drift dello schema (il
   manifest dell'export lo riporta: sul branch dev mancano le colonne della `0011`).
7. **Import full di produzione** (T-1), in quest'ordine (il gate di produzione richiede un
   preflight `PASS`, e un `PASS` richiede già il verde in read-only):
   1. deployment Convex in `maintenance-readonly`, e ci resta fino al passo 10 — l'import usa
      funzioni interne, non guardate, quindi non ne è bloccato:
      `npx convex run --prod siteSettings:set '{"mode":"maintenance-readonly","reason":"cutover T-1"}'`;
   2. preflight T-1: `preflight.ts --environment production > .migration-cutover/preflight-t1.json`,
      `exit 0` (è il report che il gate del full T-1 accetta, valido 24 h);
   3. export full + import + reconcile con `--production --confirm-deployment prod:<nome>
      --preflight-report .migration-cutover/preflight-t1.json` (stessi comandi e variabili dei
      passi 4–5), `exit 0`, mentre il blu è ancora attivo.

   **Cron e job Convex sono inerti fuori da `active`** (final review C2): ogni cron di
   `convex/crons.ts` è un no-op loggato (`{ skipped: "site_mode" }`) e `jobs.run` lascia il job
   `pending`/`retrying` senza consumare tentativi. Dal passo 7.1 al passo 10 il verde quindi non
   manda reminder a ospiti, avvisi di cleanup, non cancella eventi, non esegue purge di account e
   non cancella oggetti dal bucket R2 **condiviso** con il blu. Il passo 7.1 va fatto **prima**
   dell'import: un deployment senza override vale `active`. Test enumerativo:
   `convex/siteModeSideEffects.test.ts`.

   Il giorno del cutover il preflight si rifà (passo 0.3, `preflight.json`): è quello che
   accettano delta e reconcile della finestra. Le righe portano `legacyId` e sono ricostruibili
   da Neon: non sono "write Convex" ai fini del rollback. `email_events` e `creem_subscription`
   entrano **da questo pipeline** (Task 16), non da un replay dei provider.
8. **DNS**: TTL del record del sito abbassato (valore approvato, es. 300 s) almeno un TTL vecchio
   prima della finestra; approvazione registrata nel blocco evidenze. Verificato dal preflight.
9. **Google OAuth**: redirect URI `https://<origine>/api/auth/callback/google` registrate per
   produzione **e** staging sul client Google (il Worker fa da proxy same-origin, il path non
   cambia). Attestazione nel blocco evidenze.
10. **Alert di costo** Convex/Cloudflare/Resend attivi (G10) — attestazione + gate.
11. **Comunicazioni**:
    - i vecchi link d'invito organizzazione `/invite/{id-del-plugin}` **non valgono più** dopo il
      cutover (gli inviti pendenti non sono migrati): estrarre prima gli inviti pendenti da Neon e
      chiedere agli invitanti di re-invitare dopo;
    - tutti gli utenti dovranno rifare il login (sessioni non migrate, passo 7);
    - una finestra di ≤ 30 min di sola lettura (RSVP, checkout, upload sospesi).
12. **Webhook Creem perso definitivamente**: dopo il cutover non esiste più un recupero lato utente
    (`reconcile-unlock` non è portato). Il recupero è la riconciliazione operatore
    `scripts/migration/reconcile-creem.ts` (sola lettura) + verifica dalla console admin.

### 0.3 Preflight (senza side effect)

```bash
# shell del cutover: valori di produzione esportati a mano, nessun file letto
export MIGRATION_ENCRYPTION_KEY=… NEON_API_KEY=… NUXT_QSTASH_TOKEN=… NUXT_BETTER_AUTH_SECRET=…
export NUXT_CF_ACCOUNT_ID=… NUXT_CF_ACCESS_KEY_ID=… NUXT_CF_SECRET_ACCESS_KEY=… NUXT_CF_R2_BUCKET_NAME=…
pnpm tsx scripts/migration/preflight.ts --environment production > .migration-cutover/preflight.json
echo "exit=$?"   # deve essere 0
```

Controlli (`PREFLIGHT_CHECK_IDS`): `gates` (G01–G10 `PASS`), `rehearsal` (`PASS` < 24 h, nessun
cambio di codice dal commit provato né codice non committato — deviazione dichiarata dal "stesso
SHA" letterale: sono ammessi commit che toccano solo `docs/`, `graphify-out/`, `.superpowers/`),
`neonBackup`, `exportKey`, `legacyJobs` (0 messaggi QStash
non terminali nelle ultime 72 h e DLQ vuota), `webhookSecrets`, `authSecretParity`, `dnsTtl`
(TTL **autoritativo** di A e CNAME, interrogando direttamente i name server della zona: il
resolver ricorsivo risponderebbe col TTL residuo della cache), `googleCallbacks`, `costAlerts`,
`r2Cors`, `deploymentIds` (anche: i build deployati — `builtFromCommit` — non differiscono in
codice da HEAD), `convexReadOnly` (il target Convex risponde `maintenance-readonly`). Un controllo che non riesce a
*provare* la propria condizione fallisce; un fallimento è `exit 1`. Rete solo in GET (guardia
`readOnlyFetch`), sottoprocessi solo `git rev-parse`/`git diff --name-only`/`convex env list`,
nessuna scrittura (nemmeno locale: il report va su stdout). Il report è firmato
(`hmac-sha256`, chiave derivata HKDF dalla chiave di migrazione) e contiene commit e id dei
deployment, mai segreti. La firma prova integrità e freschezza rispetto a chi detiene la chiave di
migrazione; non separa i ruoli (la stessa persona tiene chiave e deploy key): è una scelta
consapevole per un cutover con un solo operatore. Test: `test/migration/preflight.test.ts`.

**Esito misurato sullo stato attuale** (2026-09-25, `--environment staging`, commit `c68c5df` +
modifiche del Task 17, solo letture; ripetuto dopo il fix round 1 con 13 controlli, stesso esito più `convexReadOnly` FAIL per evidenza vuota): `exit 1`, 2 PASS. `gates` FAIL (G04, G10 `NOT_RUN`),
`rehearsal` FAIL (`BLOCKED`), `exportKey` FAIL (nessuna chiave in shell), `webhookSecrets` FAIL
(**`RESEND_WEBHOOK_SECRET` non impostato sul deployment Convex di staging**), `r2Cors` FAIL
(**`GetBucketCors` → HTTP 403** con le chiavi S3 di `.env`: sono chiavi per oggetti, non leggono la
configurazione del bucket — al cutover servono credenziali con lettura della config), le cinque
voci del blocco evidenze FAIL (non compilato); `legacyJobs` PASS (QStash dev: 0 messaggi, DLQ
vuota) e `authSecretParity` PASS. È l'esito corretto: nessuna delle condizioni è ancora vera.

### 0.4 Blocco evidenze (machine-readable, letto dal preflight)

Compilato dall'operatore il giorno del cutover; `null` = non ancora vero (il preflight fallisce).

<!-- preflight:evidence -->
```json
{
  "environment": "production",
  "siteOrigin": "https://ceremly.com",
  "convexSiteUrl": null,
  "neonBackup": { "projectId": null, "branchId": null },
  "dns": { "host": "ceremly.com", "approvedTtlSeconds": null, "approvedBy": null, "approvedAt": null },
  "google": {
    "productionOrigin": "https://ceremly.com",
    "stagingOrigin": null,
    "redirectUris": [],
    "verifiedBy": null,
    "verifiedAt": null
  },
  "costAlerts": { "convex": false, "cloudflare": false, "resend": false, "verifiedBy": null, "verifiedAt": null },
  "deployments": {
    "convexProduction": null,
    "workerVersion": null,
    "legacyVercelDeployment": null,
    "legacyRollbackRef": null,
    "builtFromCommit": null
  }
}
```

---

## Runbook (ordine esatto)

Ogni passo si registra nel **Registro di esecuzione** in fondo: ora UTC, comando, esito. Budget:
delta + reconcile ≤ 15 min, finestra read-only completa ≤ 30 min. Superato un budget o fallito un
controllo **prima del passo 10** → [`rollback.md`](./rollback.md) §A.

Variabili usate sotto: `HOST=ceremly.com`, `ADMIN=$NUXT_ADMIN_API_KEY` (legacy),
`W=<watermark del full T-1>`, `CX=<prod>.convex.cloud`, `CXS=<prod>.convex.site`.

### 1. Attiva read-only su Vercel

```bash
curl -fsS -X POST "https://$HOST/api/admin/site-mode" -H "X-Admin-API-Key: $ADMIN" \
  -H 'content-type: application/json' -d '{"mode":"maintenance-readonly"}'
sleep 20   # cache per-istanza del site mode: 10 s
curl -s -o /dev/null -w '%{http_code} retry-after=%header{retry-after}\n' -X POST "https://$HOST/api/public/invite/x/rsvp"   # 503 retry-after=1800
curl -s -o /dev/null -w '%{http_code}\n' "https://$HOST/"                                                                  # 200
```

Cosa resta aperto (`READONLY_ALLOWED_WRITES` in `shared/constants/siteMode.ts`): il toggle
`/api/admin/site-mode` (rollback), `POST /api/jobs/*` (drain), il webhook Creem (verità del
provider, finestra di retry corta), login password + TOTP e logout. Il login in read-only **non**
scrive `audit_log` (diventa una riga di log strutturata) e **non** esegue il self-heal
dell'organizzazione (`server/utils/authAudit.ts`): resta solo la sessione, effimera. Lo stesso
vale in `maintenance` (final review I2: il blu dopo il passo 10), dove il break-glass ammette solo
i path di login esatti — mai 2FA enable/disable, OAuth o sign-up. Il webhook
Resend risponde `503`: Svix ritenta per circa un giorno, quindi gli eventi arrivano allo stack
servito dal DNS dopo la finestra invece di essere scritti dopo il watermark. Tutto il resto che scrive —
RSVP, checkout, upload, profilo, account, org, admin, cron, OAuth, verifica email — è `503`.
L'elenco non è scritto a mano route per route: il test enumera `server/api/**` e fallisce su una
scrittura nuova non esplicitamente ammessa.

### 2. Ferma l'enqueue legacy

In read-only nessuna azione utente accoda job e ogni cron risponde `503` (i Vercel Cron che
scattano nella finestra falliscono senza effetti). Restano i messaggi già in QStash, che la
read-only **lascia consegnare** perché finiscano prima del watermark. Attendere lo svuotamento:

```bash
pnpm tsx scripts/migration/preflight.ts --environment production --only legacyJobs   # ripetere fino a exit 0
```

`exit 0` = 0 messaggi non terminali e DLQ vuota. Un messaggio in DLQ va risolto (rieseguito o
scartato con motivazione nel registro) **ora**: dopo il DNS verrebbe ri-consegnato allo stack verde.

### 3. Salva il watermark

Annotare nel registro: `W` (watermark del full T-1, dal suo `manifest.json`) e l'ora UTC corrente.
Da qui ogni scrittura su Neon è persa per costruzione, ed è per questo che i passi 1–2 vengono
prima. Il watermark del delta (passo 4) è scritto dall'export nel proprio manifest.

### 4. Export e import delta

```bash
export MIGRATION_ENCRYPTION_KEY=…   # la stessa del full
MIGRATION_SOURCE_CONFIRM=<ep-id prod> NUXT_DATABASE_URL=<url prod> \
  time pnpm tsx scripts/migration/export-neon.ts --out .migration-cutover/delta --mode delta --since "$W"
# modalità produzione (fix round 1): report del preflight GO del passo 0.3, nome digitato a mano
export MIGRATION_CONVEX_ADMIN_KEY=<deploy key prod:…> MIGRATION_CONVEX_URL=https://$CX NUXT_MIGRATION_API_KEY=<MIGRATION_API_KEY di prod>
time pnpm tsx scripts/migration/import-convex.ts --bundle .migration-cutover/delta \
  --production --confirm-deployment prod:<nome> --preflight-report .migration-cutover/preflight.json
```

Senza `--production` lo script va sullo staging di `.env.local`, come nel Task 16. Con
`--production` rifiuta se il report non è un preflight `PASS` completo, firmato, di produzione,
per lo stesso commit di HEAD e < 24 h, o se il nome digitato non è quello del report. L'import verifica tag/checksum di ogni file prima della prima scrittura; `upsert` delle righe
cambiate, `prune` delle righe sparite (figli prima dei padri).

### 5. Reconcile automatico

`reconcile.ts` non ha un target implicito (fix round 2): senza `--production` o `--staging`
rifiuta di partire; con `--production` rifiuta se Neon di produzione, `MIGRATION_SOURCE_CONFIRM` e
`NUXT_MIGRATION_API_KEY` non sono nella shell (`.env` darebbe i valori dev), e
`--first-write-check` esiste solo con `--production`. Così la misura che decide §A/§B non può
essere presa per errore su staging.

```bash
MIGRATION_SOURCE_CONFIRM=<ep-id prod> NUXT_DATABASE_URL=<url prod> \
  time pnpm tsx scripts/migration/reconcile.ts --manifest .migration-cutover/delta/manifest.json \
  --out .migration-cutover/reconcile-delta.json \
  --production --confirm-deployment prod:<nome> --preflight-report .migration-cutover/preflight.json   # exit 0 obbligatorio
```

Count/checksum per tabella, riferimenti, R2 (presenza, chiavi in più, dimensione), piani/limiti,
customer/subscription/order Creem. `exit 1` → rollback §A.

### 6. Checklist manuale

- [ ] login password di un account reale di test (e uno con 2FA) sul **verde** via host di
      anteprima del Worker (non ancora sul DNS);
- [ ] un planner reale: numero di eventi/ospiti in Convex = Neon (dal report del reconcile);
- [ ] un evento Celebration sbloccato mostra il tier corretto; un'organizzazione Atelier ha la
      subscription nel componente Creem;
- [ ] un file R2 esistente si apre dal verde (URL firmato);
- [ ] `webhookEvents` e `jobExecutions` del deployment di produzione: nessuna riga applicativa
      oltre a quelle dell'import;
- [ ] inviti org pendenti estratti per la comunicazione (0.2 §11).

### 7. Invalida le sessioni legacy

Le sessioni non si migrano. Sul blu, cancellare le chiavi di sessione di Better Auth dalla
`secondaryStorage` Upstash con lo script dedicato (legge le liste `active-sessions-*`, poi cancella
solo quelle e i token che elencano; rifiuta `site:mode` e qualunque chiave non di sessione) —
**mai** un flush o un `DEL` per pattern: `site:mode` tiene la read-only del passo 1.

```bash
export NUXT_UPSTASH_REDIS_REST_URL=… NUXT_UPSTASH_REDIS_REST_TOKEN=…   # Upstash di produzione
pnpm tsx scripts/migration/invalidate-legacy-sessions.ts             # dry run: conta liste e token
pnpm tsx scripts/migration/invalidate-legacy-sessions.ts --execute   # cancella
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://$HOST/api/public/invite/x/rsvp"   # ancora 503: read-only intatta
```

 Sul verde
un cookie legacy è sconosciuto a Convex e vale come anonimo. `BETTER_AUTH_SECRET` **non** si
ruota (2FA). Effetto sul rollback: chi torna sul blu rifà il login.

### 8. Cambia callback Google, webhook Creem, DNS

0. **Verifica che il verde rifiuti le scritture** — prima di toccare Google, Creem o DNS:
   ```bash
   curl -fsS "https://$CXS/public/site-mode"      # {"mode":"maintenance-readonly"} — altrimenti STOP
   pnpm tsx scripts/migration/preflight.ts --environment production --only convexReadOnly   # exit 0
   ```
   Se la risposta non è `maintenance-readonly`: `npx convex run --prod siteSettings:set
   '{"mode":"maintenance-readonly","reason":"cutover 8.0"}'`, poi ripetere la verifica. Con il
   verde in `active` il primo utente sul nuovo DNS scriverebbe su Convex e il rollback §A sparirebbe
   prima dello smoke.
1. **Google**: verificare le redirect URI registrate (0.2 §9) e che `GOOGLE_CLIENT_*` siano
   nell'env Convex; il path `/api/auth/callback/google` non cambia (proxy same-origin).
2. **Creem**: endpoint webhook da `https://$HOST/api/auth/creem/webhook` a
   `https://$CXS/creem/events`, con il segreto uguale a `CREEM_WEBHOOK_SECRET` di Convex.
   Da questo momento un pagamento scrive su Convex: vedi la definizione di "prima write" in
   `rollback.md`. Il webhook Resend **non cambia URL** (il Worker lo inoltra a Convex con
   `NUXT_EMAIL_BACKEND=convex`): cambia solo chi lo serve quando cambia il DNS; nella finestra
   read-only risponde `503` su entrambi gli stack e Svix ritenta dopo.
3. **DNS**: il record di `$HOST` passa al Worker (custom domain Cloudflare). Annotare l'ora; la
   propagazione è bounded dal TTL approvato.

### 9. Smoke read-only

Il deployment Convex è in `maintenance-readonly` dal T-1 (0.2 §7), riverificato al passo 8.0.

```bash
pnpm tsx scripts/migration/smoke-production.ts --read-only --base-url "https://$HOST" \
  --convex-url "https://$CX" --convex-site-url "https://$CXS"      # exit 0 obbligatorio
export MIGRATION_SOURCE_CONFIRM=<ep-id prod> NUXT_DATABASE_URL=<url prod> NUXT_MIGRATION_API_KEY=<MIGRATION_API_KEY di prod>
export MIGRATION_CONVEX_ADMIN_KEY=<deploy key prod:…> MIGRATION_CONVEX_URL=https://$CX
pnpm tsx scripts/migration/reconcile.ts --manifest .migration-cutover/delta/manifest.json \
  --out .migration-cutover/reconcile-first-write.json --first-write-check \
  --production --confirm-deployment prod:<nome> --preflight-report .migration-cutover/preflight.json   # misura la "prima write"
```

Lo smoke fa solo GET più una query Convex (`/api/query`, che non può scrivere): home con HSTS e
CSP che ammette l'origine Convex del build, `/login`, sessione anonima, site mode Convex, query
HTTP. Il secondo reconcile è la misura del punto di non ritorno: righe `only_in_target` o nuovi
`webhookEvents` = **write Convex avvenute**. Con la guardia Convex (B4 chiuso) le scritture degli
utenti sono rifiutate, quindi l'unica fonte attesa è un webhook Creem arrivato dopo il passo 8.2.
Esito ≠ 0 → rollback §A se nessuna write, altrimenti §B.

### 10. Abilita le scritture Convex — punto di non ritorno

```bash
# L'interruttore vero: fino a qui ogni mutation/action pubblica rispondeva SITE_READ_ONLY.
npx convex run --prod siteSettings:set '{"mode":"active","reason":"cutover GO <ticket>"}'
curl -fsS "https://$CXS/public/site-mode"                              # {"mode":"active"}
curl -fsS -X POST "https://<legacy>.vercel.app/api/admin/site-mode" -H "X-Admin-API-Key: $ADMIN" \
  -H 'content-type: application/json' -d '{"mode":"maintenance"}'     # il blu non scrive più, mai
pnpm tsx scripts/migration/smoke-production.ts --write-canary --base-url "https://$HOST" \
  --convex-url "https://$CX" --convex-site-url "https://$CXS"         # SMOKE_CANARY_INVITE_TOKEN di un invito canary
```

Da qui vale solo `rollback.md` §B.

### 11. Monitor intensivo (≥ 2 h, poi 24 h ridotto)

- error rate e latenza del Worker (Cloudflare observability), log Convex (funzioni in errore);
- `jobExecutions`: nessun `dead`; email consegnate (Resend), webhook Resend ricevuti (anche i
  ritentativi Svix degli eventi rimandati dalla finestra read-only);
- webhook Creem ricevuti in `webhookEvents`; `reconcile-creem.ts --prod` (sola lettura) a +1 h e +24 h;
- login password/Google/2FA reali, RSVP reali, upload;
- dashboard costi Convex/Cloudflare/Resend vs `cost-model.md`.

---

## Step 5 del piano — default Cloudflare **solo dopo GO** (in attesa di GO)

Non applicato: il piano lo lega all'approvazione manuale del runbook, che non esiste. La modifica
esatta da applicare dopo il GO (e dopo aver taggato `legacy-vercel-final`, che resta deployabile
su Vercel con `NUXT_NITRO_PRESET=vercel`):

1. in `nuxt.config.ts`, una costante sola decide il target, con default Cloudflare:
   ```ts
   const nitroPreset = process.env.NUXT_NITRO_PRESET || "cloudflare";
   const isCloudflare = nitroPreset === "cloudflare";
   // nitro.preset:
   preset: isCloudflare ? "cloudflare-module" : nitroPreset,
   ```
   e ogni `process.env.NUXT_NITRO_PRESET === "cloudflare"` del file (compatibilityDate, replace,
   alias `sharp`, `vite.build.rollupOptions`, `experimental`) diventa `isCloudflare` — altrimenti
   il default cambierebbe il preset ma non le condizioni che lo accompagnano;
2. rimuovere `nitro.vercel.config.crons` (i sei cron vivono in `convex/crons.ts`); il commit
   `legacy-vercel-final` li conserva per il rollback;
3. i build locali che usano `NUXT_NITRO_PRESET=node-server` non cambiano; `build:cloudflare`
   resta esplicito.

---

## Registro di esecuzione (Task 18)

| Ora UTC | Passo | Comando / azione | Esito | Operatore |
|---|---|---|---|---|
| — | — | — | — | — |
