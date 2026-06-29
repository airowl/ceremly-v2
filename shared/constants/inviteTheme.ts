/**
 * Ceremly — customizable invite theme (free colors + font catalog).
 *
 * The theme is a property of the event: `event.theme` (4 hex colors) and
 * `event.inviteFont` (catalog family name). NULL ⇒ global `.cer` tokens.
 * The 6 palettes remain as UI SHORTCUTS (fill the pickers), no longer
 * persisted as keys. Catalog fonts are self-hosted via @nuxt/fonts.
 */

export interface InviteTheme {
    /** Card background → `--bone-50`. */
    paper: string;
    /** Accent (mono titles, pin, RSVP button) → `--tpl-accent` + `--wine`. */
    accent: string;
    /** Deep tint (header names, times) → `--wine-deep`. */
    deep: string;
    /** Readable text on top of accent (RSVP button label) → `--rsvp-on-accent`. */
    onAccent: string;
}

/**
 * Implicit defaults = global `.cer` tokens (paper #FFFFFF = `--bone-50`,
 * accent/deep/onAccent = `--wine`/`--wine-deep`/`--rsvp-on-accent`).
 * Distinct from the "Toscana" shortcut (paper #FFFDF6): here paper is the
 * pure white actually rendered when the event has no custom theme.
 */
export const DEFAULT_THEME: InviteTheme = {
    paper: "#FFFFFF",
    accent: "#d4a373",
    deep: "#5E4426",
    onAccent: "#3F3622",
};

/** Curated shortcuts: when applied, fill the 4 pickers (not persisted). */
export const INVITE_PALETTES: readonly (InviteTheme & { key: string; label: string })[] = [
    { key: "toscana", label: "Toscana", paper: "#FFFDF6", accent: "#d4a373", deep: "#5E4426", onAccent: "#3F3622" },
    { key: "bordeaux", label: "Bordeaux", paper: "#FBF6F4", accent: "#8C3B4A", deep: "#4A2230", onAccent: "#FBF6F4" },
    { key: "salvia", label: "Salvia", paper: "#F7F8F1", accent: "#7E8C5A", deep: "#3F4A2C", onAccent: "#F7F8F1" },
    { key: "polvere", label: "Blu polvere", paper: "#F5F7F9", accent: "#6E8AA6", deep: "#324558", onAccent: "#F5F7F9" },
    { key: "terracotta", label: "Terracotta", paper: "#FBF4F0", accent: "#C2683F", deep: "#6E3318", onAccent: "#FBF4F0" },
    { key: "notte", label: "Notte", paper: "#F3F2F0", accent: "#3F3622", deep: "#1E1A12", onAccent: "#F3F2F0" },
] as const;

export type FontCategory = "serif" | "sans" | "display" | "handwriting";
export interface CatalogFont {
    /** Exact Google family name (persisted in `event.inviteFont`). */
    family: string;
    category: FontCategory;
}

/** Curated catalog of Google families suitable for invitations, self-hosted. */
export const INVITE_FONT_CATALOG: readonly CatalogFont[] = [
    // Serif
    { family: "Playfair Display", category: "serif" },
    { family: "Cormorant Garamond", category: "serif" },
    { family: "EB Garamond", category: "serif" },
    { family: "Libre Baskerville", category: "serif" },
    { family: "Lora", category: "serif" },
    { family: "Cormorant", category: "serif" },
    { family: "Crimson Text", category: "serif" },
    { family: "Crimson Pro", category: "serif" },
    { family: "Spectral", category: "serif" },
    { family: "Source Serif 4", category: "serif" },
    { family: "PT Serif", category: "serif" },
    { family: "Bitter", category: "serif" },
    { family: "Frank Ruhl Libre", category: "serif" },
    { family: "Noto Serif", category: "serif" },
    { family: "Vollkorn", category: "serif" },
    { family: "Cardo", category: "serif" },
    { family: "Domine", category: "serif" },
    { family: "Bodoni Moda", category: "serif" },
    { family: "DM Serif Display", category: "serif" },
    { family: "DM Serif Text", category: "serif" },
    { family: "Marcellus", category: "serif" },
    { family: "Gilda Display", category: "serif" },
    { family: "Italiana", category: "serif" },
    { family: "Tenor Sans", category: "sans" },
    { family: "Sorts Mill Goudy", category: "serif" },
    { family: "Petrona", category: "serif" },
    // Sans-serif
    { family: "Manrope", category: "sans" },
    { family: "Montserrat", category: "sans" },
    { family: "Be Vietnam Pro", category: "sans" },
    { family: "Inter", category: "sans" },
    { family: "Work Sans", category: "sans" },
    { family: "Nunito Sans", category: "sans" },
    { family: "Raleway", category: "sans" },
    { family: "Poppins", category: "sans" },
    { family: "Jost", category: "sans" },
    { family: "Outfit", category: "sans" },
    { family: "Mulish", category: "sans" },
    { family: "Karla", category: "sans" },
    { family: "Rubik", category: "sans" },
    { family: "DM Sans", category: "sans" },
    { family: "Hanken Grotesk", category: "sans" },
    { family: "Bricolage Grotesque", category: "sans" },
    { family: "Archivo", category: "sans" },
    { family: "Sora", category: "sans" },
    // Display
    { family: "Cinzel", category: "display" },
    { family: "Cinzel Decorative", category: "display" },
    { family: "Fraunces", category: "display" },
    { family: "Yeseva One", category: "display" },
    { family: "Abril Fatface", category: "display" },
    { family: "Della Respira", category: "display" },
    { family: "Forum", category: "display" },
    // Handwriting / Script
    { family: "Great Vibes", category: "handwriting" },
    { family: "Dancing Script", category: "handwriting" },
    { family: "Parisienne", category: "handwriting" },
    { family: "Pinyon Script", category: "handwriting" },
    { family: "Tangerine", category: "handwriting" },
    { family: "Sacramento", category: "handwriting" },
    { family: "Allura", category: "handwriting" },
    { family: "Alex Brush", category: "handwriting" },
    { family: "Petit Formal Script", category: "handwriting" },
    { family: "Marck Script", category: "handwriting" },
] as const;

/** CSS-safe slug for the `.inv-font-<slug>` class. */
export function fontSlug(family: string): string {
    return family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function isCatalogFont(family: string): boolean {
    return INVITE_FONT_CATALOG.some((f) => f.family === family);
}

export function getCatalogFont(family: string | null | undefined): CatalogFont | undefined {
    if (!family) return undefined;
    return INVITE_FONT_CATALOG.find((f) => f.family === family);
}
