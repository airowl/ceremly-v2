<script setup lang="ts">
// Distribuzione inviti — port fedele di docs/ui/project/screens/distribution.jsx:
// composer email con anteprima inbox, copia&incolla WhatsApp, colonna destinatari.
import CerIcon from "~/components/ceremly/CerIcon.vue";
import type { CeremlyEvent, GuestWithStatus } from "~~/shared/types/ceremly";
import type { GuestListSummary } from "~/composables/useEventGuests";

definePageMeta({ layout: "ceremly" });

const route = useRoute();
const toast = useToast();
const config = useRuntimeConfig();
const { t } = useI18n();
const eventId = computed(() => String(route.params.id ?? ""));

const { listGuests, sendInvites, sendTest, markWhatsappSent } = useEventGuests();

// ─── Contesto evento (sidebar) + breadcrumbs ─────────────────────────
interface CeremlyEventCtx { id: string; title: string; type: string }
const eventCtx = useState<CeremlyEventCtx | null>("ceremly-event-ctx", () => null);
const crumbs = useState<string[]>("ceremly-crumbs", () => []);

const TYPE_LABELS = computed<Record<string, string>>(() => ({
    matrimonio: t("ceremly.eventType.matrimonio.label"),
    laurea: t("ceremly.eventType.laurea.label"),
    battesimo: t("ceremly.eventType.battesimo.label"),
    compleanno: t("ceremly.eventType.compleanno.label"),
}));

const eventData = ref<CeremlyEvent | null>(null);

watchEffect(() => {
    const label = eventData.value ? TYPE_LABELS.value[eventData.value.type] ?? eventData.value.title : t("ceremly.event.distribution.crumbEvent");
    crumbs.value = [t("ceremly.event.distribution.crumbEvents"), label, t("ceremly.event.distribution.crumbDistribution")];
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

const subject = ref("");
const body = ref("");
const waTemplate = ref("");

const FALLBACK_WA_TEMPLATE
    = "Ciao {nome}! C'è un invito che ti aspetta — trovi tutti i dettagli e la conferma qui: {link}";

async function loadAll() {
    loading.value = true;
    loadError.value = null;
    try {
        const [evRes, res] = await Promise.all([
            $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`),
            listGuests(eventId.value),
        ]);
        eventData.value = evRes.event;
        eventCtx.value = { id: evRes.event.id, title: evRes.event.title, type: evRes.event.type };
        guests.value = res.guests;
        summary.value = res.summary;
        subject.value = evRes.event.distribution?.emailSubject ?? "";
        body.value = evRes.event.distribution?.emailBody ?? "";
        waTemplate.value = evRes.event.distribution?.whatsappTemplate || FALLBACK_WA_TEMPLATE;
        if (emailTargets.value.length === 0 && waTargets.value.length > 0) {
            channel.value = "whatsapp";
        }
    } catch (e) {
        loadError.value = errOf(e).data?.statusMessage || errOf(e).message || t("ceremly.event.distribution.loadError");
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
        // refresh silenzioso: i dati visibili restano validi
    }
}

onMounted(loadAll);

// ─── Selezione da ?guests= (action bar pagina ospiti) ────────────────
const preselectedIds = computed<Set<string>>(() => {
    const raw = route.query.guests;
    const val = Array.isArray(raw) ? raw[0] : raw;
    if (!val) return new Set();
    return new Set(String(val).split(",").filter(Boolean));
});

const hasSelection = computed(() => preselectedIds.value.size > 0);

// ─── Target per canale ───────────────────────────────────────────────
const activeGuests = computed(() => guests.value.filter(g => !g.removedAt));

/** Email: selezione da ?guests= (con email) oppure tutti i non ancora inviati con email. */
const emailTargets = computed(() => {
    if (hasSelection.value) {
        return activeGuests.value.filter(g => preselectedIds.value.has(g.id) && !!g.email);
    }
    return activeGuests.value.filter(g => !!g.email && g.sentAt === null);
});

/** WhatsApp: ospiti senza email (sempre tutti: il copia&incolla è ripetibile). */
const waTargets = computed(() => activeGuests.value.filter(g => !g.email));

const channel = ref<"email" | "whatsapp">("email");
const currentTargets = computed(() => channel.value === "email" ? emailTargets.value : waTargets.value);

const notSentCount = computed(() => activeGuests.value.filter(g => g.sentAt === null).length);

const headerSub = computed(() => {
    if (!summary.value) return t("ceremly.event.distribution.loading");
    return t("ceremly.event.distribution.headerSub", { notSent: notSentCount.value, pending: summary.value.pending });
});

// ─── Helpers di formattazione ────────────────────────────────────────
function initials(g: { firstName: string; lastName: string }): string {
    return `${g.firstName[0] ?? ""}${g.lastName[0] ?? ""}`.toUpperCase();
}

const shortDateFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

const nowTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date());

const linkBase = computed(() => {
    const base = String(config.public.baseURL || (import.meta.client ? window.location.origin : ""));
    return base.replace(/\/+$/, "");
});

function guestLink(g: GuestWithStatus): string {
    return `${linkBase.value}/e/${eventData.value?.slug ?? ""}/${g.token}`;
}

function displayLink(g: GuestWithStatus): string {
    return guestLink(g).replace(/^https?:\/\//, "");
}

function buildWaMessage(g: GuestWithStatus): string {
    const tpl = waTemplate.value || FALLBACK_WA_TEMPLATE;
    return tpl.split("{nome}").join(g.firstName).split("{link}").join(guestLink(g));
}

function waSnippet(g: GuestWithStatus): string {
    const tpl = (waTemplate.value || FALLBACK_WA_TEMPLATE)
        .split("{nome}").join(g.firstName)
        .split("{link}").join("")
        .replace(/\s+/g, " ")
        .trim();
    return tpl.length > 90 ? `${tpl.slice(0, 90)}…` : tpl;
}

// ─── Mittente + anteprima inbox ──────────────────────────────────────
const senderName = computed(() => eventData.value?.distribution?.senderName || eventData.value?.title || "");

const senderLine = computed(() => {
    const email = String(config.public.appNotifyEmail || "");
    return email ? `${senderName.value} <${email}>` : senderName.value;
});

const previewGuestName = computed(() => emailTargets.value[0]?.firstName || "Anna");

const previewSnippet = computed(() => {
    const text = body.value
        .split("{nome}").join(previewGuestName.value)
        .split("{link}").join("")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return t("ceremly.event.distribution.previewSnippetEmpty");
    return text.length > 64 ? `${text.slice(0, 64)}…` : text;
});

const headerBlock = computed(() => {
    const block = eventData.value?.blocks?.find(b => b.type === "header");
    return block?.type === "header" ? block.data : null;
});

const previewEyebrow = computed(() => {
    const raw = headerBlock.value?.eyebrow || "Save the date";
    return raw.toUpperCase().split("").join(" ");
});

const previewNames = computed(() => headerBlock.value?.names ?? [eventData.value?.title ?? ""]);

const previewMeta = computed(() => {
    const parts: string[] = [];
    const iso = eventData.value?.eventDate;
    if (iso) {
        const d = new Date(iso);
        parts.push(`${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`);
    }
    if (eventData.value?.locationName) parts.push(eventData.value.locationName);
    return parts.join(" · ");
});

// ─── Invio email ─────────────────────────────────────────────────────
const confirmSendOpen = ref(false);
const sending = ref(false);
const testSending = ref(false);

function openConfirmSend() {
    if (!subject.value.trim() || !body.value.trim()) {
        toast.add({ title: t("ceremly.event.distribution.toastCompleteTitle"), description: t("ceremly.event.distribution.toastCompleteDesc"), color: "error" });
        return;
    }
    if (emailTargets.value.length === 0) return;
    confirmSendOpen.value = true;
}

async function doSend() {
    sending.value = true;
    try {
        // sendInvitesSchema accetta max 200 guestIds per chiamata: chunking.
        const ids = emailTargets.value.map(g => g.id);
        let queued = 0;
        let skippedNoEmail = 0;
        for (let i = 0; i < ids.length; i += 200) {
            const res = await sendInvites(eventId.value, {
                guestIds: ids.slice(i, i + 200),
                subject: subject.value.trim(),
                body: body.value.trim(),
            });
            queued += res.queued;
            skippedNoEmail += res.skippedNoEmail;
        }
        confirmSendOpen.value = false;
        const skippedSuffix = skippedNoEmail > 0 ? ` · ${t("ceremly.event.distribution.toastSentSkipped", { n: skippedNoEmail })}` : "";
        toast.add({
            title: t("ceremly.event.distribution.toastSentTitle"),
            description: `${t("ceremly.event.distribution.toastSentDesc", { queued })}${skippedSuffix}`,
            color: "success",
        });
        await refreshGuests();
    } catch (e) {
        toast.add({ title: t("ceremly.event.distribution.toastSendFailTitle"), description: errOf(e).data?.statusMessage || t("ceremly.event.distribution.toastSendFailDesc"), color: "error" });
    } finally {
        sending.value = false;
    }
}

async function doSendTest() {
    testSending.value = true;
    try {
        const override: { subject?: string; body?: string } = {};
        if (subject.value.trim()) override.subject = subject.value.trim();
        if (body.value.trim()) override.body = body.value.trim();
        await sendTest(eventId.value, override);
        toast.add({ title: t("ceremly.event.distribution.toastTestSentTitle"), description: t("ceremly.event.distribution.toastTestSentDesc"), color: "success" });
    } catch (e) {
        toast.add({ title: t("ceremly.event.distribution.toastTestFailTitle"), description: errOf(e).data?.statusMessage || t("ceremly.event.distribution.toastTestFailDesc"), color: "error" });
    } finally {
        testSending.value = false;
    }
}

// ─── WhatsApp: template + copia ──────────────────────────────────────
const waExpanded = ref(false);
const waVisible = computed(() => waExpanded.value ? waTargets.value : waTargets.value.slice(0, 4));
const waSavingTemplate = ref(false);
const copiedGuestId = ref<string | null>(null);
const copyingAll = ref(false);

async function saveWaTemplate() {
    if (!eventData.value) return;
    waSavingTemplate.value = true;
    try {
        const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`, {
            method: "PUT",
            body: {
                distribution: {
                    ...eventData.value.distribution,
                    whatsappTemplate: waTemplate.value,
                },
            },
        });
        eventData.value = res.event;
        toast.add({ title: t("ceremly.event.distribution.toastWaSavedTitle"), description: t("ceremly.event.distribution.toastWaSavedDesc"), color: "success" });
    } catch (e) {
        toast.add({ title: t("ceremly.event.distribution.toastWaSaveFailTitle"), description: errOf(e).data?.statusMessage || t("ceremly.event.distribution.toastWaSaveFailDesc"), color: "error" });
    } finally {
        waSavingTemplate.value = false;
    }
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        toast.add({ title: t("ceremly.event.distribution.toastCopyFailTitle"), description: t("ceremly.event.distribution.toastCopyFailDesc"), color: "error" });
        return false;
    }
}

async function copyOne(g: GuestWithStatus) {
    const ok = await copyToClipboard(buildWaMessage(g));
    if (!ok) return;
    copiedGuestId.value = g.id;
    setTimeout(() => {
        if (copiedGuestId.value === g.id) copiedGuestId.value = null;
    }, 2000);
    try {
        await markWhatsappSent(eventId.value, [g.id]);
        await refreshGuests();
    } catch (e) {
        toast.add({ title: t("ceremly.event.distribution.toastCopyWarnTitle"), description: errOf(e).data?.statusMessage || t("ceremly.event.distribution.toastCopyOneWarnDesc"), color: "warning" });
    }
}

async function copyAll() {
    if (waTargets.value.length === 0) return;
    copyingAll.value = true;
    try {
        const all = waTargets.value.map(g => buildWaMessage(g)).join("\n\n");
        const ok = await copyToClipboard(all);
        if (!ok) return;
        // markSentSchema accetta max 500 guestIds per chiamata: chunking.
        const ids = waTargets.value.map(g => g.id);
        for (let i = 0; i < ids.length; i += 500) {
            await markWhatsappSent(eventId.value, ids.slice(i, i + 500));
        }
        toast.add({ title: t("ceremly.event.distribution.toastCopyAllTitle"), description: t("ceremly.event.distribution.toastCopyAllDesc", { n: waTargets.value.length }), color: "success" });
        await refreshGuests();
    } catch (e) {
        toast.add({ title: t("ceremly.event.distribution.toastCopyWarnTitle"), description: errOf(e).data?.statusMessage || t("ceremly.event.distribution.toastCopyAllWarnDesc"), color: "warning" });
    } finally {
        copyingAll.value = false;
    }
}

function openQr(g: GuestWithStatus) {
    window.open(`/api/events/${eventId.value}/guests/${g.id}/qr`, "_blank");
}

// ─── Colonna destra: breakdown + cronologia ──────────────────────────
const GROUP_DOTS = ["var(--wine)", "var(--sage)", "var(--ink-500)", "var(--orange-deep)", "var(--bone-300)"];

const groupBreakdown = computed(() => {
    const counts = new Map<string, number>();
    for (const g of currentTargets.value) {
        const key = g.groupName?.trim() || t("ceremly.event.distribution.noGroup");
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([l, n], i) => ({ l, n, c: GROUP_DOTS[i % GROUP_DOTS.length] }));
});

interface HistoryEntry { key: string; d: string; t: string; s: string; ts: number }

const sendHistory = computed<HistoryEntry[]>(() => {
    const groups = new Map<string, { ts: number; channel: string; guests: GuestWithStatus[] }>();
    for (const g of activeGuests.value) {
        if (!g.sentAt) continue;
        const date = new Date(g.sentAt);
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${g.sentChannel ?? "email"}`;
        const entry = groups.get(dayKey);
        if (entry) {
            entry.guests.push(g);
        } else {
            groups.set(dayKey, { ts: date.getTime(), channel: g.sentChannel ?? "email", guests: [g] });
        }
    }
    return [...groups.entries()]
        .map(([key, v]) => {
            const n = v.guests.length;
            const opened = v.guests.filter(g => g.firstOpenedAt !== null).length;
            const responded = v.guests.filter(g => g.respondedAt !== null).length;
            return {
                key,
                ts: v.ts,
                d: shortDateFmt.format(new Date(v.ts)),
                t: v.channel === "whatsapp" ? t("ceremly.event.distribution.historyWaTitle", { n }) : t("ceremly.event.distribution.historyEmailTitle", { n }),
                s: v.channel === "whatsapp"
                    ? t("ceremly.event.distribution.historyWaSub", { n })
                    : t("ceremly.event.distribution.historyEmailSub", { opened, responded }),
            };
        })
        .sort((a, b) => b.ts - a.ts);
});
</script>

<template>
    <div>
        <!-- Stato errore -->
        <div v-if="loadError" class="cer-card" style="padding: 22px;">
            <div style="color: var(--decline); font-size: 14px;">{{ loadError }}</div>
            <button class="cer-btn ghost small" type="button" style="margin-top: 12px;" @click="loadAll">{{ $t('common.retry') }}</button>
        </div>

        <!-- Stato loading -->
        <template v-else-if="loading">
            <div class="cer-skeleton" style="height: 40px; width: 360px;" />
            <div class="cer-skeleton" style="height: 16px; width: 480px; margin-top: 10px;" />
            <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 20px; margin-top: 22px;">
                <div class="cer-skeleton" style="height: 420px;" />
                <div class="cer-skeleton" style="height: 420px;" />
            </div>
        </template>

        <template v-else>
            <h1>{{ $t('ceremly.event.distribution.pageTitle') }}</h1>
            <div class="h-sub">{{ headerSub }}</div>

            <div v-if="hasSelection" class="row" style="margin-top: 10px;">
                <span class="cer-tag">{{ $t('ceremly.event.distribution.selectionTag', { n: preselectedIds.size }) }}</span>
            </div>

            <!-- Channel switch -->
            <div class="row" style="gap: 8px; margin-top: 22px; padding: 4px; background: var(--bone-100); border-radius: 999px; align-self: flex-start; width: fit-content;">
                <button
                    type="button"
                    class="cer-btn"
                    :class="{ ghost: channel !== 'email' }"
                    style="border-radius: 999px; border-color: transparent;"
                    @click="channel = 'email'"
                >
                    <CerIcon name="mail" :s="14" /> {{ $t('ceremly.event.distribution.channelEmail', { n: emailTargets.length }) }}
                </button>
                <button
                    type="button"
                    class="cer-btn"
                    :class="{ ghost: channel !== 'whatsapp' }"
                    style="border-radius: 999px; border-color: transparent;"
                    @click="channel = 'whatsapp'"
                >
                    <CerIcon name="whatsapp" :s="14" /> {{ $t('ceremly.event.distribution.channelWhatsapp', { n: waTargets.length }) }}
                </button>
            </div>

            <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 20px; margin-top: 22px;">
                <!-- ─── EMAIL COMPOSER ───────────────────────────────── -->
                <div v-if="channel === 'email'" class="cer-card" style="padding: 22px;">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.distribution.emailEyebrow') }}</div>
                    <div class="serif" style="font-size: 22px; margin-top: 4px;">{{ $t('ceremly.event.distribution.emailHeading') }}</div>

                    <div style="display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 18px;">
                        <div class="col" style="gap: 4px;">
                            <label class="cer-flabel">{{ $t('ceremly.event.distribution.labelSender') }}</label>
                            <input class="cer-input" :value="senderLine" readonly style="color: var(--ink-500); background: var(--bone);">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="cer-flabel">{{ $t('ceremly.event.distribution.labelSubject') }}</label>
                            <input v-model="subject" class="cer-input" :placeholder="$t('ceremly.event.distribution.subjectPlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="cer-flabel row" style="justify-content: space-between;">
                                <span>{{ $t('ceremly.event.distribution.labelMessage') }}</span>
                                <span>{{ $t('ceremly.event.distribution.variables') }}: <span class="cer-tag" style="font-size: 9px;">{nome}</span> <span class="cer-tag" style="font-size: 9px;">{link}</span></span>
                            </label>
                            <textarea v-model="body" class="cer-input" :rows="8" :placeholder="$t('ceremly.event.distribution.bodyPlaceholder')" />
                        </div>
                    </div>

                    <div style="height: 1px; background: var(--bone-200); margin: 20px 0;" />

                    <!-- Anteprima inbox -->
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.distribution.inboxPreview') }}</div>
                    <div style="margin-top: 12px; padding: 18px; background: var(--bone-100); border-radius: 12px; border: 1px solid var(--bone-200);">
                        <div class="row" style="gap: 10px;">
                            <div class="av ink">{{ (senderName[0] || "C").toUpperCase() }}</div>
                            <div class="col" style="line-height: 1.25; flex: 1;">
                                <div class="row" style="justify-content: space-between;">
                                    <span style="font-size: 13px; font-weight: 500;">{{ senderName }}</span>
                                    <span class="small muted">{{ $t('ceremly.event.distribution.previewToday') }} · {{ nowTime }}</span>
                                </div>
                                <span style="font-size: 13px;">{{ subject || $t('ceremly.event.distribution.previewSubjectEmpty') }}</span>
                                <span class="small muted">{{ previewSnippet }}</span>
                            </div>
                        </div>

                        <div style="margin-top: 16px; padding: 22px; background: var(--bone-50); border-radius: 10px; border: 1px solid var(--bone-200); text-align: center; font-family: var(--font-display);">
                            <div style="font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.2em; color: var(--wine);">
                                {{ previewEyebrow }}
                            </div>
                            <div style="font-size: 32px; margin-top: 8px; color: var(--wine-deep);">
                                <template v-for="(name, i) in previewNames" :key="i">
                                    <em>{{ name }}</em><span v-if="i < previewNames.length - 1"> &amp; </span>
                                </template>
                            </div>
                            <div v-if="previewMeta" style="font-family: var(--font-mono); font-size: 10px; color: var(--ink-500); margin-top: 6px;">
                                {{ previewMeta }}
                            </div>
                            <button type="button" style="margin-top: 16px; padding: 10px 22px; background: var(--wine); color: var(--ink); border: none; border-radius: 999px; font-family: var(--font-sans); font-size: 13px; font-weight: 500; cursor: default;">
                                {{ $t('ceremly.event.distribution.previewCta', { name: previewGuestName }) }}
                            </button>
                        </div>
                    </div>

                    <div class="row" style="justify-content: space-between; margin-top: 18px;">
                        <button class="cer-btn ghost" type="button" :disabled="testSending" @click="doSendTest">
                            <CerIcon name="eye" :s="14" /> {{ testSending ? $t('ceremly.event.distribution.sendingTest') : $t('ceremly.event.distribution.btnSendTest') }}
                        </button>
                        <button
                            class="cer-btn wine"
                            type="button"
                            :disabled="emailTargets.length === 0"
                            @click="openConfirmSend"
                        >
                            <CerIcon name="send" :s="14" /> {{ $t('ceremly.event.distribution.btnSendEmail', { n: emailTargets.length }) }}
                        </button>
                    </div>
                    <div v-if="emailTargets.length === 0" class="small muted" style="margin-top: 10px; text-align: right;">
                        {{ hasSelection ? $t('ceremly.event.distribution.noEmailSelection') : $t('ceremly.event.distribution.allEmailSent') }}
                    </div>
                </div>

                <!-- ─── WHATSAPP COPIER ─────────────────────────────── -->
                <div v-else class="cer-card" style="padding: 22px;">
                    <div class="row" style="justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">WhatsApp</div>
                            <div class="serif" style="font-size: 22px; margin-top: 4px;">{{ $t('ceremly.event.distribution.waHeading', { n: waTargets.length }) }}</div>
                            <div class="small muted" style="margin-top: 4px;">
                                {{ $t('ceremly.event.distribution.waSubheading') }}
                            </div>
                        </div>
                        <button
                            class="cer-btn small ghost"
                            type="button"
                            :disabled="waTargets.length === 0 || copyingAll"
                            @click="copyAll"
                        >
                            <CerIcon name="copy" :s="12" /> {{ $t('ceremly.event.distribution.btnCopyAll', { n: waTargets.length }) }}
                        </button>
                    </div>

                    <!-- Modello editabile -->
                    <div class="col" style="gap: 4px; margin-top: 18px;">
                        <label class="cer-flabel row" style="justify-content: space-between;">
                            <span>{{ $t('ceremly.event.distribution.labelWaTemplate') }}</span>
                            <span>{{ $t('ceremly.event.distribution.variables') }}: <span class="cer-tag" style="font-size: 9px;">{nome}</span> <span class="cer-tag" style="font-size: 9px;">{link}</span></span>
                        </label>
                        <textarea v-model="waTemplate" class="cer-input" :rows="3" />
                        <button
                            class="cer-btn ghost small"
                            type="button"
                            style="align-self: flex-end; margin-top: 4px;"
                            :disabled="waSavingTemplate"
                            @click="saveWaTemplate"
                        >
                            <CerIcon name="check" :s="12" /> {{ waSavingTemplate ? $t('ceremly.event.distribution.savingTemplate') : $t('ceremly.event.distribution.btnSaveTemplate') }}
                        </button>
                    </div>

                    <div v-if="waTargets.length === 0" class="small muted" style="margin-top: 18px;">
                        {{ $t('ceremly.event.distribution.waNoGuests') }}
                    </div>

                    <div v-else class="col" style="gap: 10px; margin-top: 18px;">
                        <div
                            v-for="g in waVisible"
                            :key="g.id"
                            class="row"
                            style="padding: 14px; gap: 14px; background: var(--bone); border: 1px solid var(--bone-200); border-radius: 10px; align-items: flex-start;"
                        >
                            <div class="av sage">{{ initials(g) }}</div>
                            <div class="col" style="flex: 1; gap: 4px; min-width: 0;">
                                <span style="font-size: 13px; font-weight: 500;">{{ g.firstName }} {{ g.lastName }}</span>
                                <span class="small muted" style="line-height: 1.4;">{{ waSnippet(g) }}</span>
                                <span class="mono small" style="color: var(--wine-deep); word-break: break-all;">{{ displayLink(g) }}</span>
                            </div>
                            <div class="col" style="gap: 6px;">
                                <button class="cer-btn small" type="button" @click="copyOne(g)">
                                    <template v-if="copiedGuestId === g.id"><CerIcon name="check" :s="12" /> {{ $t('ceremly.event.distribution.copied') }}</template>
                                    <template v-else><CerIcon name="copy" :s="12" /> {{ $t('ceremly.event.distribution.copy') }}</template>
                                </button>
                                <button class="cer-btn small ghost" type="button" @click="openQr(g)">
                                    <CerIcon name="qr" :s="12" /> QR
                                </button>
                            </div>
                        </div>
                        <button
                            v-if="!waExpanded && waTargets.length > 4"
                            class="cer-btn ghost small"
                            type="button"
                            style="align-self: center;"
                            @click="waExpanded = true"
                        >
                            {{ $t('ceremly.event.distribution.showMore', { n: waTargets.length - 4 }) }} <CerIcon name="chevD" :s="12" />
                        </button>
                    </div>
                </div>

                <!-- ─── COLONNA DESTRA ──────────────────────────────── -->
                <div class="col" style="gap: 16px; align-items: stretch;">
                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.distribution.recipientsEyebrow') }}</div>
                        <div class="serif" style="font-size: 36px; margin-top: 6px;">{{ currentTargets.length }}</div>
                        <div class="small muted">{{ $t('ceremly.event.distribution.recipientsSub', { channel: channel === 'email' ? $t('ceremly.event.distribution.viaEmail') : $t('ceremly.event.distribution.viaWhatsapp') }) }}</div>

                        <div v-if="groupBreakdown.length > 0" class="col" style="gap: 10px; margin-top: 16px;">
                            <div v-for="g in groupBreakdown" :key="g.l" class="row" style="gap: 12px; font-size: 13px;">
                                <span class="cer-dot" :style="{ background: g.c }" />
                                <span style="flex: 1;">{{ g.l }}</span>
                                <span class="mono small muted">{{ $t('ceremly.event.distribution.guestCount', { n: g.n }) }}</span>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 16px;">{{ $t('ceremly.event.distribution.noRecipients') }}</div>
                    </div>

                    <div class="cer-card" style="padding: 20px; background: var(--ink); color: var(--bone-50); border-color: var(--ink);">
                        <div class="row" style="gap: 10px; align-items: flex-start;">
                            <div style="padding-top: 2px;"><CerIcon name="sparkle" :s="16" /></div>
                            <div class="col" style="gap: 6px;">
                                <div style="font-size: 14px; font-weight: 500;">{{ $t('ceremly.event.distribution.tipTitle') }}</div>
                                <div class="small" style="color: var(--bone-200); line-height: 1.5;">
                                    {{ $t('ceremly.event.distribution.tipBody') }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">{{ $t('ceremly.event.distribution.historyEyebrow') }}</div>
                        <div v-if="sendHistory.length > 0" class="col" style="gap: 8px; margin-top: 12px;">
                            <div v-for="e in sendHistory" :key="e.key" class="row" style="gap: 10px; font-size: 13px; align-items: flex-start;">
                                <span class="mono small muted" style="width: 50px; padding-top: 2px; flex-shrink: 0;">{{ e.d }}</span>
                                <div class="col" style="line-height: 1.3;">
                                    <span>{{ e.t }}</span>
                                    <span class="small muted">{{ e.s }}</span>
                                </div>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 12px;">
                            {{ $t('ceremly.event.distribution.historyEmpty') }}
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ─── Modale conferma invio email ─────────────────────────── -->
        <div v-if="confirmSendOpen" class="cer-overlay" @click.self="confirmSendOpen = false">
            <div class="cer-modal" style="max-width: 460px;">
                <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.distribution.confirmTitle') }}</div>
                <div class="muted" style="font-size: 14px; margin-top: 10px; line-height: 1.5;">
                    {{ $t('ceremly.event.distribution.confirmBody', { n: emailTargets.length }) }}
                </div>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 20px;">
                    <button class="cer-btn ghost small" type="button" @click="confirmSendOpen = false">{{ $t('common.cancel') }}</button>
                    <button class="cer-btn small wine" type="button" :disabled="sending" @click="doSend">
                        <CerIcon name="send" :s="12" /> {{ sending ? $t('ceremly.event.distribution.sending') : $t('ceremly.event.distribution.btnSendEmail', { n: emailTargets.length }) }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Overlay e modale custom .cer (stesso stile della pagina ospiti) */
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
    border-radius: 12px;
    animation: cer-pulse 1.2s ease-in-out infinite;
}
@keyframes cer-pulse {
    0%, 100% { opacity: 0.55; }
    50% { opacity: 1; }
}
</style>
