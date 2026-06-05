<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const { t } = useI18n()
const { user } = useAuth();
const userStore = useUserStore();

// Inject refresh function from parent page
const refreshEvents = inject<() => Promise<void>>('refreshEvents');

const schema = computed(() => z.object({
    name: z.string().min(2, t('event.createModal.validation.tooShort')),
    slug: z.string().min(2, t('event.createModal.validation.tooShort'))
}))
const open = ref(false)

type Schema = z.output<typeof schema.value>

const state = reactive({
    name: undefined as string | undefined,
    slug: undefined as string | undefined
})

// Controlli limiti
const eventLimit = ref<{ allowed: boolean; current: number; limit: number } | null>(null);
const isLoadingLimits = ref(false);

// Carica i limiti quando il modal si apre
async function loadLimits() {
    if (!user.value?.id) return;

    isLoadingLimits.value = true;
    try {
        eventLimit.value = await userStore.checkEventCreationLimit();
    } catch (error) {
        console.error('Errore nel caricamento limiti:', error);
    } finally {
        isLoadingLimits.value = false;
    }
}

// Controlla se l'utente può creare event (basato sui limiti del piano)
const canCreateEvent = computed(() => {
    // Usa solo il controllo del limite dal backend
    return eventLimit.value?.allowed ?? true;
});

const toast = useToast()
async function onSubmit(event: FormSubmitEvent<Schema>) {
    // Controllo finale prima della creazione
    if (!canCreateEvent.value) {
        toast.add({
            title: t('event.createModal.limitReached'),
            description: t('event.createModal.limitReachedDescription'),
            color: 'warning'
        })
        return;
    }

    try {
        await $fetch('/api/events', {
            method: 'POST',
            body: state
        });
    } catch (err: any) {
        toast.add({ title: t('event.createModal.error'), description: err.message || t('event.createModal.failedToCreate'), color: 'error' })
        return;
    }

    // Refresh the events list
    await refreshEvents?.();

    // ✅ Aggiorna i contatori locali
    if (eventLimit.value) {
        eventLimit.value.current += 1;
    }

    toast.add({ title: t('event.createModal.success'), description: t('event.createModal.successDescription', { name: event.data.name }), color: 'success' })
    open.value = false
}

// Quando si apre il modal, carica i limiti
watch(open, async (newOpen) => {
    if (newOpen) {
        await loadLimits();
    }
});
</script>

<template>
    <UModal v-model:open="open" :title="$t('event.createModal.title')" :description="$t('event.createModal.description')">
        <UButton
            :label="$t('event.createModal.button')"
            icon="i-lucide-plus"
            :disabled="!canCreateEvent || isLoadingLimits"
            :loading="isLoadingLimits"
        />

        <template #body>
            <!-- Limite event raggiunto -->
            <UAlert v-if="!canCreateEvent && eventLimit" color="warning" variant="subtle" class="mb-4">
                <UIcon name="i-lucide-alert-triangle" class="size-5 shrink-0" />
                <p class="text-sm">
                    {{ $t('event.createModal.limitWarning', { limit: eventLimit.limit }) }}
                    <NuxtLink to="/dashboard/subscription" class="underline">{{ $t('event.createModal.upgradeLink') }}</NuxtLink>
                </p>
            </UAlert>

            <!-- Utilizzo corrente -->
            <div v-else-if="eventLimit" class="mb-4 p-3 bg-muted rounded-lg">
                <div class="flex justify-between items-center text-sm">
                    <span>{{ $t('event.createModal.eventsUsed') }}</span>
                    <span class="font-medium">{{ eventLimit.current }} / {{ eventLimit.limit }}</span>
                </div>
                <UProgress
                    :model-value="eventLimit.current"
                    :max="eventLimit.limit"
                    class="mt-2"
                    color="primary"
                />
            </div>

            <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
                <UFormField :label="$t('event.createModal.name')" :placeholder="$t('event.createModal.namePlaceholder')" name="name">
                    <UInput v-model="state.name" class="w-full" />
                </UFormField>
                <UFormField :label="$t('event.createModal.slug')" :placeholder="$t('event.createModal.slugPlaceholder')" name="slug">
                    <UInput v-model="state.slug" class="w-full" />
                </UFormField>
                <div class="flex justify-end gap-2">
                    <UButton :label="$t('event.createModal.cancel')" color="neutral" variant="subtle" @click="open = false" />
                    <UButton
                        :label="$t('event.createModal.create')"
                        color="primary"
                        variant="solid"
                        type="submit"
                        :disabled="!canCreateEvent"
                    />
                </div>
            </UForm>
        </template>
    </UModal>
</template>
