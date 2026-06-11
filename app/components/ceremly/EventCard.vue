<script setup lang="ts">
// Card evento — port di EventCard (docs/ui/project/screens/events-home.jsx):
// header gradient wine/sage per tipo, progress bar RSVP, footer sì/no/in attesa.
import CerIcon from "./CerIcon.vue";

export interface CeremlyEventCardData {
    id: string;
    type: string;
    title: string;
    eventDate?: string | null;
    locationName?: string | null;
    status: string;
    counts: {
        guests: number;
        confirmed: number;
        declined: number;
        pending: number;
    };
}

const props = defineProps<{
    event: CeremlyEventCardData;
}>();

const emit = defineEmits<{
    click: [];
}>();

const { t, te } = useI18n();

// matrimonio/compleanno → wine (camel), laurea/battesimo → sage. Solo struttura (icona/tint); label da i18n.
const TYPE_META: Record<string, { icon: string; tint: "wine" | "sage" }> = {
    matrimonio: { icon: "ring", tint: "wine" },
    compleanno: { icon: "cake", tint: "wine" },
    laurea: { icon: "cap", tint: "sage" },
    battesimo: { icon: "cross", tint: "sage" },
};

const meta = computed(() => {
    const base = TYPE_META[props.event.type] ?? { icon: "events", tint: "sage" as const };
    const key = `ceremly.eventType.${props.event.type}.label`;
    return { ...base, label: te(key) ? t(key) : props.event.type };
});

const statusLabel = computed(() => {
    const key = `ceremly.eventStatus.${props.event.status}`;
    return te(key) ? t(key) : props.event.status;
});

const headerBackground = computed(() =>
    meta.value.tint === "wine"
        ? "linear-gradient(135deg, var(--purple-bright), var(--purple))"
        : "linear-gradient(135deg, var(--blue), var(--sage))",
);

const pct = computed(() => {
    const { guests, confirmed } = props.event.counts;
    return guests > 0 ? Math.round((confirmed / guests) * 100) : 0;
});

const { locale } = useI18n();

const dateLabel = computed(() => {
    if (!props.event.eventDate) return t("ceremly.eventCard.dateTbd");
    const d = new Date(props.event.eventDate);
    if (Number.isNaN(d.getTime())) return t("ceremly.eventCard.dateTbd");
    return new Intl.DateTimeFormat(locale.value === "en" ? "en-US" : "it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(d);
});
</script>

<template>
    <div class="cer-card" style="padding: 0; overflow: hidden; cursor: pointer;" @click="emit('click')">
        <!-- Header strip -->
        <div
            :style="{
                height: '92px',
                background: headerBackground,
                color: 'var(--ink)',
                padding: '16px',
                position: 'relative',
            }"
        >
            <div class="row" style="gap: 8px; opacity: 0.85;">
                <CerIcon :name="meta.icon" :s="14" />
                <span class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;">{{ meta.label }}</span>
            </div>
            <div class="serif" style="font-size: 26px; line-height: 1.15; margin-top: 6px; letter-spacing: -0.01em;">
                {{ event.title }}
            </div>
            <div
                style="position: absolute; top: 14px; right: 14px; background: rgba(63, 54, 34, 0.14); backdrop-filter: blur(8px); padding: 3px 8px; border-radius: 999px; font-size: 11px;"
            >
                {{ statusLabel }}
            </div>
        </div>

        <div style="padding: 16px;">
            <div class="row small muted" style="gap: 6px;">
                <CerIcon name="calendar" :s="13" /> {{ dateLabel }}
            </div>
            <div class="row small muted" style="gap: 6px; margin-top: 4px;">
                <CerIcon name="pin" :s="13" /> {{ event.locationName || t("ceremly.eventCard.locationTbd") }}
            </div>

            <div style="margin-top: 14px;">
                <div class="row" style="justify-content: space-between; margin-bottom: 6px;">
                    <span class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">RSVP</span>
                    <span class="mono small">{{ event.counts.confirmed }}/{{ event.counts.guests }}</span>
                </div>
                <div style="height: 4px; background: var(--bone-100); border-radius: 999px; overflow: hidden;">
                    <div :style="{ height: '100%', width: pct + '%', background: 'var(--ink)' }" />
                </div>
                <div class="row" style="margin-top: 10px; gap: 12px; font-size: 12px; color: var(--ink-700);">
                    <span class="row" style="gap: 4px;"><span class="cer-dot" style="background: var(--confirm);" />{{ event.counts.confirmed }} {{ t("ceremly.eventCard.yes") }}</span>
                    <span class="row" style="gap: 4px;"><span class="cer-dot" style="background: var(--decline);" />{{ event.counts.declined }} {{ t("ceremly.eventCard.no") }}</span>
                    <span class="row" style="gap: 4px;"><span class="cer-dot" style="background: var(--pending);" />{{ event.counts.pending }} {{ t("ceremly.eventCard.pending") }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
