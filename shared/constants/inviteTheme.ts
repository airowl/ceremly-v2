/**
 * Ceremly — tema dell'invito (palette colori + carattere).
 *
 * Port fedele di INV_PALETTES / INV_FONTS da docs/ui/project/screens/editor.jsx.
 * Il tema è una proprietà *dell'evento* (non del blocco): `event.palette` e
 * `event.inviteFont` sono le KEY risolte qui, esattamente come `templateKey`.
 *
 * Backward-compat: palette/font NULL ⇒ l'invito usa i token globali del design
 * system `.cer` (ceremly.css), che coincidono con la palette "toscana" + font
 * "bricolage". Nessuna regressione sugli eventi esistenti: una palette esplicita
 * fa override completo dei token sul root del renderer (InviteRenderer.vue).
 */

export const PALETTE_KEYS = [
    "toscana",
    "bordeaux",
    "salvia",
    "polvere",
    "terracotta",
    "notte",
] as const;

export const INVITE_FONT_KEYS = [
    "bricolage",
    "playfair",
    "cormorant",
    "garamond",
    "baskerville",
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];
export type InviteFontKey = (typeof INVITE_FONT_KEYS)[number];

export interface InvitePalette {
    key: PaletteKey;
    label: string;
    /** Sfondo della carta invito → override `--bone-50`. */
    paper: string;
    /** Accento (titoli mono, pin, bottone RSVP) → override `--tpl-accent` + `--wine`. */
    accent: string;
    /** Tinta profonda (nomi header, orari programma) → override `--wine-deep`. */
    deep: string;
    /** Banda/contenitori chiari (card location) → override `--bone-100`. */
    soft: string;
    /** Testo leggibile sopra l'accento (label bottone RSVP) → `--rsvp-on-accent`. */
    onAccent: string;
}

export interface InviteFont {
    key: InviteFontKey;
    label: string;
    /** Stack CSS applicato al display dell'invito (override `--font-display`). */
    family: string;
    /** Nota breve mostrata nell'inspector. */
    note: string;
    /** Classe utility (ceremly.css) — fa rilevare il webfont a @nuxt/fonts. */
    cssClass: string;
}

/** Palette curate — carte chiare, accenti caldi/freddi armoniosi. */
export const INVITE_PALETTES: readonly InvitePalette[] = [
    { key: "toscana", label: "Toscana", paper: "#FFFDF6", accent: "#d4a373", deep: "#5E4426", soft: "#faedcd", onAccent: "#3F3622" },
    { key: "bordeaux", label: "Bordeaux", paper: "#FBF6F4", accent: "#8C3B4A", deep: "#4A2230", soft: "#F0DDDD", onAccent: "#FBF6F4" },
    { key: "salvia", label: "Salvia", paper: "#F7F8F1", accent: "#7E8C5A", deep: "#3F4A2C", soft: "#E3E8D2", onAccent: "#F7F8F1" },
    { key: "polvere", label: "Blu polvere", paper: "#F5F7F9", accent: "#6E8AA6", deep: "#324558", soft: "#DCE5ED", onAccent: "#F5F7F9" },
    { key: "terracotta", label: "Terracotta", paper: "#FBF4F0", accent: "#C2683F", deep: "#6E3318", soft: "#F2DDD0", onAccent: "#FBF4F0" },
    { key: "notte", label: "Notte", paper: "#F3F2F0", accent: "#3F3622", deep: "#1E1A12", soft: "#E5E1D8", onAccent: "#F3F2F0" },
] as const;

/** Caratteri display curati — la faccia titoli usata sulla carta invito. */
export const INVITE_FONTS: readonly InviteFont[] = [
    { key: "bricolage", label: "Bricolage", family: "'Bricolage Grotesque', system-ui, sans-serif", note: "Grottesco moderno", cssClass: "inv-font-bricolage" },
    { key: "playfair", label: "Playfair", family: "'Playfair Display', Georgia, serif", note: "Serif elegante", cssClass: "inv-font-playfair" },
    { key: "cormorant", label: "Cormorant", family: "'Cormorant Garamond', Georgia, serif", note: "Serif raffinato", cssClass: "inv-font-cormorant" },
    { key: "garamond", label: "EB Garamond", family: "'EB Garamond', Georgia, serif", note: "Serif classico", cssClass: "inv-font-garamond" },
    { key: "baskerville", label: "Baskerville", family: "'Libre Baskerville', Georgia, serif", note: "Serif tradizionale", cssClass: "inv-font-baskerville" },
] as const;

/** Default impliciti = token globali `.cer` (palette toscana, font bricolage). */
export const DEFAULT_PALETTE_KEY: PaletteKey = "toscana";
export const DEFAULT_FONT_KEY: InviteFontKey = "bricolage";

/** Risolve una palette per key. `undefined` ⇒ usa i token globali (look attuale). */
export function getPalette(key: string | null | undefined): InvitePalette | undefined {
    if (!key) return undefined;
    return INVITE_PALETTES.find((p) => p.key === key);
}

/** Risolve un carattere per key. `undefined` ⇒ usa `--font-display` globale. */
export function getInviteFont(key: string | null | undefined): InviteFont | undefined {
    if (!key) return undefined;
    return INVITE_FONTS.find((f) => f.key === key);
}
