<script setup lang="ts">
// Event "Andamento" dashboard — faithful port of docs/ui/project/screens/event-dashboard.jsx
// (including RsvpChart SVG with interactive hover and GuestDetailDrawer).
// Real data: GET /api/events/:id/stats (30s polling), GET /api/events/:id,
// GET /api/events/:id/guests (+ /:guestId for the drawer).
import CerIcon from "~/components/ceremly/CerIcon.vue";
import KpiCard from "~/components/ceremly/KpiCard.vue";
import StatusPill from "~/components/ceremly/StatusPill.vue";
import { getEventTypeLabel } from "~~/shared/constants/eventTypes";
import type {
    AttendingStatus,
    CeremlyEvent,
    EventStats,
    GuestRsvpStatus,
    GuestWithStatus,
    RsvpAnswers,
    RsvpAnswerValue,
    RsvpPerPersonAnswer,
} from "~~/shared/types/ceremly";
import type { GuestDetailResult } from "~/composables/useEventGuests";

definePageMeta({
    layout: "ceremly",
    auth: { only: "user" },
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const eventId = computed(() => String(route.params.id));

// ─── Breadcrumbs + event context sidebar (ceremly layout shape) ─────────
const crumbs = useState<string[]>("ceremly-crumbs", () => []);
const eventCtx = useState<{ id: string; title: string; type: string } | null>(
    "ceremly-event-ctx",
    () => null,
);
crumbs.value = ["Eventi", "Evento", "Andamento"];

// ─── Stats (fetch + polling 30s) ───────────────────────────────────────
const { getStats } = useEventStats();
const stats = ref<EventStats | null>(null);
const statsLoading = ref(true);
const statsError = ref<string | null>(null);
const lastFetchedAt = ref<number | null>(null);

async function refreshStats(silent = false) {
    if (!silent) {
        statsLoading.value = true;
        statsError.value = null;
    }
    try {
        stats.value = await getStats(eventId.value);
        lastFetchedAt.value = Date.now();
        statsError.value = null;
    } catch (e) {
        // Silent (polling): keep the last data, error visible only if there is nothing.
        if (!silent || !stats.value) {
            const err = e as { data?: { statusMessage?: string; message?: string } };
            statsError.value
                = err.data?.statusMessage
                    || err.data?.message
                    || t("ceremly.event.detail.errorLoadStats");
        }
    } finally {
        statsLoading.value = false;
    }
}

const polling = usePolling(() => refreshStats(true), 30_000);

// ─── "Last updated: Ns ago" (reactive counter, 1s tick) ────────────────
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

const lastUpdatedLabel = computed(() => {
    if (!lastFetchedAt.value) return "—";
    const s = Math.max(0, Math.floor((nowTick.value - lastFetchedAt.value) / 1000));
    if (s < 60) return t("ceremly.event.detail.lastUpdatedSec", { s });
    return t("ceremly.event.detail.lastUpdatedMin", { m: Math.floor(s / 60) });
});

// ─── Event (header date + rsvpConfig for humanizing responses) ──────────
const eventData = ref<CeremlyEvent | null>(null);
const eventError = ref<string | null>(null);

async function loadEvent() {
    try {
        const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`);
        eventData.value = res.event;
        crumbs.value = ["Eventi", getEventTypeLabel(res.event.type), "Andamento"];
        eventCtx.value = { id: res.event.id, title: res.event.title, type: res.event.type };
    } catch {
        eventError.value = t("ceremly.event.detail.errorLoadEvent");
    }
}

const dateLine = computed(() => {
    if (!eventData.value) return eventError.value ? "—" : "…";
    const iso = eventData.value.eventDate;
    if (!iso) return t("ceremly.event.detail.dateTbd");
    const date = new Date(iso);
    const formatted = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
    const rel
        = diff > 1
            ? t("ceremly.event.detail.dateInDays", { n: diff })
            : diff === 1
                ? t("ceremly.event.detail.dateTomorrow")
                : diff === 0
                    ? t("ceremly.event.detail.dateToday")
                    : diff === -1
                        ? t("ceremly.event.detail.dateYesterday")
                        : t("ceremly.event.detail.dateDaysAgo", { n: Math.abs(diff) });
    return `${formatted} · ${rel}`;
});

// ─── Guest list (sub KPI "with email" + default drawer) ────────────────
const { listGuests, getGuest } = useEventGuests();
const guestsIndex = ref<GuestWithStatus[] | null>(null);

async function loadGuests() {
    try {
        const res = await listGuests(eventId.value);
        guestsIndex.value = res.guests.filter((g) => !g.removedAt);
        // Default drawer: the last guest who responded
        if (!selectedGuestId.value) {
            const responded = guestsIndex.value
                .filter((g) => g.respondedAt)
                .sort((a, b) => new Date(b.respondedAt!).getTime() - new Date(a.respondedAt!).getTime());
            if (responded[0]) void selectGuest(responded[0].id);
        }
    } catch {
        guestsIndex.value = null; // graceful degradation: sub KPI empty, drawer in empty state
    }
}

const withEmailCount = computed(
    () => guestsIndex.value?.filter((g) => g.email).length ?? null,
);

// ─── KPI ───────────────────────────────────────────────────────────────
function pct(num: number, den: number): string {
    if (!den) return "—";
    return `${((num / den) * 100).toFixed(1)}%`;
}

const kpiCards = computed(() => {
    const k = stats.value?.kpi;
    if (!k) return [];
    return [
        {
            key: "total",
            label: t("ceremly.event.detail.kpiTotalGuests"),
            value: k.totalGuests,
            sub: withEmailCount.value !== null ? t("ceremly.event.detail.kpiWithEmail", { n: withEmailCount.value }) : "",
            accent: true,
            to: `/dashboard/events/${eventId.value}/guests`,
        },
        {
            key: "opened",
            label: t("ceremly.event.detail.kpiOpened"),
            value: k.opened,
            sub: `${pct(k.opened, k.totalGuests)} · ${t("ceremly.event.detail.kpiOpenedTarget")}`,
            accent: false,
            // No ?filter: guests.vue has no 'opened' filter (only all/confirmed/pending/maybe/declined)
            to: `/dashboard/events/${eventId.value}/guests`,
        },
        {
            key: "responded",
            label: t("ceremly.event.detail.kpiResponded"),
            value: k.responded,
            sub: `${pct(k.responded, k.opened)} ${t("ceremly.event.detail.kpiRespondedSub")}`,
            accent: false,
            // No ?filter: guests.vue has no 'responded' filter
            to: `/dashboard/events/${eventId.value}/guests`,
        },
        {
            key: "confirmed",
            label: t("ceremly.event.detail.kpiConfirmedPeople"),
            value: k.totalPeople,
            sub: t("ceremly.event.detail.kpiConfirmedSub", { guests: k.confirmed, companions: Math.max(0, k.totalPeople - k.confirmed) }),
            accent: false,
            to: `/dashboard/events/${eventId.value}/guests?filter=confirmed`,
        },
    ];
});

// ─── Chart SVG (port of RsvpChart, dynamic scale + hover) ─────────────
const CHART = { W: 720, H: 200, padL: 30, padR: 8, padT: 10, padB: 24 };
const chartInnerW = CHART.W - CHART.padL - CHART.padR;
const chartInnerH = CHART.H - CHART.padT - CHART.padB;

const timeline = computed(() => stats.value?.timeline ?? []);

const chartMax = computed(() => {
    let m = 0;
    for (const p of timeline.value) m = Math.max(m, p.confirmed, p.declined, p.maybe);
    // Round to the nearest multiple of 4 so the 25/50/75% levels stay as integers
    return Math.max(4, Math.ceil(m / 4) * 4);
});

function cx(i: number): number {
    const len = timeline.value.length;
    return CHART.padL + (len > 1 ? (i / (len - 1)) * chartInnerW : 0);
}

function cy(v: number): number {
    return CHART.padT + chartInnerH - (v / chartMax.value) * chartInnerH;
}

const confPoints = computed(() =>
    timeline.value.map((p, i) => `${cx(i)},${cy(p.confirmed)}`).join(" "),
);
const decPoints = computed(() =>
    timeline.value.map((p, i) => `${cx(i)},${cy(p.declined)}`).join(" "),
);
const maybePoints = computed(() =>
    timeline.value.map((p, i) => `${cx(i)},${cy(p.maybe)}`).join(" "),
);

const confAreaPath = computed(() => {
    const t = timeline.value;
    if (t.length < 2) return "";
    const pts = t.map((p, i) => `L${cx(i)},${cy(p.confirmed)}`).join(" ");
    return `M${CHART.padL},${cy(0)} ${pts} L${cx(t.length - 1)},${cy(0)} Z`;
});

const gridLevels = computed(() =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(chartMax.value * f)),
);

const dayShortFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

function shortDate(iso: string): string {
    const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    return dayShortFmt.format(d).replace(".", "");
}

const xTicks = computed(() => {
    const len = timeline.value.length;
    if (len < 2) return [];
    const idxs
        = len >= 28
            ? [0, 7, 14, 21, len - 1]
            : [
                    0,
                    Math.round((len - 1) / 4),
                    Math.round((len - 1) / 2),
                    Math.round((3 * (len - 1)) / 4),
                    len - 1,
                ];
    return [...new Set(idxs)].map((i) => ({ i, label: shortDate(timeline.value[i]!.date) }));
});

const chartHasData = computed(
    () => timeline.value.length >= 2 && (stats.value?.kpi.responded ?? 0) > 0,
);

const chartSvg = ref<SVGSVGElement | null>(null);
const hoverIdx = ref<number | null>(null);

function onChartMove(e: MouseEvent) {
    const el = chartSvg.value;
    const len = timeline.value.length;
    if (!el || len < 2) return;
    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * CHART.W;
    const t = (px - CHART.padL) / chartInnerW;
    hoverIdx.value = Math.min(len - 1, Math.max(0, Math.round(t * (len - 1))));
}

function onChartLeave() {
    hoverIdx.value = null;
}

const hoverPoint = computed(() => {
    if (hoverIdx.value === null) return null;
    const p = timeline.value[hoverIdx.value];
    if (!p) return null;
    const text = t("ceremly.event.detail.chartTooltipConfirmed", { n: p.confirmed });
    const tw = Math.max(86, 18 + text.length * 6.4);
    const x = cx(hoverIdx.value);
    const y = cy(p.confirmed);
    return {
        x,
        y,
        date: shortDate(p.date).toUpperCase(),
        text,
        tw,
        tx: x + 8 + tw > CHART.W - CHART.padR ? x - 8 - tw : x + 8,
        ty: Math.max(CHART.padT, y - 26),
    };
});

// ─── Menu preferences / allergies ─────────────────────────────────────
const MENU_COLORS = ["var(--purple)", "var(--blue)", "var(--confirm)", "var(--orange)"];

const menuDenominator = computed(() => {
    const s = stats.value;
    if (!s) return 1;
    const maxCount = s.menuBreakdown.reduce((m, r) => Math.max(m, r.count), 0);
    return Math.max(s.kpi.totalPeople, maxCount, 1);
});

const allergyTotal = computed(
    () => stats.value?.allergies.reduce((sum, a) => sum + a.count, 0) ?? 0,
);

// ─── Guest detail drawer ───────────────────────────────────────────────
const selectedGuestId = ref<string | null>(null);
const detail = ref<GuestDetailResult | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

async function selectGuest(guestId: string) {
    if (selectedGuestId.value === guestId && detail.value) return;
    selectedGuestId.value = guestId;
    detailLoading.value = true;
    detailError.value = null;
    try {
        detail.value = await getGuest(eventId.value, guestId);
    } catch {
        detail.value = null;
        detailError.value = t("ceremly.event.detail.errorLoadGuest");
    } finally {
        detailLoading.value = false;
    }
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

const drawerName = computed(() => {
    const g = detail.value?.guest;
    return g ? `${g.firstName} ${g.lastName}`.trim() : "";
});

const drawerContact = computed(() => {
    const g = detail.value?.guest;
    if (!g) return "";
    const contact = g.email || g.phone || t("ceremly.event.detail.noContact");
    return g.groupName ? `${contact} · Gruppo "${g.groupName}"` : contact;
});

const drawerStatus = computed<GuestRsvpStatus>(() => {
    const d = detail.value;
    if (!d) return "not_opened";
    if (d.response) {
        return d.response.attending === "yes"
            ? "confirmed"
            : d.response.attending === "no"
                ? "declined"
                : "maybe";
    }
    return d.guest.firstOpenedAt ? "opened" : "not_opened";
});

// ─── RSVP response humanization ───────────────────────────────────────
function isPerPersonAnswer(v: unknown): v is RsvpPerPersonAnswer {
    return (
        typeof v === "object"
        && v !== null
        && !Array.isArray(v)
        && "companions" in v
        && Array.isArray((v as RsvpPerPersonAnswer).companions)
    );
}

function formatAnswer(v: RsvpAnswerValue | null | undefined): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? t("ceremly.event.detail.answerYes") : t("ceremly.event.detail.answerNo");
    if (Array.isArray(v)) return v.join(" + ");
    return String(v).trim();
}

function companionNames(answers: RsvpAnswers | undefined): string[] {
    const raw = answers?.companion_names;
    if (!isPerPersonAnswer(raw)) return [];
    return raw.companions.map((v) => (typeof v === "string" ? v.trim() : ""));
}

const ATTENDANCE_FALLBACK = computed<Record<AttendingStatus, string>>(() => ({
    yes: t("ceremly.event.detail.attendanceYes"),
    no: t("ceremly.event.detail.attendanceNo"),
    maybe: t("ceremly.event.detail.attendanceMaybe"),
}));

const qaRows = computed<{ q: string; a: string }[]>(() => {
    const d = detail.value;
    if (!d?.response) return [];
    const res = d.response;
    const config = eventData.value?.rsvpConfig ?? [];
    const rows: { q: string; a: string }[] = [];

    // 1. Attending? — label of the chosen option (positional mapping yes/no/maybe)
    const attQ = config.find((q) => q.id === "attendance");
    const attIdx = res.attending === "yes" ? 0 : res.attending === "no" ? 1 : 2;
    rows.push({
        q: attQ?.label ?? t("ceremly.event.detail.qaAttendance"),
        a: attQ?.options?.[attIdx] ?? ATTENDANCE_FALLBACK.value[res.attending],
    });

    const names = companionNames(res.answers);

    // 2. Companions — authoritative count + names from companion_names
    if (res.attending === "yes" && config.some((q) => q.id === "companions_count")) {
        const count = res.companionsCount ?? 0;
        const validNames = names.filter(Boolean);
        rows.push({
            q: t("ceremly.event.detail.qaCompanions"),
            a: count === 0
                ? t("ceremly.event.detail.qaNoCompanions")
                : validNames.length
                    ? `${count} — ${validNames.join(", ")}`
                    : String(count),
        });
    }

    // 3. Other questions in config order (perPerson replicated per person)
    for (const q of config) {
        if (q.id === "attendance" || q.id === "companions_count" || q.id === "companion_names") {
            continue;
        }
        const raw = res.answers?.[q.id];
        if (raw === undefined || raw === null) continue;

        if (q.perPerson && isPerPersonAnswer(raw)) {
            const selfName = d.guest.firstName || "Tu";
            if (q.perPersonScope !== "companions") {
                const a = formatAnswer(raw.self);
                if (a) rows.push({ q: `${q.label} ${selfName}`, a });
            }
            raw.companions.forEach((v, i) => {
                const a = formatAnswer(v);
                if (!a) return;
                rows.push({ q: `${q.label} ${names[i] || t("ceremly.event.detail.companionFallback", { n: i + 1 })}`, a });
            });
        } else if (!isPerPersonAnswer(raw)) {
            const a = formatAnswer(raw);
            if (a) rows.push({ q: q.label, a });
        }
    }

    // 4. Decline message
    if (res.declineMessage) rows.push({ q: t("ceremly.event.detail.qaMessage"), a: res.declineMessage });

    return rows;
});

// ─── Activity timeline (Italian labels) ───────────────────────────────
const ORDINALS = ["", "1ª", "2ª", "3ª", "4ª", "5ª", "6ª", "7ª", "8ª", "9ª"];

function activityLabel(a: { type: string; meta: Record<string, unknown> }): string {
    switch (a.type) {
        case "invite_sent":
            return a.meta?.channel === "whatsapp"
                ? t("ceremly.event.detail.activityInviteSentWhatsapp")
                : t("ceremly.event.detail.activityInviteSentEmail");
        case "link_opened": {
            const nth = Number(a.meta?.nth);
            if (Number.isFinite(nth) && nth > 0) {
                return t("ceremly.event.detail.activityLinkOpenedNth", { ordinal: ORDINALS[nth] ?? `${nth}ª` });
            }
            return t("ceremly.event.detail.activityLinkOpened");
        }
        case "email_opened":
            return t("ceremly.event.detail.activityEmailOpened");
        case "rsvp_submitted":
            return t("ceremly.event.detail.activityRsvpSubmitted");
        case "rsvp_updated":
            return t("ceremly.event.detail.activityRsvpUpdated");
        case "reminder_sent":
            return t("ceremly.event.detail.activityReminderSent");
        default:
            return a.type;
    }
}

function activityDate(iso: string): string {
    const d = new Date(iso);
    const day = dayShortFmt.format(d).replace(".", "");
    const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
}

// ─── Topbar actions ─────────────────────────────────────────────────────
function onExport() {
    window.open(`/api/events/${eventId.value}/export`, "_blank");
}

function goToDistribution() {
    void navigateTo(`/dashboard/events/${eventId.value}/distribution`);
}

function goToReminders() {
    void navigateTo(`/dashboard/events/${eventId.value}/reminders`);
}

function goToGuests(to: string) {
    void navigateTo(to);
}

// ─── Lifecycle ─────────────────────────────────────────────────────────

/**
 * If the user returns from Creem checkout with ?unlocked=true, reconciles the unlock
 * exactly once (the webhook is fire-and-forget and may have missed the job).
 * Resilient: a network error does not block the page from loading.
 */
async function maybeReconcileUnlock() {
    if (route.query.unlocked !== "true") return;
    // Remove the param immediately (prevents re-execution on manual refresh)
    void router.replace({ query: { ...route.query, unlocked: undefined } });
    try {
        await $fetch(`/api/events/${eventId.value}/reconcile-unlock`, { method: "POST" });
        // Reload the event to reflect the new tier (e.g. 'celebration')
        await loadEvent();
    } catch {
        // Silent: the page loads normally, the tier will be updated on the next load
    }
}

onMounted(() => {
    void maybeReconcileUnlock();
    void refreshStats();
    void loadEvent();
    void loadGuests();
    polling.start();
    tickTimer = setInterval(() => {
        nowTick.value = Date.now();
    }, 1000);
});

onUnmounted(() => {
    if (tickTimer) clearInterval(tickTimer);
});
</script>

<template>
    <div>
        <ClientOnly>
            <Teleport defer to="#ceremly-topbar-actions">
                <div class="row" style="gap: 8px;">
                    <button class="cer-btn ghost small" type="button" @click="onExport">
                        <CerIcon name="upload" :s="14" /> {{ $t('ceremly.event.detail.btnExport') }}
                    </button>
                    <button class="cer-btn small" type="button" @click="goToDistribution">
                        <CerIcon name="send" :s="14" /> {{ $t('ceremly.event.detail.btnCommunication') }}
                    </button>
                </div>
            </Teleport>
        </ClientOnly>

        <!-- Header -->
        <div class="row" style="justify-content: space-between; align-items: flex-end;">
            <div>
                <h1>{{ $t('ceremly.event.detail.pageTitle') }}</h1>
                <div class="h-sub row" style="gap: 12px;">
                    <span>{{ dateLine }}</span>
                    <span>·</span>
                    <span class="row" style="gap: 6px;">
                        <span
                            class="cer-dot"
                            style="background: var(--confirm); box-shadow: 0 0 0 3px color-mix(in oklch, var(--confirm) 25%, transparent);"
                        />
                        {{ $t('ceremly.event.detail.liveUpdate') }}
                    </span>
                </div>
            </div>
            <div
                class="row mono"
                style="gap: 6px; font-size: 11px; color: var(--ink-500); text-transform: uppercase; letter-spacing: 0.08em;"
            >
                <CerIcon name="clock" :s="12" /> {{ $t('ceremly.event.detail.lastUpdatedLabel') }} {{ lastUpdatedLabel }}
            </div>
        </div>

        <!-- Initial stats error -->
        <div
            v-if="statsError && !stats"
            class="cer-card"
            style="margin-top: 22px; padding: 22px; border-color: color-mix(in srgb, var(--decline) 35%, transparent);"
        >
            <div style="font-size: 14px; font-weight: 600; color: var(--decline);">
                {{ statsError }}
            </div>
            <div class="small muted" style="margin-top: 4px;">
                {{ $t('ceremly.event.detail.errorCheckConnection') }}
            </div>
            <button
                class="cer-btn ghost small"
                type="button"
                style="margin-top: 12px;"
                @click="refreshStats()"
            >
                {{ $t('common.retry') }}
            </button>
        </div>

        <!-- Skeleton -->
        <template v-else-if="statsLoading && !stats">
            <div class="kpi-row" style="margin-top: 22px;">
                <div v-for="i in 4" :key="i" class="kpi static">
                    <div class="skel" style="height: 11px; width: 90px;" />
                    <div class="skel" style="height: 38px; width: 70px; margin: 8px 0 4px;" />
                    <div class="skel" style="height: 12px; width: 110px;" />
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-top: 22px;">
                <div class="cer-card" style="padding: 22px;">
                    <div class="skel" style="height: 22px; width: 180px;" />
                    <div class="skel" style="height: 200px; margin-top: 18px;" />
                </div>
                <div class="col" style="gap: 16px;">
                    <div class="cer-card" style="padding: 20px;">
                        <div class="skel" style="height: 11px; width: 120px;" />
                        <div class="skel" style="height: 90px; margin-top: 12px;" />
                    </div>
                    <div class="cer-card" style="padding: 20px;">
                        <div class="skel" style="height: 11px; width: 130px;" />
                        <div class="skel" style="height: 70px; margin-top: 12px;" />
                    </div>
                </div>
            </div>
        </template>

        <template v-else-if="stats">
            <!-- KPI grid -->
            <div class="kpi-row" style="margin-top: 22px;">
                <KpiCard
                    v-for="card in kpiCards"
                    :key="card.key"
                    :label="card.label"
                    :value="card.value"
                    :sub="card.sub"
                    :accent="card.accent"
                    clickable
                    @click="goToGuests(card.to)"
                />
            </div>

            <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-top: 22px;">
                <!-- Left: RSVP progress -->
                <div class="cer-card" style="padding: 22px;">
                    <div class="row" style="justify-content: space-between;">
                        <div>
                            <div
                                class="mono"
                                style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);"
                            >
                                {{ $t('ceremly.event.detail.chartTitle') }}
                            </div>
                            <div class="serif" style="font-size: 22px; margin-top: 4px;">
                                {{ $t('ceremly.event.detail.chartSubtitle') }}
                            </div>
                        </div>
                        <div class="row" style="gap: 6px;">
                            <span class="cer-tag" style="background: var(--ink); color: var(--bone-50);">{{ $t('ceremly.event.detail.period4w') }}</span>
                            <span class="cer-tag tag-disabled" :title="$t('ceremly.event.detail.comingSoon')">{{ $t('ceremly.event.detail.period3m') }}</span>
                            <span class="cer-tag tag-disabled" :title="$t('ceremly.event.detail.comingSoon')">{{ $t('ceremly.event.detail.periodAll') }}</span>
                        </div>
                    </div>

                    <!-- Chart SVG (port RsvpChart) -->
                    <svg
                        v-if="chartHasData"
                        ref="chartSvg"
                        width="100%"
                        :viewBox="`0 0 ${CHART.W} ${CHART.H}`"
                        style="margin-top: 18px; display: block;"
                        @mousemove="onChartMove"
                        @mouseleave="onChartLeave"
                    >
                        <!-- grid -->
                        <g v-for="g in gridLevels" :key="`grid-${g}`">
                            <line
                                :x1="CHART.padL"
                                :x2="CHART.W - CHART.padR"
                                :y1="cy(g)"
                                :y2="cy(g)"
                                stroke="var(--bone-200)"
                                stroke-width="1"
                            />
                            <text
                                :x="CHART.padL - 6"
                                :y="cy(g) + 3"
                                text-anchor="end"
                                font-size="9"
                                fill="var(--ink-400)"
                                font-family="var(--font-mono)"
                            >{{ g }}</text>
                        </g>
                        <!-- confirmed area + line -->
                        <path :d="confAreaPath" fill="oklch(0.55 0.10 150)" fill-opacity="0.18" />
                        <polyline
                            fill="none"
                            stroke="var(--confirm)"
                            stroke-width="2"
                            :points="confPoints"
                        />
                        <!-- declined line -->
                        <polyline
                            fill="none"
                            stroke="var(--decline)"
                            stroke-width="1.5"
                            stroke-dasharray="3 3"
                            :points="decPoints"
                        />
                        <!-- maybe line -->
                        <polyline
                            fill="none"
                            stroke="var(--pending)"
                            stroke-width="1.5"
                            stroke-dasharray="3 3"
                            :points="maybePoints"
                        />
                        <!-- x labels -->
                        <text
                            v-for="tick in xTicks"
                            :key="`x-${tick.i}`"
                            :x="cx(tick.i)"
                            :y="CHART.H - 6"
                            text-anchor="middle"
                            font-size="9"
                            fill="var(--ink-500)"
                            font-family="var(--font-mono)"
                        >{{ tick.label }}</text>
                        <!-- hover marker + tooltip -->
                        <g v-if="hoverPoint">
                            <line
                                :x1="hoverPoint.x"
                                :x2="hoverPoint.x"
                                :y1="CHART.padT"
                                :y2="CHART.H - CHART.padB"
                                stroke="var(--ink)"
                                stroke-width="1"
                                stroke-dasharray="2 3"
                                opacity="0.4"
                            />
                            <circle
                                :cx="hoverPoint.x"
                                :cy="hoverPoint.y"
                                r="4"
                                fill="var(--confirm)"
                                stroke="#fff"
                                stroke-width="2"
                            />
                            <g :transform="`translate(${hoverPoint.tx}, ${hoverPoint.ty})`">
                                <rect :width="hoverPoint.tw" height="34" rx="6" fill="var(--ink)" />
                                <text
                                    x="8"
                                    y="13"
                                    font-size="9"
                                    fill="var(--bone-300)"
                                    font-family="var(--font-mono)"
                                >{{ hoverPoint.date }}</text>
                                <text x="8" y="27" font-size="11" fill="#fff" font-weight="500">
                                    {{ hoverPoint.text }}
                                </text>
                            </g>
                        </g>
                    </svg>
                    <div
                        v-else
                        class="col"
                        style="height: 218px; margin-top: 18px; align-items: center; justify-content: center; gap: 4px;"
                    >
                        <div style="font-size: 14px; font-weight: 500;">{{ $t('ceremly.event.detail.chartEmpty') }}</div>
                        <div class="small muted">
                            {{ $t('ceremly.event.detail.chartEmptySub') }}
                        </div>
                    </div>

                    <!-- Legend -->
                    <div class="row" style="gap: 18px; margin-top: 16px; font-size: 12px;">
                        <span class="row" style="gap: 6px;">
                            <span class="cer-dot" style="background: var(--confirm);" />{{ $t('ceremly.event.detail.legendYes') }}
                            <strong style="margin-left: 4px;">{{ stats.kpi.confirmed }}</strong>
                        </span>
                        <span class="row" style="gap: 6px;">
                            <span class="cer-dot" style="background: var(--decline);" />{{ $t('ceremly.event.detail.legendNo') }}
                            <strong style="margin-left: 4px;">{{ stats.kpi.declined }}</strong>
                        </span>
                        <span class="row" style="gap: 6px;">
                            <span class="cer-dot" style="background: var(--pending);" />{{ $t('ceremly.event.detail.legendMaybe') }}
                            <strong style="margin-left: 4px;">{{ stats.kpi.maybe }}</strong>
                        </span>
                        <span class="row" style="gap: 6px;">
                            <span class="cer-dot" style="background: var(--bone-300);" />{{ $t('ceremly.event.detail.legendPending') }}
                            <strong style="margin-left: 4px;">{{ stats.kpi.pending }}</strong>
                        </span>
                    </div>
                </div>

                <!-- Right: breakdown -->
                <div class="col" style="gap: 16px;">
                    <div class="cer-card" style="padding: 20px;">
                        <div
                            class="mono"
                            style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);"
                        >
                            {{ $t('ceremly.event.detail.menuPreferences') }}
                        </div>
                        <div v-if="stats.menuBreakdown.length" style="margin-top: 12px;">
                            <div
                                v-for="(r, i) in stats.menuBreakdown"
                                :key="r.label"
                                class="col"
                                style="gap: 4px; margin-bottom: 10px;"
                            >
                                <div class="row" style="justify-content: space-between; font-size: 13px;">
                                    <span>{{ r.label }}</span>
                                    <span class="mono">{{ r.count }}</span>
                                </div>
                                <div style="height: 6px; background: var(--bone-100); border-radius: 999px;">
                                    <div
                                        :style="{
                                            width: `${(r.count / menuDenominator) * 100}%`,
                                            height: '100%',
                                            background: MENU_COLORS[i % MENU_COLORS.length],
                                            borderRadius: '999px',
                                        }"
                                    />
                                </div>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 12px;">
                            {{ $t('ceremly.event.detail.menuEmpty') }}
                        </div>
                    </div>

                    <div class="cer-card" style="padding: 20px;">
                        <div class="row" style="justify-content: space-between;">
                            <div
                                class="mono"
                                style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);"
                            >
                                {{ $t('ceremly.event.detail.allergyTitle') }}
                            </div>
                            <span class="cer-tag">
                                {{ $t('ceremly.event.detail.guestCount', { n: allergyTotal }) }}
                            </span>
                        </div>
                        <div v-if="stats.allergies.length" class="col" style="gap: 6px; margin-top: 12px;">
                            <div
                                v-for="it in stats.allergies"
                                :key="it.value"
                                class="row"
                                style="justify-content: space-between; font-size: 13px; padding: 6px 0;"
                            >
                                <span>{{ it.value }}</span>
                                <span class="mono muted">×{{ it.count }}</span>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 12px;">
                            {{ $t('ceremly.event.detail.allergyEmpty') }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Bottom grid -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 22px;">
                <!-- Needs attention -->
                <div class="cer-card" style="padding: 20px;">
                    <div class="row" style="justify-content: space-between;">
                        <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.detail.needsAttentionTitle') }}</div>
                        <span class="cer-tag" style="background: var(--wine-soft); color: var(--wine-deep);">
                            {{ $t('ceremly.event.detail.guestCount', { n: stats.needsAttention.length }) }}
                        </span>
                    </div>
                    <div class="small muted" style="margin-top: 4px;">
                        {{ $t('ceremly.event.detail.needsAttentionSub') }}
                    </div>
                    <div v-if="stats.needsAttention.length" class="col" style="gap: 8px; margin-top: 14px;">
                        <div
                            v-for="g in stats.needsAttention"
                            :key="g.guestId"
                            class="row attn-row"
                            :class="{ active: g.guestId === selectedGuestId }"
                            style="padding: 10px 12px; border-radius: 8px; gap: 10px; background: var(--bone); border: 1px solid var(--bone-200);"
                            @click="selectGuest(g.guestId)"
                        >
                            <div class="av">{{ initials(g.name) }}</div>
                            <div class="col" style="flex: 1; line-height: 1.25;">
                                <span style="font-size: 13px; font-weight: 500;">{{ g.name }}</span>
                                <span class="small muted">
                                    {{ g.contact || $t('ceremly.event.detail.noContact') }} · {{ $t('ceremly.event.detail.openedDaysAgo', { n: g.openedDaysAgo }) }}
                                </span>
                            </div>
                            <button class="cer-btn small ghost" type="button" @click.stop="goToReminders">
                                <CerIcon name="bell" :s="12" /> {{ $t('ceremly.event.detail.btnReminder') }}
                            </button>
                        </div>
                    </div>
                    <div v-else class="small muted" style="margin-top: 14px;">
                        {{ $t('ceremly.event.detail.needsAttentionEmpty') }}
                    </div>
                </div>

                <!-- Guest detail drawer -->
                <div class="cer-card" style="padding: 20px;">
                    <div v-if="detailLoading" class="col" style="align-items: center; justify-content: center; min-height: 180px; gap: 10px;">
                        <span class="cer-spin" />
                        <span class="small muted">{{ $t('ceremly.event.detail.loadingGuest') }}</span>
                    </div>

                    <div
                        v-else-if="detailError"
                        class="col"
                        style="align-items: center; justify-content: center; min-height: 180px; gap: 8px;"
                    >
                        <span class="small" style="color: var(--decline);">{{ detailError }}</span>
                        <button
                            v-if="selectedGuestId"
                            class="cer-btn ghost small"
                            type="button"
                            @click="selectGuest(selectedGuestId)"
                        >
                            {{ $t('common.retry') }}
                        </button>
                    </div>

                    <template v-else-if="detail">
                        <div class="row" style="justify-content: space-between;">
                            <div class="row" style="gap: 12px;">
                                <div class="av lg">{{ initials(drawerName) }}</div>
                                <div class="col" style="line-height: 1.2;">
                                    <span style="font-size: 16px; font-weight: 500;">{{ drawerName }}</span>
                                    <span class="small muted">{{ drawerContact }}</span>
                                </div>
                            </div>
                            <StatusPill :status="drawerStatus" />
                        </div>

                        <div style="height: 1px; background: var(--bone-200); margin: 16px 0;" />

                        <div
                            class="mono"
                            style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);"
                        >
                            {{ $t('ceremly.event.detail.drawerRsvpAnswers') }}
                        </div>
                        <div v-if="qaRows.length" class="col" style="gap: 10px; margin-top: 10px;">
                            <div
                                v-for="r in qaRows"
                                :key="r.q"
                                class="row"
                                style="align-items: flex-start; gap: 12px; font-size: 13px;"
                            >
                                <span class="muted small" style="width: 130px; padding-top: 1px; flex-shrink: 0;">{{ r.q }}</span>
                                <span style="flex: 1;">{{ r.a }}</span>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 10px;">
                            {{ $t('ceremly.event.detail.drawerNoAnswer') }}
                        </div>

                        <div style="height: 1px; background: var(--bone-200); margin: 16px 0;" />

                        <div
                            class="mono"
                            style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);"
                        >
                            {{ $t('ceremly.event.detail.drawerTimeline') }}
                        </div>
                        <div v-if="detail.activities.length" class="col" style="gap: 6px; margin-top: 8px;">
                            <div
                                v-for="a in detail.activities"
                                :key="a.id"
                                class="row"
                                style="gap: 10px; font-size: 12px;"
                            >
                                <span class="mono muted" style="width: 110px; flex-shrink: 0;">{{ activityDate(a.createdAt) }}</span>
                                <span>{{ activityLabel(a) }}</span>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 8px;">
                            {{ $t('ceremly.event.detail.drawerNoActivity') }}
                        </div>
                    </template>

                    <div
                        v-else
                        class="col"
                        style="align-items: center; justify-content: center; min-height: 180px; gap: 4px; text-align: center;"
                    >
                        <div style="font-size: 14px; font-weight: 500;">{{ $t('ceremly.event.detail.drawerEmpty') }}</div>
                        <div class="small muted">
                            {{ $t('ceremly.event.detail.drawerEmptySub') }}<br>
                            {{ $t('ceremly.event.detail.drawerEmptyHint') }}
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
/* Subtle skeleton for initial load */
.skel {
    background: var(--bone-200);
    border-radius: var(--r-sm);
    animation: cer-skel 1.2s ease-in-out infinite;
}

@keyframes cer-skel {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
}

/* Period tabs not yet available (the backend provides only 28 days) */
.tag-disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

/* Clickable "Da contattare" row → shows the guest in the drawer */
.attn-row {
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease;
}

.attn-row:hover {
    border-color: var(--line-strong) !important;
}

.attn-row.active {
    border-color: var(--ink) !important;
}

/* Subtle spinner */
.cer-spin {
    width: 18px;
    height: 18px;
    border: 2px solid var(--bone-300);
    border-top-color: var(--ink);
    border-radius: 50%;
    animation: cer-rot 0.8s linear infinite;
}

@keyframes cer-rot {
    to { transform: rotate(360deg); }
}
</style>
