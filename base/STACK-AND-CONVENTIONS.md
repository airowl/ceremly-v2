# STACK & CONVENTIONS — Riferimento trasversale

> **Claude Code: tieni questo file aperto in OGNI fase.** Definisce le convenzioni non negoziabili del boilerplate. Ogni fase assume che tu segua queste regole. Se una guida di fase è in conflitto con questo file, vince questo file.

---

## 1. Principio architetturale: Strada A (event-driven serverless)

Il backend gira su Vercel come funzioni serverless. **Non esiste alcun processo persistente.** Conseguenze pratiche obbligatorie:

- **Vietato** qualsiasi worker in polling (no BullMQ in ascolto, no `while(true)`, no connessioni Redis tenute aperte in attesa di lavoro).
- Il lavoro asincrono/in background si accoda a una **coda HTTP** (Upstash QStash). Il "worker" è una rotta HTTP (`server/api/jobs/...`) che la coda invoca. Non è un processo, è un endpoint.
- I task schedulati sono **Vercel Cron** dichiarati in `vercel.json`, che colpiscono una rotta `server/api/cron/...`. Il cron non fa lavoro pesante: accoda o processa a piccoli batch.
- Le connessioni al DB usano il **driver Neon HTTP/serverless** (`@neondatabase/serverless`), NON il driver TCP classico. È un requisito del runtime serverless.

---

## 2. Convenzioni Laravel-style (la filosofia, non l'implementazione)

### ✅ Si porta
- **Service / Action layer.** La logica di business vive in `server/services/`. Le rotte `server/api/` sono SOTTILI: validano input, chiamano un service, restituiscono output. **Mai** logica di business dentro una rotta.
- **Validation come layer dedicato.** Schema Zod in `server/schemas/`, applicati con `readValidatedBody` / `getValidatedQuery` di Nitro all'ingresso di ogni rotta. Equivalente delle Form Request di Laravel.
- **Repository pattern.** Le query Drizzle stanno in `server/repositories/`, dietro funzioni con nomi di dominio (`findActiveUsers`, `createOrganization`). Le rotte e i service non scrivono query Drizzle inline.
- **Jobs.** Funzioni in `server/jobs/` che ricevono un payload e fanno il lavoro. Invocate dalla rotta-consumer della coda. Ergonomia simile ai Job di Laravel.
- **Mailables.** Email come componenti riutilizzabili (`server/emails/`), non HTML inline.

### ❌ NON si porta
- **Niente Service Container / DI pesante.** Si usano import diretti di moduli e funzioni pure. Il container IoC di Laravel è over-engineering qui.
- **Niente Facade.** Import espliciti sempre. Le facade rompono il tree-shaking e nascondono le dipendenze.
- **Niente Active Record.** Drizzle è query-builder esplicito di proposito. NON costruire un layer Active Record sopra Drizzle. Il Repository pattern è il compromesso corretto, non un clone di Eloquent.

---

## 3. Disaccoppiamento dai fornitori (obbligatorio)

Ogni servizio esterno sta dietro un modulo di astrazione interno. Nessun SDK di fornitore va chiamato direttamente fuori dal suo modulo.

| Fornitore | Modulo di astrazione | Regola |
|---|---|---|
| R2 (storage) | `server/storage/` (basato su `unstorage`) | L'app chiama `storage.upload/getUrl/delete`, mai l'SDK S3 direttamente |
| Creem (payments) | `server/billing/` | L'app chiama `billing.createCheckout/getSubscription/...`, mai l'SDK Creem direttamente |
| Resend (email) | `server/emails/` | L'app chiama `sendEmail(template, props)`, mai `resend.emails.send` sparso in giro |
| QStash (queue) | `server/queue/` | L'app chiama `dispatch(jobName, payload)`, mai l'SDK QStash direttamente |

Beneficio: cambiare fornitore = riscrivere l'interno di un modulo, non l'app. Riutilizzabile tra progetti.

---

## 4. Struttura cartelle (obbligatoria)

```
/
├─ app/                      # Frontend Nuxt 4 (pages, components, composables)
│  ├─ pages/
│  ├─ components/
│  ├─ composables/
│  └─ middleware/            # Middleware route lato client
├─ server/
│  ├─ api/                   # Rotte HTTP — SOTTILI. Validano, chiamano service, rispondono
│  │  ├─ cron/               # Endpoint colpiti da Vercel Cron
│  │  ├─ jobs/               # Endpoint-consumer colpiti dalla coda QStash
│  │  └─ webhooks/           # Endpoint webhook (Creem, ecc.)
│  ├─ services/              # Logica di business (Laravel Service/Action)
│  ├─ repositories/          # Query Drizzle incapsulate per entità
│  ├─ schemas/               # Schema Zod (validazione, Laravel Form Request)
│  ├─ jobs/                  # Logica dei job in background (payload → lavoro)
│  ├─ emails/                # Template email (vue-email) + sendEmail()
│  ├─ storage/               # Astrazione storage (unstorage → R2)
│  ├─ billing/               # Astrazione billing (Creem)
│  ├─ queue/                 # Astrazione coda (QStash) + dispatch()
│  ├─ middleware/            # Middleware server (auth, authorization, rate-limit)
│  ├─ db/                    # Drizzle: schema, client, migrations
│  └─ utils/                 # Helper condivisi
├─ shared/                   # Tipi/costanti condivisi frontend+backend
├─ i18n/                     # Traduzioni IT/EN
├─ tests/                    # Vitest
├─ drizzle/                  # Migration generate da Drizzle Kit
├─ .env.example              # Tutte le env documentate
├─ vercel.json               # Config deploy + Cron
├─ nuxt.config.ts            # preset nitro 'vercel', moduli
└─ drizzle.config.ts
```

---

## 5. Regole di stile e qualità (valide in ogni fase)

- **TypeScript strict.** `strict: true`. Niente `any` non giustificato.
- **Type-safety end-to-end.** Gli schema Zod generano i tipi (`z.infer`). I tipi del DB vengono da Drizzle. Non duplicare definizioni di tipo a mano.
- **Multi-tenancy in ogni query.** Dalla Fase 1 in poi, ogni query su risorse di tenant DEVE filtrare per `organizationId`. Mai una query che possa restituire dati di un'altra organization. Questo è un requisito di **sicurezza**, non di stile.
- **Env validate all'avvio.** Tutte le variabili d'ambiente passano per uno schema Zod (`server/utils/env.ts`). Se manca una variabile, l'app fallisce all'avvio con un errore chiaro, non a runtime in modo misterioso.
- **Errori centralizzati.** Le rotte non gestiscono errori ad-hoc; c'è un handler centrale (Fase 4). Gli errori applicativi usano `createError` di Nitro con codici coerenti.
- **Commenti in italiano o inglese, coerenti per file.** (Airowl lavora in italiano; il codice/identificatori in inglese, i commenti esplicativi in italiano vanno bene.)

---

## 6. Cosa NON fare mai (riepilogo anti-pattern)

- ❌ Logica di business in una rotta `server/api/`
- ❌ Query Drizzle inline fuori da `server/repositories/`
- ❌ SDK di un fornitore chiamato fuori dal suo modulo di astrazione
- ❌ Worker in polling / processi persistenti / connessioni in attesa
- ❌ Una query su risorse tenant senza filtro `organizationId`
- ❌ Variabili d'ambiente lette con `process.env.X` sparse nel codice (passa da `env.ts` validato)
- ❌ Active Record / Facade / Service Container (anti-pattern per questo stack)
