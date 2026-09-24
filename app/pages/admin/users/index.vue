<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import AdminUserDetail from "~/components/admin/console/UserDetail.vue";
import { formatDateTime, useCursorPager } from "~/lib/adminConsole";

/**
 * Admin console — users (plan Task 15): email-prefix search on an index, a
 * read-only detail, and the global role change (reason required, audited).
 * No impersonation, no password change, no delete: none exists server-side.
 */
definePageMeta({ layout: "admin", middleware: "admin" });

const { t, locale } = useI18n();
useHead({ title: () => `${t("adminConsole.nav.users")} · ${t("adminConsole.title")}` });

const searchInput = ref("");
const search = ref("");
const pager = useCursorPager();

function applySearch() {
    search.value = searchInput.value.trim();
    pager.reset();
}

const { data: result, error } = useConvexQuery(
    api.admin.searchUsers,
    () => ({ ...(search.value ? { search: search.value } : {}), paginationOpts: pager.paginationOpts.value }),
    { server: false },
);

const selectedId = ref<Id<"appUsers"> | null>(null);
</script>

<template>
    <div class="space-y-6">
        <h1 class="text-2xl font-semibold">{{ t('adminConsole.nav.users') }}</h1>

        <form class="flex max-w-xl gap-2" @submit.prevent="applySearch">
            <UInput v-model="searchInput" :placeholder="t('adminConsole.users.searchPlaceholder')" class="flex-1" data-testid="admin-user-search" />
            <UButton type="submit" icon="i-lucide-search">{{ t('adminConsole.search') }}</UButton>
        </form>

        <p v-if="error" class="text-red-600">{{ t('adminConsole.error') }}</p>

        <div class="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table class="w-full text-left text-sm">
                <thead class="bg-neutral-50 text-xs uppercase text-neutral-500">
                    <tr>
                        <th class="px-3 py-2">{{ t('adminConsole.users.email') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.users.role') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.users.locale') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.users.createdAt') }}</th>
                        <th class="px-3 py-2">{{ t('adminConsole.users.deletion') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="user in result?.page ?? []"
                        :key="user._id"
                        class="cursor-pointer border-t border-neutral-100 hover:bg-neutral-50"
                        :class="{ 'bg-neutral-100': user._id === selectedId }"
                        data-testid="admin-user-row"
                        @click="selectedId = user._id"
                    >
                        <td class="px-3 py-2 break-all">{{ user.email }}</td>
                        <td class="px-3 py-2">{{ t(`adminConsole.users.roles.${user.globalRole}`) }}</td>
                        <td class="px-3 py-2">{{ user.locale }}</td>
                        <td class="px-3 py-2">{{ formatDateTime(user.createdAt, locale) }}</td>
                        <td class="px-3 py-2">{{ user.purgeAt ? formatDateTime(user.purgeAt, locale) : '-' }}</td>
                    </tr>
                    <tr v-if="result && result.page.length === 0">
                        <td colspan="5" class="px-3 py-6 text-center text-neutral-500">{{ t('adminConsole.empty') }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="flex gap-2">
            <UButton color="neutral" variant="outline" :disabled="!pager.hasPrev.value" @click="pager.prev()">{{ t('adminConsole.prev') }}</UButton>
            <UButton color="neutral" variant="outline" :disabled="!result || result.isDone" @click="result && pager.next(result.continueCursor)">{{ t('adminConsole.next') }}</UButton>
        </div>

        <AdminUserDetail v-if="selectedId" :key="selectedId" :user-id="selectedId" @close="selectedId = null" />
    </div>
</template>
