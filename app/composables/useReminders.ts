/**
 * Composable for reminder template management and sending.
 * Handles template CRUD, reminder sending (email + WhatsApp), and history.
 */

// Types
interface ReminderTemplate {
    id: string;
    eventId: string;
    name: string;
    type: 'email' | 'whatsapp';
    subject: string | null;
    body: string;
    isDefault: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface ReminderHistoryItem {
    id: string;
    guestId: string;
    guestName: string | null;
    templateId: string | null;
    templateName: string | null;
    type: string;
    status: string;
    resendMessageId: string | null;
    sentAt: string | null;
    createdAt: string;
}

interface SendReminderResult {
    success: boolean;
    type: 'email' | 'whatsapp';
    whatsappUrl?: string;
}

interface ReminderStats {
    totalActive: number;
    emailSentToday: number;
    whatsappSentToday: number;
}

export function useReminders(eventId: Ref<string> | string) {
    // State
    const templates = ref<ReminderTemplate[]>([]);
    const history = ref<ReminderHistoryItem[]>([]);
    const stats = ref<ReminderStats>({ totalActive: 0, emailSentToday: 0, whatsappSentToday: 0 });
    const isLoading = ref(false);
    const isSending = ref(false);
    const error = ref<string | null>(null);

    /**
     * Load reminder templates for the event
     */
    async function loadTemplates() {
        if (import.meta.server) return;

        const id = toValue(eventId);
        if (!id) return;

        try {
            isLoading.value = true;
            error.value = null;

            const data = await $fetch<{ templates: ReminderTemplate[] }>(
                `/api/events/${id}/reminders/templates`,
            );

            templates.value = data.templates;
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading templates';
            console.error('Error loading templates:', err);
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Load reminder statistics for the event
     */
    async function loadStats() {
        if (import.meta.server) return;

        const id = toValue(eventId);
        if (!id) return;

        try {
            const data = await $fetch<ReminderStats>(
                `/api/events/${id}/reminders/stats`,
            );
            stats.value = data;
        } catch (err: any) {
            console.error('Error loading reminder stats:', err);
        }
    }

    /**
     * Create a new reminder template
     */
    async function createTemplate(data: {
        name: string;
        type: 'email' | 'whatsapp';
        subject?: string | null;
        body: string;
    }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            const template = await $fetch<ReminderTemplate>(
                `/api/events/${id}/reminders/templates`,
                {
                    method: 'POST',
                    body: data,
                },
            );

            // Add to local list
            templates.value.push(template);

            return { success: true, template };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error creating template';
            console.error('Error creating template:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Update an existing reminder template
     */
    async function updateTemplate(templateId: string, data: {
        name?: string;
        type?: 'email' | 'whatsapp';
        subject?: string | null;
        body?: string;
    }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            const updated = await $fetch<ReminderTemplate>(
                `/api/events/${id}/reminders/templates/${templateId}`,
                {
                    method: 'PUT',
                    body: data,
                },
            );

            // Update in local list
            const index = templates.value.findIndex(t => t.id === templateId);
            if (index !== -1) {
                templates.value[index] = updated;
            }

            return { success: true, template: updated };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error updating template';
            console.error('Error updating template:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Toggle the isActive state of a reminder template
     */
    async function toggleActive(templateId: string, isActive: boolean) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            const updated = await $fetch<ReminderTemplate>(
                `/api/events/${id}/reminders/templates/${templateId}`,
                {
                    method: 'PATCH',
                    body: { isActive },
                },
            );

            // Update in local list
            const index = templates.value.findIndex(t => t.id === templateId);
            if (index !== -1) {
                templates.value[index] = updated;
            }

            // Reload stats since active count changed
            await loadStats();

            return { success: true, template: updated };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error toggling template';
            console.error('Error toggling template:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Delete a reminder template (only non-default templates)
     */
    async function deleteTemplate(templateId: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            error.value = null;

            await $fetch(`/api/events/${id}/reminders/templates/${templateId}`, {
                method: 'DELETE',
            });

            // Remove from local list
            templates.value = templates.value.filter(t => t.id !== templateId);

            return { success: true };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error deleting template';
            console.error('Error deleting template:', err);
            return { success: false, error: error.value };
        }
    }

    /**
     * Send a reminder to a specific guest
     */
    async function sendReminder(guestId: string, options: { templateId: string; type: 'email' | 'whatsapp' }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        const id = toValue(eventId);
        if (!id) return { success: false, error: 'No event ID' };

        try {
            isSending.value = true;
            error.value = null;

            const result = await $fetch<SendReminderResult>(
                `/api/events/${id}/reminders/send/${guestId}`,
                {
                    method: 'POST',
                    body: {
                        templateId: options.templateId,
                        type: options.type,
                    },
                },
            );

            return { ...result, success: true };
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error sending reminder';
            console.error('Error sending reminder:', err);
            return { success: false, type: 'email' as const, error: error.value };
        } finally {
            isSending.value = false;
        }
    }

    /**
     * Load reminder sending history for the event
     */
    async function loadHistory() {
        if (import.meta.server) return;

        const id = toValue(eventId);
        if (!id) return;

        try {
            isLoading.value = true;
            error.value = null;

            const data = await $fetch<{ history: ReminderHistoryItem[] }>(
                `/api/events/${id}/reminders/history`,
            );

            history.value = data.history;
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading history';
            console.error('Error loading reminder history:', err);
        } finally {
            isLoading.value = false;
        }
    }

    return {
        templates,
        history,
        stats,
        isLoading,
        isSending,
        error,
        loadTemplates,
        loadStats,
        createTemplate,
        updateTemplate,
        toggleActive,
        deleteTemplate,
        sendReminder,
        loadHistory,
    };
}
