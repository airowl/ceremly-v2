<script setup lang="ts">
import { useFeedbackStore } from '~/stores/feedbackStore';

const { t } = useI18n();
const feedbackStore = useFeedbackStore();

const { filters } = storeToRefs(feedbackStore);

// Sort options
const sortOptions = [
    { label: t('feedback.sort.most_voted'), value: 'most_voted' },
    { label: t('feedback.sort.recent'), value: 'recent' },
    { label: t('feedback.sort.status'), value: 'status' },
];

// Status filter options
const statusOptions = [
    { label: t('feedback.filter.allStatuses'), value: '' },
    { label: t('feedback.statuses.new'), value: 'new' },
    { label: t('feedback.statuses.under_review'), value: 'under_review' },
    { label: t('feedback.statuses.planned'), value: 'planned' },
    { label: t('feedback.statuses.completed'), value: 'completed' },
    { label: t('feedback.statuses.rejected'), value: 'rejected' },
];

// Category filter options
const categoryOptions = [
    { label: t('feedback.filter.allCategories'), value: '' },
    { label: t('feedback.categories.ui'), value: 'ui' },
    { label: t('feedback.categories.new_feature'), value: 'new_feature' },
    { label: t('feedback.categories.improvement'), value: 'improvement' },
    { label: t('feedback.categories.bug'), value: 'bug' },
];
</script>

<template>
    <div class="flex flex-wrap items-center gap-3">
        <!-- Sort -->
        <div class="flex items-center gap-2">
            <span class="text-sm text-muted">{{ t('feedback.sort.label') }}:</span>
            <USelect
                :model-value="filters.sort"
                :options="sortOptions"
                size="sm"
                class="w-40"
                @update:model-value="feedbackStore.setFilter('sort', $event as 'most_voted' | 'recent' | 'status')"
            />
        </div>

        <!-- Status filter -->
        <USelect
            :model-value="filters.status || ''"
            :options="statusOptions"
            size="sm"
            class="w-36"
            @update:model-value="feedbackStore.setFilter('status', ($event as string) || undefined)"
        />

        <!-- Category filter -->
        <USelect
            :model-value="filters.category || ''"
            :options="categoryOptions"
            size="sm"
            class="w-40"
            @update:model-value="feedbackStore.setFilter('category', ($event as string) || undefined)"
        />
    </div>
</template>
