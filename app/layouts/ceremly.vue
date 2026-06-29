<script setup lang="ts">
// App shell Ceremly — ported from docs/ui/project/screens/app-shell.jsx.
// Sidebar 240px + topbar with breadcrumbs (useState 'ceremly-crumbs') and
// Teleport target '#ceremly-topbar-actions' for page actions.
import CerIcon from "~/components/ceremly/CerIcon.vue";

interface CeremlyEventCtx {
    id: string;
    title: string;
    type: string;
}

// Defensive shape: GET /api/events/:id may respond with { event } or the event directly
interface EventLookupResponse {
    event?: { id?: string; title?: string; type?: string };
    id?: string;
    title?: string;
    type?: string;
}

const { t, locale, setLocale } = useI18n();
const route = useRoute();
const userStore = useUserStore();
const { user } = useAuth();
const { hasActiveSubscription, isAtelier, refreshSubscription } = useSubscription();

// ─── Static nav ──────────────────────────────────────────────────────
// Note: no 'Home' entry — /dashboard IS the event list; a separate 'Home'
// would duplicate 'Your events' and never be active.
const mainNav = computed(() => [
    { key: "events", label: t("ceremly.layout.navEvents"), icon: "events", to: "/dashboard" },
    { key: "templates", label: t("ceremly.layout.navTemplates"), icon: "sparkle", to: "/dashboard/events/new" },
]);

// ─── Contextual event group ───────────────────────────────────────────
const eventNav = computed(() => [
    { key: "invito", label: t("ceremly.layout.navInvitation"), icon: "edit", path: "editor" },
    { key: "ospiti", label: t("ceremly.layout.navGuests"), icon: "guests", path: "guests" },
    { key: "rsvp", label: t("ceremly.layout.navRsvpForm"), icon: "check", path: "rsvp" },
    { key: "invio", label: t("ceremly.layout.navDistribution"), icon: "send", path: "distribution" },
    { key: "reminder", label: t("ceremly.layout.navReminders"), icon: "bell", path: "reminders" },
    { key: "dashboard", label: t("ceremly.layout.navOverview"), icon: "chart", path: "" },
]);

const TYPE_LABELS = computed<Record<string, string>>(() => ({
    matrimonio: t("ceremly.layout.typeWedding"),
    laurea: t("ceremly.layout.typeGraduation"),
    battesimo: t("ceremly.layout.typeBaptism"),
    compleanno: t("ceremly.layout.typeBirthday"),
}));

const eventId = computed(() => {
    const id = route.params.id;
    return typeof id === "string" && route.path.startsWith("/dashboard/events/") ? id : null;
});

// Lightweight event context cache (title/type) shared with pages
const eventCtx = useState<CeremlyEventCtx | null>("ceremly-event-ctx", () => null);

watch(
    eventId,
    async (id) => {
        if (!id || eventCtx.value?.id === id) return;
        try {
            const res = await $fetch<EventLookupResponse>(`/api/events/${id}`);
            const ev = res.event ?? res;
            if (ev.id && ev.title) {
                eventCtx.value = { id: ev.id, title: ev.title, type: ev.type ?? "" };
            }
        } catch {
            eventCtx.value = { id, title: t("ceremly.layout.eventFallback"), type: "" };
        }
    },
    { immediate: true },
);

const eventGroupLabel = computed(() => {
    if (!eventCtx.value || eventCtx.value.id !== eventId.value) return t("ceremly.layout.eventFallback");
    const typeLabel = TYPE_LABELS.value[eventCtx.value.type];
    return typeLabel ? `${typeLabel} · ${eventCtx.value.title}` : eventCtx.value.title;
});

function eventItemTo(path: string) {
    return path ? `/dashboard/events/${eventId.value}/${path}` : `/dashboard/events/${eventId.value}`;
}

function isEventItemActive(path: string) {
    return route.path === eventItemTo(path);
}

function isMainActive(key: string) {
    if (key === "events") return route.path === "/dashboard";
    if (key === "templates") return route.path === "/dashboard/events/new";
    return false;
}

// ─── Breadcrumbs (pages set them via useState) ───────────────────────
const crumbs = useState<string[]>("ceremly-crumbs", () => []);

// Contextual "updating" indicator for silent refetches (pattern E)
const { isRefetching } = useRefetching();

// ─── User and plan ───────────────────────────────────────────────────
const displayName = computed(() => user.value?.name || user.value?.email || "—");

const initials = computed(() => {
    const name = user.value?.name || user.value?.email || "";
    const parts = name.split(/\s+/).filter(Boolean);
    return parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
});

const planLabel = computed(() => {
    if (!hasActiveSubscription.value || !isAtelier.value) return t("ceremly.layout.planFree");
    return t("ceremly.layout.planAtelier");
});

onMounted(async () => {
    if (!userStore.isAuthenticated) {
        await userStore.initializeAuth();
    }
    await refreshSubscription();
});
</script>

<template>
    <div class="cer cer-app">
        <aside class="cer-side">
            <div class="brand serif">Ceremly<span class="dot" /></div>

            <NuxtLink
                v-for="item in mainNav"
                :key="item.key"
                :to="item.to"
                class="cer-nav-item"
                :class="{ active: isMainActive(item.key) }"
            >
                <CerIcon :name="item.icon" :s="15" />
                <span>{{ item.label }}</span>
            </NuxtLink>

            <template v-if="eventId">
                <div class="cer-nav-group">{{ eventGroupLabel }}</div>
                <NuxtLink
                    v-for="item in eventNav"
                    :key="item.key"
                    :to="eventItemTo(item.path)"
                    class="cer-nav-item"
                    :class="{ active: isEventItemActive(item.path) }"
                >
                    <CerIcon :name="item.icon" :s="15" />
                    <span>{{ item.label }}</span>
                </NuxtLink>
            </template>

            <div class="spacer" />

            <NuxtLink to="/dashboard/profile" class="cer-nav-item">
                <CerIcon name="settings" :s="15" />
                <span>{{ $t('ceremly.layout.navSettings') }}</span>
            </NuxtLink>

            <!-- IT/EN language switch — reachable from every dashboard page -->
            <div
                class="cer-nav-item"
                style="cursor: default; gap: 8px;"
                :aria-label="$t('common.language')"
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--ink-500); flex-shrink: 0;">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18" />
                    <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
                </svg>
                <span
                    role="button"
                    tabindex="0"
                    style="cursor: pointer;"
                    :style="{ fontWeight: locale.startsWith('it') ? 600 : 400, color: locale.startsWith('it') ? 'var(--ink)' : 'var(--ink-500)' }"
                    @click="setLocale('it')"
                    @keydown.enter="setLocale('it')"
                >IT</span>
                <span style="color: var(--ink-300);">·</span>
                <span
                    role="button"
                    tabindex="0"
                    style="cursor: pointer;"
                    :style="{ fontWeight: locale.startsWith('en') ? 600 : 400, color: locale.startsWith('en') ? 'var(--ink)' : 'var(--ink-500)' }"
                    @click="setLocale('en')"
                    @keydown.enter="setLocale('en')"
                >EN</span>
            </div>

            <div style="margin-top: 10px; padding: 10px 8px; border-top: 1px solid var(--bone-200); display: flex; align-items: center; gap: 10px;">
                <div class="av sage">{{ initials }}</div>
                <div style="display: flex; flex-direction: column; line-height: 1.15;">
                    <span style="font-size: 13px; font-weight: 500;">{{ displayName }}</span>
                    <span style="font-size: 11px; color: var(--ink-500);">{{ planLabel }}</span>
                </div>
            </div>
        </aside>

        <main class="cer-main">
            <header class="cer-topbar">
                <div class="crumbs">
                    <template v-for="(crumb, i) in crumbs" :key="`${i}-${crumb}`">
                        <CerIcon v-if="i > 0" name="chevR" :s="12" />
                        <strong v-if="i === crumbs.length - 1">{{ crumb }}</strong>
                        <span v-else>{{ crumb }}</span>
                    </template>
                </div>
                <div class="row" style="gap: 10px;">
                    <span
                        v-if="isRefetching"
                        class="cer-tag cer-fade-in"
                        style="color: var(--purple-ink); border-color: var(--purple); background: var(--wine-soft);"
                    >
                        <span class="cer-dots" style="color: var(--purple-bright);"><span /><span /><span /></span>
                        {{ $t('common.updating') }}
                    </span>
                    <button class="cer-btn ghost small" type="button">
                        <CerIcon name="search" :s="14" /> {{ $t('ceremly.layout.search') }}
                        <span class="mono" style="color: var(--ink-400); margin-left: 6px; font-size: 11px;">⌘K</span>
                    </button>
                    <!-- Teleport target: pages teleport their action buttons here -->
                    <div id="ceremly-topbar-actions" class="row" style="gap: 10px;" />
                </div>
            </header>
            <div :key="route.path" class="cer-page scroll cer-fade-in">
                <slot />
            </div>
        </main>
    </div>
</template>
