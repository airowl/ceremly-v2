<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import AdminOrganizationDetail from "~/components/admin/console/OrganizationDetail.vue";
import { formatDateTime, useCursorPager } from "~/lib/adminConsole";

/**
 * Admin console — organizations (plan Task 15): slug-prefix search on an
 * index; the detail shows members, the subscription (read-only) and the limit
 * override, which is the only write here (reason required, audited).
 */
definePageMeta({ layout: "admin", middleware: "admin" });

const { t, locale } = useI18n();
const route = useRoute();
useHead({ title: () => `${t("adminConsole.nav.organizations")} · ${t("adminConsole.title")}` });

const searchInput = ref("");
const search = ref("");
const pager = useCursorPager();

function applySearch() {
    search.value = searchInput.value.trim();
    pager.reset();
}

const { data: result, error } = useConvexQuery(
    api.admin.searchOrganizations,
    () => ({ ...(search.value ? { search: search.value } : {}), paginationOpts: pager.paginationOpts.value }),
    { server: false },
);

// `?id=` preselects an organization (links from the user detail).
const selectedId = ref<Id<"organizations"> | null>(
    typeof route.query.id === "string" && route.query.id ? (route.query.id as Id<"organizations">) : null,
);
</script>

<template>
    <div class="space-y-6">
        <h1 class="text-2xl font-semibold">{{ t('adminConsole.nav.organizations') }}</h1>

        <form class="flex max-w-xl gap-2" @submit.prevent="applySearch">
            <UInput v-model="searchInput" :placeholder="t('adminConsole.organizations.searchPlaceholder')" class="flex-1" data-testid="admin-org-search" />
            <UButton type="submit" icon="i-lucide-search">{{ t('adminConsole.search') }}</UButton>
        </form>

        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>

        <div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table class="w-full text-left text-sm">
                <thead class="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                        <th class="px-3 py-2">{{ t('adminConsole.organizations.name') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.organizations.slug') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.organizations.createdAt') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="organization in result?.page ?? []"
                        :key="organization._id"
                        class="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                        :class="{ 'bg-neutral-100': organization._id === selectedId }"
                        data-testid="admin-org-row"
                        @click="selectedId = organization._id"
                    >
                        <td class="px-3 py-2">{{ organization.name }}</td>
                        <td class="px-3 py-2 break-all">{{ organization.slug }}</td>
                        <td class="px-3 py-2">{{ formatDateTime(organization.createdAt, locale) }}</td>
                    </tr>
                    <tr v-if="result && result.page.length === 0">
                        <td colspan="3" class="px-3 py-6 text-center text-neutral-500">{{ t('adminConsole.empty') }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="flex gap-2">
            <UButton color="neutral" variant="outline" :disabled="!pager.hasPrev.value" @click="pager.prev()">{{ t('adminConsole.prev') }}</UButton>
            <UButton color="neutral" variant="outline" :disabled="!result || result.isDone" @click="result && pager.next(result.continueCursor)">{{ t('adminConsole.next') }}</UButton>
        </div>

        <AdminOrganizationDetail
            v-if="selectedId"
            :key="selectedId"
            :organization-id="selectedId"
            @close="selectedId = null"
        />
    </div>
</template>
