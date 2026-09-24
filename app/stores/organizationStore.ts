import { computed, watch } from 'vue';
import { defineStore } from 'pinia';
import { useConvexMutation, useConvexQuery } from 'convex-vue';
import { api } from '~~/convex/_generated/api';
import type { Id } from '~~/convex/_generated/dataModel';
import { convexErrorMessage } from '~/composables/useConvexError';
import {
    toOrganizationInvitation,
    toOrganizationListItem,
    toOrganizationMember,
    toOrganizationSummary,
    type OrganizationInvitation,
    type OrganizationListItem,
    type OrganizationMember,
    type OrganizationSummary,
    type OrgRole,
} from '~/lib/organizations';

export type {
    OrganizationInvitation,
    OrganizationListItem,
    OrganizationMember,
    OrganizationSummary,
    OrgRole,
};

type ActionResult = { success: true } | { success: false; error: string };

/**
 * Organization store — Task 14, part b.
 *
 * Before: the Better Auth **organization client plugin** (`client.organization.*`),
 * which the plan forbids (Better Auth is the identity provider only) and which
 * the `/api/**` gate could not see. Now: `api.organizations.*`.
 *
 * What changed for callers, on purpose:
 * 1. **Reads are live queries.** Organizations, the active organization, its
 *    members and pending invitations update by themselves — after a write here,
 *    after an invitation is accepted in another browser, after a role change by
 *    another admin. `loadOrganizations`/`loadCurrentOrganization` are gone: there
 *    is nothing to reload.
 * 2. **The role is the server's.** It comes from `getActiveOrganization`, which
 *    re-checks the membership, instead of being looked up in the member list by
 *    comparing user ids on the client.
 * 3. **Member writes take the `appUsers` id** (`member.userId`), which is what
 *    the Convex RBAC functions key on. The organization for every write is the
 *    caller's active organization, resolved server-side: no write sends an
 *    `organizationId` except `setActive`, whose target is verified against the
 *    caller's membership.
 *
 * Actions keep the `{ success, error }` shape the pages already handle.
 */
export const useOrganizationStore = defineStore('organization', () => {
    // `server: false`: the dashboard is CSR-only, and a render server has only the
    // HTTP client (no session to read an organization with).
    const organizationsQuery = useConvexQuery(api.organizations.listMyOrganizations, {}, { server: false });
    const activeQuery = useConvexQuery(api.organizations.getActiveOrganization, {}, { server: false });
    const membersQuery = useConvexQuery(api.organizations.listMembers, {}, { server: false });
    const invitationsQuery = useConvexQuery(api.organizations.listPendingInvitations, {}, { server: false });

    const setActiveMutation = useConvexMutation(api.organizations.setActive);
    const createMutation = useConvexMutation(api.organizations.createOrganization);
    const deleteMutation = useConvexMutation(api.organizations.deleteOrganization);
    const inviteMutation = useConvexMutation(api.organizations.inviteMember);
    const updateRoleMutation = useConvexMutation(api.organizations.updateMemberRole);
    const removeMemberMutation = useConvexMutation(api.organizations.removeMember);
    const cancelInvitationMutation = useConvexMutation(api.organizations.cancelInvitation);

    // ─── State (derived from live queries) ─────────────────────────────
    const organizations = computed<OrganizationListItem[]>(
        () => (organizationsQuery.data.value ?? []).map(toOrganizationListItem),
    );
    const currentOrganization = computed<OrganizationSummary | null>(
        () => toOrganizationSummary(activeQuery.data.value),
    );
    // Members and invitations belong to the active organization: with none active
    // the queries refuse, and the lists are simply empty.
    const members = computed<OrganizationMember[]>(() =>
        currentOrganization.value ? (membersQuery.data.value ?? []).map(toOrganizationMember) : [],
    );
    const pendingInvitations = computed<OrganizationInvitation[]>(() =>
        currentOrganization.value ? (invitationsQuery.data.value ?? []).map(toOrganizationInvitation) : [],
    );

    const isLoading = computed(() => organizationsQuery.isPending.value || activeQuery.isPending.value);

    const error = computed<string | null>(() => {
        const failed = organizationsQuery.error.value ?? activeQuery.error.value
            ?? (currentOrganization.value ? membersQuery.error.value : null);
        return failed ? convexErrorMessage(failed) : null;
    });

    // ─── Getters ───────────────────────────────────────────────────────
    const role = computed<OrgRole | null>(() => currentOrganization.value?.role ?? null);

    // ─── Actions ───────────────────────────────────────────────────────
    async function run(action: () => Promise<unknown>, fallback: string): Promise<ActionResult> {
        if (import.meta.server) return { success: false, error: 'Not available on server' };
        try {
            await action();
            return { success: true };
        } catch (err) {
            return { success: false, error: convexErrorMessage(err, fallback) };
        }
    }

    /** Resolves once the active-organization query has answered (with data, `null` or an error). */
    function activeResolved(): Promise<void> {
        if (!activeQuery.isPending.value) return Promise.resolve();
        return new Promise((resolve) => {
            const stop = watch(activeQuery.isPending, (pending) => {
                if (!pending) {
                    stop();
                    resolve();
                }
            });
        });
    }

    function setActiveOrganization(organizationId: string): Promise<ActionResult> {
        return run(
            () => setActiveMutation.mutate({ organizationId: organizationId as Id<'organizations'> }),
            'Error switching organization',
        );
    }

    /**
     * Makes `organizationId` the active organization only if it is not already.
     *
     * The detail pages open on a route id: switching on every mount would write an
     * `organization.activated` audit row per page view.
     */
    async function ensureActiveOrganization(organizationId: string): Promise<ActionResult> {
        await activeResolved();
        if (currentOrganization.value?.id === organizationId) return { success: true };
        return await setActiveOrganization(organizationId);
    }

    function createOrganization(input: { name: string; slug: string }): Promise<ActionResult> {
        // Convex also makes the new organization the active one.
        return run(() => createMutation.mutate({ name: input.name, slug: input.slug }), 'Error creating organization');
    }

    /**
     * Deletes an organization. The server deletes the **active** one (owner only),
     * so a different target is activated first; afterwards the caller lands on
     * another organization they belong to, if any (legacy fallback: first in list).
     */
    async function deleteOrganization(organizationId: string): Promise<ActionResult> {
        const result = await run(async () => {
            if (currentOrganization.value?.id !== organizationId) {
                await setActiveMutation.mutate({ organizationId: organizationId as Id<'organizations'> });
            }
            await deleteMutation.mutate({});
            const next = organizations.value.find(o => o.id !== organizationId);
            if (next) await setActiveMutation.mutate({ organizationId: next.id as Id<'organizations'> });
        }, 'Error deleting organization');
        return result;
    }

    function inviteMember(email: string, inviteRole: OrgRole = 'member'): Promise<ActionResult> {
        // The returned token is not used here: the invitation email carries it
        // (`send-org-invite-email` job), and the inviter must not need to.
        return run(() => inviteMutation.mutate({ email, role: inviteRole }), 'Error inviting member');
    }

    function updateMemberRole(userId: string, newRole: OrgRole): Promise<ActionResult> {
        return run(
            () => updateRoleMutation.mutate({ userId: userId as Id<'appUsers'>, role: newRole }),
            'Error updating role',
        );
    }

    function removeMember(userId: string): Promise<ActionResult> {
        return run(() => removeMemberMutation.mutate({ userId: userId as Id<'appUsers'> }), 'Error removing member');
    }

    function cancelInvitation(invitationId: string): Promise<ActionResult> {
        return run(
            () => cancelInvitationMutation.mutate({ invitationId: invitationId as Id<'invitations'> }),
            'Error cancelling invitation',
        );
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
        setActiveOrganization,
        ensureActiveOrganization,
        createOrganization,
        deleteOrganization,
        inviteMember,
        updateMemberRole,
        removeMember,
        cancelInvitation,
    };
});
