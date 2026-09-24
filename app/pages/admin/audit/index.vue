<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { formatDateTime, useCursorPager } from "~/lib/adminConsole";

/**
 * Admin console — audit log (plan Task 15), newest first.
 *
 * One filter at a time, each on its own index (`?actor=`, `?organizationId=`,
 * or an exact action name). Details arrive already redacted by the server.
 */
definePageMeta({ layout: "admin", middleware: "admin" });

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
useHead({ title: () => `${t("adminConsole.nav.audit")} · ${t("adminConsole.title")}` });

const queryString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

const actor = computed(() => queryString(route.query.actor) as Id<"appUsers"> | null);
const organizationId = computed(() => queryString(route.query.organizationId) as Id<"organizations"> | null);
const actionInput = ref(queryString(route.query.action) ?? "");
const action = computed(() => queryString(route.query.action));

const pager = useCursorPager();
watch([actor, organizationId, action], () => pager.reset());

function applyAction() {
    router.replace({ query: { action: actionInput.value.trim() || undefined } });
}

function clearFilters() {
    actionInput.value = "";
    router.replace({ query: {} });
}

const { data: result, error } = useConvexQuery(
    api.admin.listAudit,
    () => ({
        ...(actor.value ? { actorAppUserId: actor.value } : {}),
        ...(organizationId.value ? { organizationId: organizationId.value } : {}),
        ...(action.value ? { action: action.value } : {}),
        paginationOpts: pager.paginationOpts.value,
    }),
    { server: false },
);

const hasFilters = computed(() => !!(actor.value || organizationId.value || action.value));
const expanded = ref<string | null>(null);
</script>

<template>
    <div class="space-y-6">
        <h1 class="text-2xl font-semibold">{{ t('adminConsole.audit.title') }}</h1>

        <form class="flex max-w-xl gap-2" @submit.prevent="applyAction">
            <UInput v-model="actionInput" :placeholder="t('adminConsole.audit.actionPlaceholder')" class="flex-1" data-testid="admin-audit-action" />
            <UButton type="submit" icon="i-lucide-search">{{ t('adminConsole.search') }}</UButton>
        </form>
        <div v-if="hasFilters" class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-neutral-500">{{ t('adminConsole.audit.filters') }}:</span>
            <UBadge v-if="actor" color="neutral" variant="subtle">{{ t('adminConsole.audit.actor') }} {{ actor }}</UBadge>
            <UBadge v-if="organizationId" color="neutral" variant="subtle">{{ t('adminConsole.events.organization') }} {{ organizationId }}</UBadge>
            <UBadge v-if="action" color="neutral" variant="subtle">{{ action }}</UBadge>
            <UButton size="xs" color="neutral" variant="ghost" @click="clearFilters">{{ t('adminConsole.audit.clearFilters') }}</UButton>
        </div>

        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>

        <div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table class="w-full text-left text-sm">
                <thead class="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                        <th class="px-3 py-2">{{ t('adminConsole.audit.createdAt') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.audit.action') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.audit.actor') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.audit.target') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.audit.reason') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.audit.status') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <template v-for="row in result?.page ?? []" :key="row._id">
                        <tr
                            class="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                            data-testid="admin-audit-row"
                            @click="expanded = expanded === row._id ? null : row._id"
                        >
                            <td class="px-3 py-2 whitespace-nowrap" data-testid="admin-audit-time">{{ formatDateTime(row.createdAt, locale) }}</td>
                            <td class="px-3 py-2" data-testid="admin-audit-action-name">{{ row.action }}</td>
                            <td class="px-3 py-2 break-all" data-testid="admin-audit-actor">{{ row.actorEmail ?? t('adminConsole.audit.system') }}</td>
                            <td class="px-3 py-2 text-xs break-all" data-testid="admin-audit-target">{{ row.targetType ?? '-' }} {{ row.targetId ?? '' }}</td>
                            <td class="px-3 py-2" data-testid="admin-audit-reason">{{ row.reason ?? '-' }}</td>
                            <td class="px-3 py-2">{{ row.status }}</td>
                        </tr>
                        <tr v-if="expanded === row._id" class="bg-neutral-50">
                            <td colspan="6" class="px-3 py-2">
                                <div class="mb-1 text-xs font-medium text-neutral-500">{{ t('adminConsole.audit.details') }}</div>
                                <pre class="overflow-x-auto text-xs whitespace-pre-wrap break-all" data-testid="admin-audit-details">{{ JSON.stringify(row.details, null, 2) }}</pre>
                            </td>
                        </tr>
                    </template>
                    <tr v-if="result && result.page.length === 0">
                        <td colspan="6" class="px-3 py-6 text-center text-neutral-500">{{ t('adminConsole.empty') }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="flex gap-2">
            <UButton color="neutral" variant="outline" :disabled="!pager.hasPrev.value" @click="pager.prev()">{{ t('adminConsole.prev') }}</UButton>
            <UButton color="neutral" variant="outline" :disabled="!result || result.isDone" @click="result && pager.next(result.continueCursor)">{{ t('adminConsole.next') }}</UButton>
        </div>
    </div>
</template>
