# Migrazione Ceremly a Cloudflare + Convex (Design)

**Data:** 2026-09-11
**Stato:** design approvato con gate tecnici ed economici, pronto per piano di implementazione
**Obiettivo:** ridurre i costi ricorrenti sostituendo Vercel, Neon, Drizzle, QStash e Redis applicativo con Cloudflare e Convex, preservando dati, credenziali e billing esistenti.

## Decisioni vincolanti

- Il deploy passa da Vercel a Cloudflare Workers con Nuxt come UI, SSR e edge layer.
- Convex è l'unico backend per dati applicativi, autorizzazione, job, cron e billing state.
- Cloudflare R2 resta lo storage degli oggetti; non si migrano file o chiavi R2.
- Better Auth resta il sistema di identità, ospitato tramite `@convex-dev/better-auth` su Convex.
- Organizzazioni, membership, inviti e RBAC sono tabelle applicative Convex, non il plugin Organization di Better Auth.
- Billing usa il componente ufficiale `@creem_io/convex`, con l'organizzazione Convex come billing entity.
- Il frontend usa Convex direttamente per query, mutation e realtime. Nuxt non duplica le API CRUD; se il binding Vue non supera lo spike, usa composable minimi interni sul client JavaScript ufficiale Convex.
- L'area interna `/admin` vive nello stesso Nuxt deploy; non esiste un progetto amministrativo separato e non è prevista impersonazione.
- La migrazione usa blue-green con una breve finestra read-only e richiede un nuovo login a tutti gli utenti, mantenendo però le password attuali.

## Motivazione economica

Cloudflare Workers Paid parte da $5/mese e include 10M richieste e 30M CPU-ms. Convex Starter include 1M function call/mese, ma le call non sono solo le azioni esplicite: includono chiamate client, job schedulati, accessi file e aggiornamenti delle subscription reattive. Una write può quindi rieseguire una query per più client connessi.

Prima del go/no-go economico lo spike misura, con traffico sintetico rappresentativo, la formula `call esplicite + job + accessi file + riesecuzioni subscription (write × fan-out)`. Deve produrre una stima mensile per le fasce 20, 50, 100 e 1.000 utenti attivi, con I/O database, action compute, R2, Resend e traffico pubblico separati. Il valore precedente di 1.000 call/planner non è una base decisionale.

Questa scelta non è una promessa di costo fisso: i dashboard di Cloudflare e Convex sono la fonte di verità e vanno monitorati prima e dopo il cutover.

## Architettura target

```text
Browser / Nuxt Vue
  ├─ query, mutation e realtime ───────> Convex
  ├─ /api/auth/* ──────────────────────> Cloudflare/Nuxt proxy ─> Convex auth HTTP routes
  └─ upload/download firmato ──────────> Cloudflare R2

Cloudflare Workers + Nuxt
  ├─ pagine marketing SSR/prerender, asset e UI Vue
  ├─ middleware UI e proxy trasparente auth
  └─ nessun CRUD o business logic duplicato

Convex
  ├─ Better Auth (identità, sessioni, OAuth, 2FA)
  ├─ modello Ceremly, RBAC, admin, audit
  ├─ Creem component, webhook e billing state
  └─ scheduler, cron, job e action Resend

Creem ── webhook firmato ──────────────> Convex HTTP route
```

## Confini dei componenti

### Cloudflare + Nuxt

Responsabilità:

- servire l'applicazione pubblica e il gestionale `/admin`;
- mantenere il dominio Ceremly e i cookie SameSite/secure;
- inoltrare senza mutazioni `GET` e `POST` di `/api/auth/*` alle route Better Auth registrate su Convex;
- fornire SSR solo dove serve e asset statici gratuiti.

Non contiene repository, service layer, chiamate al database o controlli RBAC conclusivi. Qualunque guardia Nuxt è UX; l'enforcement è sempre Convex.

### Convex applicativo

Convex contiene tutti i dati e tutta la business logic, con funzioni pubbliche minimali e funzioni `internal*` per side effect. Ogni mutation valida schema input, identità, membership, ruolo e ownership prima di modificare stato.

Le tabelle applicative includono almeno: utenti applicativi, organizzazioni, membership, inviti, eventi, ospiti, RSVP, file metadata, limiti, audit, suppressions/email events, export e contatti. I documenti portano riferimenti Convex nativi; `legacyId` UUID resta durante la migrazione per riconciliazione e tracciabilità.

L'organizzazione attiva è uno stato applicativo esplicito e non un dato fidato del client. Le query risolvono sempre utente autenticato e membership lato server.

### Better Auth

`@convex-dev/better-auth` gestisce email/password, Google OAuth, 2FA, account e sessioni. Il suo componente registra route HTTP su Convex; Cloudflare conserva il percorso pubblico `/api/auth/*` tramite proxy. Il componente e il componente Creem sono pre-1.0: si bloccano nel lockfile versioni esatte verificate dallo spike (alla data del design: `@convex-dev/better-auth@0.12.5`, `@creem_io/convex@0.4.1`), con test d'integrazione, aggiornamenti intenzionali e piano di fork/vendor se un upgrade o una regressione blocca il progetto.

Il plugin Better Auth Organization non entra nel progetto. Non è supportato out-of-the-box dal componente Convex e presenta rischi sugli inviti. Organizzazione e RBAC rimangono quindi dominio Ceremly in Convex.

Durante l'import vengono preservati user/account, gli hash password compatibili e i segreti 2FA (`secret` e backup codes) in una migrazione che ne conserva esattamente cifratura/formato o li converte in modo verificato. Sessioni e verification token non vengono trasferiti: al cutover tutti rifanno login, ma con la password esistente. Google OAuth conserva il collegamento account/provider.

Un utente 2FA esistente deve poter completare il nuovo login con lo stesso authenticator. Se l'import del segreto non è tecnicamente possibile, il cutover è bloccato finché non esiste un reset 2FA controllato, auditato e comunicabile, con verifica d'identità e codici di recupero; non è ammesso lasciare utenti bloccati.

### Creem

Il componente `@creem_io/convex` è la scelta di riferimento. Le sue API vengono incapsulate da funzioni Ceremly che:

- derivano `entityId` dall'organizzazione attiva e verificano il ruolo owner;
- creano checkout e portal senza accettare un organization ID arbitrario dal browser;
- usano webhook firmati come fonte di verità e li rendono idempotenti;
- sincronizzano prodotti e mantengono il mapping `free`, `celebration`, `atelier`;
- preservano customer, subscription e ordine Creem esistenti tramite import/reconciliation.

La UI Vue resta personalizzata. I widget React/Svelte del componente non sono parte dello scope.

### R2 e media

Il bucket e gli oggetti esistenti restano invariati. Convex conserva metadata e autorizzazioni; browser e R2 scambiano file tramite URL firmati. I flussi server-to-server possono usare binding Workers/R2 o firma S3 compatibile senza cambiare chiavi oggetto.

`sharp` non può continuare a generare varianti nel runtime Worker/Convex. Prima del cutover va completato uno spike e scelta una soluzione: Cloudflare Images/Image Resizing oppure un microservizio Node isolato. Le varianti non possono degradare silenziosamente in produzione.

### Job e cron

- `ctx.scheduler.runAfter()` sostituisce QStash per inviti, reminder, export e varianti;
- cron Convex sostituiscono Vercel Cron per reminder, cleanup file/eventi e purge GDPR;
- i payload contengono solo ID;
- handler e scritture di stato restano idempotenti;
- le action Resend non ricevono retry impliciti: le mutation registrano outcome e applicano retry espliciti, persistiti e idempotenti con backoff, massimo tentativi, stato terminale/DLQ e retry manuale da `/admin`; Workpool è introdotto solo se volumi email o limiti di concorrenza lo richiedono.

QStash, consumer `/api/jobs/*`, cron `/api/cron/*`, firma QStash e `NUXT_CRON_SECRET` vengono rimossi dopo la stabilizzazione.

## Gestionale interno

`/admin` è nello stesso progetto Nuxt/Cloudflare e usa Convex direttamente.

- Accesso tramite Better Auth più ruolo globale `superAdmin`; un'allowlist iniziale assegna il primo ruolo.
- Dashboard con metriche aggregate e query indicizzate: utenti, organizzazioni, eventi, RSVP, conversioni e stato billing.
- Ricerca e gestione di utenti, organizzazioni, eventi, limiti personalizzati, subscription, retry job ed export/audit.
- Ogni scrittura admin registra attore, target, timestamp, motivazione e dettagli in audit log.
- Esclusi: impersonazione, modifica diretta password, cancellazioni irreversibili senza flusso dedicato.

## Sicurezza e osservabilità

- Il browser non riceve chiavi Creem, Resend, R2 server-side o segreti Convex.
- I segreti Creem/Resend e webhook sono in Convex; Cloudflare conserva solo deploy, proxy e configurazione R2 necessaria.
- Il client non decide `organizationId`, ruoli, piano o billing entity: ogni valore è risolto/validato sul server Convex.
- Webhook e job mantengono idempotenza tramite stato di dominio e chiavi evento, non tramite sola deduplica di trasporto.
- Cloudflare WAF e Rate Limiting proteggono route pubbliche e auth; un Workers Rate Limiting binding protegge le quote applicative che oggi dipendono da Redis. Regole, chiavi e soglie sono documentate e testate prima di rimuovere Upstash.
- CSP, HSTS, limiti body/upload, `nosniff`, fake server headers e bot trap restano applicati dal layer Nuxt/Worker; il proxy auth e i webhook mantengono le sole eccezioni strettamente necessarie.
- Dashboard costi Cloudflare, Convex, R2, Resend e Creem vengono osservati mensilmente; impostare limiti di spesa/uso prima del go-live.

## Migrazione blue-green

### 1. Preparazione e spike bloccanti

Prima di migrare dati reali devono superare ambiente staging:

1. Nuxt su Cloudflare Workers: preset Nitro, `@nuxt/content`, header/security policy, cookie, proxy Better Auth/Convex e Google OAuth;
2. binding Vue: verificare `convex-vue@0.1.5` (community e pre-1.0) per query/mutation/realtime; fallback accettabile solo con composable minimi interni costruiti sul client Convex ufficiale, senza API CRUD Nuxt;
3. import di account email/password e verifica della password originale;
4. import di account Google;
5. import 2FA e login con authenticator già registrato, backup codes e recovery controllato;
6. modello applicativo Convex per org/membership/inviti/RBAC;
7. Creem ufficiale con organization `entityId`, checkout, portal, webhook e sync prodotti;
8. alternativa a Sharp per le varianti;
9. WAF/rate limiting Cloudflare, bot trap e header di sicurezza equivalenti a produzione;
10. carico sintetico rappresentativo che misura call Convex incluse riesecuzioni reattive e produce il confronto economico.

Il fallimento di uno spike blocca la migrazione completa, non viene aggirato con un downgrade silenzioso.

### 2. Rehearsal

- redigere l'inventario di migrazione: ogni tabella/sorgente, classe (produzione, effimera o rigenerabile), conteggio righe, checksum e destinazione Convex; include esplicitamente user, account, session, verification, `two_factor`, org/membership/inviti, dominio, audit, billing e manifest R2;
- esportare Neon, auth e stato billing in formato versionato e cifrato;
- caricare una copia di staging Convex con import idempotente;
- validare conteggi, foreign key logiche, dati R2, piani/limiti, customer/subscription Creem e audit;
- eseguire flussi end-to-end di login, OAuth, 2FA, tenant isolation, RSVP, checkout, webhook e admin;
- misurare i tempi per rendere credibile la finestra di manutenzione: delta import più riconciliazione devono completare entro 15 minuti e l'intera maintenance entro 30 minuti; altrimenti il risultato è no-go e il piano va ridisegnato.

### 3. Cutover

1. attivare maintenance read-only su Vercel;
2. fermare nuovi job e registrare il watermark finale;
3. eseguire export delta Neon e import Convex idempotente;
4. eseguire riconciliazione automatica e controlli manuali predefiniti;
5. rendere tutti i record sessione legacy invalidi;
6. aggiornare DNS/Cloudflare, Google OAuth callback, Creem webhook e URL pubblici;
7. riaprire le scritture solo dopo smoke test di produzione;
8. monitorare errori, billing webhook, login e costi intensivamente.

### 4. Rollback

Fino alla riapertura delle scritture Convex, Vercel/Neon rimangono candidati rollback e sono preservati read-only. Dopo nuove scritture in Convex non esiste rollback automatico: una regressione richiede una migrazione inversa o correzione mirata. Neon/Vercel restano read-only per audit e backup fino alla chiusura formalizzata del periodo di osservazione.

## Criteri di accettazione

- Ogni record di dominio previsto è importato una volta e riconciliato con la sorgente.
- Ogni utente email/password testato accede con la password precedente dopo il nuovo login.
- Google OAuth funziona su dominio Cloudflare; ogni utente 2FA esistente testato completa il login con il proprio authenticator precedente o con il recovery flow approvato.
- Nessun utente può leggere o scrivere dati di un'altra organizzazione.
- Customer, subscription, ordini e product mapping Creem riconciliano con la sorgente e i webhook replay non duplicano effetti.
- I job/cron aggiornano stato una sola volta anche se ripetuti e gli errori di action finiscono in retry persistito o stato terminale visibile/rieseguibile da admin.
- R2 conserva chiavi e accesso ai file esistenti; varianti immagini hanno una soluzione verificata.
- `/admin` rifiuta un utente non `superAdmin` e audita tutte le scritture.
- I dashboard mostrano consumo e limiti per Cloudflare, Convex, R2, Resend e Creem; la misura di carico reattivo conferma il caso economico scelto.
- Delta import più riconciliazione completano entro 15 minuti e la maintenance completa entro 30 minuti.

## Fuori scope

- Nuove feature prodotto non necessarie alla migrazione.
- Impersonazione amministrativa.
- Un secondo progetto/hostname amministrativo.
- Doppia scrittura Neon/Convex in produzione.
- Rimozione definitiva dei sistemi legacy prima della fine del periodo di osservazione.

## Rischi da gestire

| Rischio | Mitigazione |
| --- | --- |
| Hash password o account OAuth non importabili | Spike con copie reali minimizzate; stop al cutover se fallisce. |
| Segreti 2FA non importabili, con lockout degli utenti | Spike dedicato sul formato dei segreti e login con authenticator esistente; recovery 2FA controllato come unico fallback. |
| Compatibilità Nuxt/Cloudflare/proxy auth | Spike e test cookie/OAuth/2FA su dominio preview. |
| `convex-vue` community/pre-1.0 non adeguato | Spike bloccante; fallback: composable sottili sul client Convex ufficiale, senza introdurre CRUD Nuxt. |
| Componenti auth, Creem o Vue pre-1.0 cambiano API | Versioni esatte bloccate, lockfile committato, test integrazione, upgrade intenzionale e piano fork/vendor. |
| Webhook Creem perso o duplicato nel passaggio | Replay idempotente, riconciliazione customer/subscription e cambio endpoint controllato. |
| Organizzazioni Better Auth instabili su Convex | Org/RBAC come modello applicativo Convex, senza plugin Organization. |
| Sharp assente | Scelta e test obbligatorio del sostituto prima del cutover. |
| Protezioni Redis rimosse insieme a Upstash | WAF/rate limiting Cloudflare, Worker binding per quote app, header e bot trap configurati e testati. |
| Riesecuzioni reattive gonfiano le function call | Modello write-fan-out e test sintetico prima del go/no-go economico. |
| Scheduled action senza retry automatico | Retry persistito/idempotente, stato terminale e retry admin. |
| Costi imprevisti | Budget/usage cap, misura sintetica e monitoraggio mensile prima di traffico pieno. |
