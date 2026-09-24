<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { formatDateTime, formatLimit } from "~/lib/adminConsole";

/** Event detail of the admin console (plan Task 15): read-only, no guest data. */
const props = defineProps<{ eventId: Id<"events"> }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();
const localePath = useLocalePath();

const { data: detail, error } = useConvexQuery(api.admin.getEvent, () => ({ eventId: props.eventId }), { server: false });

const LIMIT_KEYS = ["maxGuestsPerEvent", "maxActiveEvents", "maxReminders"] as const;
</script>

<template>
    <section class="space-y-4 rounded-lg border border-neutral-200 bg-white p-4">
        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>
        <p v-else-if="!detail" class="text-neutral-500">{{ t('adminConsole.loading') }}</p>
        <template v-else>
            <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-medium">{{ detail.event.title }}</h2>
                <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('adminConsole.close')" @click="emit('close')" />
            </div>
            <p class="text-sm text-neutral-600">
                {{ detail.event.slug }} ·
                {{ t(`adminConsole.events.statuses.${detail.event.status}`) }} ·
                {{ t(`adminConsole.events.tiers.${detail.event.tier}`) }} ·
                <NuxtLink :to="localePath({ path: '/admin/organizations', query: { id: detail.event.organizationId } })" class="underline">
                    {{ detail.event.organizationName ?? detail.event.organizationId }}
                </NuxtLink>
            </p>
            <ul class="text-sm">
                <li>{{ t('adminConsole.events.guests') }}: {{ detail.guests.capped ? '≥ ' : '' }}{{ detail.guests.active }}</li>
                <li>{{ t('adminConsole.events.rsvp') }}: {{ detail.rsvp.yes }} / {{ detail.rsvp.no }} / {{ detail.rsvp.maybe }}</li>
                <li>
                    {{ t('adminConsole.events.billing') }}:
                    {{ detail.billing.hasOrder ? t('adminConsole.events.hasOrder') : detail.billing.hasCheckout ? t('adminConsole.events.hasCheckout') : '-' }}
                    <template v-if="detail.event.unlockedAt"> · {{ formatDateTime(detail.event.unlockedAt, locale) }}</template>
                </li>
            </ul>
            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.events.limits') }}</h3>
                <ul class="text-sm">
                    <li v-for="key in LIMIT_KEYS" :key="key">
                        {{ t(`adminConsole.organizations.limitNames.${key}`) }}: {{ formatLimit(detail.limits[key]) }}
                    </li>
                </ul>
            </div>
        </template>
    </section>
</template>
