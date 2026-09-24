<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import AdminEventDetail from "~/components/admin/console/EventDetail.vue";
import { formatDateTime, useCursorPager } from "~/lib/adminConsole";

/**
 * Admin console — events (plan Task 15): newest first, slug-prefix search, or
 * the events of one organization (`?organizationId=`). Read-only.
 */
definePageMeta({ layout: "admin", middleware: "admin" });

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
useHead({ title: () => `${t("adminConsole.nav.events")} · ${t("adminConsole.title")}` });

const searchInput = ref("");
const search = ref("");
const pager = useCursorPager();

const organizationId = computed<Id<"organizations"> | null>(() =>
    typeof route.query.organizationId === "string" && route.query.organizationId
        ? (route.query.organizationId as Id<"organizations">)
        : null,
);
watch(organizationId, () => pager.reset());

function applySearch() {
    search.value = searchInput.value.trim();
    pager.reset();
}

function clearOrganizationFilter() {
    router.replace({ query: { ...route.query, organizationId: undefined } });
}

const { data: result, error } = useConvexQuery(
    api.admin.searchEvents,
    () => ({
        ...(organizationId.value ? { organizationId: organizationId.value } : {}),
        ...(search.value && !organizationId.value ? { search: search.value } : {}),
        paginationOpts: pager.paginationOpts.value,
    }),
    { server: false },
);

const selectedId = ref<Id<"events"> | null>(null);
</script>

<template>
    <div class="space-y-6">
        <h1 class="text-2xl font-semibold">{{ t('adminConsole.nav.events') }}</h1>

        <div v-if="organizationId" class="flex items-center gap-2 text-sm">
            <UBadge color="neutral" variant="subtle">{{ t('adminConsole.events.filteredByOrg') }}</UBadge>
            <UButton size="xs" color="neutral" variant="ghost" @click="clearOrganizationFilter">{{ t('adminConsole.events.clearFilter') }}</UButton>
        </div>
        <form v-else class="flex max-w-xl gap-2" @submit.prevent="applySearch">
            <UInput v-model="searchInput" :placeholder="t('adminConsole.events.searchPlaceholder')" class="flex-1" />
            <UButton type="submit" icon="i-lucide-search">{{ t('adminConsole.search') }}</UButton>
        </form>

        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>

        <div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table class="w-full text-left text-sm">
                <thead class="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                        <th class="px-3 py-2">{{ t('adminConsole.events.title') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.events.organization') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.events.status') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.events.tier') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.events.eventDate') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.events.createdAt') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="event in result?.page ?? []"
                        :key="event._id"
                        class="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                        :class="{ 'bg-neutral-100': event._id === selectedId }"
                        @click="selectedId = event._id"
                    >
                        <td class="px-3 py-2">{{ event.title }}<div class="text-xs text-neutral-500 break-all">{{ event.slug }}</div></td>
                        <td class="px-3 py-2">{{ event.organizationName ?? '-' }}</td>
                        <td class="px-3 py-2">{{ t(`adminConsole.events.statuses.${event.status}`) }}</td>
                        <td class="px-3 py-2">{{ t(`adminConsole.events.tiers.${event.tier}`) }}</td>
                        <td class="px-3 py-2">{{ formatDateTime(event.eventDate, locale) }}</td>
                        <td class="px-3 py-2">{{ formatDateTime(event.createdAt, locale) }}</td>
                    </tr>
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

        <AdminEventDetail v-if="selectedId" :key="selectedId" :event-id="selectedId" @close="selectedId = null" />
    </div>
</template>
