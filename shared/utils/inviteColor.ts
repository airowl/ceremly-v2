/** Colour utility for the invite theme: WCAG contrast + light-tint derivation. Pure functions. */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
        throw new Error(`hexToRgb: atteso colore #rrggbb, ricevuto "${hex}"`);
    }
    const h = hex.replace("#", "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

function channelLin(c: number): number {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

/** WCAG contrast ratio (1..21). */
export function contrastRatio(fg: string, bg: string): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA threshold: 4.5:1 normal text, 3:1 large text. */
export function isReadable(fg: string, bg: string, large = false): boolean {
    return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/** Light tint of the accent (mix with white at 85%) for `--bone-100`. */
export function deriveSoft(accent: string): string {
    const { r, g, b } = hexToRgb(accent);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.85);
    const toHex = (c: number) => mix(c).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Body text tones (`--ink`/`--ink-700`/`--ink-500`). */
export interface InkTones {
    ink: string;
    ink700: string;
    ink500: string;
}

/** Dark brown branch (`.cer` default): readable on light paper. */
const INK_DARK: InkTones = { ink: "#3F3622", ink700: "#57492F", ink500: "#786949" };
/** Warm cream branch: readable on dark paper. */
const INK_LIGHT: InkTones = { ink: "#F4EEE4", ink700: "#E0D6C6", ink500: "#C6B9A2" };

/**
 * Readable text tones on the chosen `paper`: the user picks the background but not
 * the ink, so dark paper needs light text (otherwise brown on dark = invisible).
 * Picks the branch with the best contrast against the paper.
 */
export function deriveInk(paper: string): InkTones {
    return contrastRatio(INK_DARK.ink, paper) >= contrastRatio(INK_LIGHT.ink, paper)
        ? INK_DARK
        : INK_LIGHT;
}

/**
 * Subtle line/border on the paper (for `--bone-200`: dividers, map placeholder,
 * borders): blends the paper with its own ink at 14% → yields a barely visible
 * line on both light and dark paper, no pale-green artefact.
 */
export function deriveLine(paper: string): string {
    const p = hexToRgb(paper);
    const k = hexToRgb(deriveInk(paper).ink);
    const ch = (a: number, b: number) => Math.round(a + (b - a) * 0.14).toString(16).padStart(2, "0");
    return `#${ch(p.r, k.r)}${ch(p.g, k.g)}${ch(p.b, k.b)}`;
}
