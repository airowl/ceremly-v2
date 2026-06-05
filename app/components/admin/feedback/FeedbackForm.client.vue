<script setup lang="ts">
import { z } from 'zod';
import type { FormSubmitEvent } from '@nuxt/ui';
import { useFeedbackStore } from '~/stores/feedbackStore';

const { t } = useI18n();
const toast = useToast();
const feedbackStore = useFeedbackStore();

const { userSuggestionCount, suggestionLimit, canCreate, remaining } = storeToRefs(feedbackStore);

// Form state
const isSubmitting = ref(false);
const state = reactive({
    title: '',
    description: '',
    category: undefined as string | undefined,
});

// Category options
const categoryOptions = computed(() => [
    { label: t('feedback.categories.ui'), value: 'ui' },
    { label: t('feedback.categories.new_feature'), value: 'new_feature' },
    { label: t('feedback.categories.improvement'), value: 'improvement' },
    { label: t('feedback.categories.bug'), value: 'bug' },
]);

// Validation schema
const schema = z.object({
    title: z.string().min(5, t('feedback.form.titleError')),
    description: z.string().min(20, t('feedback.form.descriptionError')),
    category: z.string().min(1, t('feedback.form.categoryError')),
});

type Schema = z.output<typeof schema>;

// Load user count on mount
onMounted(async () => {
    await feedbackStore.fetchUserCount();
});

// Handle form submit
async function onSubmit(event: FormSubmitEvent<Schema>) {
    if (isSubmitting.value || !canCreate.value) return;

    isSubmitting.value = true;

    try {
        const result = await feedbackStore.createSuggestion({
            title: event.data.title,
            description: event.data.description,
            category: event.data.category,
        });

        if (result.success) {
            toast.add({
                title: t('feedback.success'),
                color: 'success',
                icon: 'i-lucide-check-circle',
            });

            // Reset form
            state.title = '';
            state.description = '';
            state.category = undefined;
        } else {
            toast.add({
                title: t('feedback.error'),
                description: result.error,
                color: 'error',
                icon: 'i-lucide-alert-circle',
            });
        }
    } finally {
        isSubmitting.value = false;
    }
}
</script>

<template>
    <UCard>
        <template #header>
            <div class="flex items-center justify-between">
                <h3 class="font-semibold text-highlighted">
                    {{ t('feedback.form.title') }}
                </h3>
                <UBadge
                    :color="canCreate ? 'success' : 'error'"
                    variant="subtle"
                    size="sm"
                >
                    {{ userSuggestionCount }}/{{ suggestionLimit }}
                </UBadge>
            </div>
        </template>

        <!-- Limit reached warning -->
        <UAlert
            v-if="!canCreate"
            icon="i-lucide-alert-triangle"
            color="warning"
            variant="subtle"
            :title="t('feedback.form.limitReached')"
            :description="t('feedback.form.limitReachedDescription')"
            class="mb-4"
        />

        <UForm
            :schema="schema"
            :state="state"
            class="space-y-4"
            @submit="onSubmit"
        >
            <UFormField :label="t('feedback.form.titleLabel')" name="title" class="w-full">
                <UInput
                    v-model="state.title"
                    :placeholder="t('feedback.form.titlePlaceholder')"
                    :disabled="!canCreate"
                    class="w-full"
                />
            </UFormField>

            <UFormField :label="t('feedback.form.categoryLabel')" name="category" class="w-full">
                <USelect
                    v-model="state.category"
                    :items="categoryOptions"
                    :placeholder="t('feedback.form.categoryPlaceholder')"
                    :disabled="!canCreate"
                    class="w-full"
                />
            </UFormField>

            <UFormField :label="t('feedback.form.descriptionLabel')" name="description" class="w-full">
                <UTextarea
                    v-model="state.description"
                    :placeholder="t('feedback.form.descriptionPlaceholder')"
                    :rows="5"
                    :disabled="!canCreate"
                    class="w-full"
                />
            </UFormField>

            <div class="flex items-center justify-between pt-4 border-t border-default">
                <span v-if="canCreate" class="text-sm text-muted">
                    {{ t('feedback.form.remaining', { count: remaining }) }}
                </span>
                <span v-else />

                <UButton
                    type="submit"
                    :loading="isSubmitting"
                    :disabled="!canCreate"
                    icon="i-lucide-send"
                >
                    {{ t('feedback.form.submit') }}
                </UButton>
            </div>
        </UForm>
    </UCard>
</template>
