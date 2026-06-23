/**
 * Ceremly — tema invito personalizzabile (colori liberi + catalogo font).
 *
 * Il tema è una proprietà dell'evento: `event.theme` (4 colori hex) e
 * `event.inviteFont` (nome famiglia del catalogo). NULL ⇒ token globali `.cer`.
 * Le 6 palette restano come SCORCIATOIE UI (riempiono i picker), non sono più
 * persistite come key. I font del catalogo sono self-hostati via @nuxt/fonts.
 */

export interface InviteTheme {
    /** Sfondo carta → `--bone-50`. */
    paper: string;
    /** Accento (mono titoli, pin, bottone RSVP) → `--tpl-accent` + `--wine`. */
    accent: string;
    /** Tinta profonda (nomi header, orari) → `--wine-deep`. */
    deep: string;
    /** Testo leggibile sopra l'accento (label bottone RSVP) → `--rsvp-on-accent`. */
    onAccent: string;
}

/** Default impliciti = token globali `.cer` (look "toscana"). */
export const DEFAULT_THEME: InviteTheme = {
    paper: "#FFFDF6",
    accent: "#d4a373",
    deep: "#5E4426",
    onAccent: "#3F3622",
};

/** Scorciatoie curate: applicate, riempiono i 4 picker (non persistite). */
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
    /** Nome famiglia Google esatto (persistito in `event.inviteFont`). */
    family: string;
    category: FontCategory;
}

/** Catalogo curato di famiglie Google adatte agli inviti, self-hostate. */
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
    // Sans
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

/** Slug CSS-safe per la classe `.inv-font-<slug>`. */
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
