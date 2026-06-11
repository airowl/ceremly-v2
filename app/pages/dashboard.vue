<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t, locale, setLocale } = useI18n()

definePageMeta({
    layout: 'dashboard',
})

const route = useRoute();

// Le route Ceremly (layout 'ceremly' in definePageMeta) sono figlie annidate di
// questa pagina parent legacy: per loro questo componente è un puro passthrough,
// altrimenti UDashboardGroup (fixed inset-0) coprirebbe la shell Ceremly.
const isCeremlyRoute = computed(() => route.meta.layout === "ceremly");

const open = ref(false);

const links = ref<NavigationMenuItem[]>([]);

const routeName = computed(() => (route.name as string).split('___')[0]);

const isInsideOrganization = computed(() => {
    const rn = routeName.value ?? '';
    const paramsId = route.params.id as string | undefined;
    return rn.startsWith("dashboard-organization-id") && !!paramsId;
});

const changeLinks = () => {
    const paramsId = route.params.id as string | undefined;
    const rn = routeName.value ?? '';

    if (isInsideOrganization.value) {
        // Organization sub-navigation
        links.value = [
            [
                {
                    label: t('dashboard.nav.organizationDashboard'),
                    icon: "i-lucide-layout-dashboard",
                    to: `/dashboard/organization/${paramsId}`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-organization-id",
                },
                {
                    label: t('dashboard.nav.members'),
                    icon: "i-lucide-user-plus",
                    to: `/dashboard/organization/${paramsId}/members`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-organization-id-members",
                },
            ],
            [
                {
                    label: t('dashboard.nav.allOrganizations'),
                    icon: "i-lucide-arrow-left",
                    to: "/dashboard/organization",
                    active: false,
                },
            ],
        ] satisfies NavigationMenuItem[];
    } else {
        // Main dashboard navigation
        links.value = [
            [
                {
                    label: t('dashboard.nav.home'),
                    icon: "i-lucide-house",
                    to: "/dashboard",
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard",
                },
                {
                    label: t('dashboard.nav.organizations'),
                    icon: "i-lucide-building-2",
                    to: "/dashboard/organization",
                    onSelect: () => { open.value = false; },
                    active: rn.startsWith("dashboard-organization"),
                },
                {
                    label: t('profile.title'),
                    icon: "i-lucide-user",
                    to: "/dashboard/profile",
                    onSelect: () => { open.value = false; },
                    active: rn.startsWith("dashboard-profile"),
                },
                {
                    label: t('dashboard.nav.subscription'),
                    icon: "i-lucide-credit-card",
                    to: "/dashboard/subscription",
                    active: rn.startsWith("dashboard-subscription"),
                },
            ]
        ] satisfies NavigationMenuItem[][];
    }
};

watch([() => route.name, locale], () => {
    changeLinks();
}, { immediate: true });
</script>

<template>
    <!-- Route Ceremly: passthrough — il layout 'ceremly' è già applicato da app.vue -->
    <NuxtPage v-if="isCeremlyRoute" />

    <NuxtLayout v-else name="dashboard">
        <template #sidebar>
            <UDashboardSidebar
id="default" v-model:open="open" collapsible resizable class="bg-default border-r border-default"
                :ui="{ footer: 'lg:border-t lg:border-default' }">
                <template #header="{ collapsed }">
                    <NuxtLink to="/dashboard" class="flex items-center gap-3" :class="collapsed ? 'justify-center' : ''">
                        <div class="bg-primary rounded-lg p-2 flex items-center justify-center shrink-0">
                            <NuxtImg src="/logo.svg" alt="Logo" class="h-5 w-5 invert brightness-0 contrast-200" />
                        </div>
                        <div v-if="!collapsed">
                            <h1 class="text-lg font-bold tracking-tight text-highlighted">{{ $config.public.appName }}</h1>
                            <p class="text-xs text-muted font-medium">SaaS Dashboard</p>
                        </div>
                    </NuxtLink>
                </template>

                <template #default="{ collapsed }">
                    <UNavigationMenu :collapsed="collapsed" :items="links" orientation="vertical" tooltip popover />

                    <div class="mt-auto" />
                </template>

                <template #footer="{ collapsed }">
                    <div class="space-y-1">
                        <!-- Language Toggle -->
                        <button
                            v-if="!collapsed"
                            class="flex items-center gap-3 px-3 py-2 w-full text-muted hover:bg-elevated/50 rounded-lg transition-colors"
                            @click="setLocale(locale === 'it' ? 'en' : 'it')"
                        >
                            <UIcon name="i-lucide-globe" class="size-5" />
                            <span class="text-sm font-medium">{{ locale === 'it' ? 'Italiano (IT)' : 'English (EN)' }}</span>
                        </button>
                        <UTooltip v-else :text="$t('common.language') || 'Language'" side="right">
                            <UButton
                                icon="i-lucide-globe"
                                color="neutral"
                                variant="ghost"
                                size="sm"
                                class="w-full justify-center"
                                @click="setLocale(locale === 'it' ? 'en' : 'it')"
                            />
                        </UTooltip>

                        <!-- User Menu -->
                        <AdminUserMenu :collapsed="collapsed" />
                    </div>
                </template>
            </UDashboardSidebar>
        </template>


        <NuxtPage />
    </NuxtLayout>
</template>
