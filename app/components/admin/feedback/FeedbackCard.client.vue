<script setup lang="ts">
import type { Suggestion } from '~/stores/feedbackStore';
import { useFeedbackStore } from '~/stores/feedbackStore';
import { useUserStore } from '~/stores/userStore';

const props = defineProps<{
    suggestion: Suggestion;
}>();

const { t } = useI18n();
const feedbackStore = useFeedbackStore();
const userStore = useUserStore();

const isVoting = ref(false);

// Check if current user is admin
const isAdmin = computed(() => {
    return userStore.user?.role === 'admin';
});

// Status options for admin dropdown
const statusOptions = computed(() => [
    { label: t('feedback.statuses.new'), value: 'new' },
    { label: t('feedback.statuses.under_review'), value: 'under_review' },
    { label: t('feedback.statuses.planned'), value: 'planned' },
    { label: t('feedback.statuses.completed'), value: 'completed' },
    { label: t('feedback.statuses.rejected'), value: 'rejected' },
]);

type BadgeColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral';

// Category badge color
const categoryColor = computed((): BadgeColor => {
    const colors: Record<string, BadgeColor> = {
        ui: 'info',
        new_feature: 'success',
        improvement: 'warning',
        bug: 'error',
    };
    return colors[props.suggestion.category] || 'neutral';
});

// Status badge color
const statusColor = computed((): BadgeColor => {
    const colors: Record<string, BadgeColor> = {
        new: 'neutral',
        under_review: 'warning',
        planned: 'info',
        completed: 'success',
        rejected: 'error',
    };
    return colors[props.suggestion.status] || 'neutral';
});

// Handle vote toggle
async function handleVote() {
    if (isVoting.value) return;
    isVoting.value = true;
    try {
        await feedbackStore.toggleVote(props.suggestion.id);
    } finally {
        isVoting.value = false;
    }
}

// Handle status change (admin)
async function handleStatusChange(status: string) {
    await feedbackStore.updateStatus(props.suggestion.id, status);
}

// Format date
function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString();
}

// Truncate description
function truncateDescription(text: string, maxLength = 120) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
}
</script>

<template>
    <UCard class="hover:ring-primary/50 transition-all duration-200">
        <div class="flex gap-4">
            <!-- Vote button -->
            <div class="flex flex-col items-center gap-1">
                <UButton
                    :icon="suggestion.has_voted ? 'i-lucide-heart' : 'i-lucide-heart'"
                    :color="suggestion.has_voted ? 'error' : 'neutral'"
                    :variant="suggestion.has_voted ? 'solid' : 'ghost'"
                    size="sm"
                    :loading="isVoting"
                    @click="handleVote"
                />
                <span class="text-sm font-semibold" :class="suggestion.has_voted ? 'text-error' : 'text-muted'">
                    {{ suggestion.vote_count }}
                </span>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
                <!-- Header -->
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-semibold text-highlighted truncate">
                        {{ suggestion.title }}
                    </h3>
                    <div class="flex items-center gap-2 shrink-0">
                        <UBadge :color="categoryColor" variant="subtle" size="xs">
                            {{ t(`feedback.categories.${suggestion.category}`) }}
                        </UBadge>
                        <UBadge :color="statusColor" variant="soft" size="xs">
                            {{ t(`feedback.statuses.${suggestion.status}`) }}
                        </UBadge>
                    </div>
                </div>

                <!-- Description -->
                <p class="text-sm text-muted mb-3">
                    {{ truncateDescription(suggestion.description) }}
                </p>

                <!-- Footer -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2 text-xs text-dimmed">
                        <UAvatar
                            :src="suggestion.author.image || undefined"
                            :alt="suggestion.author.name || 'User'"
                            size="2xs"
                        />
                        <span>{{ suggestion.author.name }}</span>
                        <span>&bull;</span>
                        <span>{{ formatDate(suggestion.created_at) }}</span>
                    </div>

                    <!-- Admin status dropdown -->
                    <UDropdownMenu v-if="isAdmin" :items="statusOptions.map((opt: { label: string; value: string }) => ({
                        label: opt.label,
                        onSelect: () => handleStatusChange(opt.value),
                        active: suggestion.status === opt.value,
                    }))">
                        <UButton
                            icon="i-lucide-more-horizontal"
                            color="neutral"
                            variant="ghost"
                            size="xs"
                        />
                    </UDropdownMenu>
                </div>
            </div>
        </div>
    </UCard>
</template>
