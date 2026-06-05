import { ref } from 'vue';
import { defineStore } from 'pinia';

// Types
interface EventListItem {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    date: string;
    time: string | null;
    location: string | null;
    primaryColor: string;
    showGuestCount: boolean;
    socialProofEnabled: boolean;
    autoConfirmRegistration: boolean;
    createdAt: string;
    totalGuests: number;
    confirmedGuests: number;
    pendingGuests: number;
    declinedGuests: number;
}

interface EventDetail {
    id: string;
    userId: string;
    name: string;
    slug: string;
    description: string | null;
    date: string;
    time: string | null;
    location: string | null;
    address: string | null;
    deadline: string | null;
    primaryColor: string;
    showGuestCount: boolean;
    socialProofEnabled: boolean;
    maxGuests: number;
    autoConfirmRegistration: boolean;
    createdAt: string;
    updatedAt: string;
}

interface EventCounts {
    totalGuests: number;
    confirmedGuests: number;
    pendingGuests: number;
    declinedGuests: number;
}

interface ResourceUsage {
    storage_used: number;
}

interface UserPermissions {
    permissions: string[];
    is_owner: boolean;
    can_edit_settings: boolean;
    can_manage_team: boolean;
    can_invite_members: boolean;
}

// Role type
export type EventRole = 'owner' | 'editor' | 'viewer';

// Team management types
export interface EventMember {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    is_owner: boolean;
    role: EventRole;
    invited_by: string | null;
    last_login_at: string | null;
    joined_at: string;
    status: 'active' | 'pending';
}

// Backward compatibility alias
export type TeamMember = EventMember;

export interface PendingInvitation {
    id: string;
    email: string;
    invited_by: string;
    expires_at: string;
    created_at: string;
    status: 'pending';
}

export const useEventStore = defineStore('event', () => {
    // State
    const events = ref<EventListItem[]>([]);
    const currentEvent = ref<EventDetail | null>(null);
    const counts = ref<EventCounts | null>(null);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Team & permissions state (merged from event store)
    const membersCount = ref(0);
    const resourceUsage = ref<ResourceUsage | null>(null);
    const userPermissions = ref<UserPermissions | null>(null);
    const teamMembers = ref<EventMember[]>([]);
    const pendingInvitations = ref<PendingInvitation[]>([]);
    const teamLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null);
    const isLoadingTeam = ref(false);
    const teamError = ref<string | null>(null);

    // =========================================================================
    // EVENT CRUD ACTIONS
    // =========================================================================

    /**
     * Load all events for the authenticated user
     */
    async function loadEvents() {
        if (import.meta.server) return;

        try {
            isLoading.value = true;
            error.value = null;

            const data = await $fetch<{ events: EventListItem[] }>('/api/events');

            events.value = data.events;
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading events';
            console.error('Error loading events:', err);
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Load a single event with guest counts
     */
    async function loadEvent(eventId: string) {
        if (import.meta.server) return;

        try {
            isLoading.value = true;
            error.value = null;

            const data = await $fetch<{
                event: EventDetail;
                counts: EventCounts;
            }>(`/api/events/${eventId}`);

            currentEvent.value = data.event;
            counts.value = data.counts;
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading event';
            console.error('Error loading event:', err);
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Create a new event
     */
    async function createEvent(data: {
        name: string;
        date: string;
        time?: string | null;
        location?: string | null;
        address?: string | null;
        deadline?: string | null;
        primaryColor: string;
        showGuestCount: boolean;
        autoConfirmRegistration: boolean;
    }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            isLoading.value = true;
            error.value = null;

            const result = await $fetch<{ event: EventDetail }>('/api/events', {
                method: 'POST',
                body: data,
            });

            // Refresh the events list to include the new event with counts
            await loadEvents();

            return { success: true, event: result.event };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error creating event';
            console.error('Error creating event:', err);
            return { success: false, error: error.value };
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Update an existing event
     */
    async function updateEvent(eventId: string, data: {
        name?: string;
        description?: string | null;
        date?: string;
        time?: string | null;
        location?: string | null;
        address?: string | null;
        deadline?: string | null;
        primaryColor?: string;
        showGuestCount?: boolean;
        maxGuests?: number;
        autoConfirmRegistration?: boolean;
        socialProofEnabled?: boolean;
    }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            isLoading.value = true;
            error.value = null;

            const result = await $fetch<{ event: EventDetail }>(`/api/events/${eventId}`, {
                method: 'PUT',
                body: data,
            });

            // Update currentEvent if we are viewing this event
            if (currentEvent.value?.id === eventId) {
                currentEvent.value = result.event;
            }

            return { success: true, event: result.event };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error updating event';
            console.error('Error updating event:', err);
            return { success: false, error: error.value };
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Delete an event
     */
    async function deleteEvent(eventId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            isLoading.value = true;
            error.value = null;

            await $fetch(`/api/events/${eventId}`, {
                method: 'DELETE',
            });

            // Remove from local list
            events.value = events.value.filter(e => e.id !== eventId);

            // Clear currentEvent if it was the deleted one
            if (currentEvent.value?.id === eventId) {
                currentEvent.value = null;
                counts.value = null;
            }

            return { success: true };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error deleting event';
            console.error('Error deleting event:', err);
            return { success: false, error: error.value };
        } finally {
            isLoading.value = false;
        }
    }

    // =========================================================================
    // TEAM MANAGEMENT ACTIONS
    // =========================================================================

    /**
     * Load team members and pending invitations
     */
    async function loadTeamMembers() {
        if (import.meta.server) return;
        if (!currentEvent.value?.id) return;

        try {
            isLoadingTeam.value = true;
            teamError.value = null;

            const membersData = await $fetch<{
                members: EventMember[];
                pending_invitations: PendingInvitation[];
                total_members: number;
                total_pending: number;
            }>('/api/team/members');

            teamMembers.value = membersData.members || [];
            pendingInvitations.value = membersData.pending_invitations || [];
            membersCount.value = membersData.total_members;

            // Read team limit from userStore (populated by consolidated /api/limits endpoint)
            const userStore = useUserStore();
            const teamData = userStore.limitsData?.usage.team;
            teamLimit.value = teamData
                ? { allowed: teamData.allowed, current: teamData.current, limit: teamData.limit }
                : null;

        } catch (err: any) {
            teamError.value = err.message || err.data?.message || 'Error loading team';
            console.error('Error loading team members:', err);
        } finally {
            isLoadingTeam.value = false;
        }
    }

    /**
     * Invite a new event team member
     */
    async function inviteTeamMember(email: string, language?: 'it' | 'en') {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            const data = await $fetch<{
                success: boolean;
                invitation: PendingInvitation;
            }>('/api/team/invite', {
                method: 'POST',
                body: { email, language: language || 'it' },
            });

            await loadTeamMembers();
            return { success: true, invitation: data.invitation };
        } catch (err: any) {
            console.error('Error inviting team member:', err);
            return { success: false, error: err.message || err.data?.message || 'Error inviting member' };
        }
    }

    /**
     * Update event member role
     */
    async function updateMemberRole(userId: string, role: 'editor' | 'viewer') {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            await $fetch(`/api/team/${userId}/permissions`, {
                method: 'PATCH',
                body: { role },
            });

            await loadTeamMembers();
            return { success: true };
        } catch (err: any) {
            console.error('Error updating role:', err);
            return { success: false, error: err.message || err.data?.message || 'Error updating role' };
        }
    }

    /**
     * Remove a team member
     */
    async function removeTeamMember(userId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            await $fetch(`/api/team/${userId}`, { method: 'DELETE' });
            await loadTeamMembers();
            return { success: true };
        } catch (err: any) {
            console.error('Error removing team member:', err);
            return { success: false, error: err.message || err.data?.message || 'Error removing member' };
        }
    }

    /**
     * Resend an invitation
     */
    async function resendInvitation(invitationId: string, language?: 'it' | 'en') {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            const data = await $fetch<{
                success: boolean;
                email_sent: boolean;
            }>(`/api/team/invitation/${invitationId}/resend`, {
                method: 'POST',
                body: { language: language || 'it' },
            });

            await loadTeamMembers();
            return { success: true, email_sent: data.email_sent };
        } catch (err: any) {
            console.error('Error resending invitation:', err);
            return { success: false, error: err.message || err.data?.message || 'Error resending invitation' };
        }
    }

    /**
     * Cancel a pending invitation
     */
    async function cancelInvitation(invitationId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            await $fetch(`/api/team/invitation/${invitationId}`, { method: 'DELETE' });
            await loadTeamMembers();
            return { success: true };
        } catch (err: any) {
            console.error('Error cancelling invitation:', err);
            return { success: false, error: err.message || err.data?.message || 'Error cancelling invitation' };
        }
    }

    /**
     * Reset all state
     */
    function $reset() {
        events.value = [];
        currentEvent.value = null;
        counts.value = null;
        isLoading.value = false;
        error.value = null;
        membersCount.value = 0;
        resourceUsage.value = null;
        userPermissions.value = null;
        teamMembers.value = [];
        pendingInvitations.value = [];
        teamLimit.value = null;
        isLoadingTeam.value = false;
        teamError.value = null;
    }

    return {
        // State
        events,
        currentEvent,
        counts,
        isLoading,
        error,
        // Team & permissions state
        membersCount,
        resourceUsage,
        userPermissions,
        teamMembers,
        pendingInvitations,
        teamLimit,
        isLoadingTeam,
        teamError,
        // Event CRUD actions
        loadEvents,
        loadEvent,
        createEvent,
        updateEvent,
        deleteEvent,
        $reset,
        // Team management actions
        loadTeamMembers,
        inviteTeamMember,
        updateMemberRole,
        removeTeamMember,
        resendInvitation,
        cancelInvitation,
    };
});
