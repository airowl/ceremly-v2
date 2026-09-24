<script setup lang="ts">
import { useConvexMutation, useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { formatDateTime, formatLimit } from "~/lib/adminConsole";

/**
 * Organization detail of the admin console (plan Task 15).
 *
 * The subscription is read-only on purpose: Creem is the source of truth and
 * changes happen in its dashboard or the customer portal. The only write is the
 * limit override (`api.admin.setOrganizationLimits`): an empty field means "plan
 * value", `-1` unlimited; the server validates, requires the reason and audits.
 */
const props = defineProps<{ organizationId: Id<"organizations"> }>();
const emit = defineEmits<{ close: [] }>();

const { t, locale } = useI18n();
const localePath = useLocalePath();

const { data: detail, error } = useConvexQuery(
    api.admin.getOrganization,
    () => ({ organizationId: props.organizationId }),
    { server: false },
);

const LIMIT_KEYS = ["maxGuestsPerEvent", "maxActiveEvents", "maxReminders"] as const;
type LimitKey = (typeof LIMIT_KEYS)[number];

const form = reactive<Record<LimitKey, string>>({ maxGuestsPerEvent: "", maxActiveEvents: "", maxReminders: "" });
const limitsReason = ref("");

watch(
    () => detail.value?.limitOverride,
    (override) => {
        for (const key of LIMIT_KEYS) {
            const value = override?.[key];
            form[key] = value === null || value === undefined ? "" : String(value);
        }
    },
    { immediate: true },
);

function parseLimit(raw: string): number | null {
    const trimmed = raw.trim();
    return trimmed === "" ? null : Number(trimmed);
}

const setLimits = useConvexMutation(api.admin.setOrganizationLimits);
const { run, pending } = useAdminWrite();
const canSave = computed(() => limitsReason.value.trim().length > 0 && !pending.value);

async function saveLimits() {
    const done = await run(() =>
        setLimits.mutate({
            organizationId: props.organizationId,
            limits: {
                maxGuestsPerEvent: parseLimit(form.maxGuestsPerEvent),
                maxActiveEvents: parseLimit(form.maxActiveEvents),
                maxReminders: parseLimit(form.maxReminders),
            },
            reason: limitsReason.value,
        }),
    );
    if (done) limitsReason.value = "";
}
</script>

<template>
    <section class="space-y-5 rounded-lg border border-neutral-200 bg-white p-4" data-testid="admin-org-detail">
        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>
        <p v-else-if="!detail" class="text-neutral-500">{{ t('adminConsole.loading') }}</p>
        <template v-else>
            <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-medium">{{ detail.organization.name }}</h2>
                <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('adminConsole.close')" @click="emit('close')" />
            </div>
            <p class="text-sm text-neutral-600">
                {{ detail.organization.slug }} ·
                {{ t('adminConsole.organizations.plan') }} {{ t(`adminConsole.organizations.plans.${detail.plan}`) }} ·
                {{ t('adminConsole.organizations.events') }} {{ detail.events.capped ? '≥ ' : '' }}{{ detail.events.total }}
            </p>
            <div class="flex flex-wrap gap-3 text-sm">
                <NuxtLink :to="localePath({ path: '/admin/events', query: { organizationId: detail.organization._id } })" class="underline">
                    {{ t('adminConsole.organizations.viewEvents') }}
                </NuxtLink>
                <NuxtLink :to="localePath({ path: '/admin/audit', query: { organizationId: detail.organization._id } })" class="underline">
                    {{ t('adminConsole.organizations.viewAudit') }}
                </NuxtLink>
            </div>

            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.organizations.members') }}</h3>
                <ul class="text-sm">
                    <li v-for="member in detail.members" :key="member.userId" class="break-all">
                        {{ member.email ?? member.userId }} · {{ member.role }}
                    </li>
                </ul>
            </div>

            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.organizations.subscriptions') }}</h3>
                <p class="mb-2 text-xs text-neutral-500">{{ t('adminConsole.organizations.subscriptionHint') }}</p>
                <p v-if="detail.customerId" class="text-xs text-neutral-500">
                    {{ t('adminConsole.organizations.customer') }}: {{ detail.customerId }}
                </p>
                <ul class="text-sm" data-testid="admin-org-subscriptions">
                    <li v-for="subscription in detail.subscriptions" :key="subscription.id">
                        {{ subscription.productName ?? subscription.productId }} ·
                        {{ t('adminConsole.organizations.status') }} {{ subscription.status }} ·
                        {{ t('adminConsole.organizations.periodEnd') }} {{ formatDateTime(subscription.currentPeriodEnd, locale) }}
                        <span v-if="subscription.cancelAtPeriodEnd">· {{ t('adminConsole.organizations.cancelAtPeriodEnd') }}</span>
                    </li>
                    <li v-if="detail.subscriptions.length === 0" class="text-neutral-500">
                        {{ t('adminConsole.organizations.noSubscriptions') }}
                    </li>
                </ul>
            </div>

            <div class="space-y-3 border-t border-neutral-100 pt-4" data-testid="admin-limits-form">
                <h3 class="text-sm font-medium">{{ t('adminConsole.organizations.limits') }}</h3>
                <p class="text-xs text-neutral-500">{{ t('adminConsole.organizations.overrideHint') }}</p>
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                        <thead class="text-xs uppercase text-neutral-500">
                            <tr>
                                <th class="py-1 pr-3" />
                                <th class="py-1 pr-3">{{ t('adminConsole.organizations.planLimit') }}</th>
                                <th class="py-1 pr-3">{{ t('adminConsole.organizations.effectiveLimit') }}</th>
                                <th class="py-1">{{ t('adminConsole.organizations.override') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="key in LIMIT_KEYS" :key="key">
                                <td class="py-1 pr-3">{{ t(`adminConsole.organizations.limitNames.${key}`) }}</td>
                                <td class="py-1 pr-3 tabular-nums">{{ formatLimit(detail.planLimits[key]) }}</td>
                                <td class="py-1 pr-3 tabular-nums">{{ formatLimit(detail.effectiveLimits[key]) }}</td>
                                <td class="py-1">
                                    <UInput v-model="form[key]" inputmode="numeric" class="w-28" :data-testid="`admin-limit-${key}`" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p v-if="detail.limitOverride" class="text-xs text-neutral-500">
                    {{ t('adminConsole.organizations.lastChange') }}: {{ formatDateTime(detail.limitOverride.updatedAt, locale) }}
                    · {{ detail.limitOverride.updatedByEmail ?? '-' }} · {{ detail.limitOverride.reason }}
                </p>
                <UFormField :label="t('adminConsole.reason.label')" :help="t('adminConsole.reason.hint')" class="max-w-xl">
                    <UInput v-model="limitsReason" :placeholder="t('adminConsole.reason.placeholder')" class="w-full" data-testid="admin-limits-reason" />
                </UFormField>
                <UButton :disabled="!canSave" :loading="pending" data-testid="admin-limits-save" @click="saveLimits">
                    {{ t('adminConsole.organizations.saveLimits') }}
                </UButton>
            </div>

            <div>
                <h3 class="mb-1 text-sm font-medium">{{ t('adminConsole.users.recentAudit') }}</h3>
                <ul class="text-sm">
                    <li v-for="row in detail.recentAudit" :key="row._id">
                        {{ formatDateTime(row.createdAt, locale) }} · {{ row.action }} · {{ row.actorEmail ?? t('adminConsole.audit.system') }}
                        <span v-if="row.reason" class="text-neutral-600">· {{ row.reason }}</span>
                    </li>
                    <li v-if="detail.recentAudit.length === 0" class="text-neutral-500">{{ t('adminConsole.empty') }}</li>
                </ul>
            </div>
        </template>
    </section>
</template>
