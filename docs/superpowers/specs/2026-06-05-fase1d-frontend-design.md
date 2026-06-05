# FASE 1d — Frontend org-centric (Scope)

> **Scope delineato, non dettaglio implementabile.** Sotto-step di FASE 1 (vedi
> `2026-06-05-fase1-tenancy-organization-design.md`). Il dettaglio a passi-fini si produce col
> brainstorm dedicato di 1d, **dopo** che 1c è chiuso (route `/api/organizations/*` vive, RBAC org).
> Questo file fissa obiettivo, scope in/out, task delineati, checkpoint e rischi.

**Prerequisito:** 1c chiuso (route org, middleware org, RBAC su `member`).

---

## Obiettivo

Portare il frontend da event-centric a org-centric: lo store, le pagine residue, i componenti e i
composable consumano le route `/api/organizations/*` e il client del plugin organization. È l'ultimo
step: chiude FASE 1 lasciando dashboard e gestione team funzionanti sul modello org.

---

## Superficie reale (contata post-FASE-0 — è poca)

- **`app/stores/eventStore.ts`** — espone state `events/currentEvent/membersCount/teamMembers/
  pendingInvitations/userPermissions` + actions `loadEvents/loadEvent/createEvent/updateEvent/
  deleteEvent/loadTeamMembers/inviteTeamMember`. Tutte chiamano `/api/events` o `/api/team`.
- **Pagine:** `dashboard/event/index.vue`, `dashboard/event/[id]/index.vue`,
  `dashboard/event/[id]/team.vue`, `app/pages/invite/[token].vue`.
- **Componenti:** `app/components/admin/home/HomeStats.client.vue`, `HomeWelcome.client.vue` (usano
  `eventStore`).
- **Composable:** `app/composables/useDashboard.ts` (non tocca `/api/` né event direttamente →
  conversione minima).
- `invite/[token].vue` chiama `/api/team/invite/[token]` + `/api/team/accept-invite` → questi
  endpoint spariscono (il plugin gestisce accept via client/route org).

---

## Scope

### ✅ In 1d

- **Store.** `eventStore` → `organizationStore` (Pinia): rinomina, state org-centric
  (`organizations/currentOrganization/members/pendingInvitations/role`), actions su
  `/api/organizations/*` + client plugin (`authClient.organization.*`). Allinea ai pattern dello
  skill `pinia-stores`.
- **Pagine.** Le 3 pagine `dashboard/event/**` → equivalenti `dashboard/organization/**` (o naming
  dashboard neutro): lista org, dettaglio/impostazioni org, gestione membri. `invite/[token].vue` →
  flusso accept-invito via plugin (l'accept passa dal client plugin, non dalle vecchie route team).
- **Componenti.** `HomeStats`/`HomeWelcome` da `eventStore` a `organizationStore`.
- **Composable.** `useDashboard` org-centric (conversione minima). Eventuale `useOrganization()` che
  espone org attiva + ruolo per il gating UI.
- **Gating UI per ruolo.** Nascondere/disabilitare azioni in base al ruolo (es. "Invita membro" non
  appare ai `member`) — consuma il ruolo da sessione/store.
- **Client plugin.** Aggiungere `organizationClient()` al `createAuthClient` (lato `useAuth`/client).

### ❌ NON in 1d

- Logica server (route/RBAC/middleware) → già 1c
- Auth flows / signup → già 1b
- Styling fine / redesign — l'obiettivo è funzionante org-centric, non estetico
- Driver Neon, deploy, `projects` UI completa, docs → FASI 2-5

---

## Task delineati

1. **`organizationClient()`** — registrare il plugin client; esporre i metodi org nel composable auth.
2. **`organizationStore`** — riscrivere `eventStore` su org + `/api/organizations/*` + client plugin.
3. **Pagine** — convertire le 3 pagine event + la pagina invite; aggiornare le rotte
   (`useLocalePath`) e le chiavi i18n residue event→org.
4. **Componenti + composable** — `HomeStats`/`HomeWelcome`/`useDashboard` su `organizationStore`.
5. **Gating UI** — helper per nascondere azioni non permesse dal ruolo.

---

## Checkpoint 1d

- [ ] Dashboard gira **org-centric**: lista org, dettaglio, gestione membri funzionano
- [ ] Creare org dal frontend, invitare membro, accettare invito (flusso plugin) funzionano end-to-end
- [ ] Il frontend **nasconde le azioni non permesse** in base al ruolo (member non vede "Invita")
- [ ] Nessun riferimento residuo a `eventStore`/`/api/events`/`/api/team` nel frontend
- [ ] `pnpm typecheck` verde
- [ ] Commit: `feat: org-centric frontend (phase 1d)`

> A 1d chiuso, FASE 1 è completa: `events`/`event_users` non esistono più a nessun livello
> (schema, server, frontend) e l'isolamento tenant è verificato end-to-end.

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| Accept-invito: flusso client plugin diverso dalle vecchie route team | Definire il flusso nel brainstorm 1d sui metodi reali del client plugin |
| Chiavi i18n event-flavored residue nel frontend | Genericizzare in 1d (il marketing/landing resta a FASE 5) |
| `useSubscription`/limiti UI rotti dalla rinomina `pricing.ts` di 1c | Allineare i consumer UI qui |
| Naming pagine `event`→`organization` vs dashboard neutro | Decidere la convenzione nel brainstorm 1d |
