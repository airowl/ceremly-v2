# Migrazione Ceremly a Cloudflare + Convex (Design)

**Data:** 2026-09-11
**Stato:** design approvato, pronto per piano di implementazione
**Obiettivo:** ridurre i costi ricorrenti sostituendo Vercel, Neon, Drizzle, QStash e Redis applicativo con Cloudflare e Convex, preservando dati, credenziali e billing esistenti.

## Decisioni vincolanti

- Il deploy passa da Vercel a Cloudflare Workers con Nuxt come UI, SSR e edge layer.
- Convex è l'unico backend per dati applicativi, autorizzazione, job, cron e billing state.
- Cloudflare R2 resta lo storage degli oggetti; non si migrano file o chiavi R2.
- Better Auth resta il sistema di identità, ospitato tramite `@convex-dev/better-auth` su Convex.
- Organizzazioni, membership, inviti e RBAC sono tabelle applicative Convex, non il plugin Organization di Better Auth.
- Billing usa il componente ufficiale `@creem_io/convex`, con l'organizzazione Convex come billing entity.
- Il frontend usa Convex direttamente per query, mutation e realtime. Nuxt non duplica le API CRUD.
- L'area interna `/admin` vive nello stesso Nuxt deploy; non esiste un progetto amministrativo separato e non è prevista impersonazione.
- La migrazione usa blue-green con una breve finestra read-only e richiede un nuovo login a tutti gli utenti, mantenendo però le password attuali.

## Motivazione economica

Cloudflare Workers Paid parte da $5/mese e include 10M richieste e 30M CPU-ms. Convex Starter include 1M function call/mese; per una stima prudente di 1.000 call/mese per planner, 1.000 planner attivi consumano circa 1M call/mese. Il costo esatto resta dipendente da database I/O, action compute, R2, Resend e traffico non autenticato.

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

`@convex-dev/better-auth` gestisce email/password, Google OAuth, 2FA, account e sessioni. Il suo componente registra route HTTP su Convex; Cloudflare conserva il percorso pubblico `/api/auth/*` tramite proxy.

Il plugin Better Auth Organization non entra nel progetto. Non è supportato out-of-the-box dal componente Convex e presenta rischi sugli inviti. Organizzazione e RBAC rimangono quindi dominio Ceremly in Convex.

Durante l'import vengono preservati user/account e gli hash password compatibili. Sessioni, verification token e sessioni 2FA non vengono trasferiti: al cutover tutti rifanno login, ma con la password esistente. Google OAuth conserva il collegamento account/provider.

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
- le action Resend non ricevono retry impliciti: le mutation registrano outcome e Workpool è introdotto solo se volumi email o limiti di concorrenza lo richiedono.

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
- Dashboard costi Cloudflare, Convex, R2, Resend e Creem vengono osservati mensilmente; impostare limiti di spesa/uso prima del go-live.

## Migrazione blue-green

### 1. Preparazione e spike bloccanti

Prima di migrare dati reali devono superare ambiente staging:

1. Nuxt su Cloudflare Workers con proxy Better Auth/Convex, cookie, Google OAuth e 2FA;
2. import di un account email/password e verifica della password originale;
3. import di account Google;
4. modello applicativo Convex per org/membership/inviti/RBAC;
5. Creem ufficiale con organization `entityId`, checkout, portal, webhook e sync prodotti;
6. alternativa a Sharp per le varianti.

Il fallimento di uno spike blocca la migrazione completa, non viene aggirato con un downgrade silenzioso.

### 2. Rehearsal

- esportare Neon, auth e stato billing in formato versionato e cifrato;
- caricare una copia di staging Convex con import idempotente;
- validare conteggi, foreign key logiche, dati R2, piani/limiti, customer/subscription Creem e audit;
- eseguire flussi end-to-end di login, OAuth, 2FA, tenant isolation, RSVP, checkout, webhook e admin;
- misurare i tempi per rendere credibile la finestra di manutenzione.

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
- Google OAuth e 2FA funzionano su dominio Cloudflare.
- Nessun utente può leggere o scrivere dati di un'altra organizzazione.
- Customer, subscription, ordini e product mapping Creem riconciliano con la sorgente e i webhook replay non duplicano effetti.
- I job/cron aggiornano stato una sola volta anche se ripetuti.
- R2 conserva chiavi e accesso ai file esistenti; varianti immagini hanno una soluzione verificata.
- `/admin` rifiuta un utente non `superAdmin` e audita tutte le scritture.
- I dashboard mostrano consumo e limiti per Cloudflare, Convex, R2, Resend e Creem.

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
| Compatibilità Nuxt/Cloudflare/proxy auth | Spike e test cookie/OAuth/2FA su dominio preview. |
| Componente auth o Creem cambia API | Versioni esatte bloccate, test integrazione e procedura upgrade esplicita. |
| Webhook Creem perso o duplicato nel passaggio | Replay idempotente, riconciliazione customer/subscription e cambio endpoint controllato. |
| Organizzazioni Better Auth instabili su Convex | Org/RBAC come modello applicativo Convex, senza plugin Organization. |
| Sharp assente | Scelta e test obbligatorio del sostituto prima del cutover. |
| Costi imprevisti | Budget/usage cap e monitoraggio mensile prima di traffico pieno. |
