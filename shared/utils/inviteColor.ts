/** Utility colore per il tema invito: contrasto WCAG + derivazione tinta chiara. Funzioni pure. */

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

/** Rapporto di contrasto WCAG (1..21). */
export function contrastRatio(fg: string, bg: string): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

/** Soglia WCAG AA: 4.5:1 testo normale, 3:1 testo grande. */
export function isReadable(fg: string, bg: string, large = false): boolean {
    return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/** Tinta chiara dell'accento (mix con bianco all'85%) per `--bone-100`. */
export function deriveSoft(accent: string): string {
    const { r, g, b } = hexToRgb(accent);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.85);
    const toHex = (c: number) => mix(c).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
