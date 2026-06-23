<script setup lang="ts">
// Pagina pubblica ospite — /e/:slug/:token (SPEC §7 riga F8).
// Port fedele di invite-mobile.jsx (sfondo gradient + footer mono) e
// rsvp-mobile.jsx (RSVPConfirmMobile). SSR (route rule "/e/**"), layout nessuno.
// Il token è l'autorità: lo slug nell'URL è ignorato.
import type { CSSProperties } from "vue";
import type {
    AttendingStatus,
    HeaderBlockData,
    LocationBlockData,
    RsvpAnswers,
    RsvpAnswerValue,
    RsvpPerPersonAnswer,
} from "~~/shared/types/ceremly";
import { getTemplate } from "~~/shared/constants/templates";
import { getVisibleQuestions } from "~~/shared/utils/rsvpLogic";
import CerIcon from "~/components/ceremly/CerIcon.vue";
import CerLangSwitch from "~/components/ceremly/CerLangSwitch.vue";
import InviteRenderer from "~/components/ceremly/InviteRenderer.vue";
import RsvpFormRenderer from "~/components/ceremly/RsvpFormRenderer.vue";
import type { PublicRsvpPayload, PublicRsvpResponse } from "~/composables/usePublicInvite";

const { t } = useI18n();

definePageMeta({
    layout: false,
    auth: false,
});

const route = useRoute();
const token = computed(() => String(route.params.token ?? ""));

// Modalità anteprima firmata: token "preview" + ?sig HMAC (link "Invia un test a
// me"). Renderizza l'invito con ospite-esempio e RSVP in sola lettura. Senza sig
// valido la fetch fallisce → schermata d'errore cortese (nessuna enumeration).
const PREVIEW_TOKEN = "preview";
const slug = computed(() => String(route.params.slug ?? ""));
const sig = computed(() => String(route.query.sig ?? ""));
const isPreview = computed(() => token.value === PREVIEW_TOKEN);

// Brand env-driven (niente stringhe hardcoded): appName per il PRODID ICS,
// host pubblico (es. "ceremly.app") da baseURL per footer e UID ICS.
const runtimeConfig = useRuntimeConfig();
const appName = computed(() => String(runtimeConfig.public.appName ?? ""));
const brandHost = computed(() => {
    try {
        const base = String(runtimeConfig.public.baseURL ?? "");
        if (base) return new URL(base).host;
    } catch { /* baseURL assente o malformata: fallback sotto */ }
    return appName.value.toLowerCase();
});

const { isSubmitting, fetchInvite, fetchPreview, submitRsvp } = usePublicInvite();
const { data, error, status } = isPreview.value
    ? await fetchPreview(slug.value, sig.value)
    : await fetchInvite(token.value);

// ---------------------------------------------------------------------------
// SEO (noindex: pagina personale, mai indicizzata)
// ---------------------------------------------------------------------------

useSeoMeta({
    title: () => (data.value ? `${data.value.event.title} — ${t("ceremly.guest.seoInvited")}` : t("ceremly.guest.seoUnavailable")),
    description: () => t("ceremly.guest.seoDescription"),
    ogTitle: () => (data.value ? `${data.value.event.title} — ${t("ceremly.guest.seoInvited")}` : t("ceremly.guest.seoUnavailable")),
    ogDescription: () => t("ceremly.guest.seoDescription"),
    robots: "noindex, nofollow",
});

// ---------------------------------------------------------------------------
// Stato pagina
// ---------------------------------------------------------------------------

/** Schermata di base: invito oppure conferma post-submit. */
const screen = ref<"invite" | "confirm">("invite");
/** Overlay full-screen del form RSVP. */
const formOpen = ref(false);
/** Errori mostrati nell'overlay (410/422/altro) senza perdere i dati inseriti. */
const formErrors = ref<string[]>([]);

const response = ref<PublicRsvpResponse | null>(data.value?.response ?? null);
const deadlinePassed = ref(data.value?.deadlinePassed ?? false);

const ev = computed(() => data.value?.event ?? null);
const guest = computed(() => data.value?.guest ?? null);
const firstName = computed(() => guest.value?.firstName?.trim() || t("ceremly.guest.defaultGuestName"));

const tpl = computed(() => {
    const t = ev.value ? getTemplate(ev.value.templateKey) : undefined;
    return { accent: t?.accent ?? "#d4a373", accentSoft: t?.accentSoft ?? "#faedcd" };
});

/** Nomi host dal block header ("Giulia & Tommaso"), fallback titolo evento. */
const hostNames = computed(() => {
    const header = ev.value?.blocks.find(b => b.type === "header");
    const names = header ? (header.data as HeaderBlockData).names.filter(n => n?.trim()) : [];
    return names.length ? names.join(" & ") : ev.value?.title ?? "";
});

// Lock dello scroll di pagina mentre l'overlay è aperto.
watch(formOpen, (open) => {
    if (import.meta.client) document.body.style.overflow = open ? "hidden" : "";
});
onBeforeUnmount(() => {
    if (import.meta.client) document.body.style.overflow = "";
});

// ---------------------------------------------------------------------------
// Helpers risposte (banner + riepilogo)
// ---------------------------------------------------------------------------

const ATTENDANCE_ORDER: AttendingStatus[] = ["yes", "no", "maybe"];

function attendanceLabel(att: AttendingStatus): string {
    const q = ev.value?.rsvpConfig.find(c => c.id === "attendance");
    const idx = ATTENDANCE_ORDER.indexOf(att);
    const fallbacks = [
        t("ceremly.guest.attendanceYes"),
        t("ceremly.guest.attendanceNo"),
        t("ceremly.guest.attendanceMaybe"),
    ];
    return q?.options?.[idx] ?? fallbacks[idx] ?? att;
}

function isPerPersonShape(v: unknown): v is RsvpPerPersonAnswer {
    return (
        typeof v === "object"
        && v !== null
        && !Array.isArray(v)
        && Array.isArray((v as RsvpPerPersonAnswer).companions)
    );
}

function isEmptyVal(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

function humanize(v: RsvpAnswerValue | null): string {
    if (v === null) return "—";
    if (typeof v === "boolean") return v ? t("ceremly.guest.yes") : t("ceremly.guest.no");
    if (Array.isArray(v)) return v.join(" · ");
    return String(v);
}

/** Nomi accompagnatori da companion_names (fallback "Accompagnatore N"). */
const companionNames = computed<string[]>(() => {
    const resp = response.value;
    if (!resp) return [];
    const raw = resp.answers?.companion_names;
    const list = isPerPersonShape(raw) ? raw.companions : [];
    return Array.from({ length: resp.companionsCount }, (_, i) => {
        const v = list[i];
        return typeof v === "string" && v.trim() ? v.trim() : t("ceremly.guest.companionFallback", { n: i + 1 });
    });
});

const peopleCount = computed(() => {
    const resp = response.value;
    if (!resp || resp.attending === "no") return 0;
    return 1 + resp.companionsCount;
});

const peopleSummary = computed(() => {
    const n = peopleCount.value;
    if (n <= 1) return `${firstName.value} (1)`;
    return `${firstName.value} + ${companionNames.value.join(", ")} (${n})`;
});

/** Riepilogo umanizzato: domande visibili → righe { l, v }. */
const summaryRows = computed<{ l: string; v: string }[]>(() => {
    const resp = response.value;
    const config = ev.value?.rsvpConfig ?? [];
    if (!resp) return [];

    const rows: { l: string; v: string }[] = [
        { l: t("ceremly.guest.summaryAttendance"), v: attendanceLabel(resp.attending) },
    ];
    if (resp.attending !== "no") {
        rows.push({ l: t("ceremly.guest.summaryPeople"), v: peopleSummary.value });
    }

    // Visibilità valutata con i valori autoritativi, come fa il server.
    const evaluation: RsvpAnswers = { ...(resp.answers ?? {}) };
    evaluation.attendance = resp.attending;
    if (evaluation.companions_count === undefined) evaluation.companions_count = resp.companionsCount;

    for (const q of getVisibleQuestions(config, evaluation)) {
        if (q.id === "attendance" || q.id === "companions_count" || q.id === "companion_names") continue;
        const raw = resp.answers?.[q.id];
        if (raw === undefined || raw === null) continue;
        if (isPerPersonShape(raw)) {
            if ((q.perPersonScope ?? "all") !== "companions" && !isEmptyVal(raw.self)) {
                rows.push({ l: `${q.label} · ${firstName.value}`, v: humanize(raw.self) });
            }
            raw.companions.forEach((v, i) => {
                if (isEmptyVal(v)) return;
                rows.push({
                    l: `${q.label} · ${companionNames.value[i] ?? t("ceremly.guest.companionFallback", { n: i + 1 })}`,
                    v: humanize(v),
                });
            });
        }
        else if (!isEmptyVal(raw)) {
            rows.push({ l: q.label, v: humanize(raw as RsvpAnswerValue) });
        }
    }

    if (resp.attending === "no" && resp.declineMessage) {
        rows.push({ l: t("ceremly.guest.summaryMessage"), v: `"${resp.declineMessage}"` });
    }
    return rows;
});

// ---------------------------------------------------------------------------
// Apertura/chiusura form + submit
// ---------------------------------------------------------------------------

const initialResponseForForm = computed(() => {
    const resp = response.value;
    if (!resp) return null;
    return {
        attending: resp.attending,
        companionsCount: resp.companionsCount,
        answers: resp.answers ?? {},
        declineMessage: resp.declineMessage,
    };
});

function openForm() {
    if (deadlinePassed.value) return;
    formErrors.value = [];
    formOpen.value = true;
}

function closeForm() {
    formOpen.value = false;
}

async function onSubmit(payload: PublicRsvpPayload) {
    formErrors.value = [];
    // Anteprima: il form è solo dimostrativo, nessuna risposta viene salvata.
    if (isPreview.value) {
        formErrors.value = [t("ceremly.guest.previewSubmitDisabled")];
        return;
    }
    const result = await submitRsvp(token.value, payload);
    if (result.ok) {
        response.value = result.response;
        formOpen.value = false;
        screen.value = "confirm";
        if (import.meta.client) window.scrollTo({ top: 0 });
        return;
    }
    if (result.kind === "closed") {
        // Risposte chiuse nel frattempo: messaggio in form, dati preservati.
        deadlinePassed.value = true;
        formErrors.value = [result.message];
        return;
    }
    if (result.kind === "validation") {
        formErrors.value = result.errors;
        return;
    }
    formErrors.value = [result.message];
}

// ---------------------------------------------------------------------------
// Schermata conferma (port RSVPConfirmMobile)
// ---------------------------------------------------------------------------

const confirmCopy = computed(() => {
    switch (response.value?.attending) {
        case "no":
            return {
                title: t("ceremly.guest.confirmNoTitle"),
                sub: t("ceremly.guest.confirmNoSub"),
                icon: "heart",
                iconBg: "var(--wine)",
                gradient: "linear-gradient(180deg, var(--wine-soft) 0%, var(--bone) 40%)",
                quote: t("ceremly.guest.confirmNoQuote"),
            };
        case "maybe":
            return {
                title: t("ceremly.guest.confirmMaybeTitle"),
                sub: t("ceremly.guest.confirmMaybeSub"),
                icon: "clock",
                iconBg: "var(--wine)",
                gradient: "linear-gradient(180deg, var(--wine-soft) 0%, var(--bone) 40%)",
                quote: t("ceremly.guest.confirmMaybeQuote"),
            };
        default:
            return {
                title: t("ceremly.guest.confirmYesTitle"),
                sub: t("ceremly.guest.confirmYesSub", { name: firstName.value }),
                icon: "check",
                iconBg: "oklch(0.55 0.10 150)",
                gradient: "linear-gradient(180deg, color-mix(in srgb, var(--confirm) 16%, white) 0%, var(--bone) 40%)",
                quote: t("ceremly.guest.confirmYesQuote"),
            };
    }
});

// ---------------------------------------------------------------------------
// Salva in agenda (Google URL + .ics client-side)
// ---------------------------------------------------------------------------

function pad2(n: number): string {
    return String(n).padStart(2, "0");
}

/** Parti della data evento lette dall'ISO (no shift di timezone). */
const dateParts = computed<{ y: number; m: number; d: number } | null>(() => {
    const iso = ev.value?.eventDate;
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
});

const timeParts = computed<{ h: number; min: number } | null>(() => {
    const m = /^(\d{1,2}):(\d{2})/.exec(ev.value?.eventTime ?? "");
    if (!m) return null;
    return { h: Number(m[1]), min: Number(m[2]) };
});

const eventDateLabel = computed(() => {
    const p = dateParts.value;
    if (!p) return "";
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(p.y, p.m - 1, p.d));
});

/** "Villa Erba, Largo L. Visconti 4, Cernobbio (CO)" dal block location. */
const locationText = computed(() => {
    const block = ev.value?.blocks.find(b => b.type === "location");
    if (!block) return "";
    const d = block.data as LocationBlockData;
    return [d.name, d.address].filter(s => s?.trim()).join(", ");
});

function fmtLocal(d: Date): string {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
}

function fmtYmd(d: Date): string {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

const googleCalendarUrl = computed<string | null>(() => {
    const p = dateParts.value;
    const title = ev.value?.title;
    if (!p || !title) return null;
    const t = timeParts.value;
    let dates: string;
    if (t) {
        const start = new Date(p.y, p.m - 1, p.d, t.h, t.min);
        const end = new Date(start.getTime() + 3 * 3_600_000);
        dates = `${fmtLocal(start)}/${fmtLocal(end)}`;
    }
    else {
        dates = `${fmtYmd(new Date(p.y, p.m - 1, p.d))}/${fmtYmd(new Date(p.y, p.m - 1, p.d + 1))}`;
    }
    const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates });
    if (locationText.value) params.set("location", locationText.value);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
});

function icsEscape(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function buildIcs(): string | null {
    const p = dateParts.value;
    const title = ev.value?.title;
    if (!p || !title) return null;
    const now = new Date();
    const dtstamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//${appName.value}//Invito ospite//IT`,
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${token.value}@${brandHost.value}`,
        `DTSTAMP:${dtstamp}`,
    ];
    const t = timeParts.value;
    if (t) {
        const start = new Date(p.y, p.m - 1, p.d, t.h, t.min);
        const end = new Date(start.getTime() + 3 * 3_600_000);
        lines.push(`DTSTART:${fmtLocal(start)}`, `DTEND:${fmtLocal(end)}`);
    }
    else {
        // All-day: DTEND esclusivo = giorno successivo.
        lines.push(
            `DTSTART;VALUE=DATE:${fmtYmd(new Date(p.y, p.m - 1, p.d))}`,
            `DTEND;VALUE=DATE:${fmtYmd(new Date(p.y, p.m - 1, p.d + 1))}`,
        );
    }
    lines.push(`SUMMARY:${icsEscape(title)}`);
    if (locationText.value) lines.push(`LOCATION:${icsEscape(locationText.value)}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
}

function downloadIcs() {
    const ics = buildIcs();
    if (!ics || !import.meta.client) return;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ev.value?.slug || "evento"}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Stili condivisi (port inline style dei mockup)
// ---------------------------------------------------------------------------

const inviteWrapStyle = computed<CSSProperties>(() => ({
    background: `linear-gradient(180deg, ${tpl.value.accentSoft} 0%, var(--bone) 30%)`,
    minHeight: "100dvh",
    padding: "28px 14px 36px",
}));

const footerMonoStyle: CSSProperties = {
    marginTop: "18px",
    textAlign: "center",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    color: "var(--ink-400)",
    letterSpacing: "0.06em",
};

const agendaBtnStyle: CSSProperties = {
    padding: "10px 16px",
    background: "var(--bone-100)",
    color: "var(--ink)",
    border: "1px solid var(--bone-200)",
    borderRadius: "8px",
    fontSize: "13px",
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    textDecoration: "none",
};
</script>

<template>
    <div>
        <!-- Switcher lingua (IT/EN) — fisso, sempre raggiungibile dagli ospiti -->
        <CerLangSwitch :style="{ position: 'fixed', top: '16px', right: '16px', zIndex: 50 }" />

        <!-- Badge anteprima firmata (solo modalità preview, invito renderizzato) -->
        <div v-if="isPreview && data && !error" class="preview-badge">
            <CerIcon name="eye" :s="13" /> {{ $t("ceremly.guest.previewBadge") }}
        </div>

        <!-- ERRORE (404 o altro): schermata cortese standalone -->
        <div
            v-if="error"
            class="cer"
            :style="{
                minHeight: '100dvh',
                background: 'var(--bone)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
            }"
        >
            <div class="cer-card" :style="{ maxWidth: '420px', width: '100%', padding: '40px 28px', textAlign: 'center' }">
                <div
                    :style="{
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        background: 'var(--bone-100)',
                        color: 'var(--ink-500)',
                        margin: '0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }"
                >
                    <CerIcon name="mail" :s="24" />
                </div>
                <div class="serif" :style="{ fontSize: '26px', marginTop: '18px', letterSpacing: '-0.01em' }">
                    {{ $t("ceremly.guest.errorTitle") }}
                </div>
                <p class="muted" :style="{ fontSize: '14px', marginTop: '8px', lineHeight: 1.5 }">
                    {{ $t("ceremly.guest.errorHint") }}
                </p>
                <div :style="footerMonoStyle">{{ brandHost }} · {{ $t("ceremly.guest.footerTagline") }}</div>
            </div>
        </div>

        <!-- LOADING (solo navigazione client) -->
        <div
            v-else-if="status === 'pending' || !data"
            class="cer"
            :style="{
                minHeight: '100dvh',
                background: 'var(--bone)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
            }"
        >
            <span class="guest-spin" aria-hidden="true" />
            <span class="mono" :style="{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em', color: 'var(--ink-500)' }">
                {{ $t("ceremly.guest.loadingInvite") }}
            </span>
        </div>

        <!-- INVITO -->
        <div v-else class="cer guest-page">
            <div class="guest-shell">
                <template v-if="screen === 'invite'">
                    <!-- Banner risposta esistente (sticky) -->
                    <div
                        v-if="response"
                        :style="{ position: 'sticky', top: '0', zIndex: 20, padding: '10px 14px 0' }"
                    >
                        <div
                            class="cer-card"
                            :style="{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 14px',
                                boxShadow: '0 8px 24px -16px rgba(63,54,34,0.45)',
                            }"
                        >
                            <span
                                :style="{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '50%',
                                    background: 'var(--wine-soft)',
                                    color: 'var(--wine-deep)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }"
                            >
                                <CerIcon name="check" :s="13" :sw="2.5" />
                            </span>
                            <div :style="{ flex: 1, fontSize: '13px', lineHeight: 1.35, fontFamily: 'var(--font-sans)' }">
                                {{ $t("ceremly.guest.bannerAnswered") }} <strong>{{ attendanceLabel(response.attending) }}</strong>
                                <template v-if="peopleCount > 0">
                                    · {{ peopleCount }} {{ peopleCount === 1 ? $t("ceremly.guest.person") : $t("ceremly.guest.people") }}
                                </template>
                            </div>
                            <button
                                v-if="!deadlinePassed"
                                type="button"
                                :style="{
                                    padding: '7px 14px',
                                    background: 'transparent',
                                    color: 'var(--ink)',
                                    border: '1px solid var(--bone-200)',
                                    borderRadius: '999px',
                                    fontSize: '12px',
                                    fontWeight: 500,
                                    fontFamily: 'var(--font-sans)',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                }"
                                @click="openForm"
                            >
                                {{ $t("ceremly.guest.edit") }}
                            </button>
                        </div>
                    </div>

                    <!-- Invito (gradient top come invite-mobile.jsx) -->
                    <div :style="inviteWrapStyle">
                        <InviteRenderer
                            :blocks="ev!.blocks"
                            :template="tpl"
                            :palette="ev!.palette"
                            :font="ev!.inviteFont"
                            :event-date="ev!.eventDate"
                            :rsvp-deadline="ev!.rsvpDeadline"
                            :guest-name="guest!.firstName"
                            :deadline-passed="deadlinePassed"
                            :closed-message="ev!.rsvpClosedMessage"
                            @rsvp-click="openForm"
                        />
                        <div :style="footerMonoStyle">{{ brandHost }} · {{ $t("ceremly.guest.footerTagline") }}</div>
                    </div>
                </template>

                <!-- CONFERMA (port RSVPConfirmMobile) -->
                <div
                    v-else
                    :style="{
                        background: confirmCopy.gradient,
                        minHeight: '100dvh',
                        fontFamily: 'var(--font-display)',
                        color: 'var(--ink)',
                    }"
                >
                    <div :style="{ padding: '88px 24px 0', textAlign: 'center' }">
                        <div
                            :style="{
                                width: '72px',
                                height: '72px',
                                borderRadius: '50%',
                                background: confirmCopy.iconBg,
                                color: 'var(--bone-50)',
                                margin: '0 auto',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }"
                        >
                            <CerIcon :name="confirmCopy.icon" :s="36" :sw="2.5" />
                        </div>
                        <div :style="{ fontSize: '38px', marginTop: '24px', letterSpacing: '-0.01em' }">
                            {{ confirmCopy.title }}
                        </div>
                        <div :style="{ fontStyle: 'italic', color: 'var(--ink-500)', marginTop: '6px', fontSize: '16px' }">
                            {{ confirmCopy.sub }}
                        </div>
                    </div>

                    <div :style="{ padding: '36px 24px 0' }">
                        <!-- Riepilogo -->
                        <div class="cer-card" :style="{ padding: '22px' }">
                            <div
                                class="mono"
                                :style="{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '10px',
                                    letterSpacing: '0.12em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-500)',
                                }"
                            >
                                {{ $t("ceremly.guest.summary") }}
                            </div>
                            <div class="col" :style="{ gap: '12px', marginTop: '14px', fontFamily: 'var(--font-sans)' }">
                                <div
                                    v-for="r in summaryRows"
                                    :key="r.l"
                                    class="row"
                                    :style="{ alignItems: 'flex-start', gap: '12px', fontSize: '14px' }"
                                >
                                    <span class="muted small" :style="{ width: '100px', paddingTop: '1px', flexShrink: 0 }">{{ r.l }}</span>
                                    <span :style="{ flex: 1 }">{{ r.v }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Salva in agenda (solo yes, con data evento) -->
                        <div
                            v-if="response?.attending === 'yes' && dateParts"
                            :style="{
                                marginTop: '20px',
                                padding: '18px',
                                background: 'var(--bone-50)',
                                borderRadius: '14px',
                                border: '1px solid var(--bone-200)',
                                textAlign: 'center',
                            }"
                        >
                            <div
                                class="mono"
                                :style="{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '10px',
                                    letterSpacing: '0.18em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-500)',
                                }"
                            >
                                {{ $t("ceremly.guest.saveToCalendar") }}
                            </div>
                            <div :style="{ fontSize: '22px', marginTop: '8px' }">{{ eventDateLabel }}</div>
                            <div class="row" :style="{ justifyContent: 'center', gap: '8px', marginTop: '14px', fontFamily: 'var(--font-sans)', flexWrap: 'wrap' }">
                                <a
                                    v-if="googleCalendarUrl"
                                    :href="googleCalendarUrl"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    :style="agendaBtnStyle"
                                >
                                    <CerIcon name="calendar" :s="13" /> Google
                                </a>
                                <button type="button" :style="agendaBtnStyle" @click="downloadIcs">
                                    <CerIcon name="calendar" :s="13" /> Apple
                                </button>
                                <button type="button" :style="agendaBtnStyle" @click="downloadIcs">
                                    <CerIcon name="calendar" :s="13" /> ICS
                                </button>
                            </div>
                        </div>

                        <!-- Modifica la risposta -->
                        <div :style="{ marginTop: '22px', textAlign: 'center', fontFamily: 'var(--font-sans)' }">
                            <button
                                v-if="!deadlinePassed"
                                type="button"
                                :style="{
                                    padding: '10px 16px',
                                    background: 'transparent',
                                    color: 'var(--ink)',
                                    border: '1px solid var(--bone-200)',
                                    borderRadius: '999px',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }"
                                @click="openForm"
                            >
                                <CerIcon name="edit" :s="12" /> {{ $t("ceremly.guest.editResponse") }}
                            </button>
                        </div>

                        <!-- Quote firmata -->
                        <div
                            :style="{
                                marginTop: '28px',
                                textAlign: 'center',
                                fontStyle: 'italic',
                                color: 'var(--ink-500)',
                                fontSize: '15px',
                                fontFamily: 'var(--font-display)',
                                padding: '0 20px 0',
                            }"
                        >
                            {{ confirmCopy.quote }}<br>
                            <span
                                :style="{
                                    fontSize: '12px',
                                    fontFamily: 'var(--font-mono)',
                                    fontStyle: 'normal',
                                    letterSpacing: '0.08em',
                                    color: 'var(--ink-400)',
                                }"
                            >
                                — {{ hostNames }}
                            </span>
                        </div>

                        <div :style="{ ...footerMonoStyle, padding: '0 0 36px', marginTop: '24px' }">
                            {{ brandHost }} · {{ $t("ceremly.guest.footerTagline") }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- OVERLAY FORM RSVP (slide-up full-screen) -->
            <Transition name="rsvp-slide">
                <div v-if="formOpen" class="rsvp-overlay">
                    <div class="rsvp-overlay-inner">
                        <RsvpFormRenderer
                            :config="ev!.rsvpConfig"
                            :initial-response="initialResponseForForm"
                            :guest-name="guest!.firstName"
                            :host-names="hostNames"
                            :submitting="isSubmitting"
                            :style="{ flex: 1 }"
                            @close="closeForm"
                            @submit="onSubmit"
                        />
                    </div>

                    <!-- Errori submit (410/422/rete): fissi in basso, dati preservati -->
                    <div v-if="formErrors.length" class="rsvp-error-strip" role="alert">
                        <div :style="{ flex: 1 }">
                            <div v-for="(msg, i) in formErrors" :key="i" :style="{ marginTop: i === 0 ? '0' : '4px' }">
                                {{ msg }}
                            </div>
                        </div>
                        <button
                            type="button"
                            :aria-label="$t('ceremly.guest.closeError')"
                            :style="{
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                padding: '2px',
                                flexShrink: 0,
                            }"
                            @click="formErrors = []"
                        >
                            <CerIcon name="x" :s="14" />
                        </button>
                    </div>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
/* Badge "Anteprima" fisso in alto a sinistra (modalità preview firmata) */
.preview-badge {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 50;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: var(--ink);
    color: var(--bone-50);
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    box-shadow: 0 8px 24px -16px rgba(63, 54, 34, 0.6);
}

/* Mobile-first: shell max 480 centrata; su desktop sfondo bone-100 + ombra */
.guest-page {
    min-height: 100dvh;
    background: var(--bone);
}
.guest-shell {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100dvh;
    background: var(--bone);
}
@media (min-width: 540px) {
    .guest-page {
        background: var(--bone-100);
    }
    .guest-shell {
        box-shadow: 0 0 0 1px var(--line), 0 24px 80px -32px rgba(63, 54, 34, 0.35);
    }
}

/* Overlay full-screen del form RSVP */
.rsvp-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--bone);
    overflow-y: auto;
    overscroll-behavior: contain;
}
.rsvp-overlay-inner {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bone);
}
@media (min-width: 540px) {
    .rsvp-overlay {
        background: rgba(63, 54, 34, 0.4);
    }
    .rsvp-overlay-inner {
        box-shadow: 0 0 0 1px var(--line), 0 24px 80px -32px rgba(63, 54, 34, 0.45);
    }
}

/* Striscia errori submit: fissa in basso, centrata col container */
.rsvp-error-strip {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    z-index: 60;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 18px;
    background: color-mix(in srgb, var(--decline) 10%, white);
    border-top: 1px solid color-mix(in srgb, var(--decline) 30%, transparent);
    color: #6e1e0c;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
}

/* Slide-up del form */
.rsvp-slide-enter-active,
.rsvp-slide-leave-active {
    transition: transform 320ms cubic-bezier(0.22, 0.8, 0.36, 1), opacity 320ms ease;
}
.rsvp-slide-enter-from,
.rsvp-slide-leave-to {
    transform: translateY(100%);
    opacity: 0.5;
}

/* Spinner sobrio */
.guest-spin {
    width: 28px;
    height: 28px;
    border: 2px solid var(--bone-300);
    border-top-color: var(--wine);
    border-radius: 50%;
    animation: guest-spin 0.8s linear infinite;
}
@keyframes guest-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
