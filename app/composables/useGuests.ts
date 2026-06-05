/**
 * Composable for guest management within an event.
 * Handles CRUD operations, filtering, and CSV import.
 */

// Types
interface Guest {
    id: string;
    eventId: string;
    name: string;
    email: string | null;
    phone: string | null;
    group: string | null;
    status: 'pending' | 'yes' | 'no';
    source: 'manual' | 'csv' | 'registration';
    customFields: Record<string, any> | null;
    respondedAt: string | null;
    lastEmailSentAt: string | null;
    emailSentCount: number;
    lastWhatsappClickedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface GuestSummary {
    total: number;
    confirmed: number;
    pending: number;
    declined: number;
}

interface GuestFilters {
    status: 'pending' | 'yes' | 'no' | null;
    source: 'manual' | 'csv' | 'registration' | null;
    search: string;
}

export function useGuests(eventId: Ref<string> | string) {
    // State
    const guests = ref<Guest[]>([]);
    const summary = ref<GuestSummary>({ total: 0, confirmed: 0, pending: 0, declined: 0 });
    const isLoading = ref(false);
    const error = ref<string | null>(null);
    const filters = ref<GuestFilters>({ status: null, source: null, search: '' });

    /**
     * Load guests for the event with current filters
     */
    async function loadGuests() {
        if (import.meta.server) return;

        const id = toValue(eventId);
        if (!id) return;

        try {
            isLoading.value = true;
            error.value = null;

            // Build query params from active filters
            const query: Record<string, string> = {};
            if (filters.value.status) query.status = filters.value.status;
            if (filters.value.source) query.source = filters.value.source;
            if (filters.value.search) query.search = filters.value.search;

            const data = await $fetch<{
                guests: Guest[];
                summary: GuestSummary;
            }>(`/api/events/${id}/guests`, { query });

            guests.value = data.guests;
            summary.value = data.summary;
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading guests';
            console.error('Error loading guests:', err);
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Add a single guest manually
     */
    async function addGuest(data: { name: string; email?: string; phone?: string; group?: string }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            const guest = await $fetch<Guest>(`/api/events/${id}/guests`, {
                method: 'POST',
                body: data,
            });

            // Refresh the full list to get updated summary counts
            await loadGuests();

            return { success: true, guest };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error adding guest';
            console.error('Error adding guest:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Update a guest's details
     */
    async function updateGuest(guestId: string, data: {
        name?: string;
        email?: string | null;
        phone?: string | null;
        group?: string | null;
        status?: 'pending' | 'yes' | 'no';
        customFields?: Record<string, any>;
    }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            const updated = await $fetch<Guest>(`/api/events/${id}/guests/${guestId}`, {
                method: 'PUT',
                body: data,
            });

            // Update the guest in the local list
            const index = guests.value.findIndex(g => g.id === guestId);
            if (index !== -1) {
                guests.value[index] = updated;
            }

            // Refresh to update summary counts if status changed
            if (data.status !== undefined) {
                await loadGuests();
            }

            return { success: true, guest: updated };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error updating guest';
            console.error('Error updating guest:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Delete a guest
     */
    async function deleteGuest(guestId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            await $fetch(`/api/events/${id}/guests/${guestId}`, {
                method: 'DELETE',
            });

            // Remove from local list and refresh for updated counts
            guests.value = guests.value.filter(g => g.id !== guestId);
            await loadGuests();

            return { success: true };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error deleting guest';
            console.error('Error deleting guest:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Bulk import guests from parsed CSV rows
     */
    async function importGuests(rows: Array<{ name: string; email?: string; phone?: string }>) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            const result = await $fetch<{
                imported: number;
                duplicates: number;
                errors: string[];
            }>(`/api/events/${id}/guests/import`, {
                method: 'POST',
                body: { guests: rows },
            });

            // Refresh the full list after import
            await loadGuests();

            return { success: true, ...result };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error importing guests';
            console.error('Error importing guests:', err);
            return { success: false, error: error.value };
        }
    }

    // Auto-load when eventId changes
    watch(() => toValue(eventId), (newId) => {
        if (newId) {
            loadGuests();
        }
    }, { immediate: true });

    return {
        guests,
        summary,
        isLoading,
        error,
        filters,
        loadGuests,
        addGuest,
        updateGuest,
        deleteGuest,
        importGuests,
    };
}
