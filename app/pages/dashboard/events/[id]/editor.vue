<script setup lang="ts">
// Editor invito — port fedele di docs/ui/project/screens/editor.jsx (EditorScreen).
// Grid 220 / 1fr / 280 a piena altezza: libreria blocchi · anteprima live
// (InviteRenderer interactive) · inspector del blocco selezionato.
import type {
    BlockType,
    CeremlyEvent,
    InviteBlock,
} from "~~/shared/types/ceremly";
import { getTemplate } from "~~/shared/constants/templates";

definePageMeta({ layout: "ceremly" });

const { t } = useI18n();

interface CeremlyEventCtx {
    id: string;
    title: string;
    type: string;
}

const route = useRoute();
const toast = useToast();
const eventId = computed(() => String(route.params.id ?? ""));

// ─── Stato ───────────────────────────────────────────────────────────
const eventData = ref<CeremlyEvent | null>(null);
const blocks = ref<InviteBlock[]>([]);
/** Deadline RSVP locale (YYYY-MM-DD), salvata su event.rsvpDeadline col PUT. */
const rsvpDeadline = ref("");
const pending = ref(true);
const loadError = ref<string | null>(null);

const activeBlockId = ref<string | null>(null);
const device = ref<"desktop" | "mobile">("desktop");
const saveBtn = useButtonSuccess();
const previewOpen = ref(false);
const confirmDeleteId = ref<string | null>(null);
const uploadingGallery = ref(false);
const galleryInput = ref<HTMLInputElement | null>(null);

// ─── Dirty tracking ──────────────────────────────────────────────────
const savedSnapshot = ref("");
function snapshot(): string {
    return JSON.stringify({ blocks: blocks.value, rsvpDeadline: rsvpDeadline.value });
}
const isDirty = computed(() => savedSnapshot.value !== "" && snapshot() !== savedSnapshot.value);

// ─── Breadcrumbs + contesto evento sidebar ───────────────────────────
const crumbs = useState<string[]>("ceremly-crumbs", () => []);
const eventCtx = useState<CeremlyEventCtx | null>("ceremly-event-ctx", () => null);
crumbs.value = [t("ceremly.event.editor.breadcrumb.events"), t("ceremly.event.editor.breadcrumb.event"), t("ceremly.event.editor.breadcrumb.invite")];

// ─── Libreria blocchi (label e icone come blockLib del mockup) ───────
const BLOCK_LIB: { type: BlockType; label: string; icon: string; locked?: boolean }[] = [
    { type: "header", label: t("ceremly.event.editor.library.header"), icon: "ring" },
    { type: "message", label: t("ceremly.event.editor.library.message"), icon: "edit" },
    { type: "program", label: t("ceremly.event.editor.library.program"), icon: "clock" },
    { type: "location", label: t("ceremly.event.editor.library.location"), icon: "pin" },
    { type: "dresscode", label: t("ceremly.event.editor.library.dresscode"), icon: "sparkle" },
    { type: "logistics", label: t("ceremly.event.editor.library.logistics"), icon: "calendar" },
    { type: "countdown", label: t("ceremly.event.editor.library.countdown"), icon: "clock" },
    { type: "gallery", label: t("ceremly.event.editor.library.gallery"), icon: "eye" },
    { type: "rsvp", label: t("ceremly.event.editor.library.rsvp"), icon: "check", locked: true },
];

const INSPECTOR_TITLES: Record<BlockType, string> = {
    header: t("ceremly.event.editor.inspector.header"),
    message: t("ceremly.event.editor.inspector.message"),
    program: t("ceremly.event.editor.inspector.program"),
    location: t("ceremly.event.editor.inspector.location"),
    dresscode: t("ceremly.event.editor.inspector.dresscode"),
    logistics: t("ceremly.event.editor.inspector.logistics"),
    countdown: t("ceremly.event.editor.inspector.countdown"),
    gallery: t("ceremly.event.editor.inspector.gallery"),
    rsvp: t("ceremly.event.editor.inspector.rsvp"),
};

// ─── Blocchi: factory placeholder ────────────────────────────────────
function newBlockId(): string {
    return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function makeBlock(type: BlockType): InviteBlock {
    const id = newBlockId();
    switch (type) {
        case "header":
            return { id, type: "header", data: { eyebrow: "Save the date", intro: "", names: ["Nome"], dateText: "", timeText: "" } };
        case "message":
            return { id, type: "message", data: { text: "Saremo felici di avervi accanto in questo giorno speciale." } };
        case "program":
            return { id, type: "program", data: { title: "Programma", items: [{ time: "16:00", label: "Cerimonia", description: "" }] } };
        case "location":
            return { id, type: "location", data: { title: "Dove", name: "Nome della location", address: "Via e numero, Città", showMap: true, mapsUrl: "" } };
        case "dresscode":
            return { id, type: "dresscode", data: { title: "Dress code", headline: "Elegante", note: "" } };
        case "logistics":
            return { id, type: "logistics", data: { title: "Informazioni utili", text: "Parcheggio disponibile nelle vicinanze." } };
        case "countdown":
            return { id, type: "countdown", data: { title: "Manca poco" } };
        case "gallery":
            return { id, type: "gallery", data: { images: [] } };
        case "rsvp":
            return { id, type: "rsvp", data: { buttonLabel: "Rispondi all'invito" } };
    }
}

/** Garantisce le invarianti del PUT: header presente e primo, rsvp presente e ultimo. */
function normalizeBlocks(list: InviteBlock[]): InviteBlock[] {
    const headers = list.filter((b) => b.type === "header");
    const rsvps = list.filter((b) => b.type === "rsvp");
    const middle = list.filter((b) => b.type !== "header" && b.type !== "rsvp");
    return [headers[0] ?? makeBlock("header"), ...middle, rsvps[0] ?? makeBlock("rsvp")];
}

// ─── Fetch evento ────────────────────────────────────────────────────
async function loadEvent() {
    pending.value = true;
    loadError.value = null;
    try {
        const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`);
        const ev = res.event;
        eventData.value = ev;
        blocks.value = normalizeBlocks(structuredClone(ev.blocks ?? []));
        rsvpDeadline.value = ev.rsvpDeadline ? String(ev.rsvpDeadline).slice(0, 10) : "";
        activeBlockId.value = blocks.value[0]?.id ?? null;
        crumbs.value = [t("ceremly.event.editor.breadcrumb.events"), t(`ceremly.eventType.${ev.type}.label`), t("ceremly.event.editor.breadcrumb.invite")];
        eventCtx.value = { id: ev.id, title: ev.title, type: ev.type };
        savedSnapshot.value = snapshot();
    } catch (e: unknown) {
        const err = e as { data?: { statusMessage?: string; message?: string }; message?: string };
        loadError.value = err.data?.statusMessage || err.data?.message || err.message || t("ceremly.event.editor.error.network");
    } finally {
        pending.value = false;
    }
}
loadEvent();

const templateName = computed(() => {
    const key = eventData.value?.templateKey ?? "";
    return getTemplate(key)?.name ?? key;
});

// ─── Selezione e accessor tipizzati ──────────────────────────────────
const activeBlock = computed<InviteBlock | null>(
    () => blocks.value.find((b) => b.id === activeBlockId.value) ?? null,
);
const activeIndex = computed(() => blocks.value.findIndex((b) => b.id === activeBlockId.value));

const headerD = computed(() => (activeBlock.value?.type === "header" ? activeBlock.value.data : null));
const messageD = computed(() => (activeBlock.value?.type === "message" ? activeBlock.value.data : null));
const programD = computed(() => (activeBlock.value?.type === "program" ? activeBlock.value.data : null));
const locationD = computed(() => (activeBlock.value?.type === "location" ? activeBlock.value.data : null));
const dressD = computed(() => (activeBlock.value?.type === "dresscode" ? activeBlock.value.data : null));
const logisticsD = computed(() => (activeBlock.value?.type === "logistics" ? activeBlock.value.data : null));
const countdownD = computed(() => (activeBlock.value?.type === "countdown" ? activeBlock.value.data : null));
const galleryD = computed(() => (activeBlock.value?.type === "gallery" ? activeBlock.value.data : null));
const rsvpD = computed(() => (activeBlock.value?.type === "rsvp" ? activeBlock.value.data : null));

const inspectorTitle = computed(() => (activeBlock.value ? INSPECTOR_TITLES[activeBlock.value.type] : t("ceremly.event.editor.inspector.fallback")));
const isRemovable = computed(
    () => !!activeBlock.value && activeBlock.value.type !== "header" && activeBlock.value.type !== "rsvp",
);

// ─── Libreria: dot / click / blocco custom ───────────────────────────
function isOnPage(type: BlockType): boolean {
    return blocks.value.some((b) => b.type === type);
}
function isLibActive(type: BlockType): boolean {
    return activeBlock.value?.type === type;
}
function insertBeforeRsvp(blk: InviteBlock) {
    const i = blocks.value.findIndex((b) => b.type === "rsvp");
    if (i === -1) blocks.value.push(blk);
    else blocks.value.splice(i, 0, blk);
    activeBlockId.value = blk.id;
}
function onLibClick(type: BlockType) {
    const existing = blocks.value.find((b) => b.type === type);
    if (existing) {
        activeBlockId.value = existing.id;
        return;
    }
    insertBeforeRsvp(makeBlock(type));
}
function addCustomBlock() {
    const blk = makeBlock("logistics");
    if (blk.type === "logistics") blk.data.title = "Blocco personalizzato";
    insertBeforeRsvp(blk);
}

// ─── Riordino (header fisso primo, rsvp fisso ultimo) ────────────────
const canMoveUp = computed(() => isRemovable.value && activeIndex.value > 1);
const canMoveDown = computed(() => isRemovable.value && activeIndex.value < blocks.value.length - 2);

function moveActive(dir: -1 | 1) {
    const i = activeIndex.value;
    if (i < 0) return;
    const cur = blocks.value[i];
    if (!cur || cur.type === "header" || cur.type === "rsvp") return;
    const j = i + dir;
    if (j < 1 || j > blocks.value.length - 2) return;
    const arr = [...blocks.value];
    const other = arr[j]!;
    arr[j] = cur;
    arr[i] = other;
    blocks.value = arr;
}

// ─── Eliminazione blocco (con conferma) ──────────────────────────────
const confirmDeleteLabel = computed(() => {
    const blk = blocks.value.find((b) => b.id === confirmDeleteId.value);
    return blk ? INSPECTOR_TITLES[blk.type] : "";
});
function askDelete() {
    if (isRemovable.value && activeBlock.value) confirmDeleteId.value = activeBlock.value.id;
}
function confirmDelete() {
    const id = confirmDeleteId.value;
    confirmDeleteId.value = null;
    if (!id) return;
    const i = blocks.value.findIndex((b) => b.id === id);
    if (i < 0) return;
    const blk = blocks.value[i];
    if (!blk || blk.type === "header" || blk.type === "rsvp") return;
    blocks.value.splice(i, 1);
    if (activeBlockId.value === id) {
        activeBlockId.value = blocks.value[Math.max(0, i - 1)]?.id ?? null;
    }
}

// ─── Campi inspector: header / program / gallery ─────────────────────
function addName() {
    const d = headerD.value;
    if (d && d.names.length < 2) d.names.push("");
}
function removeName(i: number) {
    const d = headerD.value;
    if (d && d.names.length > 1) d.names.splice(i, 1);
}
function addProgramItem() {
    programD.value?.items.push({ time: "", label: "", description: "" });
}
function removeProgramItem(i: number) {
    programD.value?.items.splice(i, 1);
}
function removeGalleryImage(i: number) {
    galleryD.value?.images.splice(i, 1);
}

async function onGalleryFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const d = galleryD.value;
    if (!file || !d) return;
    if (d.images.length >= 5) {
        toast.add({ title: t("ceremly.event.editor.toast.gallery.limitTitle"), description: t("ceremly.event.editor.toast.gallery.limitDesc"), icon: "i-lucide-alert-circle", color: "error" });
        return;
    }
    if (!file.type.startsWith("image/")) {
        toast.add({ title: t("ceremly.event.editor.toast.gallery.invalidFileTitle"), description: t("ceremly.event.editor.toast.gallery.invalidFileDesc"), icon: "i-lucide-alert-circle", color: "error" });
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        toast.add({ title: t("ceremly.event.editor.toast.gallery.tooLargeTitle"), description: t("ceremly.event.editor.toast.gallery.tooLargeDesc"), icon: "i-lucide-alert-circle", color: "error" });
        return;
    }
    uploadingGallery.value = true;
    try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await $fetch<{ success: boolean; file: { url: string | null } }>("/api/file/upload", {
            method: "POST",
            body: formData,
        });
        if (res.success && res.file?.url) {
            d.images.push({ url: res.file.url, alt: file.name.replace(/\.[^.]+$/, "") });
        } else {
            throw new Error("URL pubblico non disponibile");
        }
    } catch {
        toast.add({ title: t("ceremly.event.editor.toast.gallery.uploadErrorTitle"), description: t("ceremly.event.editor.toast.gallery.uploadErrorDesc"), icon: "i-lucide-alert-circle", color: "error" });
    } finally {
        uploadingGallery.value = false;
    }
}

// ─── Salvataggio ─────────────────────────────────────────────────────
async function save(): Promise<boolean> {
    if (!eventData.value || saveBtn.busy) return false;
    const rsvpBlock = blocks.value.find((b) => b.type === "rsvp");
    if (rsvpBlock?.type === "rsvp" && !rsvpBlock.data.buttonLabel.trim()) {
        activeBlockId.value = rsvpBlock.id;
        toast.add({ title: t("ceremly.event.editor.toast.save.rsvpLabelMissingTitle"), description: t("ceremly.event.editor.toast.save.rsvpLabelMissingDesc"), icon: "i-lucide-alert-circle", color: "error" });
        return false;
    }
    try {
        await saveBtn.run(async () => {
            const res = await $fetch<{ event: CeremlyEvent }>(`/api/events/${eventId.value}`, {
                method: "PUT",
                body: {
                    blocks: blocks.value,
                    rsvpDeadline: rsvpDeadline.value || null,
                },
            });
            eventData.value = res.event;
            savedSnapshot.value = snapshot();
        });
        toast.add({ title: t("ceremly.event.editor.toast.save.successTitle"), description: t("ceremly.event.editor.toast.save.successDesc"), icon: "i-lucide-check", color: "success" });
        return true;
    } catch (e: unknown) {
        const err = e as { data?: { statusMessage?: string; message?: string } };
        toast.add({
            title: t("ceremly.event.editor.toast.save.errorTitle"),
            description: err.data?.statusMessage || err.data?.message || t("ceremly.event.editor.toast.save.errorDesc"),
            icon: "i-lucide-alert-circle",
            color: "error",
        });
        return false;
    }
}

async function saveAndContinue() {
    const ok = await save();
    if (ok) await navigateTo(`/dashboard/events/${eventId.value}/guests`);
}

// ─── Warning uscita con modifiche non salvate ────────────────────────
function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!isDirty.value) return;
    e.preventDefault();
    e.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
onBeforeRouteLeave(() => {
    if (isDirty.value && !window.confirm(t("ceremly.event.editor.unsavedChangesConfirm"))) {
        return false;
    }
});
</script>

<template>
    <div class="cer" style="height: 100%;">
        <!-- Loading: skeleton 3 colonne -->
        <div
            v-if="pending"
            style="display: grid; grid-template-columns: 220px 1fr 280px; gap: 16px; height: 100%;"
        >
            <div class="cer-skel" />
            <div class="cer-skel" />
            <div class="cer-skel" />
        </div>

        <!-- Error -->
        <div
            v-else-if="loadError"
            class="col"
            style="align-items: center; justify-content: center; height: 100%; gap: 12px; text-align: center;"
        >
            <div class="serif" style="font-size: 22px;">{{ $t('ceremly.event.editor.error.loadTitle') }}</div>
            <p class="small" style="margin: 0; color: var(--decline);">{{ loadError }}</p>
            <button class="cer-btn ghost small" type="button" @click="loadEvent">{{ $t('common.retry') }}</button>
        </div>

        <!-- Editor -->
        <div
            v-else-if="eventData"
            style="display: grid; grid-template-columns: 220px 1fr 280px; gap: 16px; height: 100%;"
        >
            <!-- Libreria blocchi -->
            <div class="col" style="gap: 14px; min-height: 0; overflow-y: auto;">
                <div class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                    {{ $t('ceremly.event.editor.sidebar.blocksHeading') }}
                </div>
                <div class="col" style="gap: 4px;">
                    <div
                        v-for="b in BLOCK_LIB"
                        :key="b.type"
                        class="row"
                        :style="{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            gap: '10px',
                            cursor: 'pointer',
                            background: isLibActive(b.type) ? 'var(--bone-100)' : 'transparent',
                            border: '1px solid ' + (isLibActive(b.type) ? 'var(--bone-200)' : 'transparent'),
                        }"
                        @click="onLibClick(b.type)"
                    >
                        <CeremlyCerIcon name="drag" :s="12" class="muted" />
                        <CeremlyCerIcon :name="b.icon" :s="14" />
                        <span style="font-size: 13px; flex: 1;">{{ b.label }}</span>
                        <CeremlyCerIcon v-if="b.locked" name="check" :s="11" class="muted" />
                        <span v-if="isOnPage(b.type) && !b.locked" class="cer-dot" style="background: var(--sage);" />
                    </div>
                </div>
                <button class="cer-btn ghost small" style="justify-content: center;" type="button" @click="addCustomBlock">
                    <CeremlyCerIcon name="plus" :s="12" /> {{ $t('ceremly.event.editor.sidebar.addCustomBlock') }}
                </button>
            </div>

            <!-- Preview -->
            <div
                class="col"
                style="background: var(--bone-100); border-radius: 14px; overflow: hidden; border: 1px solid var(--bone-200); min-height: 0;"
            >
                <div
                    class="row"
                    style="padding: 10px 16px; justify-content: space-between; border-bottom: 1px solid var(--bone-200); background: var(--bone-50);"
                >
                    <div class="row" style="gap: 8px;">
                        <span class="mono" style="font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-500);">
                            {{ $t('ceremly.event.editor.preview.heading', { template: templateName }) }}
                        </span>
                    </div>
                    <div class="row" style="gap: 4px; background: var(--bone-100); border-radius: 999px; padding: 3px;">
                        <button
                            type="button"
                            class="cer-btn small ghost"
                            :style="{ background: device === 'desktop' ? 'var(--bone-50)' : 'transparent', borderColor: 'transparent', borderRadius: '999px' }"
                            @click="device = 'desktop'"
                        >
                            {{ $t('ceremly.event.editor.preview.desktop') }}
                        </button>
                        <button
                            type="button"
                            class="cer-btn small ghost"
                            :style="{ background: device === 'mobile' ? 'var(--bone-50)' : 'transparent', borderColor: 'transparent', borderRadius: '999px' }"
                            @click="device = 'mobile'"
                        >
                            {{ $t('ceremly.event.editor.preview.mobile') }}
                        </button>
                    </div>
                </div>

                <div class="scroll" style="padding: 24px; display: flex; justify-content: center; flex: 1; overflow-y: auto;">
                    <div :style="{ width: device === 'mobile' ? '360px' : '540px', transition: 'width 200ms', flexShrink: 0 }">
                        <CeremlyInviteRenderer
                            :blocks="blocks"
                            :template="eventData.templateKey"
                            :event-date="eventData.eventDate"
                            :rsvp-deadline="rsvpDeadline || null"
                            interactive
                            :active-block-id="activeBlockId"
                            @select="activeBlockId = $event"
                        />
                    </div>
                </div>
            </div>

            <!-- Inspector -->
            <div class="col cer-card scroll" style="padding: 16px; gap: 14px; min-height: 0; overflow-y: auto;">
                <div class="row" style="justify-content: space-between; align-items: flex-start;">
                    <div>
                        <div class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                            {{ $t('ceremly.event.editor.inspector.selectedBlock') }}
                        </div>
                        <div class="serif" style="font-size: 22px; margin-top: 2px;">{{ inspectorTitle }}</div>
                    </div>
                    <div v-if="activeBlock" class="row" style="gap: 4px;">
                        <button
                            class="cer-btn ghost small"
                            style="padding: 6px;"
                            type="button"
                            :disabled="!canMoveUp"
                            :aria-label="$t('ceremly.event.editor.inspector.moveUp')"
                            @click="moveActive(-1)"
                        >
                            <CeremlyCerIcon name="chevD" :s="14" style="transform: rotate(180deg);" />
                        </button>
                        <button
                            class="cer-btn ghost small"
                            style="padding: 6px;"
                            type="button"
                            :disabled="!canMoveDown"
                            :aria-label="$t('ceremly.event.editor.inspector.moveDown')"
                            @click="moveActive(1)"
                        >
                            <CeremlyCerIcon name="chevD" :s="14" />
                        </button>
                        <button
                            v-if="isRemovable"
                            class="cer-btn ghost small"
                            style="padding: 6px;"
                            type="button"
                            :aria-label="$t('ceremly.event.editor.inspector.removeBlock')"
                            @click="askDelete"
                        >
                            <CeremlyCerIcon name="trash" :s="14" />
                        </button>
                    </div>
                </div>

                <div v-if="!activeBlock" class="small muted">
                    {{ $t('ceremly.event.editor.inspector.noSelection') }}
                </div>

                <div v-else class="col" style="gap: 10px;">
                    <!-- header -->
                    <template v-if="headerD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.header.eyebrow') }}</label>
                            <input v-model="headerD.eyebrow" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.header.eyebrowPlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.header.intro') }}</label>
                            <input v-model="headerD.intro" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.header.introPlaceholder')">
                        </div>
                        <div v-for="(_, i) in headerD.names" :key="i" class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.header.name', { n: i + 1 }) }}</label>
                            <div class="row" style="gap: 6px;">
                                <input v-model="headerD.names[i]" class="cer-input">
                                <button
                                    v-if="headerD.names.length > 1"
                                    class="cer-btn ghost small"
                                    style="padding: 6px;"
                                    type="button"
                                    :aria-label="$t('ceremly.event.editor.fields.header.removeName')"
                                    @click="removeName(i)"
                                >
                                    <CeremlyCerIcon name="x" :s="12" />
                                </button>
                            </div>
                        </div>
                        <button
                            v-if="headerD.names.length < 2"
                            class="cer-btn ghost small"
                            style="justify-content: center;"
                            type="button"
                            @click="addName"
                        >
                            <CeremlyCerIcon name="plus" :s="12" /> {{ $t('ceremly.event.editor.fields.header.addName') }}
                        </button>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.header.date') }}</label>
                            <input v-model="headerD.dateText" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.header.datePlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.header.time') }}</label>
                            <input v-model="headerD.timeText" class="cer-input" placeholder="16:00">
                        </div>
                    </template>

                    <!-- message -->
                    <template v-else-if="messageD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.message.text') }}</label>
                            <textarea v-model="messageD.text" class="cer-input" rows="3" />
                        </div>
                    </template>

                    <!-- program -->
                    <template v-else-if="programD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.program.blockTitle') }}</label>
                            <input v-model="programD.title" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.program.blockTitlePlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.program.items') }}</label>
                            <div class="col" style="gap: 8px;">
                                <div
                                    v-for="(it, i) in programD.items"
                                    :key="i"
                                    class="col"
                                    style="gap: 6px; border: 1px solid var(--line); border-radius: 8px; padding: 10px;"
                                >
                                    <div class="row" style="gap: 6px;">
                                        <input v-model="it.time" class="cer-input" placeholder="16:00" style="width: 72px; flex-shrink: 0;">
                                        <input v-model="it.label" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.program.itemLabelPlaceholder')">
                                        <button
                                            class="cer-btn ghost small"
                                            style="padding: 6px;"
                                            type="button"
                                            :aria-label="$t('ceremly.event.editor.fields.program.removeItem')"
                                            @click="removeProgramItem(i)"
                                        >
                                            <CeremlyCerIcon name="x" :s="12" />
                                        </button>
                                    </div>
                                    <input v-model="it.description" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.program.itemDescPlaceholder')">
                                </div>
                            </div>
                            <div v-if="programD.items.length === 0" class="small muted">
                                {{ $t('ceremly.event.editor.fields.program.noItems') }}
                            </div>
                            <button class="cer-btn ghost small" style="justify-content: center; margin-top: 2px;" type="button" @click="addProgramItem">
                                <CeremlyCerIcon name="plus" :s="12" /> {{ $t('ceremly.event.editor.fields.program.addItem') }}
                            </button>
                        </div>
                    </template>

                    <!-- location -->
                    <template v-else-if="locationD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.location.title') }}</label>
                            <input v-model="locationD.title" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.location.titlePlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.location.name') }}</label>
                            <input v-model="locationD.name" class="cer-input" placeholder="Villa Erba">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.location.address') }}</label>
                            <input v-model="locationD.address" class="cer-input" placeholder="Largo L. Visconti 4, Cernobbio (CO)">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.location.showMap') }}</label>
                            <CeremlyCerToggle v-model="locationD.showMap" :label="locationD.showMap ? $t('ceremly.event.editor.fields.location.mapOn') : $t('ceremly.event.editor.fields.location.mapOff')" />
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.location.mapsUrl') }}</label>
                            <input v-model="locationD.mapsUrl" class="cer-input" placeholder="https://maps.google.com/…">
                            <div class="small muted">{{ $t('ceremly.event.editor.fields.location.mapsUrlHint') }}</div>
                        </div>
                    </template>

                    <!-- dresscode -->
                    <template v-else-if="dressD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.dresscode.title') }}</label>
                            <input v-model="dressD.title" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.dresscode.titlePlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.dresscode.headline') }}</label>
                            <input v-model="dressD.headline" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.dresscode.headlinePlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.dresscode.note') }}</label>
                            <input v-model="dressD.note" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.dresscode.notePlaceholder')">
                        </div>
                    </template>

                    <!-- logistics -->
                    <template v-else-if="logisticsD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.logistics.title') }}</label>
                            <input v-model="logisticsD.title" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.logistics.titlePlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.logistics.text') }}</label>
                            <textarea v-model="logisticsD.text" class="cer-input" rows="4" />
                        </div>
                    </template>

                    <!-- countdown -->
                    <template v-else-if="countdownD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.countdown.title') }}</label>
                            <input v-model="countdownD.title" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.countdown.titlePlaceholder')">
                        </div>
                        <div class="small muted">
                            {{ eventData.eventDate
                                ? $t('ceremly.event.editor.fields.countdown.hintWithDate')
                                : $t('ceremly.event.editor.fields.countdown.hintNoDate') }}
                        </div>
                    </template>

                    <!-- gallery -->
                    <template v-else-if="galleryD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.gallery.images', { count: galleryD.images.length }) }}</label>
                            <div v-if="galleryD.images.length" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                <div v-for="(img, i) in galleryD.images" :key="i" style="position: relative;">
                                    <img
                                        :src="img.url"
                                        :alt="img.alt"
                                        style="width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 8px; display: block; border: 1px solid var(--line);"
                                    >
                                    <button class="img-x" type="button" :aria-label="$t('ceremly.event.editor.fields.gallery.removeImage')" @click="removeGalleryImage(i)">
                                        <CeremlyCerIcon name="x" :s="11" />
                                    </button>
                                </div>
                            </div>
                            <div v-else class="small muted">{{ $t('ceremly.event.editor.fields.gallery.noImages') }}</div>
                            <input ref="galleryInput" type="file" accept="image/*" style="display: none;" @change="onGalleryFile">
                            <button
                                class="cer-btn ghost small"
                                style="justify-content: center; margin-top: 2px;"
                                type="button"
                                :disabled="galleryD.images.length >= 5 || uploadingGallery"
                                @click="galleryInput?.click()"
                            >
                                <CeremlyCerIcon name="upload" :s="12" />
                                {{ uploadingGallery ? $t('ceremly.event.editor.fields.gallery.uploading') : $t('ceremly.event.editor.fields.gallery.upload') }}
                            </button>
                        </div>
                    </template>

                    <!-- rsvp -->
                    <template v-else-if="rsvpD">
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.rsvp.buttonLabel') }}</label>
                            <input v-model="rsvpD.buttonLabel" class="cer-input" :placeholder="$t('ceremly.event.editor.fields.rsvp.buttonLabelPlaceholder')">
                        </div>
                        <div class="col" style="gap: 4px;">
                            <label class="ins-label">{{ $t('ceremly.event.editor.fields.rsvp.deadline') }}</label>
                            <input v-model="rsvpDeadline" type="date" class="cer-input">
                            <div class="small muted">{{ $t('ceremly.event.editor.fields.rsvp.deadlineHint') }}</div>
                        </div>
                    </template>
                </div>

                <div class="divider" style="margin-top: auto;" />

                <div class="col" style="gap: 8px;">
                    <div class="row" style="justify-content: space-between;">
                        <div class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                            {{ $t('ceremly.event.editor.visibility.label') }}
                        </div>
                        <span class="cer-tag">Phase 2</span>
                    </div>
                    <select class="cer-input" disabled>
                        <option>{{ $t('ceremly.event.editor.visibility.allGuests') }}</option>
                    </select>
                    <div class="small muted">
                        {{ $t('ceremly.event.editor.visibility.hint') }}
                    </div>
                </div>
            </div>
        </div>

        <!-- Azioni topbar -->
        <ClientOnly>
            <Teleport defer to="#ceremly-topbar-actions">
                <div class="row" style="gap: 8px;">
                    <button
                        class="cer-btn ghost small"
                        type="button"
                        :disabled="pending || !eventData"
                        @click="previewOpen = true"
                    >
                        <CeremlyCerIcon name="eye" :s="14" /> {{ $t('ceremly.event.editor.topbar.preview') }}
                    </button>
                    <button
                        class="cer-btn ghost small"
                        :class="{ success: saveBtn.isSuccess }"
                        type="button"
                        :disabled="pending || !eventData || saveBtn.busy"
                        @click="save()"
                    >
                        {{ saveBtn.isLoading ? $t('ceremly.event.editor.topbar.saving') : saveBtn.isSuccess ? $t('common.saved') : $t('common.save') }}
                        <span v-if="isDirty && !saveBtn.busy" class="cer-dot" style="background: var(--orange);" />
                    </button>
                    <button
                        class="cer-btn small"
                        type="button"
                        :disabled="pending || !eventData || saveBtn.busy"
                        @click="saveAndContinue"
                    >
                        {{ $t('ceremly.event.editor.topbar.saveAndContinue') }} <CeremlyCerIcon name="chevR" :s="12" />
                    </button>
                </div>
            </Teleport>
        </ClientOnly>

        <!-- Modale anteprima ospite (mobile 390px) -->
        <div v-if="previewOpen && eventData" class="cer-overlay" @click.self="previewOpen = false">
            <div style="width: 390px; max-width: calc(100vw - 32px); max-height: calc(100vh - 48px); display: flex; flex-direction: column; gap: 10px;">
                <div class="row" style="justify-content: space-between;">
                    <span class="mono" style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #fff;">
                        {{ $t('ceremly.event.editor.guestPreview.title') }}
                    </span>
                    <button class="cer-btn ghost small" style="padding: 6px;" type="button" :aria-label="$t('ceremly.event.editor.guestPreview.close')" @click="previewOpen = false">
                        <CeremlyCerIcon name="x" :s="14" />
                    </button>
                </div>
                <div class="scroll" style="overflow-y: auto; border-radius: 16px; min-height: 0;">
                    <CeremlyInviteRenderer
                        :blocks="blocks"
                        :template="eventData.templateKey"
                        :event-date="eventData.eventDate"
                        :rsvp-deadline="rsvpDeadline || null"
                    />
                </div>
            </div>
        </div>

        <!-- Conferma rimozione blocco -->
        <div v-if="confirmDeleteId" class="cer-overlay" @click.self="confirmDeleteId = null">
            <div class="cer-card col" style="width: 380px; max-width: calc(100vw - 32px); padding: 22px; gap: 10px;">
                <div class="serif" style="font-size: 20px;">{{ $t('ceremly.event.editor.deleteModal.title') }}</div>
                <p class="small muted" style="margin: 0;">
                    {{ $t('ceremly.event.editor.deleteModal.body', { label: confirmDeleteLabel }) }}
                </p>
                <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 6px;">
                    <button class="cer-btn ghost small" type="button" @click="confirmDeleteId = null">{{ $t('common.cancel') }}</button>
                    <button
                        class="cer-btn small"
                        style="background: var(--decline); color: #fff;"
                        type="button"
                        @click="confirmDelete"
                    >
                        <CeremlyCerIcon name="trash" :s="12" /> {{ $t('ceremly.event.editor.deleteModal.confirm') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ins-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-500);
}

.cer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(63, 54, 34, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 24px;
}

.cer-btn:disabled {
    opacity: 0.35;
    cursor: default;
    pointer-events: none;
}

.cer-skel {
    background: var(--bone-100);
    border: 1px solid var(--bone-200);
    border-radius: 14px;
    animation: cer-skel-pulse 1.4s ease-in-out infinite;
}

@keyframes cer-skel-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.55;
    }
}

.img-x {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--bone-50);
    border: 1px solid var(--line-strong);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}
</style>
