# Task 15 — console `/admin` su Convex

**Stato: code-complete ermeticamente (2026-09-24), verifica browser NON eseguita.**
La console è scritta, coperta da 23 casi `convex-test` e verde su build/typecheck;
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
| `/admin/organizations` | `searchOrganizations` (prefisso slug su `by_slug`), `getOrganization` (membri, conteggio eventi, piano, abbonamenti **sola lettura**, cliente Creem, limiti piano/effettivi/override, audit recente) | `setOrganizationLimits` (override per-org) |
| `/admin/events` | `searchEvents` (prefisso slug, oppure per organizzazione su `by_organization_created`), `getEvent` (ospiti attivi, RSVP, limiti effettivi, presenza di checkout/ordine) | — |
| `/admin/jobs` | `listJobs` per stato, `listExports` per stato | `retryJob` (`dead`/`failed` → `pending`) |
| `/admin/audit` | `listAudit` (per autore, organizzazione o azione esatta; altrimenti per data) | — |

**Non esiste, per scelta:** impersonazione, cambio password, delete irreversibili
(nessun endpoint admin cancella dati; l'override dei limiti si "cancella"
svuotando i campi, e la storia resta nell'audit). **Billing in sola lettura:** le
modifiche agli abbonamenti restano nella dashboard Creem / portale cliente, dove il
provider è la fonte di verità — la console non ha un secondo percorso di scrittura.

### Limiti personalizzati: tabella nuova, non migrata

`user_custom_limits` è stata eliminata con il pricing B2B (`domain-schema.md`,
deviazione 1): non c'era nulla da importare. La console aveva bisogno dei "limiti
custom", quindi il Task 15 introduce `organizationLimitOverrides` — **per
organizzazione**, non per utente, perché ogni limite è applicato all'organizzazione.
Un campo assente = vale il piano; `-1` = illimitato; valori ammessi: interi in
`[-1, 1_000_000]`. L'override è letto da **ogni** punto di enforcement
(`resolveEventLimits` → ospiti e reminder; `events.create` → eventi attivi;
`billing.planForActiveOrganization` → i limiti mostrati all'utente) tramite
`convex/lib/limitOverrides.ts`, ed è rimosso dalle due cascade di cancellazione
dell'organizzazione (`organizations.deleteOrganization`, purge account).

## Modello di autorizzazione

1. **`requireSuperAdmin(ctx)`** (`convex/lib/authorization.ts`) è la prima
   istruzione di ogni handler pubblico di `convex/admin.ts`. Si appoggia a
   `requireAppUser`: anonimo → `UNAUTHENTICATED`; non provisioned →
   `APP_USER_NOT_PROVISIONED`; account in cancellazione → rifiutato anche se
   superAdmin; utente normale → `SUPER_ADMIN_REQUIRED`. Lo stesso helper ora
   protegge `jobs.retryDead` e `siteSettings.set/clear` (prima avevano ciascuno la
   propria copia del controllo).
2. Il test `convex/admin.test.ts` **enumera gli export pubblici del modulo** e
   fallisce se ne viene aggiunto uno senza il caso anonimo/utente/superAdmin.
3. **Scritture:** `reason` non vuota dopo il trim (max 500), rate limit bucket
   `admin` (60/min per superAdmin), audit nella stessa transazione con attore
   (`actorAppUserId`/`actorAuthUserId`), target (`targetType`/`targetId`),
   timestamp (`createdAt`), motivazione (`details.reason`) e dettagli (`from`/`to`,
   nome del job, tentativi precedenti…). Azioni nuove nella tassonomia:
   `admin.super_admin_bootstrapped`, `admin.role_changed`, `admin.limits_updated`
   (più le esistenti `admin.site_mode_changed`, `admin.job_retried`).
4. **Nessun segreto in uscita:** le letture passano da proiezioni esplicite. Mai
   `invitations.tokenHash`, token ospite, `downloadToken`/`downloadUrl`/`storageKey`
   degli export, valori del payload dei job (solo i nomi dei campi), metadata Creem;
   i `details` dell'audit passano da `redactSecrets` (chiavi che nominano token,
   secret, password, hash, signature, api key, authorization, cookie → `[redacted]`,
   a qualsiasi profondità). Coperto da un test che semina valori sentinella e
   verifica che nessuna risposta li contenga.
5. **Frontend:** `app/middleware/admin.ts` chiede `api.admin.whoami` (che è esso
   stesso una funzione admin: non esiste una sonda pubblica del ruolo) e rimanda
   alla dashboard su qualsiasi errore. È una comodità: il layout `admin.vue` non
   monta la pagina finché `whoami` non risponde, e il gate vero resta Convex. Le
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
- **Site mode `maintenance`/`waitinglist` e la console:** i middleware di site mode
  (server e client) non esentano le *pagine* `/admin` (esentano solo `/api/admin/*`
  legacy). Con il sito in `maintenance` la console non è raggiungibile per
  ripristinarlo; la via d'uscita è modificare/cancellare la riga `siteSettings`
  (`key = "siteMode"`) dalla dashboard Convex. Da decidere prima del cutover (Task
  19, quando `/api/admin/site-mode` sparisce).
- `jobs.retryDead` e `siteSettings.set/clear` restano mutation pubbliche senza
  `reason` (interfacce dei Task 12/13, con test propri): ora condividono helper e
  controllo con la console, ma la motivazione è obbligatoria solo passando da
  `api.admin.*`. Candidati a diventare `internal` quando nessun chiamante li usa più.
- Gli audit Convex non hanno IP/User-Agent (lacuna già dichiarata in
  `domain-schema.md`, deviazione 6).
