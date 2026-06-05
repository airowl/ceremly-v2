# FASE 1c — RBAC + middleware + route org (Scope)

> **Scope delineato, non dettaglio implementabile.** Sotto-step di FASE 1 (vedi
> `2026-06-05-fase1-tenancy-organization-design.md`). Il dettaglio a passi-fini si produce col
> brainstorm dedicato di 1c, **dopo** che 1b è chiuso (modello membership vivo, org attiva in
> sessione). Questo file fissa obiettivo, scope in/out, task delineati, checkpoint e rischi.

**Prerequisito:** 1b chiuso (signup→org, org attiva in sessione, team via plugin).

---

## Obiettivo

Portare authorization, middleware e route da event-scoped a org-scoped. `permissions.ts` valuta i
permessi sul ruolo `member`, il middleware carica l'org attiva in `event.context`, le route diventano
`/api/organizations/*`. È il layer di sicurezza della fase: "utente A non tocca risorse di org B".

---

## Scope

### ✅ In 1c

- **RBAC su organization.** `permissions.ts`: `getUserRole(userId, eventId)` →
  `getOrgRole(userId, organizationId)` interrogando la tabella `member` (ruolo letto dalla riga, non
  più da `events.userId` + `event_users`). `requireMember`/`requireWrite`/`requireOwner` su org.
  Mapping ruoli (deciso nella spec FASE 1): `canManageTeam` = owner/admin, `canAccessBilling` = owner,
  write risorse = tutti e tre. Valutare l'uso di `requireOrgRole` nativo del plugin dove conviene.
- **Middleware.** Rimuovere `server/middleware/2.events.ts`; creare `2.organization.ts` che, sulle
  rotte org-scoped, carica l'org attiva + il ruolo del membro in `event.context`
  (`{ user, organization, role }`). Convenzione chiara per marcare una rotta come org-protetta.
- **Route org.** Le 5 route base `/api/events/*` (`index` get/post, `[eventId]` get/put/delete) →
  `/api/organizations/*` equivalenti, thin controller che delegano (CRUD org via plugin/repository).
  Risolvere il destino delle `/api/team/*` lasciato aperto in 1b (deleganti al plugin sotto
  `/api/organizations/[id]/members` o rimosse a favore del client plugin).
- **planLimit.** `canCreateEvent(userId)` → `canCreateOrganization(userId)`; conteggio su
  `organization`/`member`. Rinominare le costanti `pricing.ts`: `max_events` → `max_organizations`
  (o naming neutro), `team_members` invariato concettualmente, `storage_mb` invariato.
- **assertOwnership.** Helper riutilizzabile: una risorsa con `organizationId` è accessibile solo a
  membri di quell'org → 403 altrimenti. È il pattern che ogni risorsa futura (`projects`, FASE 4) usa.

### ❌ NON in 1c

- Frontend (store/pagine/composable/gating UI) → **1d**
- Auth flows / signup hook / team plugin wiring → già **1b**
- Driver Neon, deploy, `projects` completa, docs → FASI 2-5

---

## Task delineati

1. **`permissions.ts`** — riscrivere `getOrgRole` su `member`; rimappare i `can*` su owner/admin/
   member; mantenere le firme `requireMember/requireWrite/requireOwner` (consumer minimi: erano solo
   middleware + team.service, quest'ultimo già sostituito in 1b).
2. **`2.organization.ts`** — sostituire `2.events.ts`. Pattern: match rotte `/api/organizations/*`,
   `requireAuth`, carica org attiva (dalla sessione) + ruolo, popola context. 404/403 espliciti.
3. **Route `/api/organizations/*`** — i 5 endpoint base + risoluzione `/api/team/*`. Thin controller,
   `parseBody`, delega a repository/plugin. Audit log su scrittura.
4. **`planLimit` + `pricing.ts`** — rinominare funzioni/costanti event→org.
5. **`assertOwnership`** — helper + esempio d'uso documentato (lo userà `projects` in FASE 4).

---

## Checkpoint 1c

- [ ] `getOrgRole` ritorna il ruolo corretto dalla tabella `member`
- [ ] Owner/admin può gestire team; **member NO** (gating per ruolo testato)
- [ ] Middleware protegge le rotte org-scoped: senza sessione → **401**
- [ ] `assertOwnership` blocca accesso a risorsa di un'altra org → **403** (testato)
- [ ] Route `/api/organizations/*` funzionano; nessuna `/api/events/*` o `/api/team/*` residua
- [ ] `pnpm typecheck` verde
- [ ] Commit: `feat: org-based RBAC, middleware and routes (phase 1c)`

> ⚠️ Test più importante: **403 cross-org**. È il requisito di sicurezza della fase, ora a livello
> route/middleware (in 1a era a livello repository).

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| Sovrapposizione tra `requireOrgRole` nativo e i `require*` custom | Decidere in 1c quale usare dove (nativo per endpoint plugin, custom per route app) |
| Rinomina `pricing.ts` rompe consumer (`useSubscription`, limiti UI) | Grep consumer prima della rinomina; il frontend si allinea in 1d |
| `/api/team/*` lasciate ambigue da 1b | Risolverne il destino qui, esplicitamente |
