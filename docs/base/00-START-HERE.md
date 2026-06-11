# SaaS Boilerplate — Build Guide (Strada A)

> **Cos'è questo set di file.** Otto guide sequenziali per costruire, con Claude Code, un boilerplate SaaS production-ready. Ogni fase è un brief autocontenuto: lo dai a Claude Code in una sessione dedicata, verifichi il checkpoint finale, e solo allora passi alla fase successiva. **Non dare più fasi insieme.** Il valore di questo approccio è che alla fine *conosci* il tuo boilerplate perché l'hai visto crescere pezzo per pezzo, invece di possedere una scatola nera generata in un big bang.

---

## Filosofia del boilerplate

Questo non è "un altro starter kit". È un template **ripetibile** pensato per chi lancia molti SaaS e vuole clonare lo stesso setup ogni volta senza ridecidere l'infrastruttura. Due principi guida attraversano tutte le fasi:

1. **Strada A (event-driven serverless).** Nessun processo che resta acceso ad aspettare lavoro. Tutto è "qualcosa mi sveglia → faccio una cosa che finisce". Le tre cose che svegliano il codice: una richiesta HTTP, un cron, un evento esterno (webhook). Non esistono worker in polling. Il lavoro in background si fa con code HTTP (Vercel Queues / Upstash QStash), non con BullMQ/Redis-in-ascolto.

2. **Convenzioni Laravel-style su Nuxt.** Si porta la *filosofia* di Laravel (un posto per ogni cosa, layer espliciti, rotte sottili), NON la sua implementazione (niente Service Container pesante, niente Facade, niente Active Record). Vedi `STACK-AND-CONVENTIONS.md`.

3. **Disaccoppia, non sposare.** Ogni fornitore esterno (storage, pagamenti, email) sta dietro un modulo di astrazione tuo. Si dipende da un'interfaccia interna, mai direttamente dall'SDK del fornitore sparpagliato per l'app. Così cambiare fornitore = cambiare un file, non riscrivere l'app.

---

## Lo stack (deciso, non da rivalutare durante il build)

| Layer | Scelta |
|---|---|
| Framework | Nuxt 4 (fullstack, Nitro) |
| Deploy | **Vercel** (preset Nitro `vercel`) |
| Database | Neon (Postgres serverless) |
| ORM | Drizzle + Drizzle Kit |
| Auth | Better Auth (con plugin **organization**) |
| Object storage | Cloudflare R2 (via API S3-compatibile, dietro astrazione `unstorage`) |
| Email | Resend (template con `vue-email`) |
| Payments | **Creem** (Merchant of Record) |
| Cache / KV / rate-limit | Upstash Redis (HTTP) |
| Coda task differiti | Upstash QStash (HTTP) |
| Error tracking | Sentry |
| Testing | Vitest |
| i18n | `@nuxtjs/i18n` — **inglese + italiano** |

---

## Le due decisioni strutturali (già prese — NON cambiarle a metà)

- **Multi-tenancy: ENTRAMBI (B2C + B2B).** Il modello è **B2B-first con B2C come caso degenere**: ogni account è un'*organization*; un utente B2C è semplicemente un'organization con un solo membro. Ogni risorsa nel DB porta un `organizationId` e ogni query filtra per tenant. Questo è deciso nella Fase 1 e tutto il resto ci poggia sopra.
- **Billing: tutto con Creem, modello subscription ricorrente** (con trial e gestione piani). I webhook Creem sono la fonte di verità sullo stato di pagamento.

---

## Ordine delle fasi (sequenziale, ogni fase poggia sulla precedente)

| # | File | Cosa costruisce | Dipende da |
|---|---|---|---|
| — | `STACK-AND-CONVENTIONS.md` | **Riferimento trasversale.** Convenzioni, struttura cartelle, pattern Laravel-style. Claude Code lo tiene aperto in OGNI fase. | — |
| 0 | `PHASE-0-scaffold.md` | Scaffold Nuxt 4, config Vercel, struttura cartelle, env validation Zod, tooling | — |
| 1 | `PHASE-1-data-and-tenancy.md` | Schema DB con multi-tenancy alla radice, Drizzle, migrations, seeders | 0 |
| 2 | `PHASE-2-auth-and-authorization.md` | Better Auth + organization plugin + ruoli/permessi + ownership | 1 |
| 3 | `PHASE-3-billing-creem.md` | Creem: checkout, webhook, subscription state, gating per piano | 2 |
| 4 | `PHASE-4-email-errors-ratelimit.md` | Email flows (Resend), error handling + Sentry, rate limiting | 3 |
| 5 | `PHASE-5-i18n-seo-legal.md` | i18n IT/EN, SEO, pagine legali + cookie banner GDPR | 4 |
| 6 | `PHASE-6-admin-analytics.md` | Admin dashboard interno + analytics | 5 |
| 7 | `PHASE-7-testing.md` | Vitest setup + test d'esempio sui service e sui flussi critici | 6 |

---

## Come usare ogni file con Claude Code

1. Apri una **nuova sessione** di Claude Code nella root del progetto.
2. Dai a Claude Code **due file**: `STACK-AND-CONVENTIONS.md` (sempre) + il file della fase corrente.
3. Lascia che esegua. Ogni guida finisce con una sezione **"Checkpoint di verifica"**: una lista di cose che devono funzionare/esistere prima di considerare la fase chiusa.
4. **Verifica tu** il checkpoint. Leggi il codice generato — è il momento in cui prendi possesso di quel pezzo.
5. Commit (`git commit`) a fine fase. Una fase = un commit pulito. Così se una fase futura rompe qualcosa, sai esattamente dove.
6. Solo allora passa alla fase successiva.

> **Regola d'oro:** se un checkpoint non passa, NON procedere alla fase dopo. Le fasi successive assumono che le precedenti siano solide. Un buco in Fase 1 (schema) diventa dieci buchi in Fase 6 (admin).

---

## Nota su Creem (importante per la Fase 3)

Creem è un Merchant of Record giovane e poco diffuso. La sua API e il formato dei webhook **non vanno dati per scontati dalla conoscenza pregressa di Claude Code** — potrebbero essere allucinati. La guida della Fase 3 istruisce esplicitamente Claude Code a **consultare la documentazione ufficiale di Creem via web** prima di implementare, e a trattare gli endpoint/payload come da verificare, non come noti. Tienilo presente: è il pezzo a più alto rischio dell'intero boilerplate.
