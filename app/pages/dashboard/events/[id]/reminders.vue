<script setup lang="ts">
// Reminder automatici — port fedele di docs/ui/project/screens/reminders.jsx.
// Sinistra: deadline RSVP + fino a 3 ReminderCard editabili (R1/R2/R3).
// Destra: destinatari, esclusioni per ospite (remindersDisabled), card "Niente spam".
// Salvataggio: PUT /api/events/:id/reminders (bulk) + PUT rsvpDeadline se cambiata.
import type { CeremlyEvent, EventReminderData, GuestWithStatus } from "~~/shared/types/ceremly";
import CerIcon from "~/components/ceremly/CerIcon.vue";
import CerToggle from "~/components/ceremly/CerToggle.vue";

definePageMeta({
    layout: "ceremly",
    auth: { only: "user" },
});

const { t } = useI18n();
const route = useRoute();
const toast = useToast();
const { listGuests, updateGuest } = useEventGuests();
const eventId = computed(() => String(route.params.id ?? ""));

const TYPE_LABELS: Record<string, string> = {
    matrimonio: "Matrimonio",
    laurea: "Laurea",
    battesimo: "Battesimo",
    compleanno: "Compleanno",
};

const DAY_MS = 86_400_000;

interface LocalReminder {
    id?: string;
    daysBefore: number;
    subject: string;
    message: string;
    enabled: boolean;
    sentAt: string | null;
}

// ─── Stato pagina ────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveBtn = useButtonSuccess();
const eventData = ref<CeremlyEvent | null>(null);
const reminders = ref<LocalReminder[]>([]);
const guests = ref<GuestWithStatus[]>([]);
const savedRemindersSnapshot = ref("[]");
const deadlineInput = ref("");
const savedDeadlineInput = ref("");

const crumbs = useState<string[]>("ceremly-crumbs", () => []);
const eventCtx = useState<{ id: string, title: string, type: string } | null>("ceremly-event-ctx", () => null);

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

/** Estrae il messaggio (statusMessage del server o message) da un errore $fetch. */
function errorMessage(e: unknown): string | undefined {
    const err = e as { data?: { statusMessage?: string }, message?: string } | null;
    return err?.data?.statusMessage || err?.message;
}

function toDateInputValue(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function setRemindersFromServer(list: EventReminderData[]) {
    reminders.value = [...list]
        .sort((a, b) => b.daysBefore - a.daysBefore)
        .map(r => ({
            id: r.id,
            daysBefore: r.daysBefore,
            subject: r.subject,
            message: r.message,
            enabled: r.enabled,
            sentAt: r.sentAt,
        }));
    savedRemindersSnapshot.value = JSON.stringify(reminders.value);
}

async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const [evRes, remRes, guestsRes] = await Promise.all([
            $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`),
            $fetch<{ reminders: EventReminderData[] }>(`/api/events/${eventId.value}/reminders`),
            listGuests(eventId.value),
        ]);
        eventData.value = evRes.event;
        guests.value = guestsRes.guests ?? [];
        setRemindersFromServer(remRes.reminders ?? []);
        deadlineInput.value = toDateInputValue(evRes.event.rsvpDeadline);
        savedDeadlineInput.value = deadlineInput.value;
        eventCtx.value = { id: evRes.event.id, title: evRes.event.title, type: evRes.event.type };
        crumbs.value = [t("ceremly.event.reminders.crumbEvents"), TYPE_LABELS[evRes.event.type] ?? evRes.event.title, t("ceremly.event.reminders.pageTitle")];
    } catch (e) {
        loadError.value = errorMessage(e) || t("ceremly.event.reminders.loadError");
    } finally {
        loading.value = false;
    }
}

onMounted(load);

// ─── Dirty guard ─────────────────────────────────────────────────────
const dirty = computed(() =>
    JSON.stringify(reminders.value) !== savedRemindersSnapshot.value
    || deadlineInput.value !== savedDeadlineInput.value);

function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!dirty.value) return;
    e.preventDefault();
    e.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
onBeforeRouteLeave(() => {
    if (dirty.value && !window.confirm(t("ceremly.event.reminders.unsavedChangesConfirm"))) {
        return false;
    }
});

// ─── Date helpers ────────────────────────────────────────────────────
const fmtDayMonth = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

const deadlineDate = computed<Date | null>(() => {
    if (!deadlineInput.value) return null;
    const d = new Date(`${deadlineInput.value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
});

const daysToDeadline = computed<number | null>(() => {
    if (!deadlineDate.value) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((deadlineDate.value.getTime() - today.getTime()) / DAY_MS);
});

function reminderSendDate(r: LocalReminder): string | null {
    if (!deadlineDate.value) return null;
    const days = Number(r.daysBefore);
    if (!Number.isFinite(days)) return null;
    return fmtDayMonth.format(new Date(deadlineDate.value.getTime() - days * DAY_MS));
}

function reminderStatusLine(r: LocalReminder): string {
    if (r.sentAt) return t("ceremly.event.reminders.statusSentOn", { date: fmtDayMonth.format(new Date(r.sentAt)) });
    const sendDate = reminderSendDate(r);
    if (!sendDate) return t("ceremly.event.reminders.statusNoDeadline");
    return t("ceremly.event.reminders.statusScheduled", { date: sendDate });
}

// ─── Reminder: add / remove / defaults ───────────────────────────────
const MAX_REMINDERS = 3;

function reminderDefaults(): Omit<LocalReminder, "id">[] {
    const title = eventData.value?.title ?? t("ceremly.event.reminders.defaultEventFallback");
    const eventDateLabel = eventData.value?.eventDate
        ? fmtDayMonth.format(new Date(eventData.value.eventDate))
        : null;
    return [
        {
            daysBefore: 14,
            subject: t("ceremly.event.reminders.default14Subject"),
            message: t("ceremly.event.reminders.default14Message", { title }),
            enabled: true,
            sentAt: null,
        },
        {
            daysBefore: 7,
            subject: t("ceremly.event.reminders.default7Subject"),
            message: t("ceremly.event.reminders.default7Message"),
            enabled: true,
            sentAt: null,
        },
        {
            daysBefore: 2,
            subject: eventDateLabel ? t("ceremly.event.reminders.default2SubjectDate", { date: eventDateLabel }) : t("ceremly.event.reminders.default2Subject"),
            message: t("ceremly.event.reminders.default2Message"),
            enabled: true,
            sentAt: null,
        },
    ];
}

function addReminder() {
    if (reminders.value.length >= MAX_REMINDERS) return;
    const used = new Set(reminders.value.map(r => Number(r.daysBefore)));
    const defaults = reminderDefaults();
    const next = defaults.find(d => !used.has(d.daysBefore)) ?? defaults[reminders.value.length] ?? defaults[0]!;
    reminders.value.push({ ...next });
    reminders.value.sort((a, b) => Number(b.daysBefore) - Number(a.daysBefore));
}

function addRecommendedReminders() {
    if (reminders.value.length > 0) return;
    reminders.value = reminderDefaults().map(d => ({ ...d }));
}

const removeTarget = ref<number | null>(null);

function confirmRemoveReminder() {
    if (removeTarget.value === null) return;
    reminders.value.splice(removeTarget.value, 1);
    removeTarget.value = null;
}

// ─── Destinatari (calcolati dalla lista ospiti) ──────────────────────
const activeGuests = computed(() => guests.value.filter(g => !g.removedAt));
const pendingGuests = computed(() =>
    activeGuests.value.filter(g => g.rsvpStatus === "opened" || g.rsvpStatus === "not_opened"));
const pendingWithEmail = computed(() => pendingGuests.value.filter(g => !!g.email));
const pendingNoEmail = computed(() => pendingGuests.value.filter(g => !g.email));

// ─── Esclusioni (remindersDisabled per ospite) ───────────────────────
const excludedGuests = computed(() => activeGuests.value.filter(g => g.remindersDisabled));
const excludeCandidates = computed(() =>
    pendingGuests.value.filter(g => !g.remindersDisabled));

const showExcludePicker = ref(false);
const excludePickerValue = ref("");
const exclusionBusyId = ref<string | null>(null);

function guestInitials(g: GuestWithStatus): string {
    return `${g.firstName?.[0] ?? ""}${g.lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

async function setGuestExcluded(guestId: string, excluded: boolean) {
    exclusionBusyId.value = guestId;
    try {
        const updated = await updateGuest(eventId.value, guestId, { remindersDisabled: excluded });
        const idx = guests.value.findIndex(g => g.id === guestId);
        if (idx >= 0) {
            guests.value[idx] = { ...guests.value[idx]!, ...updated };
        }
        toast.add({
            title: excluded ? t("ceremly.event.reminders.toastGuestExcluded") : t("ceremly.event.reminders.toastGuestReenabled"),
            color: "success",
        });
    } catch (e) {
        toast.add({
            title: t("ceremly.event.reminders.toastOperationFailed"),
            description: errorMessage(e),
            color: "error",
        });
    } finally {
        exclusionBusyId.value = null;
    }
}

async function onExcludePicked() {
    const guestId = excludePickerValue.value;
    excludePickerValue.value = "";
    showExcludePicker.value = false;
    if (guestId) await setGuestExcluded(guestId, true);
}

// ─── Salvataggio ─────────────────────────────────────────────────────
function validateReminders(): string[] {
    const errors: string[] = [];
    reminders.value.forEach((r, i) => {
        if (r.sentAt) return; // immutabili lato server
        const days = Number(r.daysBefore);
        if (!Number.isInteger(days) || days < 1 || days > 60) {
            errors.push(t("ceremly.event.reminders.validationDays", { n: i + 1 }));
        }
        if (!r.subject?.trim()) errors.push(t("ceremly.event.reminders.validationSubject", { n: i + 1 }));
        if (!r.message?.trim()) errors.push(t("ceremly.event.reminders.validationMessage", { n: i + 1 }));
    });
    return errors;
}

async function saveAll() {
    if (saveBtn.busy || !eventData.value) return;
    const errors = validateReminders();
    if (errors.length > 0) {
        toast.add({ title: t("ceremly.event.reminders.toastValidationError"), description: errors.join(" "), color: "error" });
        return;
    }
    try {
        await saveBtn.run(async () => {
            // 1. Deadline (se cambiata)
            if (deadlineInput.value !== savedDeadlineInput.value) {
                const evRes = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`, {
                    method: "PUT",
                    body: { rsvpDeadline: deadlineInput.value || null },
                });
                eventData.value = evRes.event;
                savedDeadlineInput.value = deadlineInput.value;
            }

            // 2. Bulk upsert reminder (gli inviati sono skip silenzioso lato server)
            const res = await $fetch<{ reminders: EventReminderData[] }>(
                `/api/events/${eventId.value}/reminders`,
                {
                    method: "PUT",
                    body: {
                        reminders: reminders.value.map(r => ({
                            ...(r.id ? { id: r.id } : {}),
                            daysBefore: Number(r.daysBefore),
                            subject: r.subject.trim(),
                            message: r.message.trim(),
                            enabled: r.enabled,
                        })),
                    },
                },
            );
            setRemindersFromServer(res.reminders ?? []);
        });
        toast.add({ title: t("ceremly.event.reminders.toastSaved"), color: "success" });
    } catch (e) {
        toast.add({
            title: t("ceremly.event.reminders.toastSaveFailed"),
            description: errorMessage(e),
            color: "error",
        });
    }
}

function openDistribution() {
    navigateTo(`/dashboard/events/${eventId.value}/distribution`);
}
</script>

<template>
    <div>
        <ClientOnly>
            <Teleport defer to="#ceremly-topbar-actions">
                <button
                    v-if="eventData"
                    class="cer-btn small"
                    :class="{ success: saveBtn.isSuccess }"
                    type="button"
                    :disabled="saveBtn.busy"
                    :style="saveBtn.isLoading ? { opacity: 0.7, cursor: 'default' } : undefined"
                    @click="saveAll"
                >
                    {{ saveBtn.isLoading ? $t('ceremly.event.reminders.btnSaving') : saveBtn.isSuccess ? $t('common.saved') : $t('common.save') }}{{ dirty && !saveBtn.busy ? " •" : "" }}
                </button>
            </Teleport>
        </ClientOnly>

        <!-- Loading -->
        <template v-if="loading">
            <div class="skel" style="width: 320px; height: 40px;" />
            <div class="skel" style="width: 460px; height: 16px; margin-top: 10px;" />
            <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; margin-top: 24px;">
                <div class="col" style="gap: 16px;">
                    <div class="skel" style="height: 96px;" />
                    <div v-for="i in 3" :key="i" class="skel" style="height: 220px;" />
                </div>
                <div class="col" style="gap: 16px;">
                    <div class="skel" style="height: 200px;" />
                    <div class="skel" style="height: 160px;" />
                    <div class="skel" style="height: 110px;" />
                </div>
            </div>
        </template>

        <!-- Error -->
        <div v-else-if="loadError" class="cer-card" style="padding: 28px; margin-top: 8px; max-width: 560px;">
            <div class="serif" style="font-size: 22px;">{{ $t('ceremly.event.reminders.errorTitle') }}</div>
            <div class="small muted" style="margin-top: 8px; color: var(--decline);">{{ loadError }}</div>
            <div class="row" style="gap: 8px; margin-top: 16px;">
                <button class="cer-btn ghost small" type="button" @click="load">{{ $t('common.retry') }}</button>
                <NuxtLink to="/dashboard" class="cer-btn small" style="text-decoration: none;">{{ $t('ceremly.event.reminders.backToEvents') }}</NuxtLink>
            </div>
        </div>

        <template v-else-if="eventData">
            <h1>{{ $t('ceremly.event.reminders.pageTitle') }}</h1>
            <div class="h-sub">
                {{ $t('ceremly.event.reminders.pageSubtitle') }}
            </div>

            <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; margin-top: 24px;">
                <!-- ── Colonna sinistra ─────────────────────────────── -->
                <div class="col" style="gap: 16px;">
                    <!-- Deadline RSVP -->
                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.reminders.deadlineLabel') }}</div>
                        <div class="row" style="margin-top: 12px; gap: 12px; align-items: center; flex-wrap: wrap;">
                            <input
                                v-model="deadlineInput"
                                type="date"
                                class="cer-input"
                                style="max-width: 240px; font-size: 16px;"
                            >
                            <span v-if="daysToDeadline === null" class="small" style="color: var(--decline);">
                                {{ $t('ceremly.event.reminders.deadlineNotSet') }}
                            </span>
                            <span v-else-if="daysToDeadline >= 0" class="small muted">
                                {{ $t('ceremly.event.reminders.deadlineDaysLeft', { n: daysToDeadline }) }}
                            </span>
                            <span v-else class="small" style="color: var(--decline);">
                                {{ $t('ceremly.event.reminders.deadlinePassed') }}
                            </span>
                        </div>
                    </div>

                    <!-- Empty state -->
                    <div v-if="reminders.length === 0" class="cer-card" style="padding: 24px;">
                        <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.reminders.emptyTitle') }}</div>
                        <div class="small muted" style="margin-top: 8px; line-height: 1.5;">
                            {{ $t('ceremly.event.reminders.emptyHint') }}
                        </div>
                        <div class="row" style="gap: 8px; margin-top: 16px; flex-wrap: wrap;">
                            <button class="cer-btn small" type="button" @click="addRecommendedReminders">
                                <CerIcon name="bell" :s="13" /> {{ $t('ceremly.event.reminders.btnAddRecommended') }}
                            </button>
                            <button class="cer-btn ghost small" type="button" @click="addReminder">
                                <CerIcon name="plus" :s="12" /> {{ $t('ceremly.event.reminders.btnAddOne') }}
                            </button>
                        </div>
                    </div>

                    <!-- Reminder cards -->
                    <div
                        v-for="(r, ri) in reminders"
                        :key="r.id ?? `new-${ri}`"
                        class="cer-card"
                        :style="{ padding: '20px', opacity: r.sentAt ? 0.65 : (r.enabled ? 1 : 0.6) }"
                    >
                        <div class="row" style="justify-content: space-between; align-items: flex-start;">
                            <div class="row" style="gap: 12px; align-items: flex-start;">
                                <div
                                    :style="{
                                        width: '36px', height: '36px', borderRadius: '8px',
                                        background: r.enabled && !r.sentAt ? 'var(--wine-soft)' : 'var(--bone-100)',
                                        color: r.enabled && !r.sentAt ? 'var(--wine-deep)' : 'var(--ink-500)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500,
                                        flexShrink: 0,
                                    }"
                                >R{{ ri + 1 }}</div>
                                <div class="col" style="line-height: 1.3; gap: 2px;">
                                    <div class="row" style="gap: 6px;">
                                        <input
                                            v-model.number="r.daysBefore"
                                            type="number"
                                            min="1"
                                            max="60"
                                            class="cer-input"
                                            :disabled="!!r.sentAt"
                                            style="width: 68px; padding: 5px 8px; font-size: 14px; font-weight: 500;"
                                        >
                                        <span style="font-size: 15px; font-weight: 500;">{{ $t('ceremly.event.reminders.daysBefore', { n: Number(r.daysBefore) }) }}</span>
                                    </div>
                                    <span class="small muted">{{ reminderStatusLine(r) }}</span>
                                </div>
                            </div>
                            <div class="row" style="gap: 10px;">
                                <div
                                    :style="r.sentAt ? { opacity: 0.45, pointerEvents: 'none' } : undefined"
                                    :title="r.sentAt ? $t('ceremly.event.reminders.sentNotEditable') : undefined"
                                >
                                    <CerToggle v-model="r.enabled" :label="r.enabled ? $t('ceremly.event.reminders.toggleEnabled') : $t('ceremly.event.reminders.toggleDisabled')" />
                                </div>
                                <button
                                    v-if="!r.sentAt"
                                    class="cer-btn ghost small"
                                    style="padding: 5px;"
                                    type="button"
                                    :title="$t('ceremly.event.reminders.btnDeleteTitle')"
                                    @click="removeTarget = ri"
                                >
                                    <CerIcon name="trash" :s="12" />
                                </button>
                            </div>
                        </div>

                        <div style="margin-top: 14px; padding: 14px; background: var(--bone); border-radius: 8px; border: 1px solid var(--bone-200);">
                            <div class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">
                                {{ $t('ceremly.event.reminders.subjectLabel') }}
                            </div>
                            <input
                                v-model="r.subject"
                                class="cer-input"
                                :disabled="!!r.sentAt"
                                style="margin-top: 4px; font-size: 13px; padding: 8px 10px;"
                                :placeholder="$t('ceremly.event.reminders.subjectPlaceholder')"
                            >
                            <div class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500); margin-top: 10px;">
                                {{ $t('ceremly.event.reminders.messageLabel') }}
                            </div>
                            <textarea
                                v-model="r.message"
                                class="cer-input"
                                rows="3"
                                :disabled="!!r.sentAt"
                                style="margin-top: 4px; font-size: 13px; line-height: 1.5; color: var(--ink-700); resize: vertical;"
                                :placeholder="$t('ceremly.event.reminders.messagePlaceholder')"
                            />
                            <div class="row" style="gap: 6px; margin-top: 8px;">
                                <span class="cer-tag" style="font-size: 10px;">{nome}</span>
                                <span class="cer-tag" style="font-size: 10px;">{link}</span>
                                <span class="small muted">{{ $t('ceremly.event.reminders.placeholdersHint') }}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        v-if="reminders.length > 0 && reminders.length < MAX_REMINDERS"
                        class="cer-btn ghost small"
                        style="align-self: flex-start;"
                        type="button"
                        @click="addReminder"
                    >
                        <CerIcon name="plus" :s="12" /> {{ $t('ceremly.event.reminders.btnAddReminder') }}
                    </button>
                    <div v-else-if="reminders.length >= MAX_REMINDERS" class="small muted" style="align-self: flex-start;">
                        {{ $t('ceremly.event.reminders.maxRemindersReached') }}
                    </div>
                </div>

                <!-- ── Colonna destra ───────────────────────────────── -->
                <div class="col" style="gap: 16px;">
                    <!-- Destinatari -->
                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.reminders.recipientsLabel') }}</div>
                        <div class="serif" style="font-size: 36px; margin-top: 6px;">{{ pendingWithEmail.length }}</div>
                        <div class="small muted">{{ $t('ceremly.event.reminders.recipientsHint') }}</div>

                        <div class="col" style="gap: 10px; margin-top: 14px;">
                            <div class="row" style="gap: 10px; padding: 10px 12px; background: var(--bone); border: 1px solid var(--bone-200); border-radius: 8px;">
                                <CerIcon name="mail" :s="14" class="muted" />
                                <span style="font-size: 13px; flex: 1;">{{ $t('ceremly.event.reminders.haveEmail') }}</span>
                                <span class="mono small">{{ pendingWithEmail.length }}</span>
                            </div>
                            <div v-if="pendingNoEmail.length > 0" class="row" style="gap: 10px; padding: 10px 12px; background: var(--wine-soft); border-radius: 8px;">
                                <CerIcon name="whatsapp" :s="14" style="color: var(--wine-deep); flex-shrink: 0;" />
                                <div class="col" style="flex: 1; line-height: 1.25;">
                                    <span style="font-size: 13px; color: var(--wine-deep); font-weight: 500;">
                                        {{ $t('ceremly.event.reminders.noEmailGuests', { n: pendingNoEmail.length }) }}
                                    </span>
                                    <span class="small" style="color: var(--wine-deep); opacity: 0.8;">{{ $t('ceremly.event.reminders.whatsappReady') }}</span>
                                </div>
                                <button class="cer-btn small wine" style="padding: 4px 10px; font-size: 11px;" type="button" @click="openDistribution">
                                    {{ $t('ceremly.event.reminders.btnOpenList') }}
                                </button>
                            </div>
                            <div v-if="pendingGuests.length === 0" class="small muted" style="line-height: 1.5;">
                                {{ $t('ceremly.event.reminders.allReplied') }}
                            </div>
                        </div>
                    </div>

                    <!-- Esclusioni -->
                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.reminders.exclusionsLabel') }}</div>
                        <div class="small muted" style="margin-top: 8px;">
                            {{ $t('ceremly.event.reminders.exclusionsHint') }}
                        </div>
                        <div class="col" style="gap: 6px; margin-top: 12px;">
                            <span v-if="excludedGuests.length === 0" class="small muted">{{ $t('ceremly.event.reminders.noExclusions') }}</span>
                            <div
                                v-for="g in excludedGuests"
                                :key="g.id"
                                class="row"
                                style="gap: 10px; padding: 8px 10px; border-radius: 8px; background: var(--bone);"
                            >
                                <div class="av" style="width: 24px; height: 24px; font-size: 10px;">{{ guestInitials(g) }}</div>
                                <div class="col" style="flex: 1; line-height: 1.25;">
                                    <span style="font-size: 13px;">{{ g.firstName }} {{ g.lastName }}</span>
                                    <span class="small muted">{{ g.notes || g.groupName || $t('ceremly.event.reminders.noNotes') }}</span>
                                </div>
                                <button
                                    class="cer-btn ghost small"
                                    type="button"
                                    :title="$t('ceremly.event.reminders.btnReenableTitle')"
                                    :disabled="exclusionBusyId === g.id"
                                    :style="{ padding: '4px', opacity: exclusionBusyId === g.id ? 0.5 : 1 }"
                                    @click="setGuestExcluded(g.id, false)"
                                >
                                    <CerIcon name="x" :s="12" />
                                </button>
                            </div>

                            <select
                                v-if="showExcludePicker"
                                v-model="excludePickerValue"
                                class="cer-input"
                                style="margin-top: 4px;"
                                @change="onExcludePicked"
                            >
                                <option value="" disabled>{{ $t('ceremly.event.reminders.excludePickerPrompt') }}</option>
                                <option v-for="g in excludeCandidates" :key="g.id" :value="g.id">
                                    {{ g.firstName }} {{ g.lastName }}{{ g.groupName ? ` · ${g.groupName}` : "" }}
                                </option>
                            </select>
                            <button
                                v-else
                                class="cer-btn ghost small"
                                type="button"
                                :disabled="excludeCandidates.length === 0"
                                :style="excludeCandidates.length === 0 ? { opacity: 0.5 } : undefined"
                                :title="excludeCandidates.length === 0 ? $t('ceremly.event.reminders.noPendingToExclude') : undefined"
                                @click="showExcludePicker = true"
                            >
                                <CerIcon name="plus" :s="12" /> {{ $t('ceremly.event.reminders.btnExcludeGuest') }}
                            </button>
                        </div>
                    </div>

                    <!-- Niente spam -->
                    <div class="cer-card" style="padding: 20px; background: var(--ink); color: var(--bone-50); border-color: var(--ink);">
                        <div class="row" style="gap: 10px; align-items: flex-start;">
                            <CerIcon name="bell" :s="16" style="flex-shrink: 0; margin-top: 2px;" />
                            <div class="col" style="gap: 6px;">
                                <div style="font-size: 14px; font-weight: 500;">{{ $t('ceremly.event.reminders.noSpamTitle') }}</div>
                                <div class="small" style="color: var(--bone-200); line-height: 1.5;">
                                    {{ $t('ceremly.event.reminders.noSpamDesc') }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ── Conferma eliminazione reminder ───────────────────────── -->
        <div
            v-if="removeTarget !== null"
            class="cer"
            style="position: fixed; inset: 0; z-index: 60; background: rgba(63, 54, 34, 0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
            @click.self="removeTarget = null"
        >
            <div class="cer-card" style="padding: 24px; width: 440px; max-width: 92vw; background: var(--bone-50); box-shadow: var(--hard);">
                <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.reminders.deleteModalTitle', { n: (removeTarget ?? 0) + 1 }) }}</div>
                <div class="small muted" style="margin-top: 8px; line-height: 1.5;">
                    {{ $t('ceremly.event.reminders.deleteModalDesc') }}
                </div>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 18px;">
                    <button class="cer-btn ghost small" type="button" @click="removeTarget = null">{{ $t('common.cancel') }}</button>
                    <button
                        class="cer-btn small"
                        type="button"
                        style="background: var(--decline); border-color: var(--ink); color: #fff;"
                        @click="confirmRemoveReminder"
                    >
                        <CerIcon name="trash" :s="12" /> {{ $t('ceremly.event.reminders.btnDelete') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.skel {
    background: var(--bone-200);
    border-radius: 10px;
    animation: skel-pulse 1.2s ease-in-out infinite;
}

@keyframes skel-pulse {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
}
</style>
