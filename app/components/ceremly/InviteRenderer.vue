<script setup lang="ts">
// Invite renderer — faithful port of InvitePreview (docs/ui/project/screens/editor.jsx)
// integrated with invite-mobile.jsx for blocks not present in the editor
// (countdown, gallery, logistics, location map with pin + Maps button).
// Template accent via CSS var --tpl-accent / --tpl-accent-soft inline on the root.
import type { CSSProperties } from "vue";
import type {
    BlockType,
    CountdownBlockData,
    DresscodeBlockData,
    GalleryBlockData,
    HeaderBlockData,
    InviteBlock,
    LocationBlockData,
    LogisticsBlockData,
    MessageBlockData,
    ProgramBlockData,
    RsvpBlockData,
} from "~~/shared/types/ceremly";
import { getTemplate } from "~~/shared/constants/templates";
import type { FontCategory, InviteTheme } from "~~/shared/constants/inviteTheme";
import { fontSlug, getCatalogFont } from "~~/shared/constants/inviteTheme";
import { deriveInk, deriveLine, deriveSoft } from "~~/shared/utils/inviteColor";
import CerIcon from "./CerIcon.vue";
import CountdownRing from "./CountdownRing.vue";

/** Generic fallback by category: a sans/handwriting font must not fall back to serif during FOUT. */
const GENERIC_FALLBACK: Record<FontCategory, string> = {
    serif: "serif",
    sans: "sans-serif",
    display: "serif",
    handwriting: "cursive",
};

const { t } = useI18n();

const props = withDefaults(
    defineProps<{
        blocks: InviteBlock[];
        /** Object { accent, accentSoft } or key resolved with getTemplate. */
        template: { accent: string; accentSoft: string } | string;
        /** Custom color theme. null/absent ⇒ accent from template. */
        theme?: InviteTheme | null;
        /** Font catalog family name. null/absent ⇒ global --font-display. */
        font?: string | null;
        eventDate?: string | Date | null;
        rsvpDeadline?: string | Date | null;
        guestName?: string | null;
        /** Editor: clickable blocks with outline + label. */
        interactive?: boolean;
        activeBlockId?: string | null;
        deadlinePassed?: boolean;
        closedMessage?: string | null;
    }>(),
    {
        theme: null,
        font: null,
        eventDate: null,
        rsvpDeadline: null,
        guestName: null,
        interactive: false,
        activeBlockId: null,
        deadlinePassed: false,
        closedMessage: null,
    },
);

const emit = defineEmits<{
    select: [blockId: string];
    rsvpClick: [];
}>();

const BLOCK_LABELS = computed<Record<BlockType, string>>(() => ({
    header: t("ceremly.invite.blockHeader"),
    message: t("ceremly.invite.blockMessage"),
    program: t("ceremly.invite.blockProgram"),
    location: t("ceremly.invite.blockLocation"),
    dresscode: t("ceremly.invite.blockDresscode"),
    logistics: t("ceremly.invite.blockLogistics"),
    countdown: t("ceremly.invite.blockCountdown"),
    gallery: t("ceremly.invite.blockGallery"),
    rsvp: t("ceremly.invite.blockRsvp"),
}));

const tpl = computed(() => {
    if (typeof props.template === "string") {
        const t = getTemplate(props.template);
        return { accent: t?.accent ?? "#d4a373", accentSoft: t?.accentSoft ?? "#faedcd" };
    }
    return props.template;
});

// Event-level invite theme: a user-chosen palette overrides the template;
// the font overrides --font-display. null ⇒ global .cer tokens.
const theme = computed(() => props.theme ?? null);
const catalogFont = computed(() => getCatalogFont(props.font));

// Effective accent (theme if present, otherwise template accent).
const accent = computed(() => theme.value?.accent ?? tpl.value.accent);
const accentSoft = computed(() => (theme.value ? deriveSoft(theme.value.accent) : tpl.value.accentSoft));

// Webfont class on the root: applies the font and makes the family discoverable by
// @nuxt/fonts (see .inv-font-* in ceremly.css).
const rootClass = computed(() => (catalogFont.value ? `inv-font-${fontSlug(catalogFont.value.family)}` : ""));

// Card radius 16, padding 48px 36px, soft shadow (like InvitePreview). Token
// overrides are CONDITIONAL: without palette/font the root stays
// identical to before (zero regression on existing invites).
const rootStyle = computed<CSSProperties>(() => {
    const t = theme.value;
    const f = catalogFont.value;
    // Text tones derived from the paper: the user picks the background but not
    // the ink, so on a dark paper the body text shifts to light creams.
    const ink = t ? deriveInk(t.paper) : null;
    return {
        "--tpl-accent": accent.value,
        "--tpl-accent-soft": accentSoft.value,
        ...(t && ink
            ? {
                "--bone-50": t.paper,
                "--bone-100": deriveSoft(t.accent),
                // Subtle line/border derived from the paper: dividers, map placeholder
                // and borders follow the theme (on dark paper they won't stay pale green).
                "--bone-200": deriveLine(t.paper),
                "--wine": t.accent,
                "--wine-deep": t.deep,
                "--rsvp-on-accent": t.onAccent,
                "--ink": ink.ink,
                "--ink-700": ink.ink700,
                "--ink-500": ink.ink500,
            }
            : {}),
        ...(f ? { "--font-display": `'${f.family}', ${GENERIC_FALLBACK[f.category]}` } : {}),
        background: "var(--bone-50)",
        borderRadius: "16px",
        padding: "48px 36px",
        boxShadow: "0 1px 0 var(--bone-200), 0 24px 60px -30px rgba(26,22,18,0.25)",
        fontFamily: "var(--font-display)",
        color: "var(--ink)",
    };
});

// Spaced mono section headings (the mockup letter-spaces by hand: here CSS letter-spacing).
const monoTitle: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    letterSpacing: "0.18em",
    color: "var(--tpl-accent)",
    textTransform: "uppercase",
};
const monoTitleCenter: CSSProperties = { ...monoTitle, textAlign: "center" };

const tabStyle: CSSProperties = {
    position: "absolute",
    top: "-22px",
    left: "0",
    background: "var(--tpl-accent)",
    color: "var(--ink)",
    padding: "2px 8px",
    fontSize: "10px",
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    borderRadius: "3px",
    zIndex: 1,
};

function wrapStyle(block: InviteBlock): CSSProperties {
    const active = props.interactive && props.activeBlockId === block.id;
    return {
        position: "relative",
        padding: "8px 0",
        borderRadius: "6px",
        outline: active ? "2px solid var(--tpl-accent)" : "2px solid transparent",
        outlineOffset: "4px",
        cursor: props.interactive ? "pointer" : undefined,
    };
}

function onBlockClick(block: InviteBlock) {
    if (props.interactive) emit("select", block.id);
}

// 1px bone-200 divider after the header and before the rsvp block (as in the mockup).
function dividerBefore(index: number): boolean {
    const prev = props.blocks[index - 1];
    const cur = props.blocks[index];
    if (!prev || !cur) return false;
    return prev.type === "header" || cur.type === "rsvp";
}

// Typed getters for the discriminated union (the template does not narrow on its own).
const headerData = (b: InviteBlock) => b.data as HeaderBlockData;
const messageData = (b: InviteBlock) => b.data as MessageBlockData;
const programData = (b: InviteBlock) => b.data as ProgramBlockData;
const locationData = (b: InviteBlock) => b.data as LocationBlockData;
const dresscodeData = (b: InviteBlock) => b.data as DresscodeBlockData;
const logisticsData = (b: InviteBlock) => b.data as LogisticsBlockData;
const countdownData = (b: InviteBlock) => b.data as CountdownBlockData;
const galleryData = (b: InviteBlock) => b.data as GalleryBlockData;
const rsvpData = (b: InviteBlock) => b.data as RsvpBlockData;

function headerDateLine(d: HeaderBlockData): string {
    if (!d.dateText && !d.timeText) return "";
    return d.timeText ? `${d.dateText} · ore ${d.timeText}` : d.dateText;
}

function mapsHref(d: LocationBlockData): string {
    // Defense in depth: renders only http(s). A legacy/malicious mapsUrl with
    // javascript:/data: scheme (the schema only guards new writes) falls back
    // to the safe Google Maps link instead of executing on click.
    const url = d.mapsUrl?.trim();
    if (url && /^https?:\/\//i.test(url)) return url;
    return `https://maps.google.com/?q=${encodeURIComponent(d.address)}`;
}

const daysToEvent = computed<number | null>(() => {
    if (!props.eventDate) return null;
    const d = new Date(props.eventDate);
    if (Number.isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
});

const deadlineLabel = computed<string | null>(() => {
    if (!props.rsvpDeadline) return null;
    const d = new Date(props.rsvpDeadline);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(d);
});

const DEFAULT_CLOSED_MESSAGE = computed(() => t("ceremly.invite.closedDefault"));
</script>

<template>
    <div :class="['cer', rootClass]" :style="rootStyle">
        <!-- Personalized greeting (like 'CARA ANNA' in invite-mobile.jsx, here a neutral 'Ciao') -->
        <div v-if="guestName" :style="{ textAlign: 'center', paddingBottom: '12px' }">
            <div
                class="mono"
                :style="{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '0.22em',
                    color: 'var(--tpl-accent)',
                    textTransform: 'uppercase',
                }"
            >
                {{ $t('ceremly.invite.greeting') }} {{ guestName }}
            </div>
        </div>

        <template v-for="(block, i) in blocks" :key="block.id">
            <div v-if="dividerBefore(i)" :style="{ height: '1px', background: 'var(--bone-200)', margin: '24px 0' }" />

            <div
                :role="interactive ? 'button' : undefined"
                :tabindex="interactive ? 0 : undefined"
                :style="wrapStyle(block)"
                @click="onBlockClick(block)"
                @keydown.enter="onBlockClick(block)"
            >
                <div v-if="interactive && activeBlockId === block.id" :style="tabStyle">
                    {{ BLOCK_LABELS[block.type] }}
                </div>

                <!-- header -->
                <div v-if="block.type === 'header'" :style="{ textAlign: 'center' }">
                    <div
                        class="mono"
                        :style="{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '10px',
                            letterSpacing: '0.2em',
                            color: 'var(--tpl-accent)',
                            textTransform: 'uppercase',
                        }"
                    >
                        {{ headerData(block).eyebrow }}
                    </div>
                    <div v-if="headerData(block).intro" :style="{ marginTop: '18px' }">
                        <span :style="{ fontStyle: 'italic', color: 'var(--ink-500)', fontSize: '16px' }">
                            {{ headerData(block).intro }}
                        </span>
                    </div>
                    <div
                        :style="{
                            fontSize: '56px',
                            lineHeight: 1.05,
                            marginTop: '12px',
                            color: 'var(--wine-deep)',
                            letterSpacing: '-0.01em',
                        }"
                    >
                        <template v-if="headerData(block).names.length === 2">
                            <em>{{ headerData(block).names[0] }}</em><br>
                            <span :style="{ fontStyle: 'italic', fontSize: '18px', color: 'var(--ink-500)' }">e</span><br>
                            <em>{{ headerData(block).names[1] }}</em>
                        </template>
                        <em v-else>{{ headerData(block).names.join(" e ") }}</em>
                    </div>
                    <div
                        v-if="headerDateLine(headerData(block))"
                        class="mono"
                        :style="{
                            marginTop: '20px',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            letterSpacing: '0.16em',
                            color: 'var(--ink-700)',
                            textTransform: 'uppercase',
                        }"
                    >
                        {{ headerDateLine(headerData(block)) }}
                    </div>
                </div>

                <!-- message -->
                <p
                    v-else-if="block.type === 'message'"
                    :style="{
                        textAlign: 'center',
                        fontSize: '17px',
                        lineHeight: 1.55,
                        fontStyle: 'italic',
                        color: 'var(--ink-700)',
                        margin: '0',
                    }"
                >
                    {{ messageData(block).text }}
                </p>

                <!-- program -->
                <div v-else-if="block.type === 'program'" :style="{ marginTop: '20px' }">
                    <div class="mono" :style="monoTitleCenter">{{ programData(block).title }}</div>
                    <div :style="{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }">
                        <div
                            v-for="(it, j) in programData(block).items"
                            :key="j"
                            :style="{ display: 'flex', alignItems: 'flex-start', gap: '16px' }"
                        >
                            <div
                                class="mono"
                                :style="{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '12px',
                                    color: 'var(--wine-deep)',
                                    width: '50px',
                                    paddingTop: '2px',
                                    flexShrink: 0,
                                }"
                            >
                                {{ it.time }}
                            </div>
                            <div>
                                <div :style="{ fontSize: '18px', color: 'var(--ink)' }">{{ it.label }}</div>
                                <div :style="{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--ink-500)' }">
                                    {{ it.description }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- location -->
                <div
                    v-else-if="block.type === 'location'"
                    :style="{ marginTop: '20px', padding: '18px', background: 'var(--bone-100)', borderRadius: '10px' }"
                >
                    <div class="mono" :style="monoTitle">{{ locationData(block).title }}</div>
                    <div :style="{ fontSize: '22px', marginTop: '8px' }">{{ locationData(block).name }}</div>
                    <div :style="{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink-500)' }">
                        {{ locationData(block).address }}
                    </div>
                    <template v-if="locationData(block).showMap">
                        <div
                            :style="{
                                marginTop: '12px',
                                height: '110px',
                                background:
                                    'repeating-linear-gradient(135deg, var(--bone-200), var(--bone-200) 2px, var(--bone-50) 2px, var(--bone-50) 6px)',
                                borderRadius: '8px',
                                position: 'relative',
                            }"
                        >
                            <div
                                :style="{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%,-50%)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '11px',
                                    color: 'var(--ink-500)',
                                }"
                            >
                                {{ $t('ceremly.invite.mapPlaceholder') }}
                            </div>
                            <div
                                :style="{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%,-100%)',
                                    color: 'var(--tpl-accent)',
                                }"
                            >
                                <CerIcon name="pin" :s="22" />
                            </div>
                        </div>
                        <a
                            :href="mapsHref(locationData(block))"
                            target="_blank"
                            rel="noopener noreferrer"
                            :style="{
                                marginTop: '12px',
                                width: '100%',
                                display: 'block',
                                textAlign: 'center',
                                padding: '10px 16px',
                                background: 'var(--bone-50)',
                                color: 'var(--ink)',
                                border: '1px solid var(--bone-200)',
                                borderRadius: '8px',
                                fontFamily: 'var(--font-sans)',
                                fontSize: '13px',
                                fontWeight: 500,
                                textDecoration: 'none',
                            }"
                        >{{ $t('ceremly.invite.openMaps') }}</a>
                    </template>
                </div>

                <!-- dresscode -->
                <div v-else-if="block.type === 'dresscode'" :style="{ marginTop: '20px', textAlign: 'center' }">
                    <div class="mono" :style="monoTitle">{{ dresscodeData(block).title }}</div>
                    <div :style="{ fontSize: '22px', marginTop: '6px' }">{{ dresscodeData(block).headline }}</div>
                    <div
                        v-if="dresscodeData(block).note"
                        :style="{ fontFamily: 'var(--font-sans)', fontSize: '12px', color: 'var(--ink-500)', marginTop: '4px' }"
                    >
                        {{ dresscodeData(block).note }}
                    </div>
                </div>

                <!-- logistics -->
                <div v-else-if="block.type === 'logistics'" :style="{ marginTop: '20px', textAlign: 'center' }">
                    <div class="mono" :style="monoTitle">{{ logisticsData(block).title }}</div>
                    <div
                        :style="{
                            fontFamily: 'var(--font-sans)',
                            fontSize: '13px',
                            color: 'var(--ink-700)',
                            lineHeight: 1.6,
                            marginTop: '10px',
                            whiteSpace: 'pre-line',
                        }"
                    >
                        {{ logisticsData(block).text }}
                    </div>
                </div>

                <!-- countdown -->
                <div v-else-if="block.type === 'countdown'" :style="{ marginTop: '20px', textAlign: 'center' }">
                    <div v-if="countdownData(block).title" class="mono" :style="monoTitleCenter">
                        {{ countdownData(block).title }}
                    </div>
                    <template v-if="daysToEvent !== null">
                        <div v-if="daysToEvent > 0" :style="{ display: 'flex', justifyContent: 'center', marginTop: '18px' }">
                            <CountdownRing :days="daysToEvent" />
                        </div>
                        <div
                            v-else
                            :style="{ marginTop: '14px', fontSize: '22px', fontStyle: 'italic', color: 'var(--wine-deep)' }"
                        >
                            {{ $t('ceremly.invite.eventDay') }}
                        </div>
                    </template>
                </div>

                <!-- gallery -->
                <div
                    v-else-if="block.type === 'gallery'"
                    :style="{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }"
                >
                    <img
                        v-for="(img, j) in galleryData(block).images"
                        :key="j"
                        :src="img.url"
                        :alt="img.alt"
                        loading="lazy"
                        :style="{
                            width: '100%',
                            aspectRatio: '4 / 3',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            display: 'block',
                        }"
                    >
                </div>

                <!-- rsvp -->
                <div v-else-if="block.type === 'rsvp'" :style="{ textAlign: 'center' }">
                    <div :style="{ fontSize: '22px', color: 'var(--ink)' }">{{ $t('ceremly.invite.rsvpQuestion') }}</div>
                    <div
                        v-if="deadlineLabel"
                        :style="{ fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--ink-500)', marginTop: '4px' }"
                    >
                        {{ $t('ceremly.invite.rsvpDeadlinePrefix') }} {{ deadlineLabel }}
                    </div>
                    <button
                        v-if="!deadlinePassed"
                        type="button"
                        :style="{
                            marginTop: '14px',
                            padding: '12px 28px',
                            background: 'var(--tpl-accent)',
                            color: 'var(--rsvp-on-accent, var(--ink))',
                            border: 'none',
                            borderRadius: '999px',
                            fontFamily: 'var(--font-sans)',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            letterSpacing: '0.02em',
                        }"
                        @click="emit('rsvpClick')"
                    >
                        {{ rsvpData(block).buttonLabel }}
                    </button>
                    <div
                        v-else
                        :style="{
                            marginTop: '14px',
                            padding: '14px 18px',
                            background: 'var(--bone-100)',
                            borderRadius: '10px',
                            fontStyle: 'italic',
                            color: 'var(--ink-500)',
                            fontSize: '14px',
                        }"
                    >
                        {{ closedMessage || DEFAULT_CLOSED_MESSAGE }}
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<style>
/* Invite font catalog (.inv-font-* classes + @font-face self-hosted via @nuxt/fonts).
   Imported here — not in nuxt.config css[] — so it loads only on the routes that
   mount the renderer (guest preview and editor), not on every page of the site. */
@import "../../assets/css/invite-fonts.css";
</style>
