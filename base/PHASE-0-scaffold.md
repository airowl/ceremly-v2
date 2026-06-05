# PHASE 0 — Scaffold & Fondamenta del Progetto

> **Obiettivo della fase.** Mettere in piedi lo scheletro del progetto Nuxt 4 configurato per Vercel, con la struttura cartelle Laravel-style, la validazione delle env, e il tooling di base. Alla fine di questa fase NON c'è ancora nessuna feature — c'è un progetto che parte, builda per Vercel, e ha le fondamenta su cui tutte le altre fasi poggiano.
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`.** Tieni quel file come riferimento per struttura cartelle e regole.

---

## Scope

### ✅ In questa fase
- Inizializzazione progetto Nuxt 4 con TypeScript strict
- Configurazione `nitro.preset = 'vercel'` e `vercel.json`
- Creazione dell'intera struttura cartelle di `STACK-AND-CONVENTIONS.md` (con file placeholder/index dove serve)
- `server/utils/env.ts`: validazione di TUTTE le env con Zod, fail-fast all'avvio
- `.env.example` documentato
- Setup tooling: ESLint, Prettier, TypeScript config strict
- Setup base Drizzle (config + client, SENZA ancora lo schema — quello è Fase 1)
- Health-check route (`server/api/health.get.ts`) per verificare che il server risponda
- Inizializzazione Git + primo commit

### ❌ NON in questa fase (verrà dopo)
- Schema del database → Fase 1
- Auth → Fase 2
- Qualsiasi logica di business, billing, email → fasi successive
- I moduli di astrazione (storage/billing/queue) qui sono solo **cartelle vuote con un index placeholder**, non implementati

---

## Task dettagliati

### 0.1 — Inizializza Nuxt 4
- Crea un progetto Nuxt 4 (ultima versione stabile). Verifica via web la versione corrente di Nuxt 4 e i comandi di init aggiornati se necessario.
- Abilita TypeScript strict in `nuxt.config.ts` e `tsconfig`.
- Pulisci i file di esempio generati dal template.

### 0.2 — Configura il deploy Vercel
- In `nuxt.config.ts` imposta `nitro: { preset: 'vercel' }`.
- Crea `vercel.json` con la configurazione base. Predisponi la sezione `crons` (vuota per ora, popolata in fasi successive) così la struttura è pronta.
- Documenta in un commento come avviene il deploy (collega repo a Vercel → push = deploy).

### 0.3 — Crea la struttura cartelle completa
- Crea TUTTE le cartelle elencate in `STACK-AND-CONVENTIONS.md` sezione 4.
- Per i moduli di astrazione (`server/storage/`, `server/billing/`, `server/queue/`, `server/emails/`), crea un `index.ts` placeholder con un commento `// Implementato in Fase N` e una firma di funzione vuota/typed dove ha senso. NON implementarli ora.
- Aggiungi un `.gitkeep` o un index alle cartelle che altrimenti sarebbero vuote.

### 0.4 — Env validation (CRITICO)
- Crea `server/utils/env.ts` con uno schema Zod che valida tutte le variabili d'ambiente.
- Per la Fase 0 lo schema include almeno: `DATABASE_URL`, `NODE_ENV`. Predisponi commenti `// aggiunto in Fase N` per le variabili future (auth secret, Creem keys, Resend key, R2 creds, QStash, Upstash, Sentry DSN).
- Lo schema deve fare **fail-fast**: se una variabile obbligatoria manca o è malformata, l'app deve fallire all'avvio con un messaggio chiaro che dice QUALE variabile manca. NON un errore generico a runtime.
- Esporta un oggetto `env` tipizzato. **Regola: nel resto del codebase si importa `env` da qui, mai `process.env.X` diretto.**

### 0.5 — `.env.example`
- Crea `.env.example` con OGNI variabile, un commento che spiega a cosa serve, e dove ottenerla. Per le variabili future, includile commentate con una nota sulla fase che le introdurrà.

### 0.6 — Setup Drizzle (solo client, no schema)
- Installa Drizzle + Drizzle Kit + `@neondatabase/serverless`.
- Crea `server/db/client.ts`: il client Drizzle che usa il **driver Neon HTTP** (non TCP), leggendo `DATABASE_URL` da `env`.
- Crea `drizzle.config.ts` puntando a `server/db/schema/` (che sarà popolato in Fase 1).
- NON creare ancora tabelle.

### 0.7 — Tooling
- ESLint + Prettier configurati e coerenti (usa la config ufficiale di Nuxt per ESLint).
- Script in `package.json`: `dev`, `build`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `db:studio`.

### 0.8 — Health check
- Crea `server/api/health.get.ts` che restituisce `{ status: 'ok', timestamp }`. Serve a verificare che il server risponda e che il deploy funzioni.

### 0.9 — Git
- `git init`, `.gitignore` appropriato (node_modules, .env, .nuxt, .output, ecc.).
- Primo commit: `chore: phase 0 — project scaffold and foundations`.

---

## Checkpoint di verifica

Prima di passare alla Fase 1, verifica che TUTTO quanto segue sia vero:

- [ ] `npm run dev` avvia il server senza errori
- [ ] Visitando `/api/health` si ottiene `{ status: 'ok', ... }`
- [ ] `npm run typecheck` passa senza errori
- [ ] `npm run lint` passa
- [ ] `npm run build` produce una build Vercel senza errori
- [ ] Avviando con una `DATABASE_URL` mancante, l'app fallisce con un messaggio CHIARO che nomina la variabile mancante (test della env validation)
- [ ] La struttura cartelle corrisponde esattamente a `STACK-AND-CONVENTIONS.md` sezione 4
- [ ] `.env.example` esiste ed è documentato
- [ ] Esiste un commit Git pulito di fine fase
- [ ] I moduli di astrazione sono cartelle con placeholder, NON implementati (saranno fatti nelle rispettive fasi)

> Se tutti i box sono spuntati, fai il commit e procedi alla Fase 1. Altrimenti, risolvi prima di procedere.
