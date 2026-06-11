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
const eventId = computed(() => String(route.params.id ?? ""));

const { listGuests, sendInvites, sendTest, markWhatsappSent } = useEventGuests();

// ─── Contesto evento (sidebar) + breadcrumbs ─────────────────────────
interface CeremlyEventCtx { id: string; title: string; type: string }
const eventCtx = useState<CeremlyEventCtx | null>("ceremly-event-ctx", () => null);
const crumbs = useState<string[]>("ceremly-crumbs", () => []);

const TYPE_LABELS: Record<string, string> = {
    matrimonio: "Matrimonio",
    laurea: "Laurea",
    battesimo: "Battesimo",
    compleanno: "Compleanno",
};

const eventData = ref<CeremlyEvent | null>(null);

watchEffect(() => {
    const label = eventData.value ? TYPE_LABELS[eventData.value.type] ?? eventData.value.title : "Evento";
    crumbs.value = ["Eventi", label, "Distribuzione"];
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
        loadError.value = errOf(e).data?.statusMessage || errOf(e).message || "Errore nel caricamento dei dati di invio";
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
    if (!summary.value) return "Caricamento…";
    return `${notSentCount.value} ospiti non hanno ancora ricevuto il link · ${summary.value.pending} in attesa di risposta`;
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
    if (!text) return "Il messaggio apparirà qui…";
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
        toast.add({ title: "Completa il messaggio", description: "Oggetto e messaggio sono obbligatori prima dell'invio.", color: "error" });
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
        toast.add({
            title: "Inviti in partenza",
            description: `${queued} email in coda${skippedNoEmail > 0 ? ` · ${skippedNoEmail} ospiti saltati (senza email)` : ""}.`,
            color: "success",
        });
        await refreshGuests();
    } catch (e) {
        toast.add({ title: "Invio non riuscito", description: errOf(e).data?.statusMessage || "Riprova tra qualche istante.", color: "error" });
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
        toast.add({ title: "Test inviato", description: "Controlla la tua casella: l'email di prova è in arrivo.", color: "success" });
    } catch (e) {
        toast.add({ title: "Test non riuscito", description: errOf(e).data?.statusMessage || "Invio dell'email di test non riuscito.", color: "error" });
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
        toast.add({ title: "Modello salvato", description: "Il messaggio WhatsApp è stato aggiornato.", color: "success" });
    } catch (e) {
        toast.add({ title: "Errore", description: errOf(e).data?.statusMessage || "Salvataggio del modello non riuscito.", color: "error" });
    } finally {
        waSavingTemplate.value = false;
    }
}

async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        toast.add({ title: "Copia non riuscita", description: "Il browser ha bloccato l'accesso agli appunti.", color: "error" });
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
        toast.add({ title: "Attenzione", description: errOf(e).data?.statusMessage || "Messaggio copiato, ma lo stato di invio non è stato aggiornato.", color: "warning" });
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
        toast.add({ title: "Messaggi copiati", description: `${waTargets.value.length} messaggi personalizzati copiati negli appunti.`, color: "success" });
        await refreshGuests();
    } catch (e) {
        toast.add({ title: "Attenzione", description: errOf(e).data?.statusMessage || "Messaggi copiati, ma lo stato di invio non è stato aggiornato.", color: "warning" });
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
        const key = g.groupName?.trim() || "Senza gruppo";
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
                t: v.channel === "whatsapp" ? `${n} link via WhatsApp` : `${n} inviti via email`,
                s: v.channel === "whatsapp"
                    ? `${n} link copiati`
                    : `aperti ${opened} · risposte ${responded}`,
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
            <button class="cer-btn ghost small" type="button" style="margin-top: 12px;" @click="loadAll">Riprova</button>
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
            <h1>Distribuisci gli inviti</h1>
            <div class="h-sub">{{ headerSub }}</div>

            <div v-if="hasSelection" class="row" style="margin-top: 10px;">
                <span class="cer-tag">Selezione dalla lista ospiti · {{ preselectedIds.size }} ospiti</span>
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
                    <CerIcon name="mail" :s="14" /> Email · {{ emailTargets.length }} ospiti
                </button>
                <button
                    type="button"
                    class="cer-btn"
                    :class="{ ghost: channel !== 'whatsapp' }"
                    style="border-radius: 999px; border-color: transparent;"
                    @click="channel = 'whatsapp'"
                >
                    <CerIcon name="whatsapp" :s="14" /> WhatsApp · {{ waTargets.length }} ospiti
                </button>
            </div>

            <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 20px; margin-top: 22px;">
                <!-- ─── EMAIL COMPOSER ───────────────────────────────── -->
                <div v-if="channel === 'email'" class="cer-card" style="padding: 22px;">
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">Email d'invito</div>
                    <div class="serif" style="font-size: 22px; margin-top: 4px;">Scrivi il messaggio</div>

                    <div style="display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 18px;">
                        <div class="col" style="gap: 4px;">
                            <label class="cer-flabel">Mittente</label>
                            <input class="cer-input" :value="senderLine" readonly style="color: var(--ink-500); background: var(--bone);">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="cer-flabel">Oggetto</label>
                            <input v-model="subject" class="cer-input" placeholder="Es. Ci sposiamo — ci sarai?">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="cer-flabel row" style="justify-content: space-between;">
                                <span>Messaggio</span>
                                <span>variabili: <span class="cer-tag" style="font-size: 9px;">{nome}</span> <span class="cer-tag" style="font-size: 9px;">{link}</span></span>
                            </label>
                            <textarea v-model="body" class="cer-input" :rows="8" placeholder="Scrivi il messaggio che accompagnerà il link personale…" />
                        </div>
                    </div>

                    <div style="height: 1px; background: var(--bone-200); margin: 20px 0;" />

                    <!-- Anteprima inbox -->
                    <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">Anteprima inbox</div>
                    <div style="margin-top: 12px; padding: 18px; background: var(--bone-100); border-radius: 12px; border: 1px solid var(--bone-200);">
                        <div class="row" style="gap: 10px;">
                            <div class="av ink">{{ (senderName[0] || "C").toUpperCase() }}</div>
                            <div class="col" style="line-height: 1.25; flex: 1;">
                                <div class="row" style="justify-content: space-between;">
                                    <span style="font-size: 13px; font-weight: 500;">{{ senderName }}</span>
                                    <span class="small muted">oggi · {{ nowTime }}</span>
                                </div>
                                <span style="font-size: 13px;">{{ subject || "L'oggetto apparirà qui…" }}</span>
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
                                Apri l'invito di {{ previewGuestName }}
                            </button>
                        </div>
                    </div>

                    <div class="row" style="justify-content: space-between; margin-top: 18px;">
                        <button class="cer-btn ghost" type="button" :disabled="testSending" @click="doSendTest">
                            <CerIcon name="eye" :s="14" /> {{ testSending ? "Invio…" : "Invia un test a me" }}
                        </button>
                        <button
                            class="cer-btn wine"
                            type="button"
                            :disabled="emailTargets.length === 0"
                            @click="openConfirmSend"
                        >
                            <CerIcon name="send" :s="14" /> Invia a {{ emailTargets.length }} ospiti
                        </button>
                    </div>
                    <div v-if="emailTargets.length === 0" class="small muted" style="margin-top: 10px; text-align: right;">
                        {{ hasSelection ? "Nessuno degli ospiti selezionati ha un'email: passa al canale WhatsApp." : "Tutti gli ospiti con email hanno già ricevuto il link." }}
                    </div>
                </div>

                <!-- ─── WHATSAPP COPIER ─────────────────────────────── -->
                <div v-else class="cer-card" style="padding: 22px;">
                    <div class="row" style="justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">WhatsApp</div>
                            <div class="serif" style="font-size: 22px; margin-top: 4px;">Copia &amp; incolla per {{ waTargets.length }} ospiti</div>
                            <div class="small muted" style="margin-top: 4px;">
                                Generiamo un messaggio personalizzato per ogni ospite — basta cliccare "Copia" e incollarlo nella chat.
                            </div>
                        </div>
                        <button
                            class="cer-btn small ghost"
                            type="button"
                            :disabled="waTargets.length === 0 || copyingAll"
                            @click="copyAll"
                        >
                            <CerIcon name="copy" :s="12" /> Copia tutti i {{ waTargets.length }}
                        </button>
                    </div>

                    <!-- Modello editabile -->
                    <div class="col" style="gap: 4px; margin-top: 18px;">
                        <label class="cer-flabel row" style="justify-content: space-between;">
                            <span>Modello messaggio</span>
                            <span>variabili: <span class="cer-tag" style="font-size: 9px;">{nome}</span> <span class="cer-tag" style="font-size: 9px;">{link}</span></span>
                        </label>
                        <textarea v-model="waTemplate" class="cer-input" :rows="3" />
                        <button
                            class="cer-btn ghost small"
                            type="button"
                            style="align-self: flex-end; margin-top: 4px;"
                            :disabled="waSavingTemplate"
                            @click="saveWaTemplate"
                        >
                            <CerIcon name="check" :s="12" /> {{ waSavingTemplate ? "Salvo…" : "Salva modello" }}
                        </button>
                    </div>

                    <div v-if="waTargets.length === 0" class="small muted" style="margin-top: 18px;">
                        Tutti i tuoi ospiti hanno un'email: puoi raggiungerli dal canale Email. Gli ospiti senza email compariranno qui.
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
                                    <template v-if="copiedGuestId === g.id"><CerIcon name="check" :s="12" /> Copiato ✓</template>
                                    <template v-else><CerIcon name="copy" :s="12" /> Copia</template>
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
                            Mostra tutti gli altri {{ waTargets.length - 4 }} <CerIcon name="chevD" :s="12" />
                        </button>
                    </div>
                </div>

                <!-- ─── COLONNA DESTRA ──────────────────────────────── -->
                <div class="col" style="gap: 16px; align-items: stretch;">
                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">Destinatari · questo invio</div>
                        <div class="serif" style="font-size: 36px; margin-top: 6px;">{{ currentTargets.length }}</div>
                        <div class="small muted">ospiti riceveranno l'invito {{ channel === "email" ? "via email" : "via WhatsApp" }}</div>

                        <div v-if="groupBreakdown.length > 0" class="col" style="gap: 10px; margin-top: 16px;">
                            <div v-for="g in groupBreakdown" :key="g.l" class="row" style="gap: 12px; font-size: 13px;">
                                <span class="cer-dot" :style="{ background: g.c }" />
                                <span style="flex: 1;">{{ g.l }}</span>
                                <span class="mono small muted">{{ g.n }} ospiti</span>
                            </div>
                        </div>
                        <div v-else class="small muted" style="margin-top: 16px;">Nessun destinatario per questo canale.</div>
                    </div>

                    <div class="cer-card" style="padding: 20px; background: var(--ink); color: var(--bone-50); border-color: var(--ink);">
                        <div class="row" style="gap: 10px; align-items: flex-start;">
                            <div style="padding-top: 2px;"><CerIcon name="sparkle" :s="16" /></div>
                            <div class="col" style="gap: 6px;">
                                <div style="font-size: 14px; font-weight: 500;">Pronto/a per il primo invio?</div>
                                <div class="small" style="color: var(--bone-200); line-height: 1.5;">
                                    Quando un ospite apre il link, lo vedrai aggiornarsi in tempo reale nella tua dashboard. Possiamo configurare anche reminder automatici.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cer-card" style="padding: 20px;">
                        <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">Cronologia invii</div>
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
                            Nessun invio ancora — il primo è il più emozionante.
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <!-- ─── Modale conferma invio email ─────────────────────────── -->
        <div v-if="confirmSendOpen" class="cer-overlay" @click.self="confirmSendOpen = false">
            <div class="cer-modal" style="max-width: 460px;">
                <div class="serif" style="font-size: 20px;">Inviare gli inviti?</div>
                <div class="muted" style="font-size: 14px; margin-top: 10px; line-height: 1.5;">
                    Stai per inviare {{ emailTargets.length }} email. I link sono personali per ospite.
                </div>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 20px;">
                    <button class="cer-btn ghost small" type="button" @click="confirmSendOpen = false">Annulla</button>
                    <button class="cer-btn small wine" type="button" :disabled="sending" @click="doSend">
                        <CerIcon name="send" :s="12" /> {{ sending ? "Invio…" : `Invia a ${emailTargets.length} ospiti` }}
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
