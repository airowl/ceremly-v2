# PHASE 7 — Testing & Finalizzazione

> **Obiettivo della fase.** Dare al boilerplate l'impalcatura di testing, così ogni progetto clonato parte già con i test configurati e con esempi sui flussi critici. E chiudere il template: documentazione finale, script di setup, e tutto ciò che serve perché clonarlo sia davvero "clona e parti".
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`.** Tutte le fasi precedenti devono aver passato i checkpoint: ora si testa ciò che esiste e si rifinisce.

---

## Perché il testing è in fondo (ma non opzionale)

Non perché conti meno — ma perché testi ciò che esiste, e ora esiste tutto. Il valore per la tua strategia: cloni il boilerplate dieci volte, e ogni clone ha già Vitest configurato + test d'esempio che dimostrano *come* testare i service (ecco perché il service layer della Fase 0/2 è importante: è testabile in isolamento). Non servono test esaustivi nel boilerplate — serve l'**impalcatura** + esempi sui pezzi critici, così aggiungere test nei singoli progetti è naturale.

---

## Scope

### ✅ In questa fase
- **Vitest** configurato per il progetto (unit + integration), con setup per il contesto Nuxt/Nitro dove serve.
- Test d'esempio sui **service** (la logica di business isolata): almeno authorization, billing gating, e un service di dominio.
- Test sui **flussi critici di sicurezza**:
  - Isolamento multi-tenant (utente di org A non accede a risorse di org B)
  - Authorization (member non può fare azioni da admin)
  - Webhook billing (firma non valida rifiutata; idempotenza)
- Test sulle **utility critiche**: validazione env, schema Zod.
- **Finalizzazione template**: README principale del progetto, script di setup iniziale, checklist "primo deploy", `.env.example` verificato completo.

### ❌ NON in questa fase
- Copertura di test esaustiva (è un boilerplate, non un prodotto finito — gli altri test si aggiungono per progetto)
- E2E completi (predisponi al massimo l'impalcatura se rapido; non è il focus)

---

## Task dettagliati

### 7.1 — Setup Vitest
- Installa e configura Vitest (verifica via web il setup aggiornato con Nuxt 4 — es. `@nuxt/test-utils` se serve il contesto Nuxt).
- Script `package.json`: `test`, `test:watch`, `test:coverage`.
- Struttura `tests/` coerente (unit, integration).

### 7.2 — Test sui service
- `authorization`: `can(...)` e `assertOwnership(...)` restituiscono i risultati attesi per i tre ruoli e per risorse cross-tenant.
- `billing`: `hasFeature`/`requirePlan` gating corretto per piani diversi.
- Un service di dominio d'esempio (sui `projects` della Fase 1): create/read filtrati per tenant.

### 7.3 — Test di sicurezza (i più importanti)
- **Multi-tenant isolation**: una query/azione su risorsa di org B fatta da utente di org A fallisce (403) — test esplicito.
- **Authorization**: un member che tenta un'azione da admin (es. invitare) viene bloccato.
- **Webhook billing**: payload con firma non valida → rifiutato; stesso evento due volte → effetti non duplicati (idempotenza).

### 7.4 — Test utility
- Env validation: env mancante → fail con messaggio chiaro.
- Schema Zod core: input invalido → errore di validazione atteso.

### 7.5 — Finalizzazione del boilerplate
- **README principale** del progetto: cos'è, stack, come fare setup di un nuovo progetto da questo template, come girano le fasi, comandi principali.
- **Script di setup iniziale** (`scripts/setup.ts` o simile): guida l'utente a copiare `.env`, creare il DB, applicare migration, seed.
- **Checklist "primo deploy su Vercel"**: variabili da impostare, webhook Creem da configurare in produzione, dominio, Sentry, ecc.
- Verifica che `.env.example` sia **completo** (tutte le variabili di tutte le fasi, documentate).
- Verifica finale: `typecheck`, `lint`, `test`, `build` tutti verdi.

---

## Checkpoint di verifica (finale del boilerplate)

- [ ] `npm run test` esegue e passa
- [ ] Esistono test d'esempio sui service (authorization, billing gating, dominio)
- [ ] Il test di isolamento multi-tenant passa (org A non vede org B)
- [ ] Il test di authorization passa (member bloccato su azioni admin)
- [ ] Il test webhook passa (firma invalida rifiutata, idempotenza verificata)
- [ ] Il test env validation passa (env mancante → fail chiaro)
- [ ] Esiste un README principale che spiega setup, stack, fasi, comandi
- [ ] Esiste uno script di setup per un nuovo progetto
- [ ] Esiste la checklist "primo deploy su Vercel"
- [ ] `.env.example` è completo e documentato per tutte le fasi
- [ ] `typecheck`, `lint`, `test`, `build` tutti verdi
- [ ] Commit: `feat: phase 7 — testing and template finalization`
- [ ] Tag della release del boilerplate (es. `v1.0.0`)

> 🎉 Se tutti i box sono spuntati, il boilerplate v1 è completo: production-ready, multi-tenant (B2C+B2B), con billing Creem, bilingue, testato, e — soprattutto — costruito a fasi così lo *conosci* davvero. Questo è il template che cloni per ogni nuovo SaaS.
