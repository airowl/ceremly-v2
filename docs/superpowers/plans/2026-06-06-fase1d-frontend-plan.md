# FASE 1d — Frontend org-centric Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portare il frontend da event-centric a org-centric. Eliminare `eventStore` e ogni chiamata a `/api/events` / `/api/team`. Lo store, le pagine, i componenti home e la pagina invito consumano il **client plugin `organizationClient()`** (metodi pinnati in baseline A5/A6) + la route esistente `/api/limits` (campo rinominato in 1c). A 1d chiuso FASE 1 è completa: nessun residuo event a nessun livello del frontend.

**Architecture:** Pinia store `organizationStore` (sostituisce `eventStore`) costruito **client-plugin-first** — niente nuove forme di risposta `/api/organizations/*` inventate (1c non landed sul disco). Le pagine `dashboard/event/**` → `dashboard/organization/**`; la pagina `invite/[token]` → `invite/[id]` con flusso accept auth-first via plugin. Gating UI per ruolo via helper `useOrganization()` (legge `role` dallo store). Allineato ai pattern Pinia esistenti (`userStore`/`eventStore`: `defineStore` setup-syntax, `isLoading`/`error`, guard `import.meta.server`, return-object con `{ success, error }`).

**Tech Stack:** Nuxt 4 + Vue 3 + TypeScript, Pinia (auto-import), Nuxt UI v4, Better Auth 1.4.5 `organizationClient()` (`better-auth/client/plugins`), vue-i18n. Nessun framework di test → gate = `pnpm typecheck` + grep + smoke `pnpm dev`.

---

## Prerequisiti / Gate (cosa deve essere landed PRIMA di 1d)

| Dipendenza | Fase | Stato sul disco oggi | Effetto su 1d se mancante |
|---|---|---|---|
| Plugin org server `organization()` registrato | 1a | ✅ landed (`server/utils/auth.ts:220`) | — |
| `databaseHooks.user.create.after` → crea org al signup | **1b** | ❌ non landed | Un utente nuovo non ha org → `listOrganizations()` vuota. 1d **deve** gestire la lista vuota (empty state + "Crea organizzazione"). |
| `session.create.before` → setta `activeOrganizationId` in Redis | **1b** | ❌ non landed | `getFullOrganization()` (org attiva) può tornare `null`. 1d **deve** fare fallback: prendi la prima org dalla lista → `setActive()`. Questo è anche più robusto e aggira il wiring runtime-contingente. |
| Route `/api/organizations/*` + RBAC `member` + `2.organization.ts` | **1c** | ❌ non landed | 1d **non** dipende da queste route per il funzionamento dello store (è plugin-first). Restano opzionali per aggregati più ricchi. |
| `/api/limits` → `usage.organizations` (rename da `usage.events`) | **1c** | ❌ non landed (oggi `usage.events`) | 1d rinomina `userStore.LimitsResponse` e `checkEventCreationLimit`→`checkOrgCreationLimit`. **Runtime-contingente:** finché 1c non rinomina il payload server, il campo runtime resta `events`. Vedi Task 2/6 nota di onestà. |

> **Nota di onestà (globale):** `/api/organizations/*` e `/api/projects/*` **non esistono sul disco** al momento della scrittura (verificato: `find server/api/organizations` → vuoto). Per questo lo store è costruito **interamente** sui metodi del client plugin (pinnati e presenti in `better-auth` 1.4.5, endpoint verificati in `node_modules/better-auth/dist/organization-BdJSRNgM.mjs`), NON su forme di risposta custom-route ipotetiche. Tutto ciò che presuppone 1b/1c landed è marcato `> **Nota di onestà:**` nel task relativo e va **confermato a runtime** quando 1b/1c landano.

### Decisioni adottate (da baseline D — NON rivalutare)
1. **Plugin-native** per org/team: `authClient.organization.*` (baseline A5/A6). Niente `/api/team/*` (rimosse in 1a, non reintrodurre).
2. **Pages naming:** `dashboard/organization/**` (baseline D3).
3. **Accept-invito auth-first:** l'URL porta `invitation.id` (NON token), accept via `authClient.organization.acceptInvitation({ invitationId })`, dettagli pre-accept via `authClient.organization.getInvitation({ query: { id } })` (endpoint `/organization/get-invitation` verificato).
4. **Org attiva con fallback:** `getFullOrganization()` → se `null`, prima org da `listOrganizations()` + `setActive()` (baseline E1/E4).
5. **Limiti:** riusare `/api/limits` esistente (campo rinominato in 1c). Nessuna nuova route limiti.
6. **Ruoli:** default plugin `owner`/`admin`/`member` (baseline D5). Write = `owner|admin`. `member` = read-only (non vede "Invita"/"Rimuovi"/"Crea"). NON usare più `editor`/`viewer`.

---

## File Structure (mappa file — create / modify / delete)

### Store & composables
| Path | Azione | Responsabilità |
|---|---|---|
| `app/stores/organizationStore.ts` | **Create** | State org-centric (`organizations/currentOrganization/members/pendingInvitations/role`) + actions su `authClient.organization.*`. Spine del frontend org. |
| `app/stores/eventStore.ts` | **Delete** | Morto (chiama `/api/events` + `/api/team`). Rimosso dopo che tutti i consumer puntano a `organizationStore`. |
| `app/composables/useOrganization.ts` | **Create** | Espone org attiva + `role` + helper gating (`canManageMembers`/`canManageOrg`/`isOwner`) per il gating UI. |
| `app/composables/useAuth.ts` | **Modify** | Aggiungere `organizationClient()` ai plugin + esporre `client.organization` dal return. |
| `app/composables/useDashboard.ts` | **Modify (minimo)** | Solo allineare gli shortcut (no riferimenti a route event). |
| `app/stores/userStore.ts` | **Modify** | Rinomina `LimitsResponse.usage.events`→`usage.organizations`, `checkEventCreationLimit`→`checkOrgCreationLimit`. Runtime-contingente su 1c. |

### Pagine
| Path | Azione | Responsabilità |
|---|---|---|
| `app/pages/dashboard/organization/index.vue` | **Create** (da `dashboard/event/index.vue`) | Lista org + crea org (via plugin) + stats. |
| `app/pages/dashboard/organization/[id]/index.vue` | **Create** (da `dashboard/event/[id]/index.vue`) | Dettaglio/impostazioni org. |
| `app/pages/dashboard/organization/[id]/members.vue` | **Create** (da `dashboard/event/[id]/team.vue`) | Gestione membri + inviti (plugin). |
| `app/pages/dashboard/event/index.vue` | **Delete** | Sostituita. |
| `app/pages/dashboard/event/[id]/index.vue` | **Delete** | Sostituita. |
| `app/pages/dashboard/event/[id]/team.vue` | **Delete** | Sostituita. |
| `app/pages/dashboard/event/[id]/requirements.md` | **Delete** | Doc stale event. |
| `app/pages/invite/[id].vue` | **Create** (da `invite/[token].vue`) | Accept-invito auth-first via plugin. |
| `app/pages/invite/[token].vue` | **Delete** | Sostituita (flusso token-based morto). |

### Componenti (delete vs repoint — decisione esplicita per ciascuno)
| Path | Azione | Motivo |
|---|---|---|
| `app/components/admin/home/HomeWelcome.client.vue` | **Repoint** | Generico (saluto + nome contesto + piano). `eventStore.currentEvent.name` → `organizationStore.currentOrganization.name`. |
| `app/components/admin/home/HomeStats.client.vue` | **Repoint** | Generico (membri/storage). `eventStore` → `organizationStore` (membersCount), link team → `/dashboard/organization/[id]/members`. |
| `app/components/admin/orgs/AddOrgModal.client.vue` | **Repoint (finire stub)** | Già in dir target `orgs/` ma chiama `/api/events`. Convertire a `organizationStore.createOrganization` + i18n org. |
| `app/components/admin/orgs/DeleteModal.client.vue` | **Repoint** | Placeholder fake (`setTimeout`, "customer"). Convertire a delete-org reale via `organizationStore.deleteOrganization`. |
| `app/components/admin/home/HomeDashboardSidebar.client.vue` | **Delete (orfano)** | Verificato: nessun mount site (`grep AdminHomeDashboardSidebar app/` → 0 hit fuori dal file stesso). Era event-flavored (`eventId` prop + link team). Eliminare invece di repoint (lavoro sprecato). |
| `app/components/admin/home/HomeCreateEventModal.client.vue` | **Delete** | Vestigia event (`/api/events`). Montato SOLO da `HomeTopBarActions` (riga 54) → rimuovere il mount lì (Task 9). Sostituito da `AddOrgModal`. |
| `app/components/admin/home/HomeEventCards.client.vue` | **Delete (orfano)** | Event-domain (`/api/events`, `/dashboard/event`). Verificato: nessun mount site (solo citato in `requirements.md`). |
| `app/components/admin/home/HomeEventsTable.client.vue` | **Delete** | Event-domain, montato da `dashboard/index.vue` (riga 42) → mount rimosso in Task 10. |
| `app/components/admin/home/HomeEventSummaryCard.client.vue` | **Delete** | Event-only (montato dalla vecchia pagina event detail, anch'essa eliminata). |
| `app/components/admin/home/HomeRsvpCountdownCard.client.vue` | **Delete** | Event-only (RSVP/countdown — dominio eventi strippato; montato dalla vecchia pagina event detail). |
| `app/components/admin/EventUsageDashboard.vue` | **Delete** | Event-only (montato dalla vecchia pagina event detail). |
| `app/components/admin/PlanUsageDashboard.vue` | **Delete (orfano)** | Event-flavored (`checkEventCreationLimit`, `/dashboard/event`, i18n `dashboard.planUsage.event.*`). Verificato: nessun mount site (`grep AdminPlanUsageDashboard app/` → 0 hit). Eliminare. |
| `app/components/admin/home/HomeTopBarActions.client.vue` | **Modify** | Monta `<AdminHomeCreateEventModal>` (riga 54) → rimuovere quel mount (il componente viene eliminato). Mantenere il resto della topbar. |
| `app/components/event/PageHeader.vue` | **Keep + rinominare uso** | Generico (`UDashboardNavbar` wrapper). Resta; le nuove pagine lo usano via `<EventPageHeader>` (nome auto-import invariato — vive in `components/event/`). |

> **Nota:** `HomeChart`, `HomeDonutChart`, `HomeResponseChart`, `HomeStatCards`, `HomeSales`, `HomeTopBar`, `HomePeriodSelect`, `HomeDateRangePicker` NON toccano `eventStore` né `/api/events` né stringhe `/dashboard/event` (verificato grep → 0 hit). Restano invariati. Sono dati statici/mock UI fuori scope 1d. `HomeTopBarActions` è l'eccezione (monta `HomeCreateEventModal`) → vedi Task 9.

### Routing & nav
| Path | Azione | Responsabilità |
|---|---|---|
| `app/pages/dashboard.vue` | **Modify** | Sidebar/dropdown nav: `/dashboard/event*` → `/dashboard/organization*`; `dashboard-event-id*` → `dashboard-organization-id*`; rimuovere `HomeCreateEventModal`/`HomeEventCards`. |
| `app/pages/dashboard/index.vue` | **Modify** | Rimuovere `<AdminHomeEventsTable />` (riga 42). |

### i18n (solo chiavi dashboard/team — landing/marketing resta FASE 5)
| Path | Azione |
|---|---|
| `i18n/locales/it-IT.json` | **Modify** — aggiungere blocco `dashboard.organizationsList` / `organization.*` / `members.*` / `invite.*` org-flavored (riusare le esistenti `eventsList`/`team`/`invite` come base, genericizzare event→org). |
| `i18n/locales/en-US.json` | **Modify** — speculare a it-IT. |

---

## Task 1 — `organizationClient()` nel client auth

**Files:**
- Modify: `app/composables/useAuth.ts`
- Verify: `pnpm typecheck`

- [ ] **Aggiungere il plugin client.** In `app/composables/useAuth.ts` aggiornare l'import (riga 4) e l'array `plugins` (righe 15-31) + il return (righe 90-118):

```ts
// riga 4 — aggiungere organizationClient all'import esistente
import { adminClient, inferAdditionalFields, organizationClient, twoFactorClient } from "better-auth/client/plugins";
```

Nell'array `plugins` (dopo `creemClient(),` riga 30) aggiungere:

```ts
            creemClient(),
            organizationClient(),
        ],
    });
```

Nel return-object (dopo `twoFactor: client.twoFactor,` riga 117) aggiungere:

```ts
        twoFactor: client.twoFactor,
        organization: client.organization,
    };
}
```

- [ ] **Verify:** `pnpm typecheck` → 0 errori su `app/composables/useAuth.ts`. Output atteso: nessun errore `Property 'organization' does not exist`.
- [ ] **Commit:** `feat: register organizationClient in auth client (phase 1d)`

---

## Task 2 — `userStore`: rinomina limiti event→org

> **Nota di onestà:** il payload runtime di `/api/limits` espone `usage.events` finché 1c non lo rinomina in `usage.organizations`. Questo task rinomina i tipi e i metodi **client**; il binding al campo runtime corretto va confermato quando 1c landa. Nel frattempo lasciamo un alias di lettura difensivo (`?? data.usage?.events`) così lo UI non si rompe in entrambi gli stati.

**Files:**
- Modify: `app/stores/userStore.ts`
- Verify: `pnpm typecheck`

- [ ] **Rinominare il tipo del payload.** In `app/stores/userStore.ts` aggiornare `LimitsResponse.usage` (righe 21-26):

```ts
    usage: {
        organizations: ResourceLimit;
        pages: ResourceLimit | null;
        team: ResourceLimit | null;
        storage: StorageLimit | null;
    };
```

- [ ] **Rinominare il metodo + lettura difensiva.** Sostituire `checkEventCreationLimit` (righe 178-186) con:

```ts
    /**
     * Check if user can create a new organization.
     * Uses cached data if available, otherwise fetches.
     */
    async function checkOrgCreationLimit(): Promise<ResourceLimit> {
        if (import.meta.server) return { allowed: false, current: 0, limit: 0 };

        if (!limitsData.value) {
            await fetchLimits();
        }

        // Defensive read: 1c renames `usage.events` → `usage.organizations` server-side.
        const usage = limitsData.value?.usage as Record<string, ResourceLimit> | undefined;
        return usage?.organizations ?? usage?.events ?? { allowed: false, current: 0, limit: 0 };
    }
```

- [ ] **Aggiornare il return.** Nella lista di export (riga 253) sostituire `checkEventCreationLimit,` con `checkOrgCreationLimit,`.
- [ ] **Verify:** `pnpm typecheck` → 0 errori. `grep -rn "checkEventCreationLimit" app/` → solo i consumer ancora da convertire (Task 5/7). Atteso ora: 2 hit residui (`AddOrgModal`, `dashboard/event/index.vue` — entrambi rimossi/convertiti più avanti).
- [ ] **Commit:** `refactor: rename event-limit to org-limit in userStore (phase 1d)`

---

## Task 3 — `organizationStore` (Pinia, client-plugin-first)

**Files:**
- Create: `app/stores/organizationStore.ts`
- Verify: `pnpm typecheck`

> **Spine del frontend org.** Usa SOLO `authClient.organization.*` (metodi pinnati A5/A6, endpoint verificati). `getFullOrganization()` ritorna l'org attiva con `members` e `invitations` inclusi (endpoint `/organization/get-full-organization`). Fallback org-attiva-null (baseline E1/E4): se `null`, prendi la prima da `listOrganizations()` e `setActive()`.
>
> **Nota all'esecutore (nomi metodi client).** Better Auth deriva i metodi client dai path endpoint via camelCase. I nomi usati qui (`list`, `getFullOrganization`, `setActive`, `create`, `delete`, `inviteMember`, `updateMemberRole`, `removeMember`, `cancelInvitation`, `acceptInvitation`, `getInvitation`) corrispondono agli endpoint verificati in `node_modules/better-auth/dist/organization-BdJSRNgM.mjs`. Se `pnpm typecheck` segnala "Property 'X' does not exist on type", **usa il nome suggerito dai tipi** (es. `.list()` potrebbe risolversi come `.listOrganizations()`) — NON è un errore del piano, è il binding dei tipi al nome reale. Stesso discorso per la firma `getInvitation({ query: { id } })`: typecheck rileva un eventuale mismatch (es. `{ invitationId }` vs `{ query: { id } }`).

- [ ] **Creare lo store.** Scrivere `app/stores/organizationStore.ts`:

```ts
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

// ─── Types (allineati al payload del plugin Better Auth org) ───────────
export type OrgRole = 'owner' | 'admin' | 'member';

export interface OrganizationListItem {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    createdAt: string;
}

export interface OrganizationMember {
    id: string;            // member row id
    userId: string;
    role: OrgRole;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    };
}

export interface OrganizationInvitation {
    id: string;
    email: string;
    role: OrgRole;
    status: 'pending' | 'accepted' | 'rejected' | 'canceled';
    expiresAt: string;
    inviterId: string;
}

export interface OrganizationDetail extends OrganizationListItem {
    members: OrganizationMember[];
    invitations: OrganizationInvitation[];
}

export const useOrganizationStore = defineStore('organization', () => {
    // ─── State ─────────────────────────────────────────────────────────
    const organizations = ref<OrganizationListItem[]>([]);
    const currentOrganization = ref<OrganizationDetail | null>(null);
    const members = ref<OrganizationMember[]>([]);
    const pendingInvitations = ref<OrganizationInvitation[]>([]);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // ─── Getters ───────────────────────────────────────────────────────
    // Current user's role in the active org (consumed by gating UI)
    const role = computed<OrgRole | null>(() => {
        if (import.meta.server) return null;
        const { user } = useAuth();
        const uid = user.value?.id;
        if (!uid) return null;
        const m = members.value.find(x => x.userId === uid);
        return (m?.role as OrgRole) ?? null;
    });

    // ─── Actions: organizations ────────────────────────────────────────
    async function loadOrganizations() {
        if (import.meta.server) return;
        try {
            isLoading.value = true;
            error.value = null;
            const { client } = useAuth();
            const { data } = await client.organization.list();
            organizations.value = (data ?? []) as OrganizationListItem[];
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading organizations';
            console.error('Error loading organizations:', err);
        } finally {
            isLoading.value = false;
        }
    }

    // Load active org (with members + invitations). Falls back to first org + setActive.
    async function loadCurrentOrganization() {
        if (import.meta.server) return;
        try {
            isLoading.value = true;
            error.value = null;
            const { client } = useAuth();

            let { data } = await client.organization.getFullOrganization();

            // Fallback: no active org → pick first from list and set it active.
            if (!data) {
                if (organizations.value.length === 0) await loadOrganizations();
                const first = organizations.value[0];
                if (first) {
                    await client.organization.setActive({ organizationId: first.id });
                    ({ data } = await client.organization.getFullOrganization());
                }
            }

            if (data) {
                currentOrganization.value = data as unknown as OrganizationDetail;
                members.value = (data.members ?? []) as OrganizationMember[];
                pendingInvitations.value = ((data.invitations ?? []) as OrganizationInvitation[])
                    .filter(i => i.status === 'pending');
            } else {
                currentOrganization.value = null;
                members.value = [];
                pendingInvitations.value = [];
            }
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading organization';
            console.error('Error loading organization:', err);
        } finally {
            isLoading.value = false;
        }
    }

    async function setActiveOrganization(organizationId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            const { client } = useAuth();
            await client.organization.setActive({ organizationId });
            await loadCurrentOrganization();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || err.data?.message || 'Error switching organization' };
        }
    }

    async function createOrganization(input: { name: string; slug: string }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            isLoading.value = true;
            error.value = null;
            const { client } = useAuth();
            const { data, error: apiErr } = await client.organization.create({
                name: input.name,
                slug: input.slug,
            });
            if (apiErr) throw new Error(apiErr.message || 'Error creating organization');
            await loadOrganizations();
            return { success: true, organization: data };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error creating organization';
            return { success: false, error: error.value };
        } finally {
            isLoading.value = false;
        }
    }

    async function deleteOrganization(organizationId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            const { client } = useAuth();
            await client.organization.delete({ organizationId });
            organizations.value = organizations.value.filter(o => o.id !== organizationId);
            if (currentOrganization.value?.id === organizationId) {
                currentOrganization.value = null;
                members.value = [];
                pendingInvitations.value = [];
            }
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || err.data?.message || 'Error deleting organization' };
        }
    }

    // ─── Actions: members & invitations (plugin team API) ──────────────
    async function inviteMember(email: string, role: OrgRole = 'member') {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            const { client } = useAuth();
            const { data, error: apiErr } = await client.organization.inviteMember({ email, role });
            if (apiErr) throw new Error(apiErr.message || 'Error inviting member');
            await loadCurrentOrganization();
            return { success: true, invitation: data };
        } catch (err: any) {
            return { success: false, error: err.message || err.data?.message || 'Error inviting member' };
        }
    }

    async function updateMemberRole(memberId: string, role: OrgRole) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            const { client } = useAuth();
            await client.organization.updateMemberRole({ memberId, role });
            await loadCurrentOrganization();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || err.data?.message || 'Error updating role' };
        }
    }

    async function removeMember(memberIdOrEmail: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            const { client } = useAuth();
            await client.organization.removeMember({ memberIdOrEmail });
            await loadCurrentOrganization();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || err.data?.message || 'Error removing member' };
        }
    }

    async function cancelInvitation(invitationId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            const { client } = useAuth();
            await client.organization.cancelInvitation({ invitationId });
            await loadCurrentOrganization();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message || err.data?.message || 'Error cancelling invitation' };
        }
    }

    function $reset() {
        organizations.value = [];
        currentOrganization.value = null;
        members.value = [];
        pendingInvitations.value = [];
        isLoading.value = false;
        error.value = null;
    }

    return {
        // State
        organizations,
        currentOrganization,
        members,
        pendingInvitations,
        isLoading,
        error,
        // Getters
        role,
        // Actions
        loadOrganizations,
        loadCurrentOrganization,
        setActiveOrganization,
        createOrganization,
        deleteOrganization,
        inviteMember,
        updateMemberRole,
        removeMember,
        cancelInvitation,
        $reset,
    };
});
```

> **Nota di onestà (runtime):** le forme `data.members` / `data.invitations` di `getFullOrganization()` e le firme dei metodi team (`inviteMember`/`updateMemberRole`/`removeMember`/`cancelInvitation`) sono pinnate dagli endpoint verificati (`/organization/get-full-organization`, `/organization/invite-member`, ecc., baseline A5) e dai tipi `better-auth` 1.4.5. I cast `as unknown as OrganizationDetail` assorbono eventuali differenze nominali fra il tipo inferito del plugin e i tipi locali — **da confermare a runtime** (smoke) quando 1b/1c landano e una sessione viva esiste. Le route plugin team richiedono sessione viva → non testabili via tsx, solo smoke.

- [ ] **Verify:** `pnpm typecheck` → 0 errori su `organizationStore.ts`.
- [ ] **Commit:** `feat: add organizationStore (client-plugin-first) (phase 1d)`

---

## Task 4 — `useOrganization()` composable (gating per ruolo)

**Files:**
- Create: `app/composables/useOrganization.ts`
- Verify: `pnpm typecheck`

- [ ] **Creare il composable.** Scrivere `app/composables/useOrganization.ts`:

```ts
import { storeToRefs } from 'pinia';
import { useOrganizationStore } from '~/stores/organizationStore';

/**
 * Org-attiva + ruolo + helper di gating UI.
 * Write = owner|admin. `member` = read-only (no Invita / Rimuovi / Crea).
 */
export function useOrganization() {
    const store = useOrganizationStore();
    const { currentOrganization, role, members, pendingInvitations } = storeToRefs(store);

    const isOwner = computed(() => role.value === 'owner');
    const isAdmin = computed(() => role.value === 'admin');
    const canManageOrg = computed(() => role.value === 'owner'); // delete/rename org
    const canManageMembers = computed(() => role.value === 'owner' || role.value === 'admin');

    return {
        currentOrganization,
        role,
        members,
        pendingInvitations,
        isOwner,
        isAdmin,
        canManageOrg,
        canManageMembers,
    };
}
```

- [ ] **Verify:** `pnpm typecheck` → 0 errori.
- [ ] **Commit:** `feat: add useOrganization composable for role gating (phase 1d)`

---

## Task 5 — Pagina lista organizzazioni + AddOrgModal/DeleteModal

**Files:**
- Create: `app/pages/dashboard/organization/index.vue`
- Modify: `app/components/admin/orgs/AddOrgModal.client.vue`
- Modify: `app/components/admin/orgs/DeleteModal.client.vue`
- Verify: `pnpm typecheck`

- [ ] **Convertire AddOrgModal (finire lo stub).** Sostituire l'intero `<script setup>` di `app/components/admin/orgs/AddOrgModal.client.vue` (righe 1-89) con:

```ts
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useOrganizationStore } from '~/stores/organizationStore'
import { useUserStore } from '~/stores/userStore'

const { t } = useI18n()
const userStore = useUserStore()
const orgStore = useOrganizationStore()
const toast = useToast()

const refreshOrgs = inject<() => Promise<void>>('refreshOrgs')

const schema = computed(() => z.object({
    name: z.string().min(2, t('organization.createModal.validation.tooShort')),
    slug: z.string().min(2, t('organization.createModal.validation.tooShort'))
        .regex(/^[a-z0-9-]+$/, t('organization.createModal.validation.slugFormat'))
}))
const open = ref(false)

type Schema = z.output<typeof schema.value>

const state = reactive({
    name: undefined as string | undefined,
    slug: undefined as string | undefined
})

const orgLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null)
const isLoadingLimits = ref(false)

async function loadLimits() {
    if (!userStore.user?.id) return
    isLoadingLimits.value = true
    try {
        orgLimit.value = await userStore.checkOrgCreationLimit()
    } catch (error) {
        console.error('Error loading limits:', error)
    } finally {
        isLoadingLimits.value = false
    }
}

const canCreateOrg = computed(() => orgLimit.value?.allowed ?? true)

const isSubmitting = ref(false)
async function onSubmit(event: FormSubmitEvent<Schema>) {
    if (!canCreateOrg.value) {
        toast.add({
            title: t('organization.createModal.limitReached'),
            description: t('organization.createModal.limitReachedDescription'),
            color: 'warning'
        })
        return
    }
    isSubmitting.value = true
    try {
        const result = await orgStore.createOrganization({ name: event.data.name, slug: event.data.slug })
        if (!result.success) throw new Error(result.error || t('organization.createModal.failedToCreate'))
        await refreshOrgs?.()
        if (orgLimit.value) orgLimit.value.current += 1
        toast.add({
            title: t('organization.createModal.success'),
            description: t('organization.createModal.successDescription', { name: event.data.name }),
            color: 'success'
        })
        open.value = false
        state.name = undefined
        state.slug = undefined
    } catch (err: any) {
        toast.add({ title: t('organization.createModal.error'), description: err.message, color: 'error' })
    } finally {
        isSubmitting.value = false
    }
}

watch(open, async (newOpen) => {
    if (newOpen) await loadLimits()
})
</script>
```

Poi nel `<template>` (righe 91-144) sostituire le chiavi i18n `event.createModal.*` con `organization.createModal.*`, `canCreateEvent`→`canCreateOrg`, `eventLimit`→`orgLimit`, e nel bottone submit aggiungere `:loading="isSubmitting"`. Esempio del bottone trigger e del bottone create:

```html
        <UButton
            :label="$t('organization.createModal.button')"
            icon="i-lucide-plus"
            :disabled="!canCreateOrg || isLoadingLimits"
            :loading="isLoadingLimits"
        />
```

```html
                    <UButton
                        :label="$t('organization.createModal.create')"
                        color="primary"
                        variant="solid"
                        type="submit"
                        :disabled="!canCreateOrg"
                        :loading="isSubmitting"
                    />
```

- [ ] **Convertire DeleteModal a delete-org reale.** Sostituire l'intero `app/components/admin/orgs/DeleteModal.client.vue`:

```ts
<script setup lang="ts">
import { useOrganizationStore } from '~/stores/organizationStore'

const props = defineProps<{ organizationId: string; organizationName: string }>()
const emit = defineEmits<{ deleted: [] }>()

const { t } = useI18n()
const orgStore = useOrganizationStore()
const toast = useToast()
const open = ref(false)
const isDeleting = ref(false)

async function onSubmit() {
    isDeleting.value = true
    try {
        const result = await orgStore.deleteOrganization(props.organizationId)
        if (!result.success) throw new Error(result.error || t('organization.deleteModal.error'))
        toast.add({ title: t('organization.deleteModal.success'), color: 'success' })
        open.value = false
        emit('deleted')
    } catch (err: any) {
        toast.add({ title: t('organization.deleteModal.error'), description: err.message, color: 'error' })
    } finally {
        isDeleting.value = false
    }
}
</script>

<template>
    <UModal
        v-model:open="open"
        :title="t('organization.deleteModal.title', { name: organizationName })"
        :description="t('organization.deleteModal.description')"
    >
        <slot />
        <template #body>
            <div class="flex justify-end gap-2">
                <UButton :label="t('common.cancel')" color="neutral" variant="subtle" @click="open = false" />
                <UButton :label="t('organization.deleteModal.confirm')" color="error" variant="solid" :loading="isDeleting" @click="onSubmit" />
            </div>
        </template>
    </UModal>
</template>
```

- [ ] **Creare la pagina lista.** Scrivere `app/pages/dashboard/organization/index.vue` (adattata da `dashboard/event/index.vue`, ma su `organizationStore` + plugin; stats = totale org, niente date event):

```vue
<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { format } from 'date-fns'
import { it, enUS } from 'date-fns/locale'
import { useOrganizationStore, type OrganizationListItem } from '~/stores/organizationStore'

definePageMeta({ title: 'Organizations', layout: 'dashboard' })

const { t, locale } = useI18n()
const router = useRouter()
const orgStore = useOrganizationStore()

const UButton = resolveComponent('UButton')
const UIcon = resolveComponent('UIcon')

const search = ref('')

await useAsyncData('organizations-list', async () => {
    if (import.meta.server) return []
    await orgStore.loadOrganizations()
    return orgStore.organizations
}, { server: false })

provide('refreshOrgs', () => orgStore.loadOrganizations())

const filteredOrgs = computed(() => {
    const all = orgStore.organizations
    if (!search.value) return all
    const q = search.value.toLowerCase()
    return all.filter(o => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
})

function formatDate(s: string) {
    return format(new Date(s), 'd MMM yyyy', { locale: locale.value === 'it' ? it : enUS })
}

async function openOrg(id: string) {
    await orgStore.setActiveOrganization(id)
    router.push(`/dashboard/organization/${id}`)
}

const columns: TableColumn<OrganizationListItem>[] = [
    {
        accessorKey: 'name',
        header: () => t('dashboard.organizationsList.columns.name'),
        cell: ({ row }) => h('span', { class: 'font-semibold text-sm text-highlighted' }, row.original.name)
    },
    {
        accessorKey: 'slug',
        header: () => t('dashboard.organizationsList.columns.slug'),
        cell: ({ row }) => h('span', { class: 'text-sm text-muted' }, row.original.slug)
    },
    {
        accessorKey: 'createdAt',
        header: () => t('dashboard.organizationsList.columns.createdAt'),
        cell: ({ row }) => h('span', { class: 'text-sm' }, formatDate(row.original.createdAt))
    },
    {
        id: 'actions',
        header: () => h('span', { class: 'text-right block' }, t('dashboard.organizationsList.columns.actions')),
        cell: ({ row }) => h('div', { class: 'text-right' }, [
            h(UButton, {
                icon: 'i-lucide-arrow-right', color: 'neutral', variant: 'ghost', size: 'sm',
                onClick: () => openOrg(row.original.id)
            })
        ])
    }
]
</script>

<template>
    <UDashboardPanel id="organizations-list">
        <template #header>
            <UDashboardNavbar :title="$t('dashboard.organizationsList.title')" :ui="{ right: 'gap-3' }">
                <template #leading>
                    <UDashboardSidebarCollapse />
                </template>
                <template #right>
                    <UInput v-model="search" icon="i-lucide-search" :placeholder="$t('dashboard.organizationsList.search')" class="max-w-64 hidden lg:block" />
                    <AdminOrgsAddOrgModal />
                </template>
            </UDashboardNavbar>
        </template>

        <template #body>
            <div v-if="orgStore.isLoading" class="flex items-center justify-center py-12">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-primary" />
            </div>
            <div v-else-if="!orgStore.organizations.length" class="text-center py-12">
                <UIcon name="i-lucide-building-2" class="size-12 text-muted mx-auto mb-4" />
                <h3 class="text-lg font-medium mb-2">{{ $t('dashboard.organizationsList.empty.title') }}</h3>
                <p class="text-muted mb-4">{{ $t('dashboard.organizationsList.empty.description') }}</p>
                <AdminOrgsAddOrgModal />
            </div>
            <div v-else class="bg-default rounded-xl border border-default overflow-hidden">
                <UTable :data="filteredOrgs" :columns="columns" />
            </div>
        </template>
    </UDashboardPanel>
</template>
```

> **Nota di onestà:** `AdminOrgsAddOrgModal` è il nome auto-import di `components/admin/orgs/AddOrgModal.client.vue`. Confermare a runtime che il trigger-button interno apra il modal (lo stub usa il `<UButton>` nel default slot — pattern Nuxt UI esistente).

- [ ] **Verify:** `pnpm typecheck` → 0 errori. `grep -rn "/api/events\|checkEventCreationLimit" app/components/admin/orgs/` → 0 hit.
- [ ] **Commit:** `feat: organizations list page + org create/delete modals (phase 1d)`

---

## Task 6 — Pagina dettaglio organizzazione

**Files:**
- Create: `app/pages/dashboard/organization/[id]/index.vue`
- Verify: `pnpm typecheck`

- [ ] **Creare la pagina dettaglio** `app/pages/dashboard/organization/[id]/index.vue` (adattata da `dashboard/event/[id]/index.vue`, su `organizationStore` + gating via `useOrganization`; delete via `DeleteModal` solo per owner):

```vue
<script setup lang="ts">
import { useOrganizationStore } from '~/stores/organizationStore'
import { useOrganization } from '~/composables/useOrganization'

const route = useRoute()
const router = useRouter()
const orgStore = useOrganizationStore()
const { canManageOrg } = useOrganization()

definePageMeta({ title: 'Organization', layout: 'dashboard' })

const orgId = computed(() => route.params.id as string)

onMounted(async () => {
    if (!orgId.value) return
    await orgStore.setActiveOrganization(orgId.value)
})

watch(orgId, async (id) => {
    if (id) await orgStore.setActiveOrganization(id)
})

async function onDeleted() {
    await router.push('/dashboard/organization')
}
</script>

<template>
    <UDashboardPanel id="organization-detail">
        <template #header>
            <EventPageHeader :title="orgStore.currentOrganization?.name ?? $t('organization.detail.title')" back-to="/dashboard/organization">
                <template #actions>
                    <UButton
                        :label="$t('organization.detail.members')"
                        icon="i-lucide-users"
                        color="neutral"
                        variant="subtle"
                        :to="`/dashboard/organization/${orgId}/members`"
                    />
                    <AdminOrgsDeleteModal
                        v-if="canManageOrg && orgStore.currentOrganization"
                        :organization-id="orgStore.currentOrganization.id"
                        :organization-name="orgStore.currentOrganization.name"
                        @deleted="onDeleted"
                    >
                        <UButton :label="$t('organization.detail.delete')" icon="i-lucide-trash-2" color="error" variant="subtle" />
                    </AdminOrgsDeleteModal>
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div v-if="orgStore.isLoading && !orgStore.currentOrganization" class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <USkeleton class="h-40 lg:col-span-2 rounded-xl" />
                <USkeleton class="h-40 rounded-xl" />
            </div>

            <template v-else-if="orgStore.currentOrganization">
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div class="lg:col-span-2 bg-default p-5 rounded-xl border border-default">
                        <h3 class="text-sm uppercase text-muted font-medium mb-2">{{ $t('organization.detail.info') }}</h3>
                        <p class="text-2xl font-bold text-highlighted">{{ orgStore.currentOrganization.name }}</p>
                        <p class="text-muted">{{ orgStore.currentOrganization.slug }}</p>
                    </div>
                    <div class="bg-default p-5 rounded-xl border border-default flex items-center justify-between">
                        <div>
                            <p class="text-muted text-sm font-medium mb-1">{{ $t('organization.detail.membersCount') }}</p>
                            <h3 class="text-3xl font-bold text-highlighted">{{ orgStore.members.length }}</h3>
                        </div>
                        <div class="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <UIcon name="i-lucide-users" class="size-5 text-primary" />
                        </div>
                    </div>
                </div>
            </template>
        </template>
    </UDashboardPanel>
</template>
```

- [ ] **Verify:** `pnpm typecheck` → 0 errori.
- [ ] **Commit:** `feat: organization detail page with role-gated delete (phase 1d)`

---

## Task 7 — Pagina gestione membri (inviti + ruoli + gating)

**Files:**
- Create: `app/pages/dashboard/organization/[id]/members.vue`
- Verify: `pnpm typecheck`

> Gating: `canManageMembers` (owner|admin) governa "Invita", cambio ruolo, rimozione, cancel invito. `member` vede solo la lista (read-only). Niente più `editor`/`viewer`.

- [ ] **Creare la pagina membri** `app/pages/dashboard/organization/[id]/members.vue` (adattata da `dashboard/event/[id]/team.vue`, su `organizationStore` + plugin):

```vue
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useUserStore } from '~/stores/userStore'
import { useOrganizationStore, type OrganizationMember, type OrganizationInvitation, type OrgRole } from '~/stores/organizationStore'
import { useOrganization } from '~/composables/useOrganization'

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const userStore = useUserStore()
const orgStore = useOrganizationStore()
const { canManageMembers } = useOrganization()

definePageMeta({ title: 'Members', layout: 'dashboard' })

const orgId = computed(() => route.params.id as string)
const currentUserId = computed(() => userStore.user?.id)

const showInviteModal = ref(false)
const showRoleModal = ref(false)
const selectedMember = ref<OrganizationMember | null>(null)
const selectedRole = ref<OrgRole>('member')
const isInviting = ref(false)
const isUpdatingRole = ref(false)
const isDeletingMember = ref<string | null>(null)
const isCancellingInvite = ref<string | null>(null)

const roleOptions = computed(() => [
    { value: 'admin', label: t('members.roles.admin'), description: t('members.roleDescriptions.admin') },
    { value: 'member', label: t('members.roles.member'), description: t('members.roleDescriptions.member') },
])

const inviteSchema = z.object({ email: z.string().email(t('members.validation.invalidEmail')) })
type InviteSchema = z.output<typeof inviteSchema>
const inviteFormData = reactive<Partial<InviteSchema>>({ email: undefined })

onMounted(async () => {
    if (orgStore.currentOrganization?.id !== orgId.value) {
        await orgStore.setActiveOrganization(orgId.value)
    }
})

function getRoleLabel(m: OrganizationMember): string {
    return t(`members.roles.${m.role}`)
}
function getRoleBadgeColor(m: OrganizationMember): string {
    if (m.role === 'owner') return 'success'
    if (m.role === 'admin') return 'info'
    return 'neutral'
}
function canEditMember(m: OrganizationMember): boolean {
    if (m.role === 'owner') return false
    if (m.userId === currentUserId.value) return false
    return canManageMembers.value
}

async function onInviteSubmit(event: FormSubmitEvent<InviteSchema>) {
    isInviting.value = true
    try {
        const result = await orgStore.inviteMember(event.data.email, 'member')
        if (result.success) {
            toast.add({ title: t('members.inviteSent'), description: t('members.inviteSentDescription', { email: event.data.email }), color: 'success' })
            showInviteModal.value = false
            inviteFormData.email = undefined
        } else {
            toast.add({ title: t('common.error'), description: result.error || t('members.inviteError'), color: 'error' })
        }
    } finally {
        isInviting.value = false
    }
}

function openRoleModal(m: OrganizationMember) {
    selectedMember.value = m
    selectedRole.value = m.role === 'admin' ? 'admin' : 'member'
    showRoleModal.value = true
}

async function saveRole() {
    if (!selectedMember.value) return
    isUpdatingRole.value = true
    try {
        const result = await orgStore.updateMemberRole(selectedMember.value.id, selectedRole.value)
        if (result.success) {
            toast.add({ title: t('members.roleUpdated'), color: 'success' })
            showRoleModal.value = false
        } else {
            toast.add({ title: t('common.error'), description: result.error || t('members.roleUpdateError'), color: 'error' })
        }
    } finally {
        isUpdatingRole.value = false
    }
}

async function removeMember(m: OrganizationMember) {
    isDeletingMember.value = m.id
    try {
        const result = await orgStore.removeMember(m.id)
        if (result.success) toast.add({ title: t('members.memberRemoved'), color: 'success' })
        else toast.add({ title: t('common.error'), description: result.error || t('members.memberRemoveError'), color: 'error' })
    } finally {
        isDeletingMember.value = null
    }
}

async function cancelInvitation(inv: OrganizationInvitation) {
    isCancellingInvite.value = inv.id
    try {
        const result = await orgStore.cancelInvitation(inv.id)
        if (result.success) toast.add({ title: t('members.inviteCancelled'), color: 'success' })
        else toast.add({ title: t('common.error'), description: result.error || t('members.inviteCancelError'), color: 'error' })
    } finally {
        isCancellingInvite.value = null
    }
}
</script>

<template>
    <UDashboardPanel id="members-management">
        <template #header>
            <EventPageHeader :title="t('members.title')" :back-to="`/dashboard/organization/${orgId}`">
                <template #actions>
                    <UButton
                        v-if="canManageMembers"
                        :label="t('members.inviteMember')"
                        icon="i-lucide-user-plus"
                        @click="showInviteModal = true"
                    />
                </template>
            </EventPageHeader>
        </template>

        <template #body>
            <div class="p-4 sm:p-6 space-y-6">
                <div v-if="orgStore.isLoading" class="flex items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary" />
                </div>

                <template v-else>
                    <UPageCard :title="t('members.activeMembers')" variant="subtle">
                        <div v-if="orgStore.members.length === 0" class="text-center py-8">
                            <UIcon name="i-lucide-users" class="w-12 h-12 text-muted mx-auto mb-4" />
                            <p class="text-muted">{{ t('members.noMembers') }}</p>
                        </div>
                        <div v-else class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left text-sm text-muted border-b border-default">
                                        <th class="pb-3 font-medium">{{ t('members.member') }}</th>
                                        <th class="pb-3 font-medium">{{ t('members.roleLabel') }}</th>
                                        <th class="pb-3 font-medium text-right">{{ t('members.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="m in orgStore.members" :key="m.id" class="border-b border-default last:border-b-0">
                                        <td class="py-4">
                                            <div class="flex items-center gap-3">
                                                <UAvatar :src="m.user.image || undefined" :alt="m.user.name" size="md" />
                                                <div>
                                                    <p class="font-medium text-highlighted">{{ m.user.name }}</p>
                                                    <p class="text-sm text-muted">{{ m.user.email }}</p>
                                                </div>
                                                <UBadge v-if="m.userId === currentUserId" :label="t('members.you')" variant="subtle" size="xs" />
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <UBadge :label="getRoleLabel(m)" :color="getRoleBadgeColor(m)" variant="subtle" />
                                        </td>
                                        <td class="py-4 text-right">
                                            <div class="flex items-center justify-end gap-2">
                                                <UTooltip v-if="canEditMember(m)" :text="t('members.changeRole')">
                                                    <UButton icon="i-lucide-shield" color="neutral" variant="ghost" size="sm" @click="openRoleModal(m)" />
                                                </UTooltip>
                                                <UTooltip v-if="canEditMember(m)" :text="t('members.removeMember')">
                                                    <UButton icon="i-lucide-user-minus" color="error" variant="ghost" size="sm" :loading="isDeletingMember === m.id" @click="removeMember(m)" />
                                                </UTooltip>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UPageCard>

                    <UPageCard v-if="orgStore.pendingInvitations.length > 0" :title="t('members.pendingInvitations')" variant="subtle">
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="text-left text-sm text-muted border-b border-default">
                                        <th class="pb-3 font-medium">{{ t('members.email') }}</th>
                                        <th class="pb-3 font-medium text-right">{{ t('members.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="inv in orgStore.pendingInvitations" :key="inv.id" class="border-b border-default last:border-b-0">
                                        <td class="py-4">
                                            <div class="flex items-center gap-2">
                                                <UIcon name="i-lucide-mail" class="w-4 h-4 text-muted" />
                                                <span class="font-medium">{{ inv.email }}</span>
                                            </div>
                                        </td>
                                        <td class="py-4 text-right">
                                            <UTooltip v-if="canManageMembers" :text="t('members.cancelInvite')">
                                                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" :loading="isCancellingInvite === inv.id" @click="cancelInvitation(inv)" />
                                            </UTooltip>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </UPageCard>

                    <div v-if="orgStore.error" class="text-center py-8">
                        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-error mx-auto mb-4" />
                        <p class="text-muted">{{ orgStore.error }}</p>
                    </div>
                </template>
            </div>

            <UModal v-model:open="showInviteModal" :ui="{ content: 'max-w-md' }">
                <template #content>
                    <UCard>
                        <template #header>
                            <h3 class="text-lg font-semibold">{{ t('members.inviteMemberTitle') }}</h3>
                        </template>
                        <UForm :schema="inviteSchema" :state="inviteFormData" class="space-y-5" @submit="onInviteSubmit">
                            <UFormField name="email" :label="t('members.emailLabel')">
                                <UInput v-model="inviteFormData.email" type="email" :placeholder="t('members.emailPlaceholder')" icon="i-lucide-mail" size="lg" />
                            </UFormField>
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton :label="t('common.cancel')" color="neutral" variant="outline" @click="showInviteModal = false" />
                                <UButton :label="t('members.sendInvite')" icon="i-lucide-send" type="submit" :loading="isInviting" />
                            </div>
                        </UForm>
                    </UCard>
                </template>
            </UModal>

            <UModal v-model:open="showRoleModal" :ui="{ content: 'max-w-md' }">
                <template #content>
                    <UCard>
                        <template #header>
                            <h3 class="text-lg font-semibold">{{ t('members.changeRoleTitle') }}</h3>
                        </template>
                        <div class="space-y-3">
                            <label
                                v-for="option in roleOptions"
                                :key="option.value"
                                class="flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all"
                                :class="selectedRole === option.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-default hover:border-primary/50'"
                                @click="selectedRole = option.value as OrgRole"
                            >
                                <div>
                                    <p class="font-medium">{{ option.label }}</p>
                                    <p class="text-sm text-muted mt-0.5">{{ option.description }}</p>
                                </div>
                            </label>
                        </div>
                        <template #footer>
                            <div class="flex justify-end gap-3 pt-2">
                                <UButton :label="t('common.cancel')" variant="outline" @click="showRoleModal = false" />
                                <UButton :label="t('members.saveRole')" :loading="isUpdatingRole" icon="i-lucide-check" @click="saveRole" />
                            </div>
                        </template>
                    </UCard>
                </template>
            </UModal>
        </template>
    </UDashboardPanel>
</template>
```

- [ ] **Verify:** `pnpm typecheck` → 0 errori.
- [ ] **Commit:** `feat: organization members management page (plugin team API) (phase 1d)`

---

## Task 8 — Pagina invito (accept auth-first via plugin)

**Files:**
- Create: `app/pages/invite/[id].vue`
- Delete: `app/pages/invite/[token].vue`
- Verify: `pnpm typecheck`

> **Flusso (baseline E6):** l'URL porta `invitation.id`. Dettagli pre-accept via `authClient.organization.getInvitation({ query: { id } })` (endpoint `/organization/get-invitation` verificato → mostra org + inviter prima dell'accept). Accept via `authClient.organization.acceptInvitation({ invitationId })` (richiede sessione viva con email == invito). Se non loggato: tabs login/signup → poi accept.

- [ ] **Creare `app/pages/invite/[id].vue`:**

```vue
<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { useUserStore } from '~/stores/userStore'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { t } = useI18n()
const { user: authUser, client } = useAuth()

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: () => t('invite.title') })

const invitationId = computed(() => route.params.id as string)

const invitation = ref<{
    id: string
    email: string
    organizationName: string
    inviterEmail: string
    status: string
    expiresAt: string
} | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const mode = ref<'login' | 'signup'>('login')
const accepting = ref(false)

const loginFields = computed(() => [
    { name: 'email', type: 'text' as const, label: t('invite.email'), placeholder: t('invite.emailPlaceholder'), required: true },
    { name: 'password', type: 'password' as const, label: t('invite.password'), placeholder: t('invite.passwordPlaceholder') },
])
const signupFields = computed(() => [
    { name: 'name', type: 'text' as const, label: t('invite.fullName'), placeholder: t('invite.fullNamePlaceholder'), required: true },
    { name: 'email', type: 'text' as const, label: t('invite.email'), placeholder: t('invite.emailPlaceholder'), required: true },
    { name: 'password', type: 'password' as const, label: t('invite.password'), placeholder: t('invite.passwordPlaceholderSignup') },
])
const loginSchema = computed(() => z.object({
    email: z.string().email(t('invite.validation.invalidEmail')),
    password: z.string().min(8, t('invite.validation.passwordTooShort')),
}))
const signupSchema = computed(() => z.object({
    name: z.string().min(2, t('invite.validation.nameTooShort')),
    email: z.string().email(t('invite.validation.invalidEmail')),
    password: z.string().min(8, t('invite.validation.passwordTooShort')),
}))
interface LoginSchema { email: string; password: string }
interface SignupSchema { name: string; email: string; password: string }

async function fetchInvitation() {
    loading.value = true
    error.value = null
    try {
        const { data, error: apiErr } = await client.organization.getInvitation({ query: { id: invitationId.value } })
        if (apiErr || !data) {
            error.value = apiErr?.message || t('invite.invalidInvitationMessage')
            return
        }
        invitation.value = {
            id: data.id,
            email: data.email,
            organizationName: (data as any).organizationName ?? (data as any).organization?.name ?? '',
            inviterEmail: (data as any).inviterEmail ?? (data as any).inviter?.user?.email ?? '',
            status: data.status,
            expiresAt: data.expiresAt as unknown as string,
        }
        if (invitation.value.status !== 'pending') {
            error.value = t('invite.alreadyAccepted')
        }
    } catch (err: any) {
        error.value = err.message || err.data?.message || t('invite.failedToLoad')
    } finally {
        loading.value = false
    }
}

const defaultEmail = computed(() => invitation.value?.email || '')

async function acceptInvitation() {
    accepting.value = true
    try {
        const { error: apiErr } = await client.organization.acceptInvitation({ invitationId: invitationId.value })
        if (apiErr) throw new Error(apiErr.message || t('invite.failedToAccept'))
        toast.add({ title: t('invite.welcomeToTeam'), description: t('invite.youveJoined', { org: invitation.value?.organizationName }), color: 'success' })
        await router.push('/dashboard/organization')
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.data?.message || err.message, color: 'error' })
    } finally {
        accepting.value = false
    }
}

async function onLoginSubmit(payload: FormSubmitEvent<LoginSchema>) {
    try {
        await userStore.login(payload.data.email, payload.data.password)
        await acceptInvitation()
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
    }
}

async function onSignupSubmit(payload: FormSubmitEvent<SignupSchema>) {
    try {
        await userStore.signup(payload.data.email, payload.data.password, { name: payload.data.name })
        toast.add({ title: t('invite.accountCreated'), description: t('invite.verifyEmailMessage'), color: 'info' })
    } catch (err: any) {
        toast.add({ title: t('invite.error'), description: err.message, color: 'error' })
    }
}

onMounted(async () => {
    await fetchInvitation()
    if (!userStore.isAuthenticated) await userStore.initializeAuth()
    if (authUser.value && invitation.value && !error.value) {
        const userEmail = authUser.value.email?.toLowerCase()
        const inviteEmail = invitation.value.email?.toLowerCase()
        if (userEmail === inviteEmail) await acceptInvitation()
        else error.value = t('invite.emailMismatchDescription', { email: invitation.value.email })
    }
})
</script>

<template>
    <div class="min-h-screen flex items-center justify-center p-4">
        <UCard class="w-full max-w-md">
            <template v-if="loading">
                <div class="flex flex-col items-center justify-center py-12">
                    <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                    <p class="text-muted">{{ $t('invite.loading') }}</p>
                </div>
            </template>

            <template v-else-if="error && !invitation">
                <div class="flex flex-col items-center justify-center py-12 text-center">
                    <UIcon name="i-lucide-x-circle" class="w-16 h-16 text-red-500 mb-4" />
                    <h2 class="text-xl font-semibold mb-2">{{ $t('invite.invalidInvitation') }}</h2>
                    <p class="text-muted mb-6">{{ error }}</p>
                    <UButton to="/login" variant="soft">{{ $t('invite.goToLogin') }}</UButton>
                </div>
            </template>

            <template v-else-if="invitation">
                <div class="mb-6 text-center">
                    <UIcon name="i-lucide-users" class="w-12 h-12 text-primary mb-4 mx-auto" />
                    <h1 class="text-2xl font-bold mb-2">{{ $t('invite.youreInvited') }}</h1>
                    <p class="text-muted">{{ $t('invite.hasInvitedYou', { name: invitation.inviterEmail }) }}</p>
                    <p class="text-lg font-semibold text-primary mt-1">{{ invitation.organizationName }}</p>
                </div>

                <template v-if="error">
                    <UAlert color="warning" class="mb-4">
                        <template #title>{{ $t('invite.emailMismatch') }}</template>
                        <template #description>{{ error }}</template>
                    </UAlert>
                    <UButton block variant="outline" @click="userStore.logout().then(() => { error = null })">
                        {{ $t('invite.logoutAndUse') }}
                    </UButton>
                </template>

                <template v-else-if="accepting || userStore.isAuthenticated">
                    <div class="flex flex-col items-center justify-center py-8">
                        <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
                        <p class="text-muted">{{ $t('invite.processingInvitation') }}</p>
                    </div>
                </template>

                <template v-else>
                    <UTabs
                        :model-value="mode"
                        @update:model-value="mode = $event as 'login' | 'signup'"
                        :items="[{ label: $t('invite.login'), value: 'login' }, { label: $t('invite.signUp'), value: 'signup' }]"
                        class="mb-4"
                    />
                    <template v-if="mode === 'login'">
                        <UAuthForm :fields="loginFields" :schema="loginSchema" title="" :default-values="{ email: defaultEmail }" @submit="onLoginSubmit" />
                    </template>
                    <template v-else>
                        <UAuthForm :fields="signupFields" :schema="signupSchema" title="" :default-values="{ email: defaultEmail }" @submit="onSignupSubmit" />
                    </template>
                </template>
            </template>
        </UCard>
    </div>
</template>
```

> **Nota di onestà:** la forma esatta del payload di `getInvitation` (nomi `organizationName`/`organization.name`, `inviterEmail`/`inviter.user.email`) varia per versione del plugin; il codice legge entrambe le forme via `as any` con fallback. **Da confermare a runtime** (smoke con invito reale) quando 1b crea org/inviti. Rimuovere i provider Google dall'invite (il vecchio flusso OAuth con `localStorage.invite_token` non si applica più: l'accept è plugin-side e idempotente al ritorno sulla pagina).

- [ ] **Eliminare la vecchia pagina:** `rm app/pages/invite/[token].vue`.
- [ ] **Verify:** `pnpm typecheck` → 0 errori. `grep -rn "/api/team" app/pages/invite/` → 0 hit.
- [ ] **Commit:** `feat: invite page with plugin accept flow (phase 1d)`

---

## Task 9 — Componenti home: repoint a organizationStore + rimuovere mount morto

**Files:**
- Modify: `app/components/admin/home/HomeWelcome.client.vue`
- Modify: `app/components/admin/home/HomeStats.client.vue`
- Modify: `app/components/admin/home/HomeTopBarActions.client.vue`
- Verify: `pnpm typecheck`

- [ ] **HomeWelcome:** sostituire l'import e i computed event (righe 5, 23-25, 60). Cambiare:

```ts
import { useOrganizationStore } from '~/stores/organizationStore'
```
```ts
const orgStore = useOrganizationStore()
```
```ts
// org name
const orgName = computed(() => orgStore.currentOrganization?.name || 'Organization')
```

Nel template (riga 60) `{{ eventName }}` → `{{ orgName }}`. Rimuovere `const eventStore = useEventStore()` (riga 8) e l'import `useEventStore` (riga 5).

- [ ] **HomeStats:** sostituire l'intero `<script setup>` (righe 1-35) con:

```ts
<script setup lang="ts">
import { useOrganizationStore } from '~/stores/organizationStore'

const orgStore = useOrganizationStore()
const isLoading = computed(() => orgStore.isLoading)
const orgId = computed(() => orgStore.currentOrganization?.id)

const stats = computed(() => [
    {
        title: 'Members',
        icon: 'i-lucide-users',
        value: orgStore.members.length,
        unit: undefined as string | undefined,
        to: orgId.value ? `/dashboard/organization/${orgId.value}/members` : undefined,
        color: 'primary'
    },
])
</script>
```

(Lo `storage` event-only viene rimosso; resta il solo conteggio membri. Il `<template>` resta invariato — itera su `stats`.)

- [ ] **HomeTopBarActions:** rimuovere il mount del modal event eliminato. Nel template togliere la riga 54 `<AdminHomeCreateEventModal v-model="isModalOpen" />` e lo state/handler `isModalOpen` se non usato altrove nel file. (Il bottone "nuova org" vive ora in `dashboard/organization/index.vue` via `AdminOrgsAddOrgModal` — non duplicarlo qui.)
- [ ] **Verify:** `pnpm typecheck` → 0 errori. `grep -rln "eventStore" app/components/admin/home/` → 0 hit. `grep -rn "AdminHomeCreateEventModal" app/` → 0 hit (mount rimosso).
- [ ] **Commit:** `refactor: repoint home components to organizationStore (phase 1d)`

> **Nota:** `HomeDashboardSidebar.client.vue` NON è in questo task — è orfano (nessun mount site) e viene **eliminato** in Task 11, non repointato.

---

## Task 10 — Navigazione dashboard root + rimozione mount morti

**Files:**
- Modify: `app/pages/dashboard.vue`
- Modify: `app/pages/dashboard/index.vue`
- Verify: `pnpm typecheck`

- [ ] **dashboard.vue (sidebar/dropdown):** convertire tutti i path/route-name event→org:
  - `/dashboard/event` → `/dashboard/organization` (tutte le occorrenze: righe 67-69, 86-90).
  - `/dashboard/event/${paramsId}` → `/dashboard/organization/${paramsId}` (riga 53).
  - `/dashboard/event/${paramsId}/team` → `/dashboard/organization/${paramsId}/members` (riga 60).
  - route-name match: `dashboard-event-id` → `dashboard-organization-id`; `dashboard-event-id-team` → `dashboard-organization-id-members`; `rn.startsWith("dashboard-event-id")` → `rn.startsWith("dashboard-organization-id")` (righe 44, 55, 62, 90).
  - i18n labels: `dashboard.dropdown.newEvent`→`dashboard.dropdown.newOrganization`, `dashboard.nav.eventDashboard`→`dashboard.nav.organizationDashboard`, `dashboard.nav.team`→`dashboard.nav.members`, `dashboard.nav.allEvents`→`dashboard.nav.allOrganizations`, `dashboard.nav.events`→`dashboard.nav.organizations`, `dashboard.dropdown.inviteMember` invariato (esiste già).
  - `isInsideEvent` → `isInsideOrganization` (variabile locale).

- [ ] **dashboard/index.vue:** rimuovere `<AdminHomeEventsTable />` (riga 42) e lasciare le sole card/chart generiche.
- [ ] **Verify:** `pnpm typecheck` → 0 errori. `grep -rn "/dashboard/event\|dashboard-event" app/pages/dashboard.vue` → 0 hit.
- [ ] **Commit:** `refactor: org-centric dashboard navigation (phase 1d)`

---

## Task 11 — Eliminazione file event morti

**Files:**
- Delete: `app/stores/eventStore.ts`
- Delete: `app/pages/dashboard/event/index.vue`, `app/pages/dashboard/event/[id]/index.vue`, `app/pages/dashboard/event/[id]/team.vue`, `app/pages/dashboard/event/[id]/requirements.md`
- Delete: `app/components/admin/home/HomeCreateEventModal.client.vue`, `HomeEventCards.client.vue`, `HomeEventsTable.client.vue`, `HomeEventSummaryCard.client.vue`, `HomeRsvpCountdownCard.client.vue`, `HomeDashboardSidebar.client.vue`
- Delete: `app/components/admin/EventUsageDashboard.vue`, `app/components/admin/PlanUsageDashboard.vue`
- Verify: `pnpm typecheck` + grep gate

> Eseguire SOLO dopo i Task 5-10 (i consumer puntano già a `organizationStore`/`dashboard/organization`).

- [ ] **Pre-delete: confermare che nessun mount site dei componenti da eliminare sia rimasto.** I componenti auto-importati che spariscono NON falliscono `pnpm typecheck` (sono runtime-warning Nuxt) → questo grep è l'unico gate che li intercetta:

```bash
grep -rn "AdminHomeEventCards\|AdminHomeCreateEventModal\|AdminHomeEventSummaryCard\|AdminHomeRsvpCountdownCard\|AdminEventUsageDashboard\|AdminHomeEventsTable\|AdminHomeDashboardSidebar\|AdminPlanUsageDashboard" app/ --include=*.vue
```

Output atteso: **0 hit** (tutti i mount rimossi nei Task 9/10). Se trova un mount, rimuoverlo prima del `rm`.

- [ ] **Eliminare i file.** Comando unico:

```bash
rm app/stores/eventStore.ts \
   app/pages/dashboard/event/index.vue \
   app/pages/dashboard/event/[id]/index.vue \
   app/pages/dashboard/event/[id]/team.vue \
   app/pages/dashboard/event/[id]/requirements.md \
   app/components/admin/home/HomeCreateEventModal.client.vue \
   app/components/admin/home/HomeEventCards.client.vue \
   app/components/admin/home/HomeEventsTable.client.vue \
   app/components/admin/home/HomeEventSummaryCard.client.vue \
   app/components/admin/home/HomeRsvpCountdownCard.client.vue \
   app/components/admin/home/HomeDashboardSidebar.client.vue \
   app/components/admin/EventUsageDashboard.vue \
   app/components/admin/PlanUsageDashboard.vue
rmdir app/pages/dashboard/event/\[id\] app/pages/dashboard/event 2>/dev/null || true
```

- [ ] **Verify (gate checkpoint — mappa 1:1 al checkpoint 1d).** Include anche le route-string event (`/dashboard/event`, route-name `dashboard-event`): typecheck NON le intercetta, ma un link stale produce 404 e viola lo smoke ("nessun 404 dalla nav").

```bash
grep -rn "eventStore\|useEventStore" app/ ; echo "exit:$?"
grep -rn "/api/events" app/ ; echo "exit:$?"
grep -rn "/api/team" app/ ; echo "exit:$?"
grep -rn "/dashboard/event\|dashboard-event" app/ ; echo "exit:$?"
```

Output atteso: **tutti `exit:1`** (grep non trova match → nessun residuo). Se un grep trova match, è un file dimenticato → convertirlo/eliminarlo prima di proseguire.

- [ ] **Verify:** `pnpm typecheck` → 0 errori (nessun import dangling verso file eliminati).
- [ ] **Commit:** `chore: remove dead event store/pages/components (phase 1d)`

---

## Task 12 — i18n org-flavored (it + en) + composable dashboard

**Files:**
- Modify: `i18n/locales/it-IT.json`, `i18n/locales/en-US.json`
- Modify: `app/composables/useDashboard.ts`
- Verify: `pnpm typecheck` + smoke

> Solo chiavi dashboard/team/invite. Landing/marketing resta FASE 5. Riusare le esistenti `dashboard.eventsList` / `team` / `invite` come base, aggiungere i blocchi org.

- [ ] **it-IT.json — aggiungere i blocchi org** (sotto `dashboard`, accanto a `eventsList`). Chiavi minime necessarie ai Task 5-10:

```json
"organizationsList": {
  "title": "Organizzazioni",
  "search": "Cerca organizzazioni...",
  "columns": { "name": "Nome", "slug": "Slug", "createdAt": "Creata il", "actions": "Azioni" },
  "empty": { "title": "Nessuna organizzazione", "description": "Crea la tua prima organizzazione per iniziare." }
}
```

E un blocco top-level `organization`:

```json
"organization": {
  "createModal": {
    "button": "Nuova organizzazione", "title": "Crea organizzazione", "name": "Nome", "slug": "Slug",
    "namePlaceholder": "La mia azienda", "slugPlaceholder": "la-mia-azienda",
    "create": "Crea", "cancel": "Annulla",
    "success": "Organizzazione creata", "successDescription": "{name} è stata creata.",
    "error": "Errore", "failedToCreate": "Creazione fallita",
    "limitReached": "Limite raggiunto", "limitReachedDescription": "Hai raggiunto il limite del tuo piano.",
    "validation": { "tooShort": "Troppo corto", "slugFormat": "Solo lettere minuscole, numeri e trattini" }
  },
  "deleteModal": {
    "title": "Elimina {name}", "description": "Questa azione è irreversibile.",
    "confirm": "Elimina", "success": "Organizzazione eliminata", "error": "Eliminazione fallita"
  },
  "detail": {
    "title": "Organizzazione", "info": "Informazioni", "members": "Membri", "membersCount": "Membri",
    "delete": "Elimina"
  }
}
```

E un blocco top-level `members`:

```json
"members": {
  "title": "Membri", "inviteMember": "Invita membro", "activeMembers": "Membri attivi",
  "member": "Membro", "roleLabel": "Ruolo", "actions": "Azioni", "you": "Tu",
  "noMembers": "Nessun membro", "changeRole": "Cambia ruolo", "removeMember": "Rimuovi membro",
  "pendingInvitations": "Inviti in sospeso", "email": "Email", "cancelInvite": "Annulla invito",
  "inviteMemberTitle": "Invita un membro", "emailLabel": "Email", "emailPlaceholder": "nome@esempio.com",
  "sendInvite": "Invia invito", "changeRoleTitle": "Cambia ruolo", "saveRole": "Salva",
  "inviteSent": "Invito inviato", "inviteSentDescription": "Invito inviato a {email}", "inviteError": "Errore invito",
  "roleUpdated": "Ruolo aggiornato", "roleUpdateError": "Errore aggiornamento ruolo",
  "memberRemoved": "Membro rimosso", "memberRemoveError": "Errore rimozione",
  "inviteCancelled": "Invito annullato", "inviteCancelError": "Errore annullamento",
  "validation": { "invalidEmail": "Email non valida" },
  "roles": { "owner": "Proprietario", "admin": "Amministratore", "member": "Membro" },
  "roleDescriptions": { "admin": "Può gestire membri e impostazioni", "member": "Accesso in sola lettura" }
}
```

Aggiungere a `dashboard.nav`: `"organizationDashboard": "Organizzazione"`, `"members": "Membri"`, `"allOrganizations": "Tutte le organizzazioni"`, `"organizations": "Organizzazioni"`. A `dashboard.dropdown`: `"newOrganization": "Nuova organizzazione"`. Aggiungere a `invite`: `"youveJoined": "Sei entrato in {org}"` (sostituisce la vecchia con `{event}`).

- [ ] **en-US.json — speculare** con le stesse chiavi in inglese (Organizations / Create organization / Members / ecc.).
- [ ] **useDashboard.ts — confermare shortcut.** Verificare che gli shortcut (righe 6-11) non puntino a route event morte. Le route attuali (`/`, `/inbox`, `/customers`, `/settings`) NON sono event → **nessuna modifica funzionale necessaria**, ma è il punto giusto per togliere eventuali shortcut event se presenti. (Verifica: `grep -n "event" app/composables/useDashboard.ts` → atteso 0 hit.)
- [ ] **Verify:** `pnpm typecheck` → 0 errori. JSON valido: `node -e "JSON.parse(require('fs').readFileSync('i18n/locales/it-IT.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/en-US.json','utf8')); console.log('JSON OK')"` → `JSON OK`.
- [ ] **Commit:** `feat: org-flavored i18n keys + dashboard shortcuts (phase 1d)`

---

## Task 13 — Verifica finale + smoke + commit di fase

**Files:**
- Verify: tutto il frontend

> **Nota di onestà (runtime):** lo smoke end-to-end (creare org, invitare, accettare, switch org) presuppone **1b e 1c landed** (signup→org, session→activeOrg, route/RBAC). Finché non lo sono, lo smoke verifica solo che le pagine montino senza errore e che i metodi del plugin esistano. Marcare gli step E2E come "da rifare a 1b/1c chiusi".

- [ ] **Gate grep (checkpoint 1d — versione allargata, copre API + route-string + store):**

```bash
grep -rn "/dashboard/event\|dashboard-event\|eventStore\|useEventStore\|/api/events\|/api/team" app/ ; echo "exit:$?"
```

Output atteso: **`exit:1`** (nessun match). Qualsiasi riga stampata = residuo da rimuovere.

- [ ] **Gate typecheck:** `pnpm typecheck` → 0 errori.

> **Nota di onestà:** `pnpm typecheck` verde presuppone che i tipi del client plugin (`client.organization.*`) siano risolti correttamente dal `organizationClient()` registrato in Task 1, e che 1c abbia rinominato `/api/limits` (Task 2 ha lettura difensiva → typecheck passa anche prima del rename runtime).

- [ ] **Smoke (manuale, `pnpm dev`):**
  - `/dashboard/organization` monta senza errore console (lista vuota se 1b non landed → empty state visibile).
  - `/dashboard/organization/[id]` e `/members` montano (se esiste un'org attiva via fallback).
  - `/invite/<id>` monta (stato "invito non valido" accettabile se nessun invito reale).
  - Nessun 404 dalla nav dashboard (link puntano a `/dashboard/organization*`).
  - Gating: con ruolo `member` simulato, "Invita membro" NON appare nella pagina membri.
  - **[E2E — da rifare a 1b/1c chiusi]:** crea org → invita membro (email arriva) → accetta da altra sessione → switch org.

- [ ] **Commit di fase:** `feat: org-centric frontend (phase 1d)`

---

## Riepilogo gate (mappa al Checkpoint 1d dello spec)

| Checkpoint spec | Verifica nel piano |
|---|---|
| Dashboard org-centric (lista/dettaglio/membri) | Task 5/6/7 + smoke Task 13 |
| Crea org / invita / accetta (plugin) E2E | Task 5/7/8 + smoke E2E (runtime-contingente 1b/1c) |
| Frontend nasconde azioni non permesse per ruolo | Task 4 (`useOrganization`) + gating Task 6/7 |
| Nessun residuo `eventStore`/`/api/events`/`/api/team` | Task 11 + gate grep Task 13 |
| `pnpm typecheck` verde | gate in ogni task + Task 13 |
| Commit `feat: org-centric frontend (phase 1d)` | Task 13 |
