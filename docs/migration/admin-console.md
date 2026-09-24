# Task 15 — console `/admin` su Convex

**Stato: code-complete ermeticamente (2026-09-24), verifica browser NON eseguita.**
La console è scritta, coperta da 29 casi `convex-test` (più 13 casi di site mode /
break-glass) e verde su build/typecheck — inclusi i fix round 1–2 della review;
la spec Playwright esiste (`test/migration/admin-console-live.test.ts`) ma **non è
stata eseguita**: richiede un deployment con due account reali (un superAdmin e un
utente normale) e questo ambiente non ha credenziali di staging. È parte del
rehearsal del Task 16.

La console legacy (`server/api/admin/**`, protetta da `X-Admin-API-Key`) **resta
intatta** (blue-green): la rimozione è del Task 19. La console nuova non usa API
key: è basata sulla sessione Better Auth e sul ruolo globale `appUsers.globalRole`.

## Capacità

| Pagina | Letture | Scritture (motivazione obbligatoria, audit) |
|---|---|---|
| `/admin` | `overview` (utenti, superAdmin, account in cancellazione, org, job per stato, export per stato, site mode), `eventMetrics` (eventi per stato, Celebrazione, sbloccati, conversione, RSVP sì/no/forse), `billingMetrics` (abbonamenti Atelier attivi, stati, esiti webhook recenti) | `setSiteMode` (imposta o ripristina il default) |
| `/admin/users` | `searchUsers` (prefisso email su `by_email`, altrimenti più recenti), `getUser` (membership, export GDPR, attività recente) | `setGlobalRole` (`user` ↔ `superAdmin`; mai sul proprio account) |
| `/admin/organizations` | `searchOrganizations` (prefisso slug su `by_slug`), `getOrganization` (membri, conteggio eventi, piano, abbonamenti in lettura, cliente Creem, limiti piano/effettivi/override, audit recente) | `setOrganizationLimits` (override per-org); azioni **non distruttive** `reconcileOrganizationBilling` (confronto mirror ↔ Creem, sola lettura su entrambi i lati, al massimo 10 abbonamenti) e `customerPortalLink` (link al portale cliente da girare al titolare) |
| `/admin/events` | `searchEvents` (prefisso slug, oppure per organizzazione su `by_organization_created`), `getEvent` (ospiti attivi, RSVP, limiti effettivi, presenza di checkout/ordine) | — |
| `/admin/jobs` | `listJobs` per stato, `listExports` per stato | `retryJob` (`dead`/`failed` → `pending`) |
| `/admin/audit` | `listAudit` (per autore, organizzazione o azione esatta; altrimenti per data) | — |

**Non esiste, per scelta:** impersonazione, cambio password, delete irreversibili
(nessun endpoint admin cancella dati; l'override dei limiti si "cancella"
svuotando i campi, e la storia resta nell'audit). **Billing:** solo i due wrapper non
distruttivi sopra, via l'astrazione Creem esistente (`creem.sdk.subscriptions.get`,
`creem.customers.portalUrl`), con motivazione. L'audit è in due tempi (fix round 2):
`admin.billing_*_requested` **prima** della chiamata (intento, rate limit) e l'esito
**dopo** (`admin.billing_reconciled` / `admin.billing_portal_link_created`, con
`status: "failure"` e `errorCode` se il provider fallisce) — mai un record di successo
per qualcosa che non è avvenuto. Il mirror degli abbonamenti resta scritto solo dal webhook: la verifica
riporta le differenze, non le ripara (il rimedio è la riconsegna del webhook dalla
dashboard Creem). Disdette, rimborsi e cambi piano non esistono nella console.

### Limiti personalizzati: tabella nuova, non migrata

`user_custom_limits` è stata eliminata con il pricing B2B (`domain-schema.md`,
deviazione 1): non c'era nulla da importare. La console aveva bisogno dei "limiti
custom", quindi il Task 15 introduce `organizationLimitOverrides` — **per
organizzazione**, non per utente, perché ogni limite è applicato all'organizzazione.
Un campo assente = vale il piano; `-1` = illimitato; valori ammessi: interi da
`-1` a un massimo per limite (`LIMIT_MAXIMA`: ospiti per evento 10.000, eventi attivi
500, promemoria 50). Il massimo non è estetico: ogni punto di enforcement legge fino a
`limite + 1` documenti nella transazione che crea la risorsa. Il conteggio degli eventi
attivi in `events.create` non fa più `collect()` di tutti gli eventi del tenant: usa
l'indice `by_organization_tier_status` con due `take(limite + 1)` (draft, active). L'override è letto da **ogni** punto di enforcement
(`resolveEventLimits` → ospiti e reminder; `events.create` → eventi attivi;
`billing.planForActiveOrganization` → i limiti mostrati all'utente) tramite
`convex/lib/limitOverrides.ts`, ed è rimosso dalle due cascade di cancellazione
dell'organizzazione (`organizations.deleteOrganization`, purge account).

## Modello di autorizzazione

1. **`requireSuperAdmin(ctx)`** (`convex/lib/authorization.ts`) è la prima
   istruzione di ogni handler pubblico di `convex/admin.ts`. Si appoggia a
   `requireAppUser`: anonimo → `UNAUTHENTICATED`; non provisioned →
   `APP_USER_NOT_PROVISIONED`; account in cancellazione → rifiutato anche se
   superAdmin; utente normale → `SUPER_ADMIN_REQUIRED`.
2. **Una sola porta pubblica** (fix round 1): `jobs.retryDead` e
   `siteSettings.set/clear` sono diventate `internal` (porta della CLI del
   deployment, `npx convex run …`, che è anche il break-glass estremo) e richiedono
   anch'esse la motivazione, auditata con `source: "deployment_cli"` e senza attore.
   La porta pubblica è solo `api.admin.*`. Il test `convex/admin.test.ts` **enumera
   gli export pubblici del modulo** (matrice anonimo/utente/superAdmin) e **scansiona
   ogni sorgente Convex**: un controllo superAdmin fuori da `convex/admin.ts` fa
   fallire la suite (unica eccezione dichiarata: la regola di dominio legacy di
   `files.uploadAuthz`, che è `internal`).
3. **Scritture:** `reason` non vuota dopo il trim (max 500), rate limit bucket
   `admin` (60/min per superAdmin), audit nella stessa transazione con attore
   (`actorAppUserId`/`actorAuthUserId`), target (`targetType`/`targetId`),
   timestamp (`createdAt`), motivazione (`details.reason`) e dettagli (`from`/`to`,
   nome del job, tentativi precedenti…). Azioni nuove nella tassonomia:
   `admin.super_admin_bootstrapped`, `admin.role_changed`, `admin.limits_updated`
   (più le esistenti `admin.site_mode_changed`, `admin.job_retried`).
4. **Nessun segreto né testo libero del provider in uscita:** le letture passano da
   proiezioni esplicite. Mai `invitations.tokenHash`, token ospite,
   `downloadToken`/`downloadUrl`/`storageKey` degli export, valori del payload dei job
   (solo i nomi dei campi), metadata Creem. Gli errori memorizzati
   (`jobExecutions.lastError`, `dataExports.errorMessage`) escono solo come **codice**
   (`errorCode`: codice `ConvexError`, costante, `HTTP_<status>` o `UNCLASSIFIED`), e il
   retry non copia più il testo nell'audit (`lastErrorCode`). I `details` dell'audit
   passano da una **proiezione ad allowlist** (`projectAuditDetails`): solo chiavi
   note, valori primitivi (un livello per `from`/`to`), nessuna stringa che sembri un
   URL o un token, nessuna chiave che nomini una credenziale; il resto è scartato e
   contato (`omittedDetails`). Coperto da un test che semina valori sentinella (token,
   hash, URL, testo del provider con un indirizzo email) e verifica che nessuna
   risposta li contenga.
5. **Frontend:** `app/middleware/admin.ts` chiede `api.admin.whoami` (che è esso
   stesso una funzione admin: non esiste una sonda pubblica del ruolo) e rimanda
   alla dashboard su qualsiasi errore. È una comodità: il layout `admin.vue` non
   monta la pagina finché `whoami` non risponde, e il gate vero resta Convex.
6. **Cosa la console può fare fuori da `active`** (final review M3): solo cambiare modalità
   (`admin.setSiteMode`, policy `siteModeSwitch`). Ogni altra write della console —
   `retryJob`, `setOrganizationLimits`, `setGlobalRole` e anche la verifica Creem di sola
   lettura `reconcileOrganizationBilling` (un'action con policy `domain`) — risponde
   `SITE_READ_ONLY` in `waitinglist`, `maintenance-readonly` e `maintenance`. È voluto (nella
   finestra del cutover nessuna write deve partire) ma va saputo: per un job da riprendere o un
   limite da cambiare durante una manutenzione si torna in `active` o si usa la CLI del
   deployment (`npx convex run jobs:retryDead`, con motivazione). E dalla C2 i job ripresi
   partono comunque solo in `active`.
7. **Break-glass del site mode** (fix round 1): in `maintenance` e `waitinglist` la
   shell `/admin/**`, il login diretto alla console (`/login?redirect=/admin…`) e le
   sole API di sessione di Better Auth restano raggiungibili — dalla final review I2 per
   **path esatto**: `sign-in/email`, `two-factor/verify-totp`,
   `two-factor/verify-backup-code` (il superAdmin senza dispositivo TOTP), `get-session`,
   `sign-out` e il token Convex in sola lettura; mai sign-up, OAuth, 2FA enable/disable.
   Lo stesso insieme vale sull'host `.convex.site` (`authEndpointAllowed`, che in
   `maintenance-readonly` segue invece `READONLY_ALLOWED_WRITES`, senza backup code). In
   `maintenance` il login legacy non scrive `audit_log` né esegue il self-heal
   dell'organizzazione (`server/utils/authAudit.ts`), come in read-only: middleware server, middleware client
   e catch-all `/api/auth` usano lo stesso predicato (`isAdminBreakGlass` in
   `shared/constants/siteMode.ts`). Così la console può annullare la modalità che ha
   impostato. Un non-admin che ci arriva vede solo il rifiuto della console. I test
   (`site-mode-middleware.test.ts`, `admin-break-glass.test.ts`) hanno trovato anche un
   difetto preesistente: in `waitinglist` una pagina bloccata con una query string
   (`/login?x=y`) passava, perché il predicato confrontava il path con la query; ora la
   query è rimossa prima del confronto. Le
   pagine sono CSR (`routeRules` `/admin/**` e `/en/admin/**`), escluse da sitemap
   e robots, e usano solo `useConvexQuery`/`useConvexMutation` (gate
   `frontend-data-layer.test.ts` verde).

### Query indicizzate e limiti di lettura

Ricerche = intervalli di prefisso su indice (`by_email`, `by_slug`); liste =
`paginate` con pagina clampata a 100; filtri audit = un indice per filtro
(`by_actor`, `by_organization`, `by_action`, `by_created_at`). I contatori della
dashboard leggono al massimo i tetti di `METRIC_CAPS` in `convex/admin.ts` e
restituiscono `capped: true` quando li toccano (la UI mostra `≥ N`):

| Contatore | Tetto |
|---|---|
| utenti, organizzazioni, account in cancellazione | 4.000 |
| job per stato, export per stato | 500 |
| eventi (dashboard; il documento porta l'intero invito) | 500 più recenti |
| risposte RSVP | 4.000 |
| organizzazioni lette per lo stato billing (una query al componente Creem ciascuna) | 200 più recenti |
| (ogni contatore restituisce `{ total, capped }`; le ripartizioni — per stato, sì/no/forse, stati degli abbonamenti, esiti webhook — portano un flag `sampled` e la UI le marca come campione; la conversione campionata è marcata `≈`) | |
| esiti webhook | ultimi 100 |
| dettaglio org: eventi / dettaglio evento: ospiti, RSVP | 1.000 / 2.000 |

Ogni query resta ben sotto il limite Convex di 16.384 documenti letti per
transazione. Oltre questi volumi servono contatori materializzati (fuori scope).

## Bootstrap del primo superAdmin

1. La persona si registra normalmente (il trigger crea `appUsers` con
   `globalRole = "user"`).
2. Sul deployment: `npx convex env set SUPER_ADMIN_EMAIL_ALLOWLIST "ops@dominio,altra@dominio"`
   (virgole; spazi e maiuscole sono normalizzati).
3. `npx convex run admin:bootstrapSuperAdmin '{"email":"ops@dominio"}'`.

La mutation è `internal` (non raggiungibile da un client) e rifiuta:
allowlist vuota/assente (`SUPER_ADMIN_ALLOWLIST_EMPTY`), email fuori lista
(`EMAIL_NOT_ALLOWLISTED`), account non ancora registrato (`APP_USER_NOT_FOUND`) e
**qualsiasi chiamata quando esiste già un superAdmin** (`SUPER_ADMIN_ALREADY_EXISTS`).
Da lì in poi i ruoli cambiano solo da `setGlobalRole`: superAdmin esistente,
motivazione, audit; un superAdmin non può cambiare il proprio ruolo, quindi la
console non può restare senza amministratori. Dopo il bootstrap si può svuotare
l'allowlist.

## Cosa non è stato eseguito / limiti noti

- **Spec Playwright non eseguita** (nessuna credenziale di staging qui). Come
  eseguirla: `ADMIN_E2E=live ADMIN_E2E_BASE_URL=… ADMIN_E2E_ADMIN_EMAIL=…
  ADMIN_E2E_ADMIN_PASSWORD=… ADMIN_E2E_USER_EMAIL=… ADMIN_E2E_USER_PASSWORD=…
  ADMIN_E2E_ORG_SLUG=… pnpm test:e2e:admin`, con Chromium installato
  (`pnpm exec playwright install chromium`), l'account admin promosso via bootstrap
  e almeno un `jobExecutions` in stato `dead` (inserito dalla dashboard Convex: la
  spec non lo fabbrica e fallisce con un messaggio esplicito se manca). Verifica:
  redirect del non-admin, accesso admin, cambio limite con motivo (bottone
  disabilitato senza), retry del job, record di audit con autore, destinatario,
  orario, motivazione e dettagli.
- **Break-glass non provato dal vivo:** il predicato e i middleware sono coperti da
  test, ma il giro completo (impostare `maintenance` dalla console e riaprire il sito
  dalla stessa console) va fatto nel rehearsal del Task 16. Se anche il browser è
  inutilizzabile: `npx convex run siteSettings:clear '{"reason":"…"}'`.
- **Deviazione di interfaccia:** il Task 13 dichiarava `api.jobs.retryDead`; ora è
  `internal.jobs.retryDead` (con `reason`), e la porta pubblica è `api.admin.retryJob`.
  Nessun chiamante nell'app usava quella pubblica.
- **Verifica billing:** la risposta del provider non viene persistita (solo l'audit
  della richiesta con gli id controllati); il risultato è mostrato all'operatore.
- Gli audit Convex non hanno IP/User-Agent (lacuna già dichiarata in
  `domain-schema.md`, deviazione 6).
