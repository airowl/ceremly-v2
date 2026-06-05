# PHASE 1 — Data Model & Multi-Tenancy

> **Obiettivo della fase.** Definire lo schema del database con la **multi-tenancy incisa nelle fondamenta**. Questa è la fase architetturalmente più importante: la decisione "ogni risorsa appartiene a un'organization" viene presa QUI e tutto il resto del boilerplate ci poggia sopra. Sbagliarla significa rifare auth, billing, admin. Per questo è una fase a sé, da fare con cura ed eseguire con calma.
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`** (sezioni 1, 4, 5 in particolare).

---

## La decisione di tenancy (immutabile per questo boilerplate)

**Modello: B2B-first, B2C come caso degenere.**

- Ogni account è un'**organization** (tenant).
- Un utente **B2C** è modellato come un'organization con **un solo membro** (se stesso, ruolo owner). Nessuna UI di "team" gli viene mostrata, ma sotto è comunque un'organization.
- Un utente **B2B** è un'organization con più membri, ruoli, e inviti.
- **Ogni risorsa di dominio porta un `organizationId`.** Ogni query su risorse di dominio filtra per `organizationId`. Mai una query che possa restituire dati cross-tenant. Questo è un requisito di **sicurezza**.

Perché così: avere un solo modello (organization) che copre entrambi i casi evita due codebase e rende ogni SaaS clonato capace di servire B2C o B2B senza riarchitettura. Il costo è che anche il singolo utente "vive dentro" un'organization — costo accettabile e standard del settore.

---

## Scope

### ✅ In questa fase
- Schema Drizzle completo delle tabelle **core di tenancy e identità**:
  - `users` — identità individuale
  - `organizations` — il tenant
  - `members` — relazione utente↔organization con ruolo (tabella di join)
  - `invitations` — inviti pendenti a un'organization
- Tabelle di supporto che Better Auth richiederà (Fase 2) — predisposte qui se conviene, o lasciate alla Fase 2 se Better Auth le genera. **Verifica via web come Better Auth + il suo plugin organization si integrano con Drizzle** per decidere quali tabelle definire qui e quali lasciare generare al suo schema. Documenta la scelta.
- Una tabella di dominio **d'esempio** (`projects` o simile) che dimostra il pattern multi-tenant (`organizationId` + indici corretti), come riferimento per le risorse future.
- Migrations generate con Drizzle Kit.
- Seeder di sviluppo: crea un utente B2C d'esempio (org con 1 membro) e un'organization B2B d'esempio (con 2-3 membri e ruoli diversi).
- Repository di base in `server/repositories/` per le entità core (`userRepository`, `organizationRepository`, `memberRepository`), con le query SEMPRE filtrate per tenant dove applicabile.

### ❌ NON in questa fase
- Logica di autenticazione (login, sessioni) → Fase 2
- Logica di autorizzazione (controlli di permesso) → Fase 2
- Tabelle di billing/subscription → Fase 3
- Qualsiasi rotta API che usi queste tabelle → fasi successive

---

## Task dettagliati

### 1.1 — Studia l'integrazione Better Auth + organization + Drizzle
- **Prima di scrivere lo schema**, consulta via web la documentazione di Better Auth, in particolare l'adapter Drizzle e il **plugin organization**, per capire quali tabelle/colonne si aspetta.
- Decidi (e documenta in un commento nello schema) quali tabelle definisci manualmente qui e quali lascerai generare/allineare in Fase 2. L'obiettivo è zero conflitti tra il tuo schema e quello atteso da Better Auth.

### 1.2 — Definisci lo schema core
In `server/db/schema/` (un file per area, es. `auth.ts`, `organizations.ts`, `domain.ts`):
- `users`: id, email, name, emailVerified, image, timestamps. (Allinea ai requisiti Better Auth.)
- `organizations`: id, name, slug, timestamps, e un flag/tipo che distingua uso personale vs team se utile (opzionale ma comodo per la UI).
- `members`: id, `organizationId` (FK), `userId` (FK), `role` (enum: owner/admin/member — allinea ai ruoli del plugin organization), timestamps. Indice unico su (organizationId, userId).
- `invitations`: id, `organizationId` (FK), email, role, status (pending/accepted/expired), token, expiresAt, timestamps.

### 1.3 — Tabella di dominio d'esempio (pattern multi-tenant)
- Crea `projects` (o entità neutra equivalente) con: id, `organizationId` (FK, NOT NULL), name, timestamps.
- Aggiungi l'**indice su `organizationId`** (le query multi-tenant lo useranno sempre).
- Questa tabella serve come **modello di riferimento**: ogni risorsa di dominio futura nel boilerplate si modella così.

### 1.4 — Migrations
- Genera le migration con `drizzle-kit generate`.
- Verifica che le migration applichino correttamente su un DB Neon pulito (`drizzle-kit migrate`).

### 1.5 — Seeders
- Crea uno script di seed (`server/db/seed.ts`, eseguibile via script npm `db:seed`).
- Seed:
  - 1 utente B2C → org personale con 1 membro (owner).
  - 1 org B2B → 3 membri con ruoli owner/admin/member, e 1 invitation pending.
  - Qualche `projects` d'esempio per ciascuna org (per testare l'isolamento tenant).

### 1.6 — Repository core
In `server/repositories/`:
- `organizationRepository.ts`: `createOrganization`, `findOrganizationById`, `findOrganizationsForUser`, ecc.
- `memberRepository.ts`: `addMember`, `findMembers(organizationId)`, `findMemberRole(organizationId, userId)`, `removeMember`.
- `userRepository.ts`: `findUserByEmail`, `findUserById`, ecc.
- **Regola assoluta:** ogni funzione che tocca risorse di tenant accetta `organizationId` e filtra per esso. Scrivi le query Drizzle SOLO qui, mai inline altrove.

---

## Checkpoint di verifica

- [ ] Lo schema Drizzle è completo per users/organizations/members/invitations + tabella dominio d'esempio
- [ ] È documentato (commento nello schema) quali tabelle sono allineate a Better Auth e perché
- [ ] `npm run db:generate` produce migration valide
- [ ] `npm run db:migrate` applica su un Neon pulito senza errori
- [ ] `npm run db:seed` popola con successo: 1 org B2C, 1 org B2B multi-membro, dati dominio per entrambe
- [ ] I repository core esistono e OGNI query su risorse tenant filtra per `organizationId`
- [ ] `npm run typecheck` passa (i tipi Drizzle sono inferiti correttamente)
- [ ] Verifica manuale: una query sui `projects` dell'org A non restituisce mai i `projects` dell'org B
- [ ] Commit: `feat: phase 1 — data model and multi-tenancy foundation`

> ⚠️ Questa è la fase su cui poggia tutto. Non procedere alla Fase 2 finché l'isolamento tenant non è verificato. Un buco qui si propaga ovunque.
