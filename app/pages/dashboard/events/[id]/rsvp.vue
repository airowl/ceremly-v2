<script setup lang="ts">
// Form RSVP builder — port fedele di docs/ui/project/screens/rsvp-builder.jsx.
// Sinistra: lista domande (drag + frecce, attendance fissa a indice 0).
// Destra: inspector (label/tipo/status, opzioni, logica condizionale, anteprima).
// Salvataggio: PUT /api/events/:id { rsvpConfig } con validazione client.
import draggable from "vuedraggable";
import type {
    CeremlyEvent,
    RsvpCondition,
    RsvpQuestion,
    RsvpQuestionType,
} from "~~/shared/types/ceremly";
import CerIcon from "~/components/ceremly/CerIcon.vue";
import CerToggle from "~/components/ceremly/CerToggle.vue";
import RsvpFormRenderer from "~/components/ceremly/RsvpFormRenderer.vue";

definePageMeta({
    layout: "ceremly",
    auth: { only: "user" },
});

const { t, te } = useI18n();
const route = useRoute();
const toast = useToast();
const eventId = computed(() => String(route.params.id ?? ""));

const QUESTION_TYPE_LABELS = computed<Record<RsvpQuestionType, string>>(() => ({
    text: t("ceremly.event.rsvp.typeText"),
    single: t("ceremly.event.rsvp.typeSingle"),
    multiple: t("ceremly.event.rsvp.typeMultiple"),
    number: t("ceremly.event.rsvp.typeNumber"),
    boolean: t("ceremly.event.rsvp.typeBoolean"),
}));

const OP_SYMBOLS: Record<RsvpCondition["op"], string> = { eq: "=", neq: "≠", gt: ">" };
const ATTENDANCE_CANONICAL = ["yes", "no", "maybe"] as const;
const ATTENDANCE_FALLBACK_LABELS = computed(() => [
    t("ceremly.event.rsvp.attendanceYes"),
    t("ceremly.event.rsvp.attendanceNo"),
    t("ceremly.event.rsvp.attendanceMaybe"),
]);

// ─── Stato pagina ────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveBtn = useButtonSuccess();
const eventData = ref<CeremlyEvent | null>(null);
const config = ref<RsvpQuestion[]>([]);
const savedSnapshot = ref("[]");
const selectedId = ref<string>("attendance");
const saveErrors = ref<string[]>([]);

// Breadcrumbs + contesto evento condivisi col layout ceremly
const crumbs = useState<string[]>("ceremly-crumbs", () => []);
const eventCtx = useState<{ id: string, title: string, type: string } | null>("ceremly-event-ctx", () => null);

const dirty = computed(() => JSON.stringify(config.value) !== savedSnapshot.value);

/** Estrae il messaggio (statusMessage del server o message) da un errore $fetch. */
function errorMessage(e: unknown): string | undefined {
    const err = e as { data?: { statusMessage?: string }, message?: string } | null;
    return err?.data?.statusMessage || err?.message;
}

const selectedIndex = computed(() => config.value.findIndex(q => q.id === selectedId.value));
const selected = computed<RsvpQuestion | null>(() => config.value[selectedIndex.value] ?? null);

async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`);
        eventData.value = res.event;
        config.value = JSON.parse(JSON.stringify(res.event.rsvpConfig ?? [])) as RsvpQuestion[];
        savedSnapshot.value = JSON.stringify(config.value);
        selectedId.value = config.value[0]?.id ?? "attendance";
        eventCtx.value = { id: res.event.id, title: res.event.title, type: res.event.type };
        const typeKey = `ceremly.eventType.${res.event.type}.label`;
        crumbs.value = [t("ceremly.event.rsvp.breadcrumbEvents"), te(typeKey) ? t(typeKey) : res.event.title, t("ceremly.event.rsvp.breadcrumbRsvp")];
        rebuildOptionRows();
        resetDemo();
    } catch (e) {
        loadError.value = errorMessage(e) || t("ceremly.event.rsvp.loadError");
    } finally {
        loading.value = false;
    }
}

onMounted(load);

// Le modifiche invalidano gli errori dell'ultimo tentativo di salvataggio
watch(config, () => {
    saveErrors.value = [];
}, { deep: true });

// ─── Dirty guard (beforeunload + route leave) ────────────────────────
function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!dirty.value) return;
    e.preventDefault();
    e.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
onBeforeRouteLeave(() => {
    if (dirty.value && !window.confirm(t("ceremly.event.rsvp.unsavedConfirm"))) {
        return false;
    }
});

// ─── Helpers domande ─────────────────────────────────────────────────
function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

function questionTypeLabel(q: RsvpQuestion): string {
    return QUESTION_TYPE_LABELS.value[q.type] ?? q.type;
}

/** Label umana del valore di una condition (per attendance/boolean mappa il canonico). */
function conditionValueLabel(c: RsvpCondition, ref: RsvpQuestion | undefined): string {
    if (ref?.id === "attendance") {
        const idx = ATTENDANCE_CANONICAL.indexOf(c.value as typeof ATTENDANCE_CANONICAL[number]);
        if (idx >= 0) return ref.options?.[idx] ?? ATTENDANCE_FALLBACK_LABELS.value[idx] ?? String(c.value);
    }
    if (ref?.type === "boolean") return String(c.value) === "true" ? t("ceremly.event.rsvp.attendanceYes") : t("ceremly.event.rsvp.attendanceNo");
    return String(c.value);
}

function conditionTagText(q: RsvpQuestion): string | null {
    if (!q.condition) return null;
    const ref = config.value.find(c => c.id === q.condition!.questionId);
    const refLabel = ref?.label ?? "?";
    return t("ceremly.event.rsvp.conditionTag", { ref: refLabel, op: OP_SYMBOLS[q.condition.op], val: conditionValueLabel(q.condition, ref) });
}

/** Condition che (dopo un riordino o una delete) puntano a domande successive o inesistenti. */
const conditionIssues = computed(() => {
    const issues: { id: string, label: string, refLabel: string | null }[] = [];
    config.value.forEach((q, i) => {
        if (!q.condition) return;
        const j = config.value.findIndex(c => c.id === q.condition!.questionId);
        if (j === -1 || j >= i) {
            issues.push({
                id: q.id,
                label: q.label || t("ceremly.event.rsvp.questionFallback", { n: pad2(i + 1) }),
                refLabel: j === -1 ? null : (config.value[j]?.label ?? null),
            });
        }
    });
    return issues;
});

const invalidConditionIds = computed(() => new Set(conditionIssues.value.map(i => i.id)));

const bannerErrors = computed(() => [
    ...conditionIssues.value.map(i => i.refLabel
        ? t("ceremly.event.rsvp.bannerConditionOrder", { label: i.label, refLabel: i.refLabel })
        : t("ceremly.event.rsvp.bannerConditionDeleted", { label: i.label })),
    ...saveErrors.value,
]);

// ─── Selezione + riordino ────────────────────────────────────────────
function selectQuestion(id: string) {
    selectedId.value = id;
}

function moveQuestion(index: number, delta: number) {
    const target = index + delta;
    if (index <= 0 || target <= 0 || target >= config.value.length) return;
    const list = [...config.value];
    const [item] = list.splice(index, 1);
    if (!item) return;
    list.splice(target, 0, item);
    config.value = list;
}

/** Guard drag: attendance non si sposta e nessuno può prendere l'indice 0. */
function onDragMove(evt: { draggedContext?: { element?: RsvpQuestion, futureIndex?: number } }): boolean {
    const ctx = evt?.draggedContext;
    if (!ctx?.element || ctx.element.locked) return false;
    return (ctx.futureIndex ?? 0) > 0;
}

// ─── Aggiunta / eliminazione ─────────────────────────────────────────
function randomQuestionId(): string {
    return `q_${Math.random().toString(36).slice(2, 10)}`;
}

function addQuestion() {
    const q: RsvpQuestion = {
        id: randomQuestionId(),
        label: t("ceremly.event.rsvp.newQuestionLabel"),
        type: "text",
        required: false,
        perPerson: false,
        condition: null,
    };
    config.value = [...config.value, q];
    selectedId.value = q.id;
}

const deleteTarget = ref<RsvpQuestion | null>(null);
const deleteDependents = computed(() =>
    deleteTarget.value
        ? config.value.filter(q => q.condition?.questionId === deleteTarget.value!.id)
        : []);

function askDeleteQuestion(q: RsvpQuestion) {
    if (q.locked) return;
    deleteTarget.value = q;
}

function confirmDeleteQuestion() {
    const target = deleteTarget.value;
    if (!target) return;
    const idx = config.value.findIndex(q => q.id === target.id);
    config.value = config.value
        .filter(q => q.id !== target.id)
        .map(q => (q.condition?.questionId === target.id ? { ...q, condition: null } : q));
    if (selectedId.value === target.id) {
        selectedId.value = config.value[Math.max(0, idx - 1)]?.id ?? "attendance";
    }
    deleteTarget.value = null;
}

// ─── Tipo + opzioni (righe con chiave stabile per il drag) ───────────
let optionKeySeq = 0;
const optionRows = ref<{ k: number, text: string }[]>([]);

function rebuildOptionRows() {
    const q = selected.value;
    optionRows.value = (q?.type === "single" || q?.type === "multiple")
        ? (q.options ?? []).map(text => ({ k: optionKeySeq++, text }))
        : [];
}

function syncOptions() {
    const q = selected.value;
    if (!q || (q.type !== "single" && q.type !== "multiple")) return;
    q.options = optionRows.value.map(r => r.text);
}

function addOption() {
    optionRows.value.push({ k: optionKeySeq++, text: "" });
    syncOptions();
}

function removeOption(index: number) {
    optionRows.value.splice(index, 1);
    syncOptions();
}

function onTypeChange() {
    const q = selected.value;
    if (!q) return;
    if (q.type === "single" || q.type === "multiple") {
        if (!q.options?.length) q.options = [t("ceremly.event.rsvp.defaultOption1"), t("ceremly.event.rsvp.defaultOption2")];
        q.min = undefined;
        q.max = undefined;
    } else if (q.type === "number") {
        q.options = undefined;
        if (typeof q.min !== "number") q.min = 0;
        if (typeof q.max !== "number") q.max = 4;
    } else {
        q.options = undefined;
        q.min = undefined;
        q.max = undefined;
    }
    rebuildOptionRows();
    resetDemo();
}

watch(selectedId, () => {
    rebuildOptionRows();
    resetDemo();
});

// ─── Logica condizionale ─────────────────────────────────────────────
const precedingQuestions = computed(() =>
    selectedIndex.value > 0 ? config.value.slice(0, selectedIndex.value) : []);

const condRef = computed(() => {
    const c = selected.value?.condition;
    return c ? config.value.find(q => q.id === c.questionId) : undefined;
});

const condRefIsForward = computed(() => !!selected.value?.condition
    && !precedingQuestions.value.some(q => q.id === selected.value!.condition!.questionId));

type CondValueMode = "attendance" | "options" | "boolean" | "number" | "text";

const condValueMode = computed<CondValueMode>(() => {
    const c = selected.value?.condition;
    if (!c) return "text";
    if (c.op === "gt") return "number";
    const ref = condRef.value;
    if (!ref) return "text";
    if (ref.id === "attendance") return "attendance";
    if (ref.type === "single" || ref.type === "multiple") return "options";
    if (ref.type === "boolean") return "boolean";
    if (ref.type === "number") return "number";
    return "text";
});

function setConditionActive(on: boolean) {
    const q = selected.value;
    if (!q || q.locked) return;
    q.condition = on ? { questionId: "attendance", op: "eq", value: "yes" } : null;
}

function defaultConditionValue(ref: RsvpQuestion | undefined, op: RsvpCondition["op"]): string | number {
    if (op === "gt") return 0;
    if (!ref) return "";
    if (ref.id === "attendance") return "yes";
    if (ref.type === "single" || ref.type === "multiple") return ref.options?.[0] ?? "";
    if (ref.type === "boolean") return "true";
    if (ref.type === "number") return 0;
    return "";
}

function onCondRefChange() {
    const c = selected.value?.condition;
    if (!c) return;
    const ref = config.value.find(q => q.id === c.questionId);
    if (ref?.type === "number") {
        c.op = "gt";
    } else if (c.op === "gt") {
        c.op = "eq";
    }
    c.value = defaultConditionValue(ref, c.op);
}

function onCondOpChange() {
    const c = selected.value?.condition;
    if (!c) return;
    if (c.op === "gt") {
        const n = Number(c.value);
        c.value = Number.isFinite(n) ? n : 0;
        return;
    }
    // tornando a è/non è da > il valore numerico va ri-mappato sul dominio del ref
    if (typeof c.value === "number" && condRef.value?.type !== "number") {
        c.value = defaultConditionValue(condRef.value, c.op);
    }
}

// ─── Anteprima inline (card destra) ──────────────────────────────────
const demoNumber = ref<number | null>(null);
const demoBool = ref<boolean | null>(null);
const demoSingle = ref<string | null>(null);
const demoMulti = ref<string[]>([]);
const demoText = ref("");

function resetDemo() {
    demoNumber.value = null;
    demoBool.value = null;
    demoSingle.value = null;
    demoMulti.value = [];
    demoText.value = "";
}

function toggleDemoMulti(opt: string) {
    const i = demoMulti.value.indexOf(opt);
    if (i >= 0) demoMulti.value.splice(i, 1);
    else demoMulti.value.push(opt);
}

const demoNumberRange = computed<number[]>(() => {
    const q = selected.value;
    if (!q || q.type !== "number") return [];
    const min = typeof q.min === "number" ? q.min : 0;
    const max = typeof q.max === "number" ? q.max : 4;
    if (max < min || max - min > 11) return [];
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
});

// ─── Deadline (tag cliccabile → input date inline) ───────────────────
const editingDeadline = ref(false);
const deadlineDraft = ref("");
const deadlineInputEl = ref<HTMLInputElement | null>(null);

function toDateInputValue(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const deadlineTagText = computed(() => {
    const iso = eventData.value?.rsvpDeadline;
    if (!iso) return t("ceremly.event.rsvp.deadlineSet");
    const d = new Date(iso);
    return t("ceremly.event.rsvp.deadlineValue", { date: `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}` });
});

function openDeadlineEdit() {
    deadlineDraft.value = toDateInputValue(eventData.value?.rsvpDeadline);
    editingDeadline.value = true;
    nextTick(() => deadlineInputEl.value?.focus());
}

function cancelDeadlineEdit() {
    editingDeadline.value = false;
}

async function commitDeadline() {
    if (!editingDeadline.value) return;
    editingDeadline.value = false;
    const current = toDateInputValue(eventData.value?.rsvpDeadline);
    if (deadlineDraft.value === current) return;
    try {
        const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`, {
            method: "PUT",
            body: { rsvpDeadline: deadlineDraft.value || null },
        });
        eventData.value = res.event;
        toast.add({ title: t("ceremly.event.rsvp.toastDeadlineUpdated"), color: "success" });
    } catch (e) {
        toast.add({
            title: t("ceremly.event.rsvp.toastDeadlineError"),
            description: errorMessage(e),
            color: "error",
        });
    }
}

// ─── Anteprima ospite (modale con RsvpFormRenderer) ──────────────────
const previewOpen = ref(false);
const previewDone = ref(false);

function openPreview() {
    previewDone.value = false;
    previewOpen.value = true;
}

function closePreview() {
    previewOpen.value = false;
}

// ─── Salvataggio ─────────────────────────────────────────────────────
function toIntOr(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Sanifica una copia della config e raccoglie gli errori bloccanti (italiano). */
function buildPayload(): { payload: RsvpQuestion[], errors: string[] } {
    const errors: string[] = [];
    const payload = (JSON.parse(JSON.stringify(config.value)) as RsvpQuestion[]).map((q, i) => {
        q.label = (q.label ?? "").trim();
        if (!q.label) errors.push(t("ceremly.event.rsvp.errorNoLabel", { n: pad2(i + 1) }));

        if (q.type === "single" || q.type === "multiple") {
            q.options = (q.options ?? []).map(o => o.trim()).filter(Boolean);
            if (q.id === "attendance" && q.options.length !== 3) {
                errors.push(t("ceremly.event.rsvp.errorAttendanceOptions"));
            } else if (q.options.length === 0) {
                errors.push(t("ceremly.event.rsvp.errorNoOptions", { label: q.label || t("ceremly.event.rsvp.questionFallback", { n: pad2(i + 1) }) }));
            }
            q.min = undefined;
            q.max = undefined;
        } else if (q.type === "number") {
            q.options = undefined;
            q.min = Math.max(0, toIntOr(q.min, 0));
            q.max = Math.max(0, toIntOr(q.max, 4));
            if (q.max < q.min) {
                errors.push(t("ceremly.event.rsvp.errorMinMax", { label: q.label || t("ceremly.event.rsvp.questionFallback", { n: pad2(i + 1) }) }));
            }
        } else {
            q.options = undefined;
            q.min = undefined;
            q.max = undefined;
        }

        if (q.condition) {
            if (q.condition.op === "gt") q.condition.value = toIntOr(q.condition.value, 0);
            if (typeof q.condition.value === "string" && q.condition.value.trim() === "") {
                errors.push(t("ceremly.event.rsvp.errorConditionEmpty", { label: q.label || t("ceremly.event.rsvp.questionFallback", { n: pad2(i + 1) }) }));
            }
        }
        return q;
    });

    for (const issue of conditionIssues.value) {
        errors.push(issue.refLabel
            ? t("ceremly.event.rsvp.errorConditionOrder", { label: issue.label, refLabel: issue.refLabel })
            : t("ceremly.event.rsvp.errorConditionMissing", { label: issue.label }));
    }
    return { payload, errors };
}

async function save() {
    if (saveBtn.busy || !eventData.value) return;
    const { payload, errors } = buildPayload();
    if (errors.length > 0) {
        saveErrors.value = [...new Set(errors)];
        toast.add({ title: t("ceremly.event.rsvp.toastValidationError"), color: "error" });
        return;
    }
    try {
        await saveBtn.run(async () => {
            const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`, {
                method: "PUT",
                body: { rsvpConfig: payload },
            });
            eventData.value = res.event;
            config.value = payload;
            savedSnapshot.value = JSON.stringify(payload);
            saveErrors.value = [];
            if (!config.value.some(q => q.id === selectedId.value)) {
                selectedId.value = config.value[0]?.id ?? "attendance";
            }
            rebuildOptionRows();
        });
        toast.add({ title: t("ceremly.event.rsvp.toastSaved"), color: "success" });
    } catch (e) {
        toast.add({
            title: t("ceremly.event.rsvp.toastSaveError"),
            description: errorMessage(e),
            color: "error",
        });
    }
}
</script>

<template>
    <div>
        <ClientOnly>
            <Teleport defer to="#ceremly-topbar-actions">
                <button
                    v-if="eventData"
                    class="cer-btn ghost small"
                    type="button"
                    @click="openPreview"
                >
                    <CerIcon name="eye" :s="14" /> {{ $t('ceremly.event.rsvp.previewGuest') }}
                </button>
                <button
                    v-if="eventData"
                    class="cer-btn small"
                    :class="{ success: saveBtn.isSuccess }"
                    type="button"
                    :disabled="saveBtn.busy"
                    :style="saveBtn.isLoading ? { opacity: 0.7, cursor: 'default' } : undefined"
                    @click="save"
                >
                    {{ saveBtn.isLoading ? $t('ceremly.event.rsvp.saving') : saveBtn.isSuccess ? $t('common.saved') : $t('common.save') }}{{ dirty && !saveBtn.busy ? " •" : "" }}
                </button>
            </Teleport>
        </ClientOnly>

        <!-- Loading -->
        <template v-if="loading">
            <div class="skel" style="width: 240px; height: 40px;" />
            <div class="skel" style="width: 380px; height: 16px; margin-top: 10px;" />
            <div style="display: grid; grid-template-columns: 1fr 1.1fr; gap: 20px; margin-top: 24px;">
                <div class="col" style="gap: 8px;">
                    <div v-for="i in 6" :key="i" class="skel" style="height: 74px;" />
                </div>
                <div class="col" style="gap: 16px;">
                    <div class="skel" style="height: 220px;" />
                    <div class="skel" style="height: 120px;" />
                    <div class="skel" style="height: 180px;" />
                </div>
            </div>
        </template>

        <!-- Error -->
        <div v-else-if="loadError" class="cer-card" style="padding: 28px; margin-top: 8px; max-width: 560px;">
            <div class="serif" style="font-size: 22px;">{{ $t('ceremly.event.rsvp.loadErrorTitle') }}</div>
            <div class="small muted" style="margin-top: 8px; color: var(--decline);">{{ loadError }}</div>
            <div class="row" style="gap: 8px; margin-top: 16px;">
                <button class="cer-btn ghost small" type="button" @click="load">{{ $t('common.retry') }}</button>
                <NuxtLink to="/dashboard" class="cer-btn small" style="text-decoration: none;">{{ $t('ceremly.event.rsvp.backToEvents') }}</NuxtLink>
            </div>
        </div>

        <template v-else-if="eventData">
            <h1>{{ $t('ceremly.event.rsvp.pageTitle') }}</h1>
            <div class="h-sub">
                {{ config.length === 1 ? $t('ceremly.event.rsvp.questionCountOne') : $t('ceremly.event.rsvp.questionCountMany', { n: config.length }) }} · {{ $t('ceremly.event.rsvp.presetApplied', { type: eventData.type }) }} ·
                <button
                    v-if="!editingDeadline"
                    class="cer-tag"
                    style="margin-left: 8px; cursor: pointer;"
                    type="button"
                    :title="$t('ceremly.event.rsvp.deadlineEditTitle')"
                    @click="openDeadlineEdit"
                >
                    <CerIcon name="calendar" :s="11" /> {{ deadlineTagText }}
                </button>
                <input
                    v-else
                    ref="deadlineInputEl"
                    v-model="deadlineDraft"
                    type="date"
                    class="cer-input"
                    style="margin-left: 8px; width: 170px; padding: 5px 9px; font-size: 12px; display: inline-block;"
                    @change="commitDeadline"
                    @blur="commitDeadline"
                    @keydown.esc.prevent="cancelDeadlineEdit"
                >
            </div>

            <!-- Warning inline (condition fuori ordine + errori di salvataggio) -->
            <div
                v-if="bannerErrors.length > 0"
                class="cer-card"
                style="margin-top: 16px; padding: 14px 16px; border: 1px solid var(--decline); background: color-mix(in srgb, var(--decline) 7%, white);"
            >
                <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--decline);">
                    {{ $t('ceremly.event.rsvp.bannerTitle') }}
                </div>
                <div class="col" style="gap: 4px; margin-top: 8px;">
                    <span v-for="(err, i) in bannerErrors" :key="i" class="small" style="color: #6E1E0C;">· {{ err }}</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1.1fr; gap: 20px; margin-top: 24px;">
                <!-- ── Lista domande ──────────────────────────────── -->
                <div class="col" style="gap: 8px;">
                    <draggable
                        v-model="config"
                        item-key="id"
                        handle=".qdrag"
                        :move="onDragMove"
                        :animation="150"
                        class="col"
                        style="gap: 8px;"
                    >
                        <template #item="{ element: q, index: qi }">
                            <div
                                class="cer-card"
                                :style="{
                                    padding: '12px 14px',
                                    cursor: 'pointer',
                                    border: '1px solid ' + (selectedId === q.id ? 'var(--ink)' : 'var(--bone-200)'),
                                    background: 'var(--bone-50)',
                                    boxShadow: selectedId === q.id ? '0 1px 0 var(--ink)' : 'none',
                                }"
                                @click="selectQuestion(q.id)"
                            >
                                <div class="row" style="gap: 10px; align-items: flex-start;">
                                    <CerIcon
                                        name="drag"
                                        :s="12"
                                        class="muted"
                                        :class="{ qdrag: !q.locked }"
                                        :style="{ marginTop: '6px', cursor: q.locked ? 'default' : 'grab', flexShrink: 0 }"
                                    />
                                    <div class="mono" style="font-size: 11px; color: var(--ink-400); width: 18px; padding-top: 3px; flex-shrink: 0;">
                                        {{ pad2(qi + 1) }}
                                    </div>
                                    <div class="col" style="flex: 1; gap: 4px;">
                                        <div class="row" style="gap: 6px; align-items: center;">
                                            <span style="font-weight: 500; font-size: 14px;">{{ q.label || $t('ceremly.event.rsvp.questionUntitled') }}</span>
                                            <span v-if="q.required" class="cer-dot" style="background: var(--wine); flex-shrink: 0;" :title="$t('ceremly.event.rsvp.required')" />
                                            <span v-if="q.locked" class="cer-tag" style="font-size: 9px;">BASE</span>
                                        </div>
                                        <div class="row" style="gap: 6px; flex-wrap: wrap;">
                                            <span class="cer-tag">{{ questionTypeLabel(q) }}</span>
                                            <span
                                                v-if="conditionTagText(q)"
                                                class="cer-tag"
                                                style="background: var(--wine-soft); color: var(--wine-deep);"
                                            >{{ conditionTagText(q) }}</span>
                                            <span
                                                v-if="q.perPerson"
                                                class="cer-tag"
                                                style="background: var(--sage-soft); color: var(--blue-deep); border-color: transparent;"
                                            >{{ $t('ceremly.event.rsvp.perPerson') }}</span>
                                            <span
                                                v-if="invalidConditionIds.has(q.id)"
                                                class="cer-tag"
                                                style="background: color-mix(in srgb, var(--decline) 12%, white); color: #6E1E0C; border-color: var(--decline);"
                                            >{{ $t('ceremly.event.rsvp.invalidCondition') }}</span>
                                        </div>
                                    </div>
                                    <div v-if="!q.locked" class="col" style="gap: 0; flex-shrink: 0;">
                                        <button
                                            type="button"
                                            :title="$t('ceremly.event.rsvp.moveUp')"
                                            :disabled="qi <= 1"
                                            :style="{
                                                background: 'none', border: 'none', padding: '1px 2px',
                                                cursor: qi <= 1 ? 'default' : 'pointer',
                                                color: qi <= 1 ? 'var(--ink-300)' : 'var(--ink-500)',
                                                lineHeight: 0,
                                            }"
                                            @click.stop="moveQuestion(qi, -1)"
                                        >
                                            <CerIcon name="chevD" :s="13" style="transform: rotate(180deg);" />
                                        </button>
                                        <button
                                            type="button"
                                            :title="$t('ceremly.event.rsvp.moveDown')"
                                            :disabled="qi >= config.length - 1"
                                            :style="{
                                                background: 'none', border: 'none', padding: '1px 2px',
                                                cursor: qi >= config.length - 1 ? 'default' : 'pointer',
                                                color: qi >= config.length - 1 ? 'var(--ink-300)' : 'var(--ink-500)',
                                                lineHeight: 0,
                                            }"
                                            @click.stop="moveQuestion(qi, 1)"
                                        >
                                            <CerIcon name="chevD" :s="13" />
                                        </button>
                                    </div>
                                    <CerIcon name="chevR" :s="14" class="muted" style="flex-shrink: 0; margin-top: 4px;" />
                                </div>
                            </div>
                        </template>
                    </draggable>

                    <button class="cer-btn ghost small" style="justify-content: center; margin-top: 8px;" type="button" @click="addQuestion">
                        <CerIcon name="plus" :s="12" /> {{ $t('ceremly.event.rsvp.addQuestion') }}
                    </button>
                </div>

                <!-- ── Inspector ─────────────────────────────────── -->
                <div v-if="selected" class="col" style="gap: 16px;">
                    <!-- Card domanda -->
                    <div class="cer-card" style="padding: 20px;">
                        <div class="row" style="justify-content: space-between; align-items: center;">
                            <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                                {{ $t('ceremly.event.rsvp.questionLabel', { n: pad2(selectedIndex + 1) }) }}
                            </div>
                            <button
                                v-if="!selected.locked"
                                class="cer-btn ghost small"
                                style="padding: 6px;"
                                type="button"
                                :title="$t('ceremly.event.rsvp.deleteQuestion')"
                                @click="askDeleteQuestion(selected)"
                            >
                                <CerIcon name="trash" :s="12" />
                            </button>
                        </div>
                        <input
                            v-model="selected.label"
                            class="cer-input"
                            style="margin-top: 10px; font-size: 18px; font-weight: 500; padding: 12px 14px;"
                            :placeholder="$t('ceremly.event.rsvp.questionTextPlaceholder')"
                        >

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
                            <div class="col" style="gap: 4px;">
                                <label class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.rsvp.labelType') }}</label>
                                <select
                                    v-model="selected.type"
                                    class="cer-input"
                                    :disabled="selected.locked"
                                    :style="selected.locked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined"
                                    @change="onTypeChange"
                                >
                                    <option value="text">{{ $t('ceremly.event.rsvp.typeText') }}</option>
                                    <option value="single">{{ $t('ceremly.event.rsvp.typeSingle') }}</option>
                                    <option value="multiple">{{ $t('ceremly.event.rsvp.typeMultiple') }}</option>
                                    <option value="number">{{ $t('ceremly.event.rsvp.typeNumber') }}</option>
                                    <option value="boolean">{{ $t('ceremly.event.rsvp.typeBoolean') }}</option>
                                </select>
                            </div>
                            <div class="col" style="gap: 4px;">
                                <label class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.rsvp.labelStatus') }}</label>
                                <div class="row" style="gap: 8px; margin-top: 4px;">
                                    <CerToggle v-model="selected.required" :label="$t('ceremly.event.rsvp.required')" />
                                    <div
                                        :style="selected.locked ? { opacity: 0.45, pointerEvents: 'none' } : undefined"
                                        :title="selected.locked ? $t('ceremly.event.rsvp.perPersonLockedTitle') : undefined"
                                    >
                                        <CerToggle v-model="selected.perPerson" :label="$t('ceremly.event.rsvp.perPerson')" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Opzioni (single/multiple) -->
                        <div v-if="selected.type === 'single' || selected.type === 'multiple'" class="col" style="margin-top: 16px; gap: 6px;">
                            <label class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.rsvp.labelOptions') }}</label>

                            <template v-if="selected.locked">
                                <div v-for="(row, oi) in optionRows" :key="row.k" class="row" style="gap: 8px;">
                                    <span class="mono" style="font-size: 10px; color: var(--ink-400); width: 12px;">{{ oi + 1 }}</span>
                                    <input v-model="row.text" class="cer-input" :placeholder="$t('ceremly.event.rsvp.optionTextPlaceholder')" @input="syncOptions">
                                </div>
                                <span class="small muted" style="margin-top: 2px;">
                                    {{ $t('ceremly.event.rsvp.attendanceOptionsHint') }}
                                </span>
                            </template>

                            <template v-else>
                                <draggable
                                    v-model="optionRows"
                                    item-key="k"
                                    handle=".odrag"
                                    :animation="150"
                                    class="col"
                                    style="gap: 6px;"
                                    @end="syncOptions"
                                >
                                    <template #item="{ element: row, index: oi }">
                                        <div class="row" style="gap: 8px;">
                                            <CerIcon name="drag" :s="12" class="muted odrag" style="cursor: grab; flex-shrink: 0;" />
                                            <input v-model="row.text" class="cer-input" :placeholder="$t('ceremly.event.rsvp.optionTextPlaceholder')" @input="syncOptions">
                                            <button class="cer-btn ghost small" style="padding: 6px;" type="button" :title="$t('ceremly.event.rsvp.removeOption')" @click="removeOption(oi)">
                                                <CerIcon name="trash" :s="12" />
                                            </button>
                                        </div>
                                    </template>
                                </draggable>
                                <button class="cer-btn ghost small" style="align-self: flex-start;" type="button" @click="addOption">
                                    <CerIcon name="plus" :s="12" /> {{ $t('ceremly.event.rsvp.addOption') }}
                                </button>
                            </template>
                        </div>

                        <!-- Min/Max (number) -->
                        <div v-else-if="selected.type === 'number'" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
                            <div class="col" style="gap: 4px;">
                                <label class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.rsvp.labelMin') }}</label>
                                <input v-model.number="selected.min" type="number" min="0" class="cer-input" placeholder="0">
                            </div>
                            <div class="col" style="gap: 4px;">
                                <label class="mono" style="font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.rsvp.labelMax') }}</label>
                                <input v-model.number="selected.max" type="number" min="0" class="cer-input" placeholder="4">
                            </div>
                        </div>
                    </div>

                    <!-- Logica condizionale -->
                    <div class="cer-card" style="padding: 20px;">
                        <div class="row" style="justify-content: space-between; align-items: center;">
                            <div>
                                <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.rsvp.conditionalLogic') }}</div>
                                <div style="font-size: 14px; margin-top: 4px;">{{ $t('ceremly.event.rsvp.conditionalLogicSub') }}</div>
                            </div>
                            <div
                                :style="selected.locked ? { opacity: 0.45, pointerEvents: 'none' } : undefined"
                                :title="selected.locked ? $t('ceremly.event.rsvp.attendanceAlwaysVisible') : undefined"
                            >
                                <CerToggle :model-value="!!selected.condition" :label="$t('ceremly.event.rsvp.conditionActive')" @update:model-value="setConditionActive" />
                            </div>
                        </div>

                        <div v-if="selected.locked" class="small muted" style="margin-top: 10px;">
                            {{ $t('ceremly.event.rsvp.attendanceAlwaysVisibleHint') }}
                        </div>

                        <div v-else-if="selected.condition" class="row" style="margin-top: 14px; gap: 8px; align-items: stretch;">
                            <select v-model="selected.condition.questionId" class="cer-input" @change="onCondRefChange">
                                <option v-if="condRefIsForward" :value="selected.condition.questionId" disabled>
                                    ⚠ {{ condRef?.label ?? $t('ceremly.event.rsvp.questionDeleted') }}
                                </option>
                                <option v-for="p in precedingQuestions" :key="p.id" :value="p.id">{{ p.label || $t('ceremly.event.rsvp.questionUntitled') }}</option>
                            </select>
                            <select v-model="selected.condition.op" class="cer-input" style="width: 90px; flex-shrink: 0;" @change="onCondOpChange">
                                <option value="eq">{{ $t('ceremly.event.rsvp.opEq') }}</option>
                                <option value="neq">{{ $t('ceremly.event.rsvp.opNeq') }}</option>
                                <option value="gt">&gt;</option>
                            </select>

                            <select
                                v-if="condValueMode === 'attendance'"
                                v-model="selected.condition.value"
                                class="cer-input"
                            >
                                <option
                                    v-for="(canonical, i) in ATTENDANCE_CANONICAL"
                                    :key="canonical"
                                    :value="canonical"
                                >{{ condRef?.options?.[i] ?? ATTENDANCE_FALLBACK_LABELS[i] }}</option>
                            </select>
                            <select
                                v-else-if="condValueMode === 'options'"
                                v-model="selected.condition.value"
                                class="cer-input"
                            >
                                <option v-for="opt in (condRef?.options ?? [])" :key="opt" :value="opt">{{ opt }}</option>
                            </select>
                            <select
                                v-else-if="condValueMode === 'boolean'"
                                v-model="selected.condition.value"
                                class="cer-input"
                            >
                                <option value="true">{{ $t('ceremly.event.rsvp.attendanceYes') }}</option>
                                <option value="false">{{ $t('ceremly.event.rsvp.attendanceNo') }}</option>
                            </select>
                            <input
                                v-else-if="condValueMode === 'number'"
                                v-model.number="selected.condition.value"
                                type="number"
                                class="cer-input"
                                style="width: 120px; flex-shrink: 0;"
                            >
                            <input
                                v-else
                                v-model="selected.condition.value"
                                type="text"
                                class="cer-input"
                                :placeholder="$t('ceremly.event.rsvp.conditionValuePlaceholder')"
                            >
                        </div>
                    </div>

                    <!-- Anteprima ospite (inline) -->
                    <div class="cer-card" style="padding: 20px; background: var(--bone-100);">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                            {{ $t('ceremly.event.rsvp.previewGuest') }}
                        </div>
                        <div style="margin-top: 14px;">
                            <div class="serif" style="font-size: 22px;">{{ selected.label || $t('ceremly.event.rsvp.questionUntitled') }}</div>

                            <!-- number → quadrati -->
                            <div v-if="selected.type === 'number' && demoNumberRange.length > 0" class="row" style="margin-top: 12px; gap: 4px; flex-wrap: wrap;">
                                <button
                                    v-for="n in demoNumberRange"
                                    :key="n"
                                    class="cer-btn ghost"
                                    type="button"
                                    :style="{
                                        width: '44px', height: '44px', justifyContent: 'center', borderRadius: '10px', padding: '0',
                                        background: demoNumber === n ? 'var(--ink)' : 'var(--bone-50)',
                                        color: demoNumber === n ? 'var(--bone-50)' : 'var(--ink)',
                                    }"
                                    @click="demoNumber = n"
                                >
                                    {{ n }}
                                </button>
                            </div>
                            <input
                                v-else-if="selected.type === 'number'"
                                v-model.number="demoNumber"
                                type="number"
                                class="cer-input"
                                :min="selected.min ?? 0"
                                :max="selected.max ?? 4"
                                style="margin-top: 12px; background: var(--bone-50); max-width: 160px;"
                            >

                            <!-- boolean → pill -->
                            <div v-else-if="selected.type === 'boolean'" class="row" style="margin-top: 12px; gap: 8px;">
                                <button
                                    v-for="(lbl, bi) in [$t('ceremly.event.rsvp.attendanceYes'), $t('ceremly.event.rsvp.attendanceNo')]"
                                    :key="lbl"
                                    class="cer-btn ghost"
                                    type="button"
                                    :style="{
                                        borderRadius: '999px',
                                        background: demoBool === (bi === 0) ? 'var(--ink)' : 'var(--bone-50)',
                                        color: demoBool === (bi === 0) ? 'var(--bone-50)' : 'var(--ink)',
                                    }"
                                    @click="demoBool = bi === 0"
                                >
                                    {{ lbl }}
                                </button>
                            </div>

                            <!-- single/multiple → card radio/check -->
                            <div v-else-if="(selected.type === 'single' || selected.type === 'multiple') && (selected.options?.length ?? 0) > 0" class="col" style="margin-top: 12px; gap: 6px;">
                                <div
                                    v-for="(o, oi) in selected.options"
                                    :key="oi"
                                    class="row"
                                    :style="{
                                        padding: '10px 14px',
                                        background: 'var(--bone-50)',
                                        border: '1px solid ' + ((selected.type === 'single' ? demoSingle === o : demoMulti.includes(o)) ? 'var(--ink)' : 'var(--bone-200)'),
                                        borderRadius: '10px',
                                        gap: '10px',
                                        cursor: 'pointer',
                                    }"
                                    @click="selected.type === 'single' ? (demoSingle = o) : toggleDemoMulti(o)"
                                >
                                    <span
                                        :style="{
                                            width: '14px', height: '14px',
                                            borderRadius: selected.type === 'single' ? '50%' : '4px',
                                            border: '1.5px solid ' + ((selected.type === 'single' ? demoSingle === o : demoMulti.includes(o)) ? 'var(--ink)' : 'var(--ink-400)'),
                                            background: (selected.type === 'single' ? demoSingle === o : demoMulti.includes(o)) ? 'var(--ink)' : 'transparent',
                                            display: 'inline-block', flexShrink: 0,
                                        }"
                                    />
                                    <span style="font-size: 14px;">{{ o || $t('ceremly.event.rsvp.optionUntitled') }}</span>
                                </div>
                            </div>
                            <div v-else-if="selected.type === 'single' || selected.type === 'multiple'" class="small muted" style="margin-top: 12px;">
                                {{ $t('ceremly.event.rsvp.previewNoOptions') }}
                            </div>

                            <!-- text → textarea -->
                            <textarea
                                v-else
                                v-model="demoText"
                                class="cer-input"
                                rows="3"
                                :placeholder="$t('ceremly.event.rsvp.previewTextPlaceholder')"
                                style="margin-top: 12px; background: var(--bone-50); resize: vertical;"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ── Modale anteprima ospite (frame mobile 390px) ─────────── -->
        <div
            v-if="previewOpen && eventData"
            style="position: fixed; inset: 0; z-index: 60; background: rgba(63, 54, 34, 0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
            @click.self="closePreview"
        >
            <div class="col" style="gap: 10px; align-items: center;">
                <div
                    class="cer"
                    style="width: 390px; max-width: 92vw; height: min(760px, 84vh); border-radius: 24px; overflow: hidden; border: 2px solid var(--ink); box-shadow: var(--hard); background: var(--bone); display: flex; flex-direction: column;"
                >
                    <div v-if="previewDone" class="col" style="flex: 1; align-items: center; justify-content: center; gap: 12px; padding: 32px; text-align: center;">
                        <span
                            style="width: 56px; height: 56px; border-radius: 50%; background: color-mix(in srgb, var(--confirm) 16%, white); color: var(--confirm); display: inline-flex; align-items: center; justify-content: center;"
                        >
                            <CerIcon name="check" :s="26" :sw="2.5" />
                        </span>
                        <div class="serif" style="font-size: 22px;">{{ $t('ceremly.event.rsvp.previewDoneTitle') }}</div>
                        <div class="small muted">{{ $t('ceremly.event.rsvp.previewDoneHint') }}</div>
                        <button class="cer-btn dark small" style="margin-top: 8px;" type="button" @click="closePreview">{{ $t('ceremly.event.rsvp.closePreview') }}</button>
                    </div>
                    <div v-else class="scroll" style="flex: 1; overflow: auto;">
                        <RsvpFormRenderer
                            :config="config"
                            guest-name="Anna"
                            :host-names="eventData.title"
                            @submit="previewDone = true"
                            @close="closePreview"
                        />
                    </div>
                </div>
                <span class="cer-tag" style="background: var(--bone-50);">{{ $t('ceremly.event.rsvp.previewDemoTag') }}</span>
            </div>
        </div>

        <!-- ── Conferma eliminazione domanda ────────────────────────── -->
        <div
            v-if="deleteTarget"
            class="cer"
            style="position: fixed; inset: 0; z-index: 60; background: rgba(63, 54, 34, 0.45); display: flex; align-items: center; justify-content: center; padding: 24px;"
            @click.self="deleteTarget = null"
        >
            <div class="cer-card" style="padding: 24px; width: 460px; max-width: 92vw; background: var(--bone-50); box-shadow: var(--hard);">
                <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.rsvp.deleteTitle') }}</div>
                <div class="small muted" style="margin-top: 8px; line-height: 1.5;">
                    {{ $t('ceremly.event.rsvp.deleteBody', { label: deleteTarget.label || $t('ceremly.event.rsvp.questionUntitled') }) }}
                </div>
                <div
                    v-if="deleteDependents.length > 0"
                    style="margin-top: 12px; padding: 12px; border-radius: 8px; background: var(--wine-soft); color: var(--wine-deep); font-size: 13px; line-height: 1.5;"
                >
                    <strong>{{ $t('ceremly.event.rsvp.deleteWarningLabel') }}</strong>
                    {{ deleteDependents.length === 1
                        ? $t('ceremly.event.rsvp.deleteWarningBodyOne', { deps: deleteDependents.map(d => `«${d.label}»`).join(", ") })
                        : $t('ceremly.event.rsvp.deleteWarningBodyMany', { count: deleteDependents.length, deps: deleteDependents.map(d => `«${d.label}»`).join(", ") }) }}
                </div>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 18px;">
                    <button class="cer-btn ghost small" type="button" @click="deleteTarget = null">{{ $t('common.cancel') }}</button>
                    <button
                        class="cer-btn small"
                        type="button"
                        style="background: var(--decline); border-color: var(--ink); color: #fff;"
                        @click="confirmDeleteQuestion"
                    >
                        <CerIcon name="trash" :s="12" /> {{ $t('ceremly.event.rsvp.deleteConfirm') }}
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
