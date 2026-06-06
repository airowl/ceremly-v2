import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { useAuth } from '~/composables/useAuth';

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
            organizations.value = (data ?? []) as unknown as OrganizationListItem[];
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
                members.value = (data.members ?? []) as unknown as OrganizationMember[];
                pendingInvitations.value = ((data.invitations ?? []) as unknown as OrganizationInvitation[])
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
            const { error: apiErr } = await client.organization.setActive({ organizationId });
            if (apiErr) throw new Error(apiErr.message || 'Error switching organization');
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
            const { error: apiErr } = await client.organization.delete({ organizationId });
            if (apiErr) throw new Error(apiErr.message || 'Error deleting organization');
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
            const { error: apiErr } = await client.organization.updateMemberRole({ memberId, role });
            if (apiErr) throw new Error(apiErr.message || 'Error updating role');
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
            const { error: apiErr } = await client.organization.removeMember({ memberIdOrEmail });
            if (apiErr) throw new Error(apiErr.message || 'Error removing member');
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
            const { error: apiErr } = await client.organization.cancelInvitation({ invitationId });
            if (apiErr) throw new Error(apiErr.message || 'Error cancelling invitation');
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
