<script setup lang="ts">
import { sub } from 'date-fns'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Period, Range } from '~/types'
import type { NavigationMenuItem } from "@nuxt/ui"
import { useUserStore } from '~/stores/userStore'

const userStore = useUserStore()
const { t, locale, setLocale } = useI18n()

definePageMeta({
    layout: 'dashboard',
})

const items = computed(() => [[{
    label: t('dashboard.dropdown.newEvent'),
    icon: 'i-lucide-building-2',
    to: '/dashboard'
}, {
    label: t('dashboard.dropdown.inviteMember'),
    icon: 'i-lucide-user-plus',
    to: '/dashboard'
}]] satisfies DropdownMenuItem[][])

const range = shallowRef<Range>({
    start: sub(new Date(), { days: 14 }),
    end: new Date()
})
const period = ref<Period>('daily')

const route = useRoute();

const open = ref(false);

const links = ref<NavigationMenuItem[]>([]);

const routeName = computed(() => (route.name as string).split('___')[0]);

const changeLinks = () => {
    const paramsId = route.params.id as string | undefined;
    const rn = routeName.value ?? '';

    // Check if we're inside a specific event (dashboard-event-id-*)
    const isInsideEvent = rn.startsWith("dashboard-event-id") && paramsId;

    if (isInsideEvent) {
        // Event sub-navigation
        links.value = [
            [
                {
                    label: t('dashboard.nav.eventDashboard'),
                    icon: "i-lucide-layout-dashboard",
                    to: `/dashboard/event/${paramsId}`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-event-id",
                },
                {
                    label: t('dashboard.nav.guests'),
                    icon: "i-lucide-users",
                    to: `/dashboard/event/${paramsId}/guests`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-event-id-guests",
                },
                {
                    label: t('dashboard.nav.reminders'),
                    icon: "i-lucide-bell",
                    to: `/dashboard/event/${paramsId}/reminders`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-event-id-reminders",
                },
                {
                    label: t('dashboard.nav.templates'),
                    icon: "i-lucide-layout-template",
                    to: `/dashboard/event/${paramsId}/templates`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-event-id-templates",
                },
                {
                    label: t('dashboard.nav.team'),
                    icon: "i-lucide-user-plus",
                    to: `/dashboard/event/${paramsId}/team`,
                    onSelect: () => { open.value = false; },
                    active: rn === "dashboard-event-id-team",
                },
                {
                    label: t('dashboard.nav.eventSettings'),
                    icon: "i-lucide-settings",
                    to: `/dashboard/event/${paramsId}/settings`,
                    onSelect: () => { open.value = false; },
                    active: rn.startsWith("dashboard-event-id-settings"),
                },
            ],
            [
                {
                    label: t('dashboard.nav.allEvents'),
                    icon: "i-lucide-arrow-left",
                    to: "/dashboard/event",
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
                    label: t('dashboard.nav.events'),
                    icon: "i-lucide-calendar-heart",
                    to: "/dashboard/event",
                    onSelect: () => { open.value = false; },
                    active: rn.startsWith("dashboard-event"),
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

const groups = computed(() => [
    {
        id: "links",
        label: t('dashboard.nav.goTo'),
        items: links.value.flat(),
    },
    {
        id: "code",
        label: t('dashboard.nav.code'),
        items: [
            {
                id: "source",
                label: t('dashboard.nav.viewSource'),
                icon: "i-simple-icons-github",
                to: `https://github.com/nuxt-ui-templates/dashboard/blob/main/app/pages${route.path === "/" ? "/index" : route.path
                    }.vue`,
                target: "_blank",
            },
        ],
    },
]);
</script>

<template>
    <NuxtLayout name="dashboard">
        <template #sidebar>
            <UDashboardSidebar id="default" v-model:open="open" collapsible resizable class="bg-default border-r border-default"
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
