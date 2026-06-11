<script setup lang="ts">
// Lista ospiti — port fedele di docs/ui/project/screens/guests.jsx
// + drawer dettaglio (port GuestDetailDrawer di event-dashboard.jsx).
import CerIcon from "~/components/ceremly/CerIcon.vue";
import CerCheckbox from "~/components/ceremly/CerCheckbox.vue";
import StatusPill from "~/components/ceremly/StatusPill.vue";
import { getVisibleQuestions } from "~~/shared/utils/rsvpLogic";
import { parseCsv, mapGuestRows, type CsvError, type CsvGuestRow } from "~~/shared/utils/csv";
import type {
    CeremlyEvent,
    GuestWithStatus,
    RsvpAnswers,
    RsvpPerPersonAnswer,
    RsvpQuestion,
    RsvpAnswerValue,
} from "~~/shared/types/ceremly";
import type {
    GuestDetailResult,
    GuestImportResult,
    GuestListSummary,
} from "~/composables/useEventGuests";

definePageMeta({ layout: "ceremly" });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { t } = useI18n();
const eventId = computed(() => String(route.params.id ?? ""));

const {
    listGuests, getGuest, createGuest, updateGuest, deleteGuest, importGuests,
} = useEventGuests();

// ─── Contesto evento (sidebar) + breadcrumbs ─────────────────────────
interface CeremlyEventCtx { id: string; title: string; type: string }
const eventCtx = useState<CeremlyEventCtx | null>("ceremly-event-ctx", () => null);
const crumbs = useState<string[]>("ceremly-crumbs", () => []);

function getTypeLabel(type: string): string {
    const key = `ceremly.eventType.${type}.label`;
    const translated = t(key);
    return translated !== key ? translated : type;
}

const eventData = ref<CeremlyEvent | null>(null);

watchEffect(() => {
    const label = eventData.value
        ? getTypeLabel(eventData.value.type) ?? eventData.value.title
        : (eventCtx.value?.id === eventId.value ? getTypeLabel(eventCtx.value.type) ?? eventCtx.value.title : t("ceremly.event.guests.crumbEventFallback"));
    crumbs.value = [t("ceremly.event.guests.crumbEvents"), label, t("ceremly.event.guests.crumbGuests")];
});

// ─── Errori $fetch (shape minima, niente any) ────────────────────────
interface FetchErrorLike {
    statusCode?: number;
    data?: { statusMessage?: string; message?: string };
    message?: string;
}

function errOf(e: unknown): FetchErrorLike {
    return (e ?? {}) as FetchErrorLike;
}

// ─── Dati ────────────────────────────────────────────────────────────
const guests = ref<GuestWithStatus[]>([]);
const summary = ref<GuestListSummary | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

async function loadAll() {
    loading.value = true;
    loadError.value = null;
    try {
        const [res, evRes] = await Promise.all([
            listGuests(eventId.value),
            $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`),
        ]);
        guests.value = res.guests;
        summary.value = res.summary;
        eventData.value = evRes.event;
        eventCtx.value = { id: evRes.event.id, title: evRes.event.title, type: evRes.event.type };
    } catch (e) {
        loadError.value = errOf(e).data?.statusMessage || errOf(e).message || t("ceremly.event.guests.loadError");
    } finally {
        loading.value = false;
    }
}

async function refreshGuests() {
    try {
        const res = await listGuests(eventId.value);
        guests.value = res.guests;
        summary.value = res.summary;
    } catch {
        toast.add({ title: t("common.error"), description: t("ceremly.event.guests.refreshError"), color: "error" });
    }
}

onMounted(loadAll);

// ─── Derivati header ─────────────────────────────────────────────────
const activeGuests = computed(() => guests.value.filter(g => !g.removedAt));
const sentCount = computed(() => activeGuests.value.filter(g => g.sentAt !== null).length);
const toSendCount = computed(() => Math.max(0, (summary.value?.total ?? 0) - sentCount.value));

// ─── Filtri + ricerca + paginazione ──────────────────────────────────
type FilterKey = "all" | "confirmed" | "pending" | "maybe" | "declined";
const FILTER_KEYS: readonly FilterKey[] = ["all", "confirmed", "pending", "maybe", "declined"];

/** Deep-link da Andamento (?filter=...): valori non supportati → 'all'. */
function filterFromQuery(): FilterKey {
    const q = String(route.query.filter ?? "");
    return (FILTER_KEYS as readonly string[]).includes(q) ? q as FilterKey : "all";
}

const filter = ref<FilterKey>(filterFromQuery());
const search = ref("");
const PAGE_SIZE = 10;
const page = ref(1);

const filterTabs = computed(() => [
    { k: "all" as FilterKey, l: t("ceremly.event.guests.filterAll"), n: summary.value?.total ?? 0, dot: null as string | null },
    { k: "confirmed" as FilterKey, l: t("ceremly.event.guests.filterConfirmed"), n: summary.value?.confirmed ?? 0, dot: "var(--confirm)" },
    { k: "pending" as FilterKey, l: t("ceremly.event.guests.filterPending"), n: summary.value?.pending ?? 0, dot: "var(--pending)" },
    { k: "maybe" as FilterKey, l: t("ceremly.event.guests.filterMaybe"), n: summary.value?.maybe ?? 0, dot: "var(--bone-300)" },
    { k: "declined" as FilterKey, l: t("ceremly.event.guests.filterDeclined"), n: summary.value?.declined ?? 0, dot: "var(--decline)" },
]);

function matchesFilter(g: GuestWithStatus): boolean {
    if (filter.value === "all") return true;
    if (filter.value === "pending") return g.rsvpStatus === "opened" || g.rsvpStatus === "not_opened";
    return g.rsvpStatus === filter.value;
}

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    return activeGuests.value.filter((g) => {
        if (!matchesFilter(g)) return false;
        if (!q) return true;
        const full = `${g.firstName} ${g.lastName}`.toLowerCase();
        const reversed = `${g.lastName} ${g.firstName}`.toLowerCase();
        return full.includes(q) || reversed.includes(q);
    });
});

watch([filter, search], () => { page.value = 1; });

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)));
watch(totalPages, (tp) => { if (page.value > tp) page.value = tp; });
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));

// ─── Selezione ───────────────────────────────────────────────────────
const selected = ref<Set<string>>(new Set());

function toggleSelect(id: string) {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
}

const allFilteredSelected = computed(() =>
    filtered.value.length > 0 && filtered.value.every(g => selected.value.has(g.id)),
);

function toggleSelectAll() {
    if (allFilteredSelected.value) {
        selected.value = new Set();
    } else {
        selected.value = new Set(filtered.value.map(g => g.id));
    }
}

function clearSelection() {
    selected.value = new Set();
}

function goToDistribution() {
    const ids = [...selected.value].join(",");
    router.push(`/dashboard/events/${eventId.value}/distribution?guests=${ids}`);
}

function goToReminders() {
    router.push(`/dashboard/events/${eventId.value}/reminders`);
}

// ─── Formattazione ───────────────────────────────────────────────────
const shortDateFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const timelineFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function shortDate(iso: string | null): string {
    if (!iso) return "";
    return shortDateFmt.format(new Date(iso));
}

function timelineDate(iso: string): string {
    return timelineFmt.format(new Date(iso)).replace(",", " ·");
}

function initials(g: { firstName: string; lastName: string }): string {
    return `${g.firstName[0] ?? ""}${g.lastName[0] ?? ""}`.toUpperCase();
}

function responseCell(g: GuestWithStatus): string {
    if (g.respondedAt) return shortDate(g.respondedAt);
    return g.rsvpStatus === "not_opened" ? t("ceremly.event.guests.responseNotOpened") : t("ceremly.event.guests.responseOpenedNoReply");
}

// ─── Drawer dettaglio ────────────────────────────────────────────────
const drawerRow = ref<GuestWithStatus | null>(null);
const drawerDetail = ref<GuestDetailResult | null>(null);
const drawerLoading = ref(false);
const drawerError = ref<string | null>(null);

async function openDrawer(g: GuestWithStatus) {
    drawerRow.value = g;
    drawerDetail.value = null;
    drawerError.value = null;
    drawerLoading.value = true;
    try {
        drawerDetail.value = await getGuest(eventId.value, g.id);
    } catch (e) {
        drawerError.value = errOf(e).data?.statusMessage || t("ceremly.event.guests.drawerLoadError");
    } finally {
        drawerLoading.value = false;
    }
}

function closeDrawer() {
    drawerRow.value = null;
    drawerDetail.value = null;
    confirmDeleteOpen.value = false;
}

function isPerPersonAnswer(value: unknown): value is RsvpPerPersonAnswer {
    return (
        typeof value === "object"
        && value !== null
        && !Array.isArray(value)
        && "companions" in value
        && Array.isArray((value as RsvpPerPersonAnswer).companions)
    );
}

function formatFlatValue(value: RsvpAnswerValue | null | undefined): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? t("ceremly.event.guests.answerYes") : t("ceremly.event.guests.answerNo");
    if (Array.isArray(value)) return value.length ? value.join(" · ") : "—";
    const s = String(value).trim();
    return s === "" ? "—" : s;
}

const ATTENDANCE_FALLBACK = computed<Record<string, string>>(() => ({
    yes: t("ceremly.event.guests.attendanceYes"),
    no: t("ceremly.event.guests.attendanceNo"),
    maybe: t("ceremly.event.guests.attendanceMaybe"),
}));

/** Righe q→a umanizzate per il drawer (incluse perPerson per persona). */
const answerRows = computed<{ q: string; a: string }[]>(() => {
    const detail = drawerDetail.value;
    const response = detail?.response;
    if (!detail || !response) return [];
    const config: RsvpQuestion[] = eventData.value?.rsvpConfig ?? [];
    const rows: { q: string; a: string }[] = [];
    const guestName = detail.guest.firstName;

    // Valutazione con i valori autoritativi iniettati (come fa il server).
    const evaluation: RsvpAnswers = { ...(response.answers ?? {}) };
    const knownIds = new Set(config.map(q => q.id));
    if (knownIds.has("attendance")) evaluation.attendance = response.attending;
    if (knownIds.has("companions_count") && evaluation.companions_count === undefined) {
        evaluation.companions_count = response.companionsCount;
    }

    // Partecipazione: label dalla config (mapping posizionale yes/no/maybe).
    const attendanceQ = config.find(q => q.id === "attendance");
    const canonicalIdx = ["yes", "no", "maybe"].indexOf(response.attending);
    const attendanceLabel = attendanceQ?.options?.[canonicalIdx]
        ?? ATTENDANCE_FALLBACK.value[response.attending] ?? response.attending;
    rows.push({ q: attendanceQ?.label ?? t("ceremly.event.guests.attendanceQuestion"), a: attendanceLabel });

    // Nomi accompagnatori (per le righe perPerson e per la riga Accompagnatori).
    const rawNames = evaluation.companion_names;
    const companionNames: string[] = isPerPersonAnswer(rawNames)
        ? rawNames.companions.map(v => (typeof v === "string" ? v.trim() : ""))
        : [];

    if (response.attending === "yes" || response.companionsCount > 0) {
        const names = companionNames.filter(n => n !== "").join(", ");
        rows.push({
            q: t("ceremly.event.guests.companions"),
            a: response.companionsCount > 0
                ? `${response.companionsCount}${names ? ` — ${names}` : ""}`
                : t("ceremly.event.guests.companionsNone"),
        });
    }

    const visible = config.length > 0
        ? getVisibleQuestions(config, evaluation)
        : [];
    for (const q of visible) {
        if (q.id === "attendance" || q.id === "companions_count" || q.id === "companion_names") continue;
        const raw = evaluation[q.id];
        if (q.perPerson && isPerPersonAnswer(raw)) {
            if ((q.perPersonScope ?? "all") !== "companions") {
                rows.push({ q: `${q.label} · ${guestName}`, a: formatFlatValue(raw.self) });
            }
            raw.companions.forEach((value, i) => {
                const who = companionNames[i] || t("ceremly.event.guests.companionN", { n: i + 1 });
                rows.push({ q: `${q.label} · ${who}`, a: formatFlatValue(value) });
            });
        } else if (!q.perPerson) {
            rows.push({ q: q.label, a: formatFlatValue(raw as RsvpAnswerValue | undefined) });
        }
    }

    if (response.declineMessage) {
        rows.push({ q: t("ceremly.event.guests.declineMessage"), a: response.declineMessage });
    }
    return rows;
});

function activityLabel(a: { type: string; meta: Record<string, unknown> }): string {
    switch (a.type) {
        case "invite_sent":
            return a.meta?.channel === "whatsapp" ? t("ceremly.event.guests.activityInviteSentWhatsapp") : t("ceremly.event.guests.activityInviteSentEmail");
        case "link_opened":
            return typeof a.meta?.nth === "number" ? t("ceremly.event.guests.activityLinkOpenedNth", { n: a.meta.nth }) : t("ceremly.event.guests.activityLinkOpened");
        case "email_opened":
            return t("ceremly.event.guests.activityEmailOpened");
        case "rsvp_submitted":
            return t("ceremly.event.guests.activityRsvpSubmitted");
        case "rsvp_updated":
            return t("ceremly.event.guests.activityRsvpUpdated");
        case "reminder_sent":
            return t("ceremly.event.guests.activityReminderSent");
        default:
            return a.type;
    }
}

// ─── Elimina ospite (conferma) ───────────────────────────────────────
const confirmDeleteOpen = ref(false);
const deleting = ref(false);

async function confirmDelete() {
    if (!drawerRow.value) return;
    deleting.value = true;
    try {
        await deleteGuest(eventId.value, drawerRow.value.id);
        toast.add({ title: t("ceremly.event.guests.deleteSuccessTitle"), description: t("ceremly.event.guests.deleteSuccessDesc"), color: "success" });
        closeDrawer();
        await refreshGuests();
    } catch (e) {
        toast.add({ title: t("common.error"), description: errOf(e).data?.statusMessage || t("ceremly.event.guests.deleteError"), color: "error" });
    } finally {
        deleting.value = false;
    }
}

// ─── Modale "Aggiungi ospite" ────────────────────────────────────────
const addOpen = ref(false);
const addSaving = ref(false);
const addError = ref<string | null>(null);
const addForm = reactive({ firstName: "", lastName: "", email: "", phone: "", groupName: "", notes: "" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function openAdd() {
    Object.assign(addForm, { firstName: "", lastName: "", email: "", phone: "", groupName: "", notes: "" });
    addError.value = null;
    addOpen.value = true;
}

async function submitAdd() {
    addError.value = null;
    if (!addForm.firstName.trim() || !addForm.lastName.trim()) {
        addError.value = t("ceremly.event.guests.addErrorNameRequired");
        return;
    }
    if (addForm.email.trim() && !EMAIL_RE.test(addForm.email.trim())) {
        addError.value = t("ceremly.event.guests.addErrorEmailInvalid");
        return;
    }
    addSaving.value = true;
    try {
        await createGuest(eventId.value, {
            firstName: addForm.firstName.trim(),
            lastName: addForm.lastName.trim(),
            email: addForm.email.trim(),
            phone: addForm.phone.trim() || undefined,
            groupName: addForm.groupName.trim() || undefined,
            notes: addForm.notes.trim() || undefined,
        });
        toast.add({ title: t("ceremly.event.guests.addSuccessTitle"), description: t("ceremly.event.guests.addSuccessDesc", { firstName: addForm.firstName, lastName: addForm.lastName }), color: "success" });
        addOpen.value = false;
        await refreshGuests();
    } catch (e) {
        const err = errOf(e);
        if (err.statusCode === 402) {
            addError.value = `${err.data?.statusMessage || t("ceremly.event.guests.addErrorPlanLimit")} ${t("ceremly.event.guests.addErrorPlanLimitUpgrade")}`;
        } else {
            addError.value = err.data?.statusMessage || t("ceremly.event.guests.addErrorGeneric");
        }
    } finally {
        addSaving.value = false;
    }
}

// ─── Modale "Importa CSV" ────────────────────────────────────────────
const importOpen = ref(false);
const importStep = ref<"pick" | "preview" | "done">("pick");
const importRows = ref<CsvGuestRow[]>([]);
const importErrors = ref<CsvError[]>([]);
const importFileName = ref("");
const importSaving = ref(false);
const importResult = ref<GuestImportResult | null>(null);
const importSubmitError = ref<string | null>(null);

function openImport() {
    importStep.value = "pick";
    importRows.value = [];
    importErrors.value = [];
    importFileName.value = "";
    importResult.value = null;
    importSubmitError.value = null;
    importOpen.value = true;
}

async function onCsvPicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importFileName.value = file.name;
    const text = await file.text();
    const parsed = parseCsv(text);
    const mapped = mapGuestRows(parsed.rows);
    importRows.value = mapped.guests;
    importErrors.value = [...parsed.errors, ...mapped.errors];
    importStep.value = "preview";
    input.value = "";
}

async function submitImport() {
    if (importRows.value.length === 0) return;
    importSaving.value = true;
    importSubmitError.value = null;
    try {
        importResult.value = await importGuests(eventId.value, importRows.value.map(r => ({
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email ?? "",
            phone: r.phone,
            groupName: r.groupName,
        })));
        importStep.value = "done";
        await refreshGuests();
    } catch (e) {
        importSubmitError.value = errOf(e).data?.statusMessage || t("ceremly.event.guests.importError");
    } finally {
        importSaving.value = false;
    }
}

// ─── Modale "Cambia gruppo" ──────────────────────────────────────────
const groupOpen = ref(false);
const groupName = ref("");
const groupSaving = ref(false);

function openGroupModal() {
    groupName.value = "";
    groupOpen.value = true;
}

async function submitGroup() {
    const name = groupName.value.trim();
    if (!name || selected.value.size === 0) return;
    groupSaving.value = true;
    try {
        await Promise.all([...selected.value].map(id =>
            updateGuest(eventId.value, id, { groupName: name }),
        ));
        toast.add({ title: t("ceremly.event.guests.groupSuccessTitle"), description: t("ceremly.event.guests.groupSuccessDesc", { count: selected.value.size, name }), color: "success" });
        groupOpen.value = false;
        clearSelection();
        await refreshGuests();
    } catch (e) {
        toast.add({ title: t("common.error"), description: errOf(e).data?.statusMessage || t("ceremly.event.guests.groupError"), color: "error" });
    } finally {
        groupSaving.value = false;
    }
}
</script>

<template>
    <div>
        <ClientOnly>
            <Teleport defer to="#ceremly-topbar-actions">
                <div class="row" style="gap: 8px;">
                    <button class="cer-btn ghost small" type="button" @click="openImport">
                        <CerIcon name="upload" :s="14" /> {{ $t('ceremly.event.guests.importCsv') }}
                    </button>
                    <button class="cer-btn small" type="button" @click="openAdd">
                        <CerIcon name="plus" :s="14" /> {{ $t('ceremly.event.guests.addGuest') }}
                    </button>
                </div>
            </Teleport>
        </ClientOnly>

        <!-- Header -->
        <div class="row" style="justify-content: space-between; align-items: flex-end;">
            <div>
                <h1>{{ $t('ceremly.event.guests.pageTitle') }}</h1>
                <div class="h-sub">
                    {{ summary ? $t('ceremly.event.guests.summaryLine', { total: summary.total, sent: sentCount, toSend: toSendCount }) : $t('ceremly.event.guests.summaryLoading') }}
                </div>
            </div>
            <div class="row" style="gap: 8px;">
                <button
                    v-for="t in filterTabs"
                    :key="t.k"
                    type="button"
                    class="cer-btn ghost small"
                    :style="{
                        background: filter === t.k ? 'var(--bone-100)' : 'transparent',
                        borderColor: filter === t.k ? 'var(--bone-300)' : 'var(--bone-200)',
                        padding: '6px 12px',
                    }"
                    @click="filter = t.k"
                >
                    <span v-if="t.dot" class="cer-dot" :style="{ background: t.dot }" />
                    {{ t.l }} <span class="mono muted" style="margin-left: 4px; font-size: 11px;">{{ t.n }}</span>
                </button>
            </div>
        </div>

        <!-- Ricerca -->
        <div class="row" style="margin-top: 18px;">
            <div style="position: relative; width: 320px;">
                <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ink-400); display: inline-flex;">
                    <CerIcon name="search" :s="14" />
                </span>
                <input
                    v-model="search"
                    class="cer-input"
                    style="padding-left: 34px;"
                    :placeholder="$t('ceremly.event.guests.searchPlaceholder')"
                >
            </div>
        </div>

        <!-- Action bar selezione -->
        <div
            v-if="selected.size > 0"
            class="row"
            style="margin-top: 18px; padding: 10px 16px; background: var(--ink); color: var(--bone-50); border-radius: 10px; gap: 12px;"
        >
            <span style="font-size: 13px;">{{ $t('ceremly.event.guests.selectedCount', { count: selected.size }) }}</span>
            <div style="height: 16px; width: 1px; background: rgba(255,255,255,0.2);" />
            <button class="cer-btn small ghost bar-btn" type="button" @click="goToDistribution">
                <CerIcon name="send" :s="12" /> {{ $t('ceremly.event.guests.sendInvite') }}
            </button>
            <button class="cer-btn small ghost bar-btn" type="button" @click="goToReminders">
                <CerIcon name="bell" :s="12" /> {{ $t('ceremly.event.guests.reminder') }}
            </button>
            <button class="cer-btn small ghost bar-btn" type="button" @click="openGroupModal">
                <CerIcon name="edit" :s="12" /> {{ $t('ceremly.event.guests.changeGroup') }}
            </button>
            <div class="spacer" />
            <button class="cer-btn small ghost bar-btn" type="button" @click="clearSelection">
                <CerIcon name="x" :s="12" /> {{ $t('ceremly.event.guests.deselect') }}
            </button>
        </div>

        <!-- Stato errore -->
        <div v-if="loadError" class="cer-card" style="margin-top: 18px; padding: 22px;">
            <div style="color: var(--decline); font-size: 14px;">{{ loadError }}</div>
            <button class="cer-btn ghost small" type="button" style="margin-top: 12px;" @click="loadAll">{{ $t('common.retry') }}</button>
        </div>

        <!-- Stato loading: skeleton sobrio -->
        <div v-else-if="loading" class="cer-card" style="margin-top: 18px; padding: 22px;">
            <div v-for="i in 6" :key="i" class="cer-skeleton" style="height: 38px; margin-bottom: 10px;" />
        </div>

        <!-- Empty state assoluto -->
        <div v-else-if="activeGuests.length === 0" class="cer-card" style="margin-top: 18px; padding: 48px 32px; text-align: center;">
            <div class="serif" style="font-size: 24px;">{{ $t('ceremly.event.guests.emptyTitle') }}</div>
            <div class="muted" style="font-size: 14px; margin-top: 8px; max-width: 420px; margin-left: auto; margin-right: auto;">
                {{ $t('ceremly.event.guests.emptyBody') }}
            </div>
            <div class="row" style="gap: 10px; justify-content: center; margin-top: 18px;">
                <button class="cer-btn ghost" type="button" @click="openImport"><CerIcon name="upload" :s="14" /> {{ $t('ceremly.event.guests.importCsv') }}</button>
                <button class="cer-btn" type="button" @click="openAdd"><CerIcon name="plus" :s="14" /> {{ $t('ceremly.event.guests.addGuest') }}</button>
            </div>
        </div>

        <template v-else>
            <!-- Tabella -->
            <div class="cer-card scroll" style="margin-top: 18px; padding: 0;">
                <table class="cer-table">
                    <thead>
                        <tr>
                            <th style="width: 32px; padding-left: 16px;">
                                <CerCheckbox :model-value="allFilteredSelected" @update:model-value="toggleSelectAll" />
                            </th>
                            <th>{{ $t('ceremly.event.guests.colGuest') }}</th>
                            <th>{{ $t('ceremly.event.guests.colRsvpStatus') }}</th>
                            <th>{{ $t('ceremly.event.guests.colGroup') }}</th>
                            <th>{{ $t('ceremly.event.guests.colChannel') }}</th>
                            <th>{{ $t('ceremly.event.guests.colPeople') }}</th>
                            <th>{{ $t('ceremly.event.guests.colResponse') }}</th>
                            <th style="width: 40px;" />
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="g in paged"
                            :key="g.id"
                            style="cursor: pointer;"
                            @click="openDrawer(g)"
                        >
                            <td style="padding-left: 16px;" @click.stop>
                                <CerCheckbox :model-value="selected.has(g.id)" @update:model-value="toggleSelect(g.id)" />
                            </td>
                            <td>
                                <div class="row" style="gap: 10px;">
                                    <div class="av">{{ initials(g) }}</div>
                                    <div class="col" style="line-height: 1.25;">
                                        <span style="font-weight: 500;">{{ g.firstName }} {{ g.lastName }}</span>
                                        <span class="small muted">{{ g.email || g.phone || "—" }}</span>
                                    </div>
                                </div>
                            </td>
                            <td><StatusPill :status="g.rsvpStatus" /></td>
                            <td>
                                <span v-if="g.groupName" class="cer-tag">{{ g.groupName }}</span>
                                <span v-else class="small muted">—</span>
                            </td>
                            <td>
                                <span v-if="g.email" class="row small" style="gap: 5px;"><span class="muted" style="display: inline-flex;"><CerIcon name="mail" :s="12" /></span> Email</span>
                                <span v-else class="row small" style="gap: 5px;"><span class="muted" style="display: inline-flex;"><CerIcon name="whatsapp" :s="12" /></span> WhatsApp</span>
                            </td>
                            <td class="mono small">{{ g.totalPeople > 0 ? g.totalPeople : "—" }}</td>
                            <td class="small muted">{{ responseCell(g) }}</td>
                            <td><span class="muted" style="display: inline-flex;"><CerIcon name="chevR" :s="14" /></span></td>
                        </tr>
                        <tr v-if="paged.length === 0">
                            <td colspan="8" style="padding: 28px 16px; text-align: center;" class="muted">
                                {{ $t('ceremly.event.guests.noResults') }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Paginazione -->
            <div class="row" style="margin-top: 12px; justify-content: space-between;">
                <span class="small muted">{{ $t('ceremly.event.guests.showingCount', { shown: paged.length, total: filtered.length }) }}</span>
                <div v-if="totalPages > 1" class="row" style="gap: 4px;">
                    <button class="cer-btn ghost small" type="button" style="padding: 6px;" :disabled="page === 1" @click="page--">‹</button>
                    <button
                        v-for="p in totalPages"
                        :key="p"
                        type="button"
                        class="cer-btn small"
                        :class="{ ghost: p !== page }"
                        style="padding: 6px 10px;"
                        @click="page = p"
                    >{{ p }}</button>
                    <button class="cer-btn ghost small" type="button" style="padding: 6px;" :disabled="page === totalPages" @click="page++">›</button>
                </div>
            </div>
        </template>

        <!-- ─── Drawer dettaglio ospite ─────────────────────────────── -->
        <template v-if="drawerRow">
            <div class="cer-drawer-backdrop" @click="closeDrawer" />
            <aside class="cer-drawer scroll">
                <div class="row" style="justify-content: space-between; align-items: flex-start;">
                    <div class="row" style="gap: 12px;">
                        <div class="av lg">{{ initials(drawerRow) }}</div>
                        <div class="col" style="line-height: 1.2;">
                            <span style="font-size: 16px; font-weight: 500;">{{ drawerRow.firstName }} {{ drawerRow.lastName }}</span>
                            <span class="small muted">
                                {{ drawerRow.email || drawerRow.phone || $t('ceremly.event.guests.noContact') }}{{ drawerRow.groupName ? ` · ${$t('ceremly.event.guests.groupLabel', { name: drawerRow.groupName })}` : "" }}
                            </span>
                        </div>
                    </div>
                    <div class="row" style="gap: 10px;">
                        <StatusPill :status="drawerRow.rsvpStatus" />
                        <button class="cer-btn ghost small" type="button" style="padding: 6px;" @click="closeDrawer">
                            <CerIcon name="x" :s="13" />
                        </button>
                    </div>
                </div>

                <div style="height: 1px; background: var(--bone-200); margin: 16px 0;" />

                <div v-if="drawerLoading">
                    <div v-for="i in 4" :key="i" class="cer-skeleton" style="height: 18px; margin-bottom: 10px;" />
                </div>
                <div v-else-if="drawerError" style="color: var(--decline); font-size: 13px;">{{ drawerError }}</div>

                <template v-else-if="drawerDetail">
                    <div class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                        {{ $t('ceremly.event.guests.sectionRsvpAnswers') }}
                    </div>
                    <div v-if="answerRows.length > 0" class="col" style="gap: 10px; margin-top: 10px;">
                        <div v-for="r in answerRows" :key="r.q" class="row" style="align-items: flex-start; gap: 12px; font-size: 13px;">
                            <span class="muted small" style="width: 130px; padding-top: 1px; flex-shrink: 0;">{{ r.q }}</span>
                            <span style="flex: 1;">{{ r.a }}</span>
                        </div>
                    </div>
                    <div v-else class="small muted" style="margin-top: 10px;">
                        {{ $t('ceremly.event.guests.noAnswersYet') }} — {{ drawerRow.rsvpStatus === "not_opened" ? $t('ceremly.event.guests.noAnswersNotOpened') : $t('ceremly.event.guests.noAnswersOpenedNoForm') }}
                    </div>

                    <template v-if="drawerDetail.guest.notes">
                        <div style="height: 1px; background: var(--bone-200); margin: 16px 0;" />
                        <div class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.guests.sectionNotes') }}</div>
                        <div style="font-size: 13px; margin-top: 8px;">{{ drawerDetail.guest.notes }}</div>
                    </template>

                    <div style="height: 1px; background: var(--bone-200); margin: 16px 0;" />

                    <div class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                        {{ $t('ceremly.event.guests.sectionTimeline') }}
                    </div>
                    <div v-if="drawerDetail.activities.length > 0" class="col" style="gap: 6px; margin-top: 8px;">
                        <div v-for="a in drawerDetail.activities" :key="a.id" class="row" style="gap: 10px; font-size: 12px; align-items: flex-start;">
                            <span class="mono muted" style="width: 110px; flex-shrink: 0;">{{ timelineDate(a.createdAt) }}</span>
                            <span>{{ activityLabel(a) }}</span>
                        </div>
                    </div>
                    <div v-else class="small muted" style="margin-top: 8px;">{{ $t('ceremly.event.guests.noActivity') }}</div>

                    <div style="height: 1px; background: var(--bone-200); margin: 16px 0;" />

                    <button
                        class="cer-btn ghost small"
                        type="button"
                        style="color: var(--decline); border-color: var(--decline);"
                        @click="confirmDeleteOpen = true"
                    >
                        <CerIcon name="trash" :s="13" /> {{ $t('ceremly.event.guests.deleteGuest') }}
                    </button>
                </template>
            </aside>
        </template>

        <!-- ─── Modale conferma eliminazione ────────────────────────── -->
        <div v-if="confirmDeleteOpen && drawerRow" class="cer-overlay" @click.self="confirmDeleteOpen = false">
            <div class="cer-modal" style="max-width: 440px;">
                <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.guests.confirmDeleteTitle', { firstName: drawerRow.firstName, lastName: drawerRow.lastName }) }}</div>
                <div class="muted" style="font-size: 14px; margin-top: 10px; line-height: 1.5;">
                    {{ $t('ceremly.event.guests.confirmDeleteBody') }}
                </div>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 20px;">
                    <button class="cer-btn ghost small" type="button" @click="confirmDeleteOpen = false">{{ $t('common.cancel') }}</button>
                    <button
                        class="cer-btn small dark"
                        type="button"
                        :disabled="deleting"
                        @click="confirmDelete"
                    >
                        <CerIcon name="trash" :s="12" /> {{ deleting ? $t('ceremly.event.guests.deletingProgress') : $t('ceremly.event.guests.deleteAction') }}
                    </button>
                </div>
            </div>
        </div>

        <!-- ─── Modale "Aggiungi ospite" ────────────────────────────── -->
        <div v-if="addOpen" class="cer-overlay" @click.self="addOpen = false">
            <div class="cer-modal">
                <div class="serif" style="font-size: 22px;">{{ $t('ceremly.event.guests.addModalTitle') }}</div>
                <div class="muted" style="font-size: 13px; margin-top: 4px;">{{ $t('ceremly.event.guests.addModalSubtitle') }}</div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px;">
                    <div class="col" style="gap: 4px;">
                        <label class="cer-flabel">{{ $t('ceremly.event.guests.fieldFirstName') }} *</label>
                        <input v-model="addForm.firstName" class="cer-input" placeholder="Anna">
                    </div>
                    <div class="col" style="gap: 4px;">
                        <label class="cer-flabel">{{ $t('ceremly.event.guests.fieldLastName') }} *</label>
                        <input v-model="addForm.lastName" class="cer-input" placeholder="Conti">
                    </div>
                    <div class="col" style="gap: 4px;">
                        <label class="cer-flabel">{{ $t('ceremly.event.guests.fieldEmail') }}</label>
                        <input v-model="addForm.email" class="cer-input" type="email" placeholder="anna@email.it">
                    </div>
                    <div class="col" style="gap: 4px;">
                        <label class="cer-flabel">{{ $t('ceremly.event.guests.fieldPhone') }}</label>
                        <input v-model="addForm.phone" class="cer-input" placeholder="+39 333 1234567">
                    </div>
                    <div class="col" style="gap: 4px; grid-column: 1 / -1;">
                        <label class="cer-flabel">{{ $t('ceremly.event.guests.fieldGroup') }}</label>
                        <input v-model="addForm.groupName" class="cer-input" :placeholder="$t('ceremly.event.guests.fieldGroupPlaceholder')">
                    </div>
                    <div class="col" style="gap: 4px; grid-column: 1 / -1;">
                        <label class="cer-flabel">{{ $t('ceremly.event.guests.fieldNotes') }}</label>
                        <textarea v-model="addForm.notes" class="cer-input" rows="2" :placeholder="$t('ceremly.event.guests.fieldNotesPlaceholder')" />
                    </div>
                </div>

                <div v-if="addError" style="margin-top: 12px; font-size: 13px; color: var(--decline);">{{ addError }}</div>

                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 18px;">
                    <button class="cer-btn ghost small" type="button" @click="addOpen = false">{{ $t('common.cancel') }}</button>
                    <button class="cer-btn small" type="button" :disabled="addSaving" @click="submitAdd">
                        <CerIcon name="plus" :s="12" /> {{ addSaving ? $t('ceremly.event.guests.savingProgress') : $t('ceremly.event.guests.addGuest') }}
                    </button>
                </div>
            </div>
        </div>

        <!-- ─── Modale "Importa CSV" ────────────────────────────────── -->
        <div v-if="importOpen" class="cer-overlay" @click.self="importOpen = false">
            <div class="cer-modal" style="max-width: 640px;">
                <div class="serif" style="font-size: 22px;">Importa ospiti da CSV</div>
                <div class="muted" style="font-size: 13px; margin-top: 4px;">
                    Colonne attese: nome, cognome, email, telefono, gruppo — la riga di intestazione è facoltativa.
                </div>

                <!-- Step 1: scelta file -->
                <template v-if="importStep === 'pick'">
                    <label
                        style="display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 18px; padding: 32px; border: 1.5px dashed var(--bone-300); border-radius: 12px; cursor: pointer; background: var(--bone);"
                    >
                        <CerIcon name="upload" :s="22" />
                        <span style="font-size: 14px; font-weight: 500;">Scegli un file .csv</span>
                        <span class="small muted">o trascinalo qui dentro</span>
                        <input type="file" accept=".csv,text/csv" style="display: none;" @change="onCsvPicked">
                    </label>
                </template>

                <!-- Step 2: anteprima -->
                <template v-else-if="importStep === 'preview'">
                    <div class="row" style="margin-top: 16px; justify-content: space-between;">
                        <span class="cer-tag">{{ importFileName }}</span>
                        <span class="small muted">{{ importRows.length }} ospiti pronti · {{ importErrors.length }} righe con problemi</span>
                    </div>

                    <div v-if="importRows.length > 0" class="cer-card scroll" style="margin-top: 12px; padding: 0;">
                        <table class="cer-table">
                            <thead>
                                <tr><th style="padding-left: 14px;">Nome</th><th>Cognome</th><th>Email</th><th>Telefono</th><th>Gruppo</th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="(r, i) in importRows.slice(0, 5)" :key="i">
                                    <td style="padding-left: 14px;">{{ r.firstName }}</td>
                                    <td>{{ r.lastName }}</td>
                                    <td class="small muted">{{ r.email || "—" }}</td>
                                    <td class="small muted">{{ r.phone || "—" }}</td>
                                    <td class="small muted">{{ r.groupName || "—" }}</td>
                                </tr>
                            </tbody>
                        </table>
                        <div v-if="importRows.length > 5" class="small muted" style="padding: 10px 14px;">
                            … e altri {{ importRows.length - 5 }} ospiti
                        </div>
                    </div>

                    <div v-if="importErrors.length > 0" style="margin-top: 12px;">
                        <div class="cer-flabel" style="color: var(--decline);">Righe saltate</div>
                        <div class="col" style="gap: 4px; margin-top: 6px; max-height: 120px; overflow: auto;">
                            <span v-for="(err, i) in importErrors" :key="i" class="small" style="color: var(--decline);">
                                Riga {{ err.line }}: {{ err.reason }}
                            </span>
                        </div>
                    </div>

                    <div v-if="importSubmitError" style="margin-top: 12px; font-size: 13px; color: var(--decline);">{{ importSubmitError }}</div>

                    <div class="row" style="justify-content: space-between; margin-top: 18px;">
                        <button class="cer-btn ghost small" type="button" @click="importStep = 'pick'">Scegli un altro file</button>
                        <div class="row" style="gap: 8px;">
                            <button class="cer-btn ghost small" type="button" @click="importOpen = false">Annulla</button>
                            <button
                                class="cer-btn small"
                                type="button"
                                :disabled="importRows.length === 0 || importSaving"
                                @click="submitImport"
                            >
                                <CerIcon name="upload" :s="12" /> {{ importSaving ? "Importo…" : `Importa ${importRows.length} ospiti` }}
                            </button>
                        </div>
                    </div>
                </template>

                <!-- Step 3: report -->
                <template v-else-if="importStep === 'done' && importResult">
                    <div class="row" style="gap: 10px; margin-top: 18px;">
                        <span class="pill confirm"><span class="cer-dot" />Importati {{ importResult.imported }}</span>
                        <span class="pill" :class="importResult.skipped.length > 0 ? 'decline' : 'neutral'"><span class="cer-dot" />Saltati {{ importResult.skipped.length }}</span>
                    </div>
                    <div v-if="importResult.skipped.length > 0" class="col" style="gap: 4px; margin-top: 12px; max-height: 120px; overflow: auto;">
                        <span v-for="(s, i) in importResult.skipped" :key="i" class="small" style="color: var(--decline);">
                            Riga {{ s.row }}: {{ s.reason }}
                        </span>
                    </div>
                    <div v-if="importResult.warnings.length > 0" style="margin-top: 12px;">
                        <div class="cer-flabel">Possibili duplicati (importati comunque)</div>
                        <div class="col" style="gap: 4px; margin-top: 6px; max-height: 120px; overflow: auto;">
                            <span v-for="(w, i) in importResult.warnings" :key="i" class="small muted">
                                Riga {{ w.row }}: {{ w.reason }}
                            </span>
                        </div>
                    </div>
                    <div class="row" style="justify-content: flex-end; margin-top: 18px;">
                        <button class="cer-btn small" type="button" @click="importOpen = false">Chiudi</button>
                    </div>
                </template>
            </div>
        </div>

        <!-- ─── Modale "Cambia gruppo" ──────────────────────────────── -->
        <div v-if="groupOpen" class="cer-overlay" @click.self="groupOpen = false">
            <div class="cer-modal" style="max-width: 440px;">
                <div class="serif" style="font-size: 20px;">Cambia gruppo</div>
                <div class="muted" style="font-size: 13px; margin-top: 4px;">
                    Il nuovo gruppo sarà applicato a {{ selected.size }} ospiti selezionati.
                </div>
                <div class="col" style="gap: 4px; margin-top: 16px;">
                    <label class="cer-flabel">Nome del gruppo</label>
                    <input v-model="groupName" class="cer-input" placeholder="Famiglia, Amici, Colleghi…" @keyup.enter="submitGroup">
                </div>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 18px;">
                    <button class="cer-btn ghost small" type="button" @click="groupOpen = false">Annulla</button>
                    <button class="cer-btn small" type="button" :disabled="!groupName.trim() || groupSaving" @click="submitGroup">
                        {{ groupSaving ? "Salvo…" : "Applica" }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Bottoni della action bar su sfondo ink (stile inline del mockup) */
.bar-btn {
    background: transparent;
    color: var(--bone-50);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: none;
}
.bar-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: none;
    box-shadow: none;
}

/* Overlay e modali custom .cer (coerenza visiva col design system) */
.cer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(63, 54, 34, 0.45);
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
}
.cer-modal {
    width: 100%;
    max-width: 520px;
    background: var(--bone-50);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    padding: 22px;
    max-height: 90vh;
    overflow: auto;
    box-shadow: var(--hard);
}

/* Drawer laterale dettaglio ospite */
.cer-drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(63, 54, 34, 0.35);
    z-index: 60;
}
.cer-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 480px;
    max-width: 100%;
    background: var(--bone-50);
    border-left: 1px solid var(--line);
    z-index: 61;
    padding: 24px;
    overflow: auto;
}

/* Label form mono (stile inline del mockup) */
.cer-flabel {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-500);
}

/* Skeleton sobrio */
.cer-skeleton {
    background: var(--bone-100);
    border-radius: 8px;
    animation: cer-pulse 1.2s ease-in-out infinite;
}
@keyframes cer-pulse {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
}
</style>
