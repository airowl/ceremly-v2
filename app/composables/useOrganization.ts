import { computed } from 'vue';
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
