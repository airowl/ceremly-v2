<script setup lang="ts">
import { useConvexQuery } from "convex-vue";
import { api } from "~~/convex/_generated/api";

/**
 * Admin console layout (plan Task 15).
 *
 * The slot renders only after `api.admin.whoami` has answered: if the route
 * middleware is bypassed, a non-admin sees the refusal below and no page mounts
 * (so no admin query is even attempted from the page). The real gate is still
 * the server — every `api.admin.*` function checks the role itself.
 */
const { t } = useI18n();
const localePath = useLocalePath();
const route = useRoute();

useHead({ meta: [{ name: "robots", content: "noindex, nofollow" }] });

const { data: me, error, isPending } = useConvexQuery(api.admin.whoami, {}, { server: false });

const nav = computed(() => [
    { to: "/admin", label: t("adminConsole.nav.overview"), icon: "i-lucide-layout-dashboard" },
    { to: "/admin/users", label: t("adminConsole.nav.users"), icon: "i-lucide-users" },
    { to: "/admin/organizations", label: t("adminConsole.nav.organizations"), icon: "i-lucide-building-2" },
    { to: "/admin/events", label: t("adminConsole.nav.events"), icon: "i-lucide-calendar-heart" },
    { to: "/admin/jobs", label: t("adminConsole.nav.jobs"), icon: "i-lucide-list-restart" },
    { to: "/admin/audit", label: t("adminConsole.nav.audit"), icon: "i-lucide-scroll-text" },
]);

function isActive(to: string): boolean {
    const path = route.path.replace(/^\/en(?=\/)/, "");
    return to === "/admin" ? path === "/admin" : path.startsWith(to);
}
</script>

<template>
    <div class="min-h-screen bg-[#FAF9F6] text-neutral-900">
        <div v-if="error" class="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center" data-testid="admin-denied">
            <UIcon name="i-lucide-shield-x" class="size-10 text-neutral-500" />
            <h1 class="text-xl font-semibold">{{ t('adminConsole.denied.title') }}</h1>
            <p class="text-neutral-600">{{ t('adminConsole.denied.description') }}</p>
            <UButton :to="localePath('/dashboard')" color="neutral" variant="outline">
                {{ t('adminConsole.denied.action') }}
            </UButton>
        </div>

        <div v-else-if="isPending || !me" class="flex min-h-screen items-center justify-center text-neutral-500">
            {{ t('adminConsole.loading') }}
        </div>

        <div v-else class="flex min-h-screen flex-col md:flex-row">
            <aside class="border-b border-neutral-200 bg-white px-4 py-4 md:w-60 md:shrink-0 md:border-b-0 md:border-r">
                <div class="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                    {{ t('adminConsole.title') }}
                </div>
                <nav class="flex flex-wrap gap-1 md:flex-col" data-testid="admin-nav">
                    <NuxtLink
                        v-for="item in nav"
                        :key="item.to"
                        :to="localePath(item.to)"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-neutral-100"
                        :class="{ 'bg-neutral-100 font-medium': isActive(item.to) }"
                    >
                        <UIcon :name="item.icon" class="size-4" />
                        <span>{{ item.label }}</span>
                    </NuxtLink>
                </nav>
                <div class="mt-6 space-y-2 text-xs text-neutral-500">
                    <div class="break-all" data-testid="admin-identity">{{ me.email }}</div>
                    <NuxtLink :to="localePath('/dashboard')" class="underline">
                        {{ t('adminConsole.nav.backToApp') }}
                    </NuxtLink>
                </div>
            </aside>
            <main class="min-w-0 flex-1 px-4 py-6 md:px-8">
                <slot />
            </main>
        </div>
    </div>
</template>
