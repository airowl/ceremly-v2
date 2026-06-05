import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// Types
export interface SuggestionAuthor {
    id: string;
    name: string | null;
    image: string | null;
}

export interface Suggestion {
    id: string;
    title: string;
    description: string;
    category: 'ui' | 'new_feature' | 'improvement' | 'bug';
    status: 'new' | 'under_review' | 'planned' | 'completed' | 'rejected';
    vote_count: number;
    created_at: string;
    updated_at: string;
    author: SuggestionAuthor;
    has_voted: boolean;
}

export interface SuggestionFilters {
    sort: 'most_voted' | 'recent' | 'status';
    status?: string;
    category?: string;
}

export interface Pagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

export const useFeedbackStore = defineStore('feedback', () => {
    // State
    const suggestions = ref<Suggestion[]>([]);
    const userVotes = ref<Set<string>>(new Set());
    const userSuggestionCount = ref(0);
    const suggestionLimit = ref(3);
    const canCreate = ref(true);
    const filters = ref<SuggestionFilters>({
        sort: 'most_voted',
    });
    const pagination = ref<Pagination>({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0,
    });
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Computed
    const remaining = computed(() => Math.max(0, suggestionLimit.value - userSuggestionCount.value));

    /**
     * Fetch suggestions from API
     */
    async function fetchSuggestions(page = 1) {
        if (import.meta.server) return;

        try {
            isLoading.value = true;
            error.value = null;

            const params = new URLSearchParams({
                page: page.toString(),
                limit: pagination.value.limit.toString(),
                sort: filters.value.sort,
            });

            if (filters.value.status) {
                params.append('status', filters.value.status);
            }
            if (filters.value.category) {
                params.append('category', filters.value.category);
            }

            const data = await $fetch<{
                suggestions: Suggestion[];
                user_votes: string[];
                pagination: Pagination;
            }>(`/api/suggestions?${params.toString()}`);

            suggestions.value = data.suggestions;
            userVotes.value = new Set(data.user_votes);
            pagination.value = data.pagination;
        } catch (err: any) {
            error.value = err.message || err.data?.message || 'Error loading suggestions';
            console.error('Error fetching suggestions:', err);
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Fetch user's suggestion count
     */
    async function fetchUserCount() {
        if (import.meta.server) return;

        try {
            const data = await $fetch<{
                count: number;
                limit: number;
                remaining: number;
                can_create: boolean;
            }>('/api/suggestions/my-count');

            userSuggestionCount.value = data.count;
            suggestionLimit.value = data.limit;
            canCreate.value = data.can_create;
        } catch (err: any) {
            console.error('Error fetching user count:', err);
        }
    }

    /**
     * Create a new suggestion
     */
    async function createSuggestion(data: {
        title: string;
        description: string;
        category: string;
    }) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            const result = await $fetch<{
                success: boolean;
                suggestion: Suggestion;
                remaining: number;
            }>('/api/suggestions', {
                method: 'POST',
                body: data,
            });

            // Refresh suggestions and user count
            await Promise.all([fetchSuggestions(), fetchUserCount()]);

            return { success: true, suggestion: result.suggestion };
        } catch (err: any) {
            console.error('Error creating suggestion:', err);
            return {
                success: false,
                error: err.message || err.data?.message || 'Error creating suggestion',
            };
        }
    }

    /**
     * Toggle vote on a suggestion
     */
    async function toggleVote(suggestionId: string) {
        if (import.meta.server) return { success: false };

        const hasVoted = userVotes.value.has(suggestionId);

        try {
            // Optimistic update
            const suggestion = suggestions.value.find(s => s.id === suggestionId);
            if (suggestion) {
                if (hasVoted) {
                    suggestion.vote_count = Math.max(0, suggestion.vote_count - 1);
                    suggestion.has_voted = false;
                    userVotes.value.delete(suggestionId);
                } else {
                    suggestion.vote_count += 1;
                    suggestion.has_voted = true;
                    userVotes.value.add(suggestionId);
                }
            }

            // API call
            const result = await $fetch<{
                success: boolean;
                vote_count: number;
                has_voted: boolean;
            }>(`/api/suggestions/${suggestionId}/vote`, {
                method: hasVoted ? 'DELETE' : 'POST',
            });

            // Update with actual value from server
            if (suggestion) {
                suggestion.vote_count = result.vote_count;
                suggestion.has_voted = result.has_voted;
            }

            return { success: true };
        } catch (err: any) {
            // Revert optimistic update on error
            const suggestion = suggestions.value.find(s => s.id === suggestionId);
            if (suggestion) {
                if (hasVoted) {
                    suggestion.vote_count += 1;
                    suggestion.has_voted = true;
                    userVotes.value.add(suggestionId);
                } else {
                    suggestion.vote_count = Math.max(0, suggestion.vote_count - 1);
                    suggestion.has_voted = false;
                    userVotes.value.delete(suggestionId);
                }
            }

            console.error('Error toggling vote:', err);
            return {
                success: false,
                error: err.message || err.data?.message || 'Error toggling vote',
            };
        }
    }

    /**
     * Update suggestion status (admin only)
     */
    async function updateStatus(suggestionId: string, status: string) {
        if (import.meta.server) return { success: false, error: 'Not available on server' };

        try {
            await $fetch(`/api/suggestions/${suggestionId}/status`, {
                method: 'PATCH',
                body: { status },
            });

            // Update local state
            const suggestion = suggestions.value.find(s => s.id === suggestionId);
            if (suggestion) {
                suggestion.status = status as Suggestion['status'];
            }

            return { success: true };
        } catch (err: any) {
            console.error('Error updating status:', err);
            return {
                success: false,
                error: err.message || err.data?.message || 'Error updating status',
            };
        }
    }

    /**
     * Set filter and reload
     */
    async function setFilter(key: keyof SuggestionFilters, value: string | undefined) {
        if (key === 'sort') {
            filters.value.sort = value as SuggestionFilters['sort'];
        } else if (key === 'status') {
            filters.value.status = value;
        } else if (key === 'category') {
            filters.value.category = value;
        }

        // Reset to page 1 and reload
        pagination.value.page = 1;
        await fetchSuggestions();
    }

    /**
     * Change page
     */
    async function changePage(page: number) {
        if (page < 1 || page > pagination.value.total_pages) return;
        pagination.value.page = page;
        await fetchSuggestions(page);
    }

    /**
     * Reset store state
     */
    function $reset() {
        suggestions.value = [];
        userVotes.value = new Set();
        userSuggestionCount.value = 0;
        suggestionLimit.value = 3;
        canCreate.value = true;
        filters.value = { sort: 'most_voted' };
        pagination.value = { page: 1, limit: 20, total: 0, total_pages: 0 };
        isLoading.value = false;
        error.value = null;
    }

    return {
        // State
        suggestions,
        userVotes,
        userSuggestionCount,
        suggestionLimit,
        canCreate,
        filters,
        pagination,
        isLoading,
        error,
        // Computed
        remaining,
        // Actions
        fetchSuggestions,
        fetchUserCount,
        createSuggestion,
        toggleVote,
        updateStatus,
        setFilter,
        changePage,
        $reset,
    };
});
