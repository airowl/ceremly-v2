<script setup lang="ts">
// New event wizard — port of docs/ui/project/screens/onboarding.jsx (F4).
// "choose" phase = event type + template (as in the mockup, a single screen),
// "details" phase = details; POST /api/events → redirect to editor.
// The Guests/Send steps are in the stepper but completed in their dedicated pages.
import CerIcon from "~/components/ceremly/CerIcon.vue";
import Stepper from "~/components/ceremly/Stepper.vue";
import { EVENT_TYPES, type EventTypeKey } from "~~/shared/constants/eventTypes";
import { getTemplatesByType, getTemplate, type InviteTemplate } from "~~/shared/constants/templates";
import type { InviteBlock } from "~~/shared/types/ceremly";
import { useEvents } from "~/composables/useEvents";

definePageMeta({
    layout: "ceremly",
});

const { t } = useI18n();

useHead({ title: t("ceremly.event.new.pageTitle") });

const crumbs = useState<string[]>("ceremly-crumbs", () => []);
crumbs.value = [t("ceremly.event.new.crumbEvents"), t("ceremly.event.new.crumbNew")];

const STEPS = computed(() => [
    t("ceremly.event.new.stepEventType"),
    t("ceremly.event.new.stepTemplate"),
    t("ceremly.event.new.stepDetails"),
    t("ceremly.event.new.stepGuests"),
    t("ceremly.event.new.stepSend"),
]);
const ONBOARDING_TYPE_KEY = "ceremly:onboarding-type";

// ─── Wizard state ────────────────────────────────────────────────────
const phase = ref<"choose" | "details">("choose");
const stepperCurrent = computed(() => (phase.value === "choose" ? 1 : 2));

const eventType = ref<EventTypeKey>("matrimonio");
const templateKey = ref<string | null>(null);

const title = ref("");
const eventDate = ref("");
const eventTime = ref("");
const locationName = ref("");
const locationAddress = ref("");

const { createEvent } = useEvents();
const creating = ref(false);
const createError = ref<string | null>(null);
const planLimitMessage = ref<string | null>(null);

// Type pre-selection from signup (localStorage, never backend)
onMounted(() => {
    const saved = localStorage.getItem(ONBOARDING_TYPE_KEY);
    if (saved && EVENT_TYPES.some((et) => et.key === saved)) {
        eventType.value = saved as EventTypeKey;
    }
});

function selectType(key: EventTypeKey) {
    eventType.value = key;
    if (import.meta.client) {
        localStorage.setItem(ONBOARDING_TYPE_KEY, key);
    }
}

// ─── Templates for the selected type ───────────────────────────────────
const templates = computed(() => getTemplatesByType(eventType.value));

// On type change, the first template is pre-selected (as in the mockup)
watch(
    eventType,
    () => {
        templateKey.value = templates.value[0]?.key ?? null;
    },
    { immediate: true },
);

const selectedTemplate = computed(() =>
    templateKey.value ? getTemplate(templateKey.value) ?? null : null,
);

const typeLabel = computed(
    () => EVENT_TYPES.find((et) => et.key === eventType.value)?.key
        ? t(`ceremly.eventType.${eventType.value}.label`)
        : eventType.value,
);

// Mini invite preview: text taken from the template's own defaultBlocks
type HeaderBlock = Extract<InviteBlock, { type: "header" }>;
type LocationBlock = Extract<InviteBlock, { type: "location" }>;

function headerOf(t: InviteTemplate): HeaderBlock["data"] {
    const block = t.defaultBlocks.find((b): b is HeaderBlock => b.type === "header");
    return block?.data ?? { eyebrow: "", intro: "", names: [t.name], dateText: "", timeText: "" };
}

function locationNameOf(t: InviteTemplate): string {
    const block = t.defaultBlocks.find((b): b is LocationBlock => b.type === "location");
    return block?.data.name ?? "";
}

const templateCards = computed(() =>
    templates.value.map((tmpl) => {
        const header = headerOf(tmpl);
        return {
            key: tmpl.key,
            name: tmpl.name,
            tone: tmpl.tone,
            accent: tmpl.accent,
            eyebrow: header.eyebrow,
            dateText: header.dateText,
            intro: header.intro,
            names: header.names,
            locationName: locationNameOf(tmpl),
        };
    }),
);

// ─── Details: title hint per type ──────────────────────────────────
const titleHint = computed(() => ({
    placeholder: t(`ceremly.event.new.titleHint.${eventType.value}.placeholder`),
    hint: t(`ceremly.event.new.titleHint.${eventType.value}.hint`),
}));

// ─── Phase navigation ────────────────────────────────────────────────
function scrollPageTop() {
    if (import.meta.client) {
        document.querySelector(".cer-page")?.scrollTo({ top: 0 });
    }
}

function goBack() {
    if (phase.value === "details") {
        phase.value = "choose";
        scrollPageTop();
    } else {
        navigateTo("/dashboard");
    }
}

function goToDetails() {
    if (!selectedTemplate.value) return;
    phase.value = "details";
    scrollPageTop();
}

// ─── Creation ───────────────────────────────────────────────────────
const canCreate = computed(
    () => title.value.trim().length > 0 && !!selectedTemplate.value && !creating.value,
);

async function submit() {
    if (!canCreate.value || !selectedTemplate.value) return;
    creating.value = true;
    createError.value = null;
    planLimitMessage.value = null;
    try {
        const created = await createEvent({
            type: eventType.value,
            templateKey: selectedTemplate.value.key,
            title: title.value.trim(),
            eventDate: eventDate.value || undefined,
            eventTime: eventTime.value || undefined,
            locationName: locationName.value.trim() || undefined,
            locationAddress: locationAddress.value.trim() || undefined,
        });
        await navigateTo(`/dashboard/events/${created.id}/editor`);
    } catch (e) {
        const err = e as {
            statusCode?: number;
            status?: number;
            data?: { statusCode?: number, statusMessage?: string, message?: string };
        };
        const status = err.statusCode ?? err.status ?? err.data?.statusCode;
        if (status === 402) {
            planLimitMessage.value
                = err.data?.statusMessage
                    || err.data?.message
                    || t("ceremly.event.new.errorPlanLimit");
        } else {
            createError.value
                = err.data?.statusMessage
                    || err.data?.message
                    || t("ceremly.event.new.errorCreate");
        }
    } finally {
        creating.value = false;
    }
}
</script>

<template>
    <div style="max-width: 1100px; margin: 0 auto;">
        <!-- Stepper -->
        <div style="margin-bottom: 32px;">
            <Stepper :steps="STEPS" :current="stepperCurrent" />
        </div>

        <!-- ─── Phase 1+2: event type + template (as in the mockup) ─── -->
        <template v-if="phase === 'choose'">
            <h1>{{ $t('ceremly.event.new.chooseTypeHeading') }}</h1>
            <p class="h-sub" style="max-width: 560px;">
                {{ $t('ceremly.event.new.chooseTypeSubheading') }}
            </p>

            <!-- Type cards -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 24px;">
                <div
                    v-for="et in EVENT_TYPES"
                    :key="et.key"
                    :style="{
                        padding: '20px',
                        border: '1px solid ' + (eventType === et.key ? 'var(--ink)' : 'var(--bone-200)'),
                        background: eventType === et.key ? 'var(--ink)' : 'var(--bone-50)',
                        color: eventType === et.key ? 'var(--bone-50)' : 'var(--ink)',
                        borderRadius: '14px',
                        cursor: 'pointer',
                        transition: 'transform 150ms',
                    }"
                    @click="selectType(et.key)"
                >
                    <CerIcon :name="et.icon" :s="26" />
                    <div class="serif" style="font-size: 22px; margin-top: 14px; letter-spacing: -0.01em;">{{ $t(`ceremly.eventType.${et.key}.label`) }}</div>
                    <div
                        :style="{
                            fontSize: '12px',
                            marginTop: '4px',
                            color: eventType === et.key ? 'var(--bone-200)' : 'var(--ink-500)',
                        }"
                    >{{ $t(`ceremly.eventType.${et.key}.desc`) }}</div>
                </div>
            </div>

            <!-- Templates -->
            <div class="row" style="margin-top: 36px; justify-content: space-between;">
                <div>
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.step2Label') }}</div>
                    <div class="serif" style="font-size: 28px; margin-top: 4px;">{{ $t('ceremly.event.new.chooseTemplateHeading') }}</div>
                </div>
                <div class="small muted">{{ $t('ceremly.event.new.templateCount', { count: templateCards.length, type: typeLabel.toLowerCase() }) }}</div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 18px;">
                <div
                    v-for="c in templateCards"
                    :key="c.key"
                    :style="{
                        border: '1px solid ' + (templateKey === c.key ? 'var(--ink)' : 'var(--bone-200)'),
                        borderRadius: '14px',
                        overflow: 'hidden',
                        background: 'var(--bone-50)',
                        cursor: 'pointer',
                        boxShadow: templateKey === c.key ? '0 0 0 3px var(--bone-200)' : 'none',
                    }"
                    @click="templateKey = c.key"
                >
                    <!-- preview: mini-invite with the template's text -->
                    <div
                        :style="{
                            aspectRatio: '3 / 4',
                            background: `linear-gradient(160deg, color-mix(in oklch, ${c.accent} 10%, var(--bone-50)), var(--bone-50))`,
                            padding: '22px',
                            display: 'flex',
                            flexDirection: 'column',
                            borderBottom: '1px solid var(--bone-200)',
                        }"
                    >
                        <div
                            class="mono"
                            :style="{
                                fontSize: '9px',
                                letterSpacing: '0.18em',
                                color: c.accent,
                                textAlign: 'center',
                                textTransform: 'uppercase',
                            }"
                        >
                            {{ c.eyebrow }}<template v-if="c.dateText"> · {{ c.dateText }}</template>
                        </div>
                        <div style="flex: 1; display: flex; align-items: center; justify-content: center; text-align: center;">
                            <div>
                                <div class="serif" style="font-size: 14px; color: var(--ink-500); font-style: italic;">{{ c.intro }}</div>
                                <div
                                    class="serif"
                                    :style="{
                                        fontSize: '32px',
                                        lineHeight: 1.05,
                                        marginTop: '8px',
                                        color: c.accent,
                                        letterSpacing: '-0.01em',
                                    }"
                                >
                                    <template v-for="(name, i) in c.names" :key="i">
                                        <em>{{ name }}</em>
                                        <template v-if="i < c.names.length - 1">
                                            <br><span style="font-size: 14px; color: var(--ink-500); font-style: italic;">e</span><br>
                                        </template>
                                    </template>
                                </div>
                            </div>
                        </div>
                        <div style="text-align: center; color: var(--ink-500); font-size: 10px; font-family: var(--font-mono);">
                            {{ c.locationName }}
                        </div>
                    </div>
                    <div style="padding: 12px;">
                        <div class="row" style="justify-content: space-between;">
                            <div style="font-size: 14px; font-weight: 500;">{{ c.name }}</div>
                            <span v-if="templateKey === c.key" class="pill confirm"><span class="cer-dot" />{{ $t('ceremly.event.new.templateChosen') }}</span>
                        </div>
                        <div class="small muted" style="margin-top: 2px;">{{ c.tone }}</div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ─── Phase 3: details ─── -->
        <template v-else>
            <div class="row" style="justify-content: space-between;">
                <div>
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.step3Label') }}</div>
                    <div class="serif" style="font-size: 28px; margin-top: 4px;">{{ $t('ceremly.event.new.detailsHeading') }}</div>
                </div>
                <div class="small muted">{{ $t('ceremly.event.new.detailsEditorNote') }}</div>
            </div>

            <form class="col" style="gap: 14px; max-width: 560px; margin-top: 24px;" novalidate @submit.prevent="submit">
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.fieldTitle') }}</span>
                    <input v-model="title" class="cer-input" type="text" :placeholder="titleHint.placeholder">
                    <span class="small muted">{{ titleHint.hint }}</span>
                </label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <label class="col" style="gap: 6px;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.fieldDate') }}</span>
                        <input v-model="eventDate" class="cer-input" type="date">
                    </label>
                    <label class="col" style="gap: 6px;">
                        <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.fieldTime') }}</span>
                        <input v-model="eventTime" class="cer-input" type="time">
                    </label>
                </div>
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.fieldLocationName') }}</span>
                    <input v-model="locationName" class="cer-input" type="text" :placeholder="$t('ceremly.event.new.fieldLocationNamePlaceholder')">
                </label>
                <label class="col" style="gap: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.new.fieldAddress') }}</span>
                    <input v-model="locationAddress" class="cer-input" type="text" :placeholder="$t('ceremly.event.new.fieldAddressPlaceholder')">
                </label>
            </form>

            <!-- 402: Free plan limit -->
            <div
                v-if="planLimitMessage"
                class="cer-card"
                style="margin-top: 24px; padding: 24px; max-width: 560px; background: var(--orange-soft); border-color: var(--ink);"
            >
                <div class="serif" style="font-size: 22px; letter-spacing: -0.01em;">{{ $t('ceremly.event.new.planLimitHeading') }}</div>
                <p class="small" style="margin: 8px 0 0; color: var(--ink-700);">{{ planLimitMessage }}</p>
                <div class="row" style="gap: 10px; margin-top: 16px;">
                    <button class="cer-btn dark" type="button" @click="navigateTo('/dashboard/subscription')">
                        <CerIcon name="sparkle" :s="14" /> {{ $t('ceremly.event.new.upgradeCta') }}
                    </button>
                    <button class="cer-btn ghost" type="button" @click="navigateTo('/dashboard')">
                        {{ $t('ceremly.event.new.backToEvents') }}
                    </button>
                </div>
            </div>

            <!-- Generic error -->
            <p v-if="createError" class="small" style="color: var(--decline); margin: 16px 0 0; max-width: 560px;">
                {{ createError }}
            </p>
        </template>

        <!-- Footer -->
        <div class="row" style="margin-top: 36px; justify-content: space-between;">
            <button class="cer-btn ghost" type="button" @click="goBack">
                <CerIcon name="chevR" :s="14" style="transform: rotate(180deg);" /> {{ $t('common.back') }}
            </button>
            <button
                v-if="phase === 'choose'"
                class="cer-btn"
                type="button"
                :disabled="!selectedTemplate"
                :style="!selectedTemplate ? { opacity: 0.5, cursor: 'not-allowed' } : undefined"
                @click="goToDetails"
            >
                {{ $t('ceremly.event.new.continueWith', { name: selectedTemplate?.name ?? $t('ceremly.event.new.templateFallback') }) }} <CerIcon name="chevR" :s="14" />
            </button>
            <button
                v-else
                class="cer-btn"
                type="button"
                :disabled="!canCreate"
                :style="!canCreate ? { opacity: 0.5, cursor: 'not-allowed' } : undefined"
                @click="submit"
            >
                {{ creating ? $t('ceremly.event.new.creating') : $t('ceremly.event.new.createEvent') }} <CerIcon name="chevR" :s="14" />
            </button>
        </div>
    </div>
</template>
