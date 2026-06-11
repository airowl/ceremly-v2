<script setup lang="ts">
// Home eventi — port di docs/ui/project/screens/events-home.jsx (F4).
// KPI aggregate client-side dai counts di GET /api/events, sezioni
// Attivi / Bozze / Conclusi, empty state per zero eventi.
import CerIcon from "~/components/ceremly/CerIcon.vue";
import EventCard from "~/components/ceremly/EventCard.vue";
import KpiCard from "~/components/ceremly/KpiCard.vue";
import { EVENT_TYPES } from "~~/shared/constants/eventTypes";
import type { EventWithCounts } from "~~/shared/types/ceremly";
import { useEvents } from "~/composables/useEvents";

definePageMeta({
    layout: "ceremly",
});

useHead({ title: "I tuoi eventi — Ceremly" });

const crumbs = useState<string[]>("ceremly-crumbs", () => []);
crumbs.value = ["Dashboard"];

// ─── Dati reali ──────────────────────────────────────────────────────
const { listEvents } = useEvents();
const events = ref<EventWithCounts[]>([]);
const pending = ref(true);
const loadError = ref<string | null>(null);

async function load() {
    pending.value = true;
    loadError.value = null;
    try {
        events.value = await listEvents();
    } catch {
        loadError.value = "Non siamo riusciti a caricare i tuoi eventi. Controlla la connessione e riprova.";
    } finally {
        pending.value = false;
    }
}

onMounted(load);

// ─── Sezioni ─────────────────────────────────────────────────────────
const activeEvents = computed(() =>
    events.value
        .filter((e) => e.status === "active")
        .sort((a, b) => {
            // Ordina per data evento crescente, date mancanti in coda
            if (!a.eventDate && !b.eventDate) return 0;
            if (!a.eventDate) return 1;
            if (!b.eventDate) return -1;
            return a.eventDate.localeCompare(b.eventDate);
        }),
);
const draftEvents = computed(() => events.value.filter((e) => e.status === "draft"));
const closedEvents = computed(() => events.value.filter((e) => e.status === "closed"));

const subLine = computed(() => {
    if (pending.value) return "Caricamento dei tuoi eventi…";
    if (loadError.value) return "Qualcosa è andato storto.";
    if (events.value.length === 0) return "Nessun evento ancora — il primo è quello che si ricorda di più.";
    const parts: string[] = [];
    const a = activeEvents.value.length;
    const d = draftEvents.value.length;
    const c = closedEvents.value.length;
    if (a > 0) parts.push(a === 1 ? "1 evento attivo" : `${a} eventi attivi`);
    if (d > 0) parts.push(d === 1 ? "1 bozza" : `${d} bozze`);
    if (c > 0) parts.push(c === 1 ? "1 concluso" : `${c} conclusi`);
    return parts.join(" · ") || "Nessun evento attivo";
});

// ─── KPI client-side dai counts (eventi non conclusi) ────────────────
const statsEvents = computed(() => events.value.filter((e) => e.status !== "closed"));

function sumCounts(key: "guests" | "confirmed" | "declined" | "maybe" | "pending" | "opened" | "sent") {
    return statsEvents.value.reduce((acc, e) => acc + (e.counts?.[key] ?? 0), 0);
}

const totalGuests = computed(() => sumCounts("guests"));
const totalPending = computed(() => sumCounts("pending"));
const totalConfirmed = computed(() => sumCounts("confirmed"));
const totalResponded = computed(
    () => sumCounts("confirmed") + sumCounts("declined") + sumCounts("maybe"),
);
const totalSent = computed(() => sumCounts("sent"));
const totalOpened = computed(() => sumCounts("opened"));

const guestsSub = computed(() => {
    const a = activeEvents.value.length;
    if (a > 0) return a === 1 ? "in 1 evento attivo" : `tra ${a} eventi attivi`;
    const d = draftEvents.value.length;
    if (d > 0) return d === 1 ? "in 1 bozza" : `in ${d} bozze`;
    return "nessun evento attivo";
});

const openRate = computed(() =>
    totalSent.value > 0 ? `${Math.round((totalOpened.value / totalSent.value) * 100)}%` : "—",
);
const openRateSub = computed(() =>
    totalSent.value > 0 ? "obiettivo >70%" : "nessun invito inviato",
);

// ─── Helpers presentazione ───────────────────────────────────────────
function typeMeta(type: string) {
    return EVENT_TYPES.find((t) => t.key === type) ?? { key: type, label: type, icon: "events", desc: "" };
}

function dateLabel(eventDate: string | null) {
    if (!eventDate) return "Data da definire";
    const d = new Date(eventDate);
    if (Number.isNaN(d.getTime())) return "Data da definire";
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

function openEvent(id: string) {
    navigateTo(`/dashboard/events/${id}`);
}

function openEditor(id: string) {
    navigateTo(`/dashboard/events/${id}/editor`);
}

function newEvent() {
    navigateTo("/dashboard/events/new");
}
</script>

<template>
    <div>
        <!-- Azione topbar -->
        <ClientOnly>
            <Teleport defer to="#ceremly-topbar-actions">
                <button class="cer-btn" type="button" @click="newEvent">
                    <CerIcon name="plus" :s="14" /> Nuovo evento
                </button>
            </Teleport>
        </ClientOnly>

        <h1>I tuoi eventi</h1>
        <div class="h-sub">{{ subLine }}</div>

        <!-- Loading: skeleton sobri -->
        <template v-if="pending">
            <div class="kpi-row" style="margin-top: 24px;">
                <div v-for="i in 4" :key="i" class="kpi static">
                    <div class="cer-skel" style="width: 60%; height: 11px;" />
                    <div class="cer-skel" style="width: 40%; height: 34px; margin: 10px 0 6px;" />
                    <div class="cer-skel" style="width: 70%; height: 10px;" />
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 32px;">
                <div v-for="i in 3" :key="i" class="cer-card" style="padding: 0; overflow: hidden;">
                    <div class="cer-skel" style="height: 92px; border-radius: 0;" />
                    <div style="padding: 16px;">
                        <div class="cer-skel" style="width: 55%; height: 12px;" />
                        <div class="cer-skel" style="width: 75%; height: 12px; margin-top: 8px;" />
                        <div class="cer-skel" style="width: 100%; height: 4px; margin-top: 18px;" />
                    </div>
                </div>
            </div>
        </template>

        <!-- Errore caricamento -->
        <div
            v-else-if="loadError"
            class="cer-card"
            style="margin-top: 32px; padding: 24px; border-color: var(--decline); max-width: 560px;"
        >
            <div class="row" style="gap: 8px; color: var(--decline); font-weight: 600;">
                <CerIcon name="x" :s="16" /> Errore di caricamento
            </div>
            <p class="small muted" style="margin: 8px 0 0;">{{ loadError }}</p>
            <button class="cer-btn ghost small" type="button" style="margin-top: 14px;" @click="load">
                Riprova
            </button>
        </div>

        <!-- Empty state: zero eventi -->
        <div
            v-else-if="events.length === 0"
            class="cer-card"
            style="margin: 48px auto 0; padding: 64px 32px; text-align: center; border-style: dashed; max-width: 720px;"
        >
            <div style="display: inline-flex; color: var(--ink-500);">
                <CerIcon name="sparkle" :s="30" />
            </div>
            <div class="serif" style="font-size: 32px; margin-top: 14px; letter-spacing: -0.02em;">
                Il tuo primo invito ti aspetta
            </div>
            <p class="h-sub" style="max-width: 460px; margin: 8px auto 0;">
                Scegli il tipo di evento, personalizza un template e invia a ogni ospite
                un link personale per rispondere. Bastano pochi minuti.
            </p>
            <button class="cer-btn" type="button" style="margin-top: 22px;" @click="newEvent">
                <CerIcon name="plus" :s="14" /> Crea il tuo primo evento
            </button>
            <div class="small muted" style="margin-top: 12px;">
                Matrimonio, laurea, battesimo o compleanno — gratis fino a 30 ospiti.
            </div>
        </div>

        <!-- Contenuto -->
        <template v-else>
            <!-- Quick stats -->
            <div class="kpi-row" style="margin-top: 24px;">
                <KpiCard label="Totale ospiti gestiti" :value="totalGuests" :sub="guestsSub" accent />
                <KpiCard
                    label="In attesa di risposta"
                    :value="totalPending"
                    :sub="`su ${totalGuests} ospiti invitati`"
                />
                <KpiCard
                    label="Confermati"
                    :value="totalConfirmed"
                    :sub="`su ${totalResponded} risposte ricevute`"
                />
                <KpiCard label="Tasso apertura inviti" :value="openRate" :sub="openRateSub" />
            </div>

            <div style="margin-top: 32px;">
                <!-- Attivi -->
                <template v-if="activeEvents.length > 0">
                    <div class="row" style="justify-content: space-between;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">Attivi</div>
                        <div class="mono" style="font-size: 11px; color: var(--ink-400);">Ordina per: data evento ↓</div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 12px;">
                        <EventCard
                            v-for="e in activeEvents"
                            :key="e.id"
                            :event="e"
                            @click="openEvent(e.id)"
                        />
                    </div>
                </template>

                <!-- Bozze + crea nuovo -->
                <div
                    class="mono"
                    :style="{
                        fontSize: '11px',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--ink-500)',
                        marginTop: activeEvents.length > 0 ? '28px' : '0',
                    }"
                >
                    Bozze
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 12px;">
                    <div
                        v-for="d in draftEvents"
                        :key="d.id"
                        class="cer-card"
                        style="padding: 20px; opacity: 0.85; border-style: dashed; cursor: pointer;"
                        @click="openEditor(d.id)"
                    >
                        <div class="row" style="gap: 10px; color: var(--ink-500);">
                            <CerIcon :name="typeMeta(d.type).icon" :s="18" />
                            <span class="mono" style="font-size: 11px; text-transform: uppercase;">{{ typeMeta(d.type).label }}</span>
                        </div>
                        <div class="serif" style="font-size: 22px; margin-top: 8px;">{{ d.title }}</div>
                        <div class="small muted" style="margin-top: 4px;">{{ dateLabel(d.eventDate) }}</div>
                        <button class="cer-btn ghost small" type="button" style="margin-top: 14px;" @click.stop="openEditor(d.id)">
                            Continua la configurazione <CerIcon name="chevR" :s="12" />
                        </button>
                    </div>

                    <!-- New event placeholder -->
                    <div
                        class="cer-card"
                        style="padding: 20px; border-style: dashed; border-color: var(--bone-300); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; cursor: pointer; color: var(--ink-500); min-height: 160px;"
                        @click="newEvent"
                    >
                        <CerIcon name="plus" :s="20" />
                        <div style="margin-top: 6px; font-size: 13px;">Crea un nuovo evento</div>
                        <div class="small muted" style="margin-top: 2px;">Matrimonio, laurea, compleanno…</div>
                    </div>
                </div>

                <!-- Conclusi -->
                <template v-if="closedEvents.length > 0">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500); margin-top: 28px;">
                        Conclusi
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 12px;">
                        <EventCard
                            v-for="e in closedEvents"
                            :key="e.id"
                            :event="e"
                            @click="openEvent(e.id)"
                        />
                    </div>
                </template>
            </div>
        </template>
    </div>
</template>

<style scoped>
/* Skeleton shimmer sobrio per gli stati di caricamento */
.cer-skel {
    background: linear-gradient(90deg, var(--bone-100) 25%, var(--bone-200) 50%, var(--bone-100) 75%);
    background-size: 200% 100%;
    border-radius: 6px;
    animation: cer-skel-shimmer 1.4s ease infinite;
}

@keyframes cer-skel-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
}
</style>
