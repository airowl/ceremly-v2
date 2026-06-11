# PHASE 6 — Admin Dashboard & Analytics

> **Obiettivo della fase.** Dare a TE (il fondatore) gli strumenti per gestire il SaaS: un pannello admin interno per vedere utenti, organizzazioni e subscription, e l'analytics per capire cosa succede. Quasi ogni SaaS ricostruisce queste cose da zero — averle nel boilerplate ti fa risparmiare ore a ogni clone.
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`.** Le fasi precedenti devono aver passato i checkpoint; l'admin legge i dati di tenancy (Fase 1), auth (Fase 2) e billing (Fase 3).

---

## Scope

### ✅ In questa fase
- **Admin dashboard interno** (accessibile solo a un super-admin, distinto dai ruoli di organization della Fase 2):
  - Lista organizzazioni con piano/stato subscription
  - Lista utenti
  - Dettaglio organization: membri, piano, stato pagamenti
  - Metriche di base: numero org, utenti, subscription attive, MRR approssimativo (dai dati subscription della Fase 3)
- **Ruolo super-admin**: un livello sopra l'authorization della Fase 2. Un super-admin (tu) accede al pannello; gli utenti normali no. Definito in modo sicuro (non un semplice flag client-side).
- **Analytics**: integrazione di uno strumento di analytics (es. Plausible, o DataFast, o equivalente privacy-friendly — scelta documentata). Tracciamento di eventi chiave (signup, checkout, conversione).
- **Aggancio al cookie consent della Fase 5**: gli script di analytics partono SOLO con consenso.

### ❌ NON in questa fase
- Testing → Fase 7
- Funzionalità admin avanzate (impersonation, refund dal pannello, ecc.) → fuori scope v1, eventuale roadmap

---

## Task dettagliati

### 6.1 — Ruolo super-admin (sicuro)
- Definisci il concetto di super-admin separato dai ruoli organization. Opzioni: flag sul record user verificato server-side, o lista di email/id in `env`/config server. **Mai** un controllo solo client-side.
- Middleware che protegge tutte le rotte `/admin` e `server/api/admin/...`: solo super-admin, altrimenti 403/404.

### 6.2 — Rotte e repository admin
- Repository/service admin che leggono **cross-organization** (l'admin è l'unico contesto autorizzato a vedere oltre il singolo tenant — documentalo chiaramente come eccezione controllata alla regola multi-tenant).
- Endpoint per: liste organizzazioni, utenti, dettaglio org, metriche aggregate.

### 6.3 — UI admin
- Pagine `/admin` (protette): tabelle navigabili per org/utenti, dettaglio org, pannello metriche.
- UI funzionale e leggibile (lo styling fine non è l'obiettivo, la completezza dei dati sì).

### 6.4 — Metriche
- Calcola dai dati esistenti: totale org, totale utenti, subscription attive per piano, MRR stimato, nuovi signup nel periodo.
- (Le metriche pesanti, se mai servissero, vanno calcolate via cron/batch — strada A — non a ogni caricamento pagina.)

### 6.5 — Analytics
- Integra lo strumento scelto (verifica via web il setup aggiornato per Nuxt). Privacy-friendly preferito (sei in UE).
- Traccia eventi chiave: signup, avvio checkout, subscription attivata.
- **Gating consenso:** lo script di analytics si carica solo se il cookie banner (Fase 5) ha consenso per la categoria analytics. Verifica l'integrazione col meccanismo di Fase 5.

---

## Checkpoint di verifica

- [ ] Solo un super-admin accede a `/admin`; un utente normale riceve 403/404 (testato server-side, non aggirabile da client)
- [ ] L'admin vede la lista organizzazioni con piano/stato subscription
- [ ] L'admin vede la lista utenti e il dettaglio di un'organization (membri + billing)
- [ ] Le metriche di base (org, utenti, subscription attive, MRR stimato) sono corrette rispetto ai dati
- [ ] L'accesso cross-organization dell'admin è documentato come eccezione controllata alla regola multi-tenant
- [ ] L'analytics traccia signup/checkout/conversione
- [ ] Lo script analytics NON parte senza consenso (verificato l'aggancio al cookie banner di Fase 5)
- [ ] `npm run typecheck` e `npm run lint` passano
- [ ] Commit: `feat: phase 6 — admin dashboard and analytics`
