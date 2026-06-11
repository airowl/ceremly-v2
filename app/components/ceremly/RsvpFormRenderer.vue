<script setup lang="ts">
// Form RSVP multi-step — port di RSVPMobile (docs/ui/project/screens/rsvp-mobile.jsx).
// Flusso: step 1 attendance → (no: messaggio di declino → submit) | (yes/maybe:
// una domanda visibile per step, perPerson replicata per self + accompagnatori).
// Componente puro mobile-first: nessun fetch, emit submit(payload) / close.
import type { CSSProperties } from "vue";
import type {
    AttendingStatus,
    RsvpAnswers,
    RsvpAnswerValue,
    RsvpPerPersonAnswer,
    RsvpQuestion,
} from "~~/shared/types/ceremly";
import { getVisibleQuestions } from "~~/shared/utils/rsvpLogic";
import CerIcon from "./CerIcon.vue";

const { t } = useI18n();

interface RsvpSubmitPayload {
    attending: AttendingStatus;
    companionsCount: number;
    answers: RsvpAnswers;
    declineMessage: string | null;
}

const props = withDefaults(
    defineProps<{
        config: RsvpQuestion[];
        initialResponse?: {
            attending: AttendingStatus;
            companionsCount: number;
            answers: RsvpAnswers;
            declineMessage: string | null;
        } | null;
        guestName?: string | null;
        /** Titolo evento nell'header sticky (es. "Giulia & Tommaso"). */
        hostNames?: string;
        submitting?: boolean;
    }>(),
    {
        initialResponse: null,
        guestName: null,
        hostNames: "",
        submitting: false,
    },
);

const emit = defineEmits<{
    submit: [payload: RsvpSubmitPayload];
    close: [];
}>();

// ---------------------------------------------------------------------------
// Stato risposta in costruzione
// ---------------------------------------------------------------------------

const state = reactive({
    attending: null as AttendingStatus | null,
    answers: {} as RsvpAnswers,
    declineMessage: "",
});
const stepIndex = ref(0);
const stepError = ref<string | null>(null);

watch(
    () => props.initialResponse,
    (resp) => {
        if (!resp) return;
        state.attending = resp.attending;
        state.answers = JSON.parse(JSON.stringify(resp.answers ?? {})) as RsvpAnswers;
        state.declineMessage = resp.declineMessage ?? "";
        if (resp.companionsCount > 0 && state.answers.companions_count === undefined) {
            state.answers.companions_count = resp.companionsCount;
        }
    },
    { immediate: true },
);

watch(stepIndex, () => {
    stepError.value = null;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPerPersonShape(v: unknown): v is RsvpPerPersonAnswer {
    return (
        typeof v === "object"
        && v !== null
        && !Array.isArray(v)
        && Array.isArray((v as RsvpPerPersonAnswer).companions)
    );
}

/** Vuoto = nessuna risposta (false e 0 sono risposte valide). */
function isEmpty(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

// ---------------------------------------------------------------------------
// Attendance (mapping POSIZIONALE options → yes/no/maybe)
// ---------------------------------------------------------------------------

const ATTENDANCE_VALUES: AttendingStatus[] = ["yes", "no", "maybe"];
const ATTENDANCE_SUBTITLES = computed(() => [
    t("ceremly.rsvpForm.attendanceSubtitleYes"),
    t("ceremly.rsvpForm.attendanceSubtitleNo"),
    t("ceremly.rsvpForm.attendanceSubtitleMaybe"),
]);
const FALLBACK_ATTENDANCE_OPTIONS = computed(() => [
    t("ceremly.rsvpForm.attendanceOptionYes"),
    t("ceremly.rsvpForm.attendanceOptionNo"),
    t("ceremly.rsvpForm.attendanceOptionMaybe"),
]);

const attendanceOptions = computed<string[]>(() => {
    const q = props.config.find(c => c.id === "attendance");
    return q?.options?.length ? q.options.slice(0, 3) : FALLBACK_ATTENDANCE_OPTIONS.value;
});

const attendanceQuestion = computed(() => props.config.find(c => c.id === "attendance"));

// Label personalizzata dal builder, se diversa dal default "Partecipi?";
// altrimenti il saluto personale col nome dell'ospite (come da mockup).
const attendanceTitle = computed(() => {
    const label = attendanceQuestion.value?.label?.trim();
    if (label && label !== "Partecipi?") return label;
    const name = props.guestName?.trim();
    return name ? t("ceremly.rsvpForm.attendanceTitleWithName", { name }) : t("ceremly.rsvpForm.attendanceTitle");
});

const attendanceSubtitle = computed(() =>
    attendanceQuestion.value?.description?.trim() || t("ceremly.rsvpForm.attendanceSubtitleDefault"));

function isAttendanceSelected(i: number): boolean {
    return state.attending !== null && state.attending === ATTENDANCE_VALUES[i];
}

function selectAttendance(i: number) {
    stepError.value = null;
    state.attending = ATTENDANCE_VALUES[i] ?? "maybe";
}

// ---------------------------------------------------------------------------
// Step (gruppi di domande)
// ---------------------------------------------------------------------------

type Step = { kind: "attendance" } | { kind: "decline" } | { kind: "question"; question: RsvpQuestion };

const evalAnswers = computed<RsvpAnswers>(() => {
    const a: RsvpAnswers = { ...state.answers };
    if (state.attending) a.attendance = state.attending;
    return a;
});

const companionsCount = computed(() => {
    const raw = state.answers.companions_count;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
});

const visibleQuestions = computed(() => getVisibleQuestions(props.config, evalAnswers.value));

const steps = computed<Step[]>(() => {
    const list: Step[] = [{ kind: "attendance" }];
    if (state.attending === "no") {
        list.push({ kind: "decline" });
        return list;
    }
    for (const q of visibleQuestions.value) {
        if (q.id === "attendance") continue;
        // scope 'companions' senza accompagnatori: nessuna sezione da mostrare
        if (q.perPerson && (q.perPersonScope ?? "all") === "companions" && companionsCount.value === 0) continue;
        list.push({ kind: "question", question: q });
    }
    return list;
});

watch(steps, (s) => {
    if (stepIndex.value > s.length - 1) stepIndex.value = Math.max(0, s.length - 1);
});

const currentStep = computed<Step>(() => steps.value[Math.min(stepIndex.value, steps.value.length - 1)] ?? { kind: "attendance" });
const currentQuestion = computed<RsvpQuestion | null>(() => {
    const s = currentStep.value;
    return s.kind === "question" ? s.question : null;
});
const isLastStep = computed(() => stepIndex.value >= steps.value.length - 1);

const progressTotal = computed(() => steps.value.length);
const progressCurrent = computed(() => Math.min(stepIndex.value + 1, progressTotal.value));

// ---------------------------------------------------------------------------
// Persone (self + accompagnatori) per le domande perPerson
// ---------------------------------------------------------------------------

interface PersonSlot {
    kind: "flat" | "self" | "companion";
    index: number;
    name: string;
}

const selfName = computed(() => props.guestName?.trim() || t("ceremly.rsvpForm.selfName"));

const companionNames = computed<string[]>(() => {
    const cn = state.answers.companion_names;
    const list = isPerPersonShape(cn) ? cn.companions : [];
    return Array.from({ length: companionsCount.value }, (_, i) => {
        const v = list[i];
        return typeof v === "string" && v.trim() ? v.trim() : t("ceremly.rsvpForm.companionFallbackName", { n: i + 1 });
    });
});

function personSlotsFor(q: RsvpQuestion): PersonSlot[] {
    if (!q.perPerson) return [{ kind: "flat", index: -1, name: "" }];
    const slots: PersonSlot[] = [];
    if ((q.perPersonScope ?? "all") !== "companions") {
        slots.push({ kind: "self", index: -1, name: selfName.value });
    }
    for (let i = 0; i < companionsCount.value; i++) {
        slots.push({ kind: "companion", index: i, name: companionNames.value[i] ?? t("ceremly.rsvpForm.companionFallbackName", { n: i + 1 }) });
    }
    return slots;
}

// ---------------------------------------------------------------------------
// Lettura/scrittura risposte
// ---------------------------------------------------------------------------

function getAnswer(q: RsvpQuestion, slot: PersonSlot): RsvpAnswerValue | null | undefined {
    const raw = state.answers[q.id];
    if (!q.perPerson) return isPerPersonShape(raw) ? undefined : raw;
    if (!isPerPersonShape(raw)) return undefined;
    return slot.kind === "companion" ? raw.companions[slot.index] : raw.self;
}

function setAnswer(q: RsvpQuestion, slot: PersonSlot, value: RsvpAnswerValue) {
    stepError.value = null;
    if (!q.perPerson) {
        state.answers[q.id] = value;
        return;
    }
    if (!isPerPersonShape(state.answers[q.id])) {
        state.answers[q.id] = { self: null, companions: [] };
    }
    const entry = state.answers[q.id] as RsvpPerPersonAnswer;
    if (slot.kind === "companion") entry.companions[slot.index] = value;
    else entry.self = value;
}

function isOptionChecked(q: RsvpQuestion, slot: PersonSlot, option: string): boolean {
    const v = getAnswer(q, slot);
    return Array.isArray(v) && v.includes(option);
}

function toggleMultiple(q: RsvpQuestion, slot: PersonSlot, option: string) {
    const cur = getAnswer(q, slot);
    const arr = Array.isArray(cur) ? [...cur] : [];
    const i = arr.indexOf(option);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(option);
    setAnswer(q, slot, arr);
}

function textValue(q: RsvpQuestion, slot: PersonSlot): string {
    const v = getAnswer(q, slot);
    return typeof v === "string" ? v : "";
}

function numberRange(q: RsvpQuestion): number[] {
    const min = q.min ?? 0;
    const max = q.max ?? 4;
    const out: number[] = [];
    for (let n = min; n <= max; n++) out.push(n);
    return out;
}

const companionsNote = computed(() =>
    companionsCount.value === 1
        ? t("ceremly.rsvpForm.companionsNoteSingular")
        : t("ceremly.rsvpForm.companionsNotePlural", { count: companionsCount.value }),
);

// ---------------------------------------------------------------------------
// Tag contestuali + sottotitoli
// ---------------------------------------------------------------------------

function showAttendanceTag(q: RsvpQuestion): boolean {
    return q.condition?.questionId === "attendance" && q.condition.op === "eq" && q.condition.value === "yes";
}

function hasTags(q: RsvpQuestion): boolean {
    return showAttendanceTag(q) || q.perPerson;
}

function questionSubtitle(q: RsvpQuestion): string | null {
    if (q.description) return q.required ? q.description : `${q.description} · ${t("ceremly.rsvpForm.optional")}`;
    if (!q.required) return t("ceremly.rsvpForm.optionalAnswer");
    return null;
}

function slotAriaLabel(q: RsvpQuestion, slot: PersonSlot): string {
    return slot.name ? `${q.label} — ${slot.name}` : q.label;
}

// ---------------------------------------------------------------------------
// Validazione + navigazione + submit
// ---------------------------------------------------------------------------

function validateCurrentStep(): boolean {
    const step = currentStep.value;
    if (step.kind === "attendance") {
        if (!state.attending) {
            stepError.value = t("ceremly.rsvpForm.errorSelectAttendance");
            return false;
        }
        return true;
    }
    if (step.kind === "decline") return true;
    const q = step.question;
    if (!q.required || state.attending === "no") return true;
    for (const slot of personSlotsFor(q)) {
        if (isEmpty(getAnswer(q, slot))) {
            stepError.value = q.perPerson
                ? t("ceremly.rsvpForm.errorRequiredPerPerson")
                : t("ceremly.rsvpForm.errorRequired");
            return false;
        }
    }
    return true;
}

function goBack() {
    stepError.value = null;
    if (stepIndex.value > 0) stepIndex.value -= 1;
}

function goNext() {
    if (props.submitting) return;
    if (!validateCurrentStep()) return;
    stepError.value = null;
    if (isLastStep.value) {
        submit();
        return;
    }
    stepIndex.value += 1;
}

function submit() {
    if (!state.attending) return;
    const count = state.attending === "no" ? 0 : companionsCount.value;
    const answers: RsvpAnswers = {};
    if (state.attending !== "no") {
        for (const q of visibleQuestions.value) {
            if (q.id === "attendance") continue;
            const raw = state.answers[q.id];
            if (raw === undefined) continue;
            if (q.perPerson) {
                if (!isPerPersonShape(raw)) continue;
                answers[q.id] = {
                    self: (q.perPersonScope ?? "all") === "companions" ? null : raw.self ?? null,
                    companions: raw.companions.slice(0, count).map(v => v ?? ""),
                };
            }
            else {
                answers[q.id] = raw;
            }
        }
    }
    emit("submit", {
        attending: state.attending,
        companionsCount: count,
        answers,
        declineMessage: state.attending === "no" ? state.declineMessage.trim() || null : null,
    });
}

// ---------------------------------------------------------------------------
// Stili riusati (port 1:1 degli inline style del mockup)
// ---------------------------------------------------------------------------

function attendanceCardStyle(i: number): CSSProperties {
    const on = isAttendanceSelected(i);
    return {
        padding: "16px",
        borderRadius: "14px",
        border: "1.5px solid " + (on ? "var(--wine)" : "var(--bone-200)"),
        background: on ? "var(--wine-soft)" : "var(--bone-50)",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
    };
}

function attendanceRadioStyle(i: number): CSSProperties {
    const on = isAttendanceSelected(i);
    return {
        width: "22px",
        height: "22px",
        borderRadius: "50%",
        border: "1.5px solid " + (on ? "var(--wine)" : "var(--ink-300)"),
        background: on ? "var(--wine)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--ink)",
        flexShrink: 0,
    };
}

function numberBtnStyle(on: boolean): CSSProperties {
    return {
        flex: "1",
        minWidth: "48px",
        height: "56px",
        borderRadius: "14px",
        border: "1.5px solid " + (on ? "var(--ink)" : "var(--bone-200)"),
        background: on ? "var(--ink)" : "var(--bone-50)",
        color: on ? "var(--bone-50)" : "var(--ink)",
        fontFamily: "var(--font-display)",
        fontSize: "22px",
        cursor: "pointer",
    };
}

function choiceCardStyle(on: boolean): CSSProperties {
    return {
        padding: "14px 16px",
        borderRadius: "12px",
        border: "1.5px solid " + (on ? "var(--ink)" : "var(--bone-200)"),
        background: on ? "var(--bone-100)" : "var(--bone-50)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        color: "var(--ink)",
    };
}

function radioDotStyle(on: boolean): CSSProperties {
    return {
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        border: "1.5px solid " + (on ? "var(--ink)" : "var(--ink-300)"),
        background: on ? "var(--ink)" : "transparent",
        position: "relative",
        display: "inline-block",
        flexShrink: 0,
    };
}

function checkboxStyle(on: boolean): CSSProperties {
    return {
        width: "18px",
        height: "18px",
        borderRadius: "5px",
        border: "1.5px solid " + (on ? "var(--ink)" : "var(--ink-300)"),
        background: on ? "var(--ink)" : "transparent",
        color: "var(--bone-50)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    };
}

function boolPillStyle(on: boolean): CSSProperties {
    return {
        flex: "1",
        padding: "14px",
        borderRadius: "999px",
        border: "1.5px solid " + (on ? "var(--ink)" : "var(--bone-200)"),
        background: on ? "var(--ink)" : "var(--bone-50)",
        color: on ? "var(--bone-50)" : "var(--ink)",
        fontSize: "15px",
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "inherit",
    };
}

const textInputStyle: CSSProperties = {
    marginTop: "6px",
    fontSize: "15px",
    padding: "14px 16px",
    borderRadius: "12px",
};

const backBtnStyle: CSSProperties = {
    padding: "14px 20px",
    background: "transparent",
    color: "var(--ink)",
    border: "1.5px solid var(--bone-200)",
    borderRadius: "14px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
};

const nextBtnStyle = computed<CSSProperties>(() => ({
    flex: "1",
    padding: "14px",
    background: "var(--ink)",
    color: "var(--bone-50)",
    border: "none",
    borderRadius: "14px",
    fontSize: "15px",
    fontWeight: 500,
    cursor: props.submitting ? "default" : "pointer",
    opacity: props.submitting ? 0.7 : 1,
    fontFamily: "inherit",
}));
</script>

<template>
    <div
        class="cer"
        :style="{
            background: 'var(--bone)',
            minHeight: '100%',
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink)',
            display: 'flex',
            flexDirection: 'column',
        }"
    >
        <!-- Header sticky: titolo evento + chiudi + progress a segmenti -->
        <div
            :style="{
                position: 'sticky',
                top: '0',
                zIndex: 5,
                padding: '24px 22px 18px',
                borderBottom: '1px solid var(--bone-200)',
                background: 'var(--bone)',
            }"
        >
            <div class="row" :style="{ justifyContent: 'space-between' }">
                <div class="serif" :style="{ fontSize: '18px' }">{{ hostNames }}</div>
                <button
                    type="button"
                    class="mono small muted"
                    :style="{ background: 'none', border: 'none', cursor: 'pointer' }"
                    @click="emit('close')"
                >
                    {{ $t('ceremly.rsvpForm.close') }}
                </button>
            </div>
            <div class="row" :style="{ marginTop: '14px', gap: '4px' }">
                <div
                    v-for="(_, i) in steps"
                    :key="i"
                    :style="{
                        flex: '1',
                        height: '3px',
                        borderRadius: '999px',
                        background: i <= stepIndex ? 'var(--wine)' : 'var(--bone-200)',
                    }"
                />
            </div>
            <div
                class="mono small muted"
                :style="{ marginTop: '8px', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '10px' }"
            >
                {{ $t('ceremly.rsvpForm.stepCounter', { current: progressCurrent, total: progressTotal }) }}
            </div>
        </div>

        <!-- Step 1: attendance -->
        <div v-if="currentStep.kind === 'attendance'" :style="{ padding: '28px 22px 0' }">
            <div class="serif" :style="{ fontSize: '30px', lineHeight: 1.15, letterSpacing: '-0.01em' }">
                {{ attendanceTitle }}
            </div>
            <div class="small muted" :style="{ marginTop: '8px' }">{{ attendanceSubtitle }}</div>

            <div class="col" :style="{ gap: '10px', marginTop: '22px' }">
                <button
                    v-for="(opt, i) in attendanceOptions"
                    :key="i"
                    type="button"
                    :style="attendanceCardStyle(i)"
                    @click="selectAttendance(i)"
                >
                    <span :style="attendanceRadioStyle(i)">
                        <CerIcon v-if="isAttendanceSelected(i)" name="check" :s="12" :sw="3" />
                    </span>
                    <span class="col" :style="{ lineHeight: 1.3 }">
                        <span
                            :style="{
                                fontSize: '16px',
                                fontWeight: 500,
                                color: isAttendanceSelected(i) ? 'var(--wine-deep)' : 'var(--ink)',
                            }"
                        >{{ opt }}</span>
                        <span
                            class="small"
                            :style="{ color: isAttendanceSelected(i) ? 'var(--wine-deep)' : 'var(--ink-500)' }"
                        >{{ ATTENDANCE_SUBTITLES[i] }}</span>
                    </span>
                </button>
            </div>
        </div>

        <!-- Step declino: messaggio opzionale -->
        <div v-else-if="currentStep.kind === 'decline'" :style="{ padding: '28px 22px 0' }">
            <div class="serif" :style="{ fontSize: '30px', lineHeight: 1.15, letterSpacing: '-0.01em' }">
                {{ $t('ceremly.rsvpForm.declineTitle') }}
            </div>
            <div class="small muted" :style="{ marginTop: '8px' }">
                {{ $t('ceremly.rsvpForm.declineSubtitle') }}
            </div>
            <textarea
                v-model="state.declineMessage"
                class="cer-input"
                rows="4"
                :placeholder="$t('ceremly.rsvpForm.declinePlaceholder')"
                :aria-label="$t('ceremly.rsvpForm.declineAriaLabel')"
                :style="{ marginTop: '22px', fontSize: '15px', padding: '14px 16px', borderRadius: '12px' }"
            />
        </div>

        <!-- Step domanda -->
        <div v-else-if="currentQuestion" :style="{ padding: '28px 22px 0' }">
            <div v-if="hasTags(currentQuestion)" class="row" :style="{ gap: '8px', flexWrap: 'wrap' }">
                <span
                    v-if="showAttendanceTag(currentQuestion)"
                    class="cer-tag"
                    :style="{ background: 'var(--wine-soft)', color: 'var(--wine-deep)' }"
                >{{ $t('ceremly.rsvpForm.tagShownBecauseYes') }}</span>
                <span
                    v-if="currentQuestion.perPerson"
                    class="cer-tag"
                    :style="{ background: 'var(--sage-soft)', color: 'var(--blue-deep)', borderColor: 'transparent' }"
                >{{ $t('ceremly.rsvpForm.tagPerPerson') }}</span>
            </div>

            <div
                v-if="!currentQuestion.perPerson"
                class="serif"
                :style="{ fontSize: '26px', marginTop: hasTags(currentQuestion) ? '14px' : '0', lineHeight: 1.2 }"
            >
                {{ currentQuestion.label }}
            </div>
            <div
                v-if="questionSubtitle(currentQuestion)"
                class="small muted"
                :style="{ marginTop: currentQuestion.perPerson ? '12px' : '8px' }"
            >
                {{ questionSubtitle(currentQuestion) }}
            </div>

            <div
                v-for="(slot, si) in personSlotsFor(currentQuestion)"
                :key="slot.kind + '-' + slot.index"
                :style="{ marginTop: si === 0 ? '18px' : '28px' }"
            >
                <!-- sezione per persona: 'Preferenza menu · Anna' -->
                <div
                    v-if="currentQuestion.perPerson"
                    class="serif"
                    :style="{ fontSize: '22px', marginBottom: '14px' }"
                >
                    {{ currentQuestion.label }} · <em>{{ slot.name }}</em>
                </div>

                <!-- number: bottoni quadrati 56px -->
                <div v-if="currentQuestion.type === 'number'">
                    <div class="row" :style="{ gap: '8px', flexWrap: 'wrap' }">
                        <button
                            v-for="n in numberRange(currentQuestion)"
                            :key="n"
                            type="button"
                            :style="numberBtnStyle(getAnswer(currentQuestion, slot) === n)"
                            @click="setAnswer(currentQuestion, slot, n)"
                        >
                            {{ n }}
                        </button>
                    </div>
                    <div
                        v-if="currentQuestion.id === 'companions_count' && companionsCount > 0"
                        class="small muted"
                        :style="{ marginTop: '10px' }"
                    >
                        {{ companionsNote }}
                    </div>
                </div>

                <!-- single: card radio con pallino -->
                <div v-else-if="currentQuestion.type === 'single'" class="col" :style="{ gap: '8px' }">
                    <button
                        v-for="opt in currentQuestion.options ?? []"
                        :key="opt"
                        type="button"
                        :style="choiceCardStyle(getAnswer(currentQuestion, slot) === opt)"
                        @click="setAnswer(currentQuestion, slot, opt)"
                    >
                        <span :style="radioDotStyle(getAnswer(currentQuestion, slot) === opt)">
                            <span
                                v-if="getAnswer(currentQuestion, slot) === opt"
                                :style="{ position: 'absolute', inset: '4px', background: 'var(--bone-50)', borderRadius: '50%' }"
                            />
                        </span>
                        <span :style="{ fontSize: '15px' }">{{ opt }}</span>
                    </button>
                </div>

                <!-- multiple: card checkbox -->
                <div v-else-if="currentQuestion.type === 'multiple'" class="col" :style="{ gap: '8px' }">
                    <button
                        v-for="opt in currentQuestion.options ?? []"
                        :key="opt"
                        type="button"
                        :style="choiceCardStyle(isOptionChecked(currentQuestion, slot, opt))"
                        @click="toggleMultiple(currentQuestion, slot, opt)"
                    >
                        <span :style="checkboxStyle(isOptionChecked(currentQuestion, slot, opt))">
                            <CerIcon v-if="isOptionChecked(currentQuestion, slot, opt)" name="check" :s="11" :sw="2.5" />
                        </span>
                        <span :style="{ fontSize: '15px' }">{{ opt }}</span>
                    </button>
                </div>

                <!-- boolean: due pill Sì/No -->
                <div v-else-if="currentQuestion.type === 'boolean'" class="row" :style="{ gap: '8px' }">
                    <button
                        type="button"
                        :style="boolPillStyle(getAnswer(currentQuestion, slot) === true)"
                        @click="setAnswer(currentQuestion, slot, true)"
                    >
                        {{ $t('ceremly.rsvpForm.yes') }}
                    </button>
                    <button
                        type="button"
                        :style="boolPillStyle(getAnswer(currentQuestion, slot) === false)"
                        @click="setAnswer(currentQuestion, slot, false)"
                    >
                        {{ $t('ceremly.rsvpForm.no') }}
                    </button>
                </div>

                <!-- text: textarea per domande libere, input per perPerson -->
                <textarea
                    v-else-if="currentQuestion.type === 'text' && !currentQuestion.perPerson"
                    class="cer-input"
                    rows="3"
                    :placeholder="$t('ceremly.rsvpForm.textPlaceholder')"
                    :value="textValue(currentQuestion, slot)"
                    :aria-label="slotAriaLabel(currentQuestion, slot)"
                    :style="textInputStyle"
                    @input="setAnswer(currentQuestion, slot, ($event.target as HTMLTextAreaElement).value)"
                />
                <input
                    v-else-if="currentQuestion.type === 'text'"
                    class="cer-input"
                    type="text"
                    :placeholder="$t('ceremly.rsvpForm.textPlaceholder')"
                    :value="textValue(currentQuestion, slot)"
                    :aria-label="slotAriaLabel(currentQuestion, slot)"
                    :style="textInputStyle"
                    @input="setAnswer(currentQuestion, slot, ($event.target as HTMLInputElement).value)"
                >
            </div>
        </div>

        <!-- Errore di validazione step -->
        <div
            v-if="stepError"
            :style="{ padding: '14px 22px 0', color: 'var(--decline)', fontSize: '13px', fontWeight: 500 }"
        >
            {{ stepError }}
        </div>

        <div class="spacer" />

        <!-- Bottom nav -->
        <div :style="{ padding: '40px 22px 38px', display: 'flex', gap: '10px' }">
            <button v-if="stepIndex > 0" type="button" :style="backBtnStyle" @click="goBack">
                {{ $t('ceremly.rsvpForm.back') }}
            </button>
            <button type="button" :disabled="submitting" :style="nextBtnStyle" @click="goNext">
                {{ submitting ? $t('ceremly.rsvpForm.submitting') : isLastStep ? $t('ceremly.rsvpForm.submit') : $t('common.continue') }}
            </button>
        </div>
    </div>
</template>
