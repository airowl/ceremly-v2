<script setup lang="ts">
import { useConvexMutation, useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import { formatCount, formatDateTime, formatPercent } from "~/lib/adminConsole";

/**
 * Admin console — overview (plan Task 15): bounded metrics and the site mode.
 * Every number comes from `api.admin.*`, which checks the superAdmin role.
 */
definePageMeta({ layout: "admin", middleware: "admin" });

const { t, locale } = useI18n();
useHead({ title: () => t("adminConsole.title") });

const { data: overview, error: overviewError } = useConvexQuery(api.admin.overview, {}, { server: false });
const { data: events } = useConvexQuery(api.admin.eventMetrics, {}, { server: false });
const { data: billing } = useConvexQuery(api.admin.billingMetrics, {}, { server: false });

type SiteModeValue = "active" | "waitinglist" | "maintenance" | "maintenance-readonly";
const SITE_MODES: SiteModeValue[] = ["active", "waitinglist", "maintenance", "maintenance-readonly"];

const setSiteMode = useConvexMutation(api.admin.setSiteMode);
const { run, pending } = useAdminWrite();
const nextMode = ref<SiteModeValue>("active");
const siteReason = ref("");
const canWriteSite = computed(() => siteReason.value.trim().length > 0 && !pending.value);

watch(
    () => overview.value?.siteMode,
    (mode) => {
        if (mode) nextMode.value = mode;
    },
    { immediate: true },
);

async function applySiteMode(mode: SiteModeValue | null) {
    const done = await run(() => setSiteMode.mutate({ mode, reason: siteReason.value }));
    if (done) siteReason.value = "";
}

const siteModeItems = computed(() =>
    SITE_MODES.map((mode) => ({ label: t(`adminConsole.siteMode.modes.${mode}`), value: mode })),
);

const cards = computed(() => {
    const o = overview.value;
    const e = events.value;
    const b = billing.value;
    return [
        { key: "users", label: t("adminConsole.overview.users"), value: o ? formatCount(o.users.total, o.users.capped) : "…" },
        { key: "superAdmins", label: t("adminConsole.overview.superAdmins"), value: o ? String(o.users.superAdmins) : "…" },
        { key: "organizations", label: t("adminConsole.overview.organizations"), value: o ? formatCount(o.organizations.total, o.organizations.capped) : "…" },
        { key: "events", label: t("adminConsole.overview.events"), value: e ? formatCount(e.events.total, e.events.capped) : "…" },
        { key: "rsvp", label: t("adminConsole.overview.rsvp"), value: e ? formatCount(e.rsvp.total, e.rsvp.capped) : "…" },
        { key: "conversion", label: t("adminConsole.overview.conversion"), value: e ? formatPercent(e.conversionRate, locale.value) : "…" },
        { key: "atelier", label: t("adminConsole.overview.atelier"), value: b ? String(b.atelierActive) : "…" },
        { key: "jobsDead", label: t("adminConsole.overview.jobsDead"), value: o ? String(o.jobs.dead) : "…" },
        { key: "jobsRetrying", label: t("adminConsole.overview.jobsRetrying"), value: o ? String(o.jobs.retrying) : "…" },
        { key: "exportsFailed", label: t("adminConsole.overview.exportsFailed"), value: o ? String(o.exports.failed) : "…" },
        { key: "scheduled", label: t("adminConsole.overview.scheduledForDeletion"), value: o ? String(o.users.scheduledForDeletion) : "…" },
    ];
});
</script>

<template>
    <div class="space-y-8">
        <h1 class="text-2xl font-semibold">{{ t('adminConsole.nav.overview') }}</h1>

        <p v-if="overviewError" class="text-red-600">{{ t('adminConsole.error') }}</p>

        <section class="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-metrics">
            <div
                v-for="card in cards"
                :key="card.key"
                class="rounded-lg border border-neutral-200 bg-white p-4"
                :data-testid="`metric-${card.key}`"
            >
                <div class="text-xs text-neutral-500">{{ card.label }}</div>
                <div class="mt-1 text-2xl font-semibold tabular-nums">{{ card.value }}</div>
            </div>
        </section>
        <p class="text-xs text-neutral-500">≥ = {{ t('adminConsole.capped') }}</p>

        <section v-if="events" class="grid gap-4 md:grid-cols-2">
            <div class="rounded-lg border border-neutral-200 bg-white p-4">
                <h2 class="mb-2 font-medium">{{ t('adminConsole.overview.byStatus') }}</h2>
                <ul class="space-y-1 text-sm">
                    <li v-for="(count, status) in events.events.byStatus" :key="status">
                        {{ t(`adminConsole.events.statuses.${status}`) }}: <span class="tabular-nums">{{ count }}</span>
                    </li>
                    <li>{{ t('adminConsole.overview.celebration') }}: <span class="tabular-nums">{{ events.events.celebration }}</span></li>
                    <li>{{ t('adminConsole.overview.attending') }}: <span class="tabular-nums">{{ events.rsvp.yes }} / {{ events.rsvp.no }} / {{ events.rsvp.maybe }}</span></li>
                </ul>
            </div>
            <div v-if="billing" class="rounded-lg border border-neutral-200 bg-white p-4">
                <h2 class="mb-2 font-medium">{{ t('adminConsole.overview.billing') }}</h2>
                <ul class="space-y-1 text-sm">
                    <li>{{ t('adminConsole.overview.scannedOrgs') }}: {{ formatCount(billing.organizationsScanned, billing.capped) }}</li>
                    <li>
                        {{ t('adminConsole.overview.subscriptionStatuses') }}:
                        <span v-for="(count, status) in billing.subscriptionStatuses" :key="status" class="mr-2">{{ status }} {{ count }}</span>
                    </li>
                    <li>
                        {{ t('adminConsole.overview.webhookOutcomes') }}:
                        <span v-for="(count, outcome) in billing.recentWebhookOutcomes" :key="outcome" class="mr-2">{{ outcome }} {{ count }}</span>
                    </li>
                    <li>{{ t('adminConsole.overview.lastWebhook') }}: {{ formatDateTime(billing.lastWebhookAt, locale) }}</li>
                </ul>
            </div>
        </section>

        <section v-if="overview" class="max-w-xl space-y-3 rounded-lg border border-neutral-200 bg-white p-4" data-testid="admin-site-mode">
            <h2 class="font-medium">{{ t('adminConsole.siteMode.title') }}</h2>
            <p class="text-sm">
                {{ t('adminConsole.siteMode.current') }}:
                <strong>{{ t(`adminConsole.siteMode.modes.${overview.siteMode}`) }}</strong>
                ({{ overview.siteModeOverridden ? t('adminConsole.siteMode.overridden') : t('adminConsole.siteMode.default') }})
            </p>
            <USelect v-model="nextMode" :items="siteModeItems" class="w-full" />
            <UFormField :label="t('adminConsole.reason.label')" :help="t('adminConsole.reason.hint')">
                <UInput v-model="siteReason" :placeholder="t('adminConsole.reason.placeholder')" class="w-full" />
            </UFormField>
            <div class="flex flex-wrap gap-2">
                <UButton :disabled="!canWriteSite" :loading="pending" @click="applySiteMode(nextMode)">
                    {{ t('adminConsole.siteMode.apply') }}
                </UButton>
                <UButton
                    v-if="overview.siteModeOverridden"
                    :disabled="!canWriteSite"
                    color="neutral"
                    variant="outline"
                    @click="applySiteMode(null)"
                >
                    {{ t('adminConsole.siteMode.reset') }}
                </UButton>
            </div>
        </section>
    </div>
</template>
