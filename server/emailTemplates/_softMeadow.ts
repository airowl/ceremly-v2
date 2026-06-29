// Shared "Soft Meadow" design system for Ceremly email templates.
// Token (colors/fonts) + inline styles + rendering helpers, so all
// templates stay consistent from a single source. Uses React.createElement (no JSX).

import * as React from 'react';
import { Hr, Link, Text } from '@react-email/components';

export type SoftMeadowLang = 'it' | 'en';

// Soft Meadow palette (SPEC §1) — single source of colour tokens.
export const colors = {
    bone: '#fefae0',
    card: '#ffffff',
    border: '#e9e4ce',
    accent: '#d4a373',
    ink: '#3F3622',
    wineDeep: '#5E4426',
    muted: '#a89e7e',
};

// Email-safe font stack: the brand fonts (Bricolage/Be Vietnam/Space Mono) do not
// load reliably in email clients → the fallbacks are what users actually see.
export const fonts = {
    sans: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Space Mono', 'Courier New', monospace",
};

export const styles = {
    body: { margin: 0, padding: 0, backgroundColor: colors.bone, fontFamily: fonts.sans },
    container: { maxWidth: '560px', margin: '0 auto', padding: '32px 16px' },
    card: {
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '18px',
        padding: '40px 34px',
    },
    eyebrow: {
        fontFamily: fonts.mono,
        fontSize: '12px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.18em',
        color: colors.accent,
        margin: '0 0 16px 0',
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: '28px',
        lineHeight: '1.2',
        fontWeight: 600,
        color: colors.wineDeep,
        margin: '0 0 20px 0',
    },
    titleSm: {
        fontFamily: fonts.serif,
        fontSize: '24px',
        lineHeight: '1.2',
        fontWeight: 600,
        color: colors.wineDeep,
        margin: '0 0 20px 0',
    },
    text: { fontSize: '15px', lineHeight: '1.7', color: colors.ink, margin: '0 0 16px 0' },
    btn: {
        display: 'inline-block',
        backgroundColor: colors.accent,
        color: colors.ink,
        fontFamily: fonts.mono,
        fontSize: '13px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        textDecoration: 'none',
        padding: '14px 30px',
        borderRadius: '999px',
        margin: '12px 0 8px 0',
    },
    box: {
        backgroundColor: colors.bone,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        padding: '16px 18px',
        margin: '4px 0 22px 0',
    },
    boxLbl: {
        fontFamily: fonts.mono,
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.12em',
        color: colors.muted,
        margin: '0 0 6px 0',
    },
    boxValSans: { fontSize: '16px', fontWeight: 600, color: colors.ink, margin: 0, wordBreak: 'break-all' as const },
    boxValWine: { fontSize: '17px', fontWeight: 600, color: colors.wineDeep, margin: 0, wordBreak: 'break-all' as const },
    boxValSerif: { fontFamily: fonts.serif, fontSize: '20px', fontWeight: 600, color: colors.wineDeep, margin: 0 },
    boxNote: { fontSize: '13px', lineHeight: '1.6', color: colors.ink, margin: 0 },
    note: { fontSize: '13px', lineHeight: '1.6', color: colors.muted, margin: '20px 0 0 0' },
    fbl: { fontSize: '13px', lineHeight: '1.6', color: colors.muted, margin: '24px 0 6px 0' },
    fbk: { fontFamily: fonts.mono, fontSize: '12px', color: colors.accent, margin: 0, wordBreak: 'break-all' as const },
    hr: { borderColor: colors.border, margin: '32px 0 18px 0' },
    foot: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: '0 0 8px 0' },
    footlinks: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: 0 },
    footLink: { color: colors.muted, textDecoration: 'underline', margin: '0 4px' },
    // notification (admin)
    nrow: { borderTop: `1px solid ${colors.border}`, padding: '14px 0 0 0', margin: '0 0 14px 0' },
    nrowLbl: {
        fontFamily: fonts.mono,
        fontSize: '11px',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.12em',
        color: colors.muted,
        margin: '0 0 4px 0',
    },
    nrowVal: { fontSize: '15px', fontWeight: 500, color: colors.ink, margin: 0, wordBreak: 'break-word' as const },
    nrowLink: { color: colors.accent, textDecoration: 'none' },
    msgbox: {
        backgroundColor: colors.bone,
        border: `1px solid ${colors.border}`,
        borderRadius: '12px',
        padding: '18px 20px',
        margin: '6px 0 0 0',
    },
    msgboxVal: { fontSize: '15px', lineHeight: '1.7', color: colors.ink, margin: 0 },
};

const TAGLINE: Record<SoftMeadowLang, string> = {
    it: 'Inviti digitali e RSVP intelligenti',
    en: 'Digital invitations & smart RSVP',
};

const LEGAL_LABELS: Record<SoftMeadowLang, { privacy: string; tos: string; dpa: string }> = {
    it: { privacy: 'Privacy', tos: 'Termini', dpa: 'DPA' },
    en: { privacy: 'Privacy', tos: 'Terms', dpa: 'DPA' },
};

const h = React.createElement;

export interface LegalLinks {
    privacy: string;
    tos: string;
    dpa: string;
}

/** Renders the text preserving newlines as <br> (white-space CSS unsupported in Outlook). */
export function renderMessageLines(message: string): React.ReactNode[] {
    return message
        .split('\n')
        .flatMap((line, i) => (i === 0 ? [line] : [h('br', { key: `br-${i}` }), line]));
}

/** Footer: separator + brand/tagline + (optional) legal links. */
export function renderFooter(opts: {
    appName: string;
    lang: SoftMeadowLang;
    legalLinks?: LegalLinks;
    tagline?: string;
}): React.ReactNode[] {
    const tagline = opts.tagline ?? TAGLINE[opts.lang];
    const els: React.ReactNode[] = [
        h(Hr, { key: 'hr', style: styles.hr }),
        h(Text, { key: 'foot', style: styles.foot }, `${opts.appName} — ${tagline}`),
    ];
    if (opts.legalLinks) {
        const lbl = LEGAL_LABELS[opts.lang];
        els.push(
            h(Text, { key: 'flinks', style: styles.footlinks },
                h(Link, { href: opts.legalLinks.privacy, style: styles.footLink }, lbl.privacy),
                ' · ',
                h(Link, { href: opts.legalLinks.tos, style: styles.footLink }, lbl.tos),
                ' · ',
                h(Link, { href: opts.legalLinks.dpa, style: styles.footLink }, lbl.dpa),
            ),
        );
    }
    return els;
}

/** "If the button doesn't work, copy the link" fallback block. */
export function renderFallback(label: string, url: string): React.ReactNode[] {
    return [
        h(Text, { key: 'fbl', style: styles.fbl }, label),
        h(Link, { key: 'fbk', href: url, style: styles.fbk }, url),
    ];
}
