<script setup lang="ts">
import { useFeedbackStore } from '~/stores/feedbackStore';

const { t } = useI18n();
const feedbackStore = useFeedbackStore();

const { suggestions, isLoading, pagination } = storeToRefs(feedbackStore);

// Load suggestions on mount
onMounted(async () => {
    await feedbackStore.fetchSuggestions();
});

// Handle page change
async function handlePageChange(page: number) {
    await feedbackStore.changePage(page);
}
</script>

<template>
    <div class="space-y-4">
        <!-- Loading state -->
        <template v-if="isLoading">
            <div v-for="i in 3" :key="i" class="animate-pulse">
                <UCard>
                    <div class="flex gap-4">
                        <div class="w-10 h-16 bg-muted rounded" />
                        <div class="flex-1 space-y-2">
                            <div class="h-5 bg-muted rounded w-3/4" />
                            <div class="h-4 bg-muted rounded w-full" />
                            <div class="h-4 bg-muted rounded w-1/2" />
                        </div>
                    </div>
                </UCard>
            </div>
        </template>

        <!-- Empty state -->
        <template v-else-if="suggestions.length === 0">
            <UCard class="text-center py-12">
                <UIcon name="i-lucide-lightbulb" class="w-12 h-12 mx-auto text-muted mb-4" />
                <h3 class="text-lg font-semibold text-highlighted mb-2">
                    {{ t('feedback.empty') }}
                </h3>
                <p class="text-muted">
                    {{ t('feedback.emptyDescription') }}
                </p>
            </UCard>
        </template>

        <!-- Suggestions list -->
        <template v-else>
            <AdminFeedbackCard
                v-for="suggestion in suggestions"
                :key="suggestion.id"
                :suggestion="suggestion"
            />

            <!-- Pagination -->
            <div v-if="pagination.total_pages > 1" class="flex justify-center pt-4">
                <UPagination
                    :model-value="pagination.page"
                    :total="pagination.total"
                    :items-per-page="pagination.limit"
                    @update:model-value="handlePageChange"
                />
            </div>
        </template>
    </div>
</template>
