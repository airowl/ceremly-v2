// React Email template — invito ospite Ceremly (SPEC §6 "Distribuzione", owner B3).
// Design "Soft Meadow": sfondo bone, card bianca con bordo sottile, eyebrow mono,
// titolo evento serif, CTA pill. Uses React.createElement to avoid JSX/Vue conflicts.
//
// Il testo `message` è quello scritto dall'organizzatore con i placeholder
// {nome}/{link} GIÀ sostituiti a monte (service/handler): qui viene solo
// renderizzato rispettando i newline.

import * as React from 'react';
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Text,
    Button,
} from '@react-email/components';

export interface GuestInviteEmailProps {
    eventTitle: string;
    firstName: string;
    /** Testo personalizzato dell'organizzatore, placeholder già sostituiti. */
    message: string;
    /** Link personale dell'ospite `{baseURL}/e/{slug}/{token}`. */
    ctaUrl: string;
    /** Pixel di tracking apertura `{baseURL}/api/public/pixel/{token}.gif`. */
    pixelUrl: string;
    appName: string;
    /** Host pubblico (es. "ceremly.app") per il footer, derivato da baseURL. */
    appHost: string;
}

// Palette Soft Meadow (SPEC §1)
const colors = {
    bone: '#fefae0',
    card: '#ffffff',
    border: '#e9e4ce',
    accent: '#d4a373',
    ink: '#3F3622',
    wineDeep: '#5E4426',
    muted: '#a89e7e',
};

const fonts = {
    sans: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Space Mono', 'Courier New', monospace",
};

const styles = {
    body: {
        margin: 0,
        padding: 0,
        backgroundColor: colors.bone,
        fontFamily: fonts.sans,
    },
    container: {
        maxWidth: '560px',
        margin: '0 auto',
        padding: '32px 16px',
    },
    card: {
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '18px',
        padding: '40px 36px',
    },
    eyebrow: {
        fontFamily: fonts.mono,
        fontSize: '11px',
        letterSpacing: '0.3em',
        textTransform: 'uppercase' as const,
        color: colors.accent,
        margin: '0 0 14px 0',
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: '32px',
        lineHeight: '1.2',
        color: colors.wineDeep,
        fontWeight: 600,
        margin: '0 0 24px 0',
    },
    message: {
        fontSize: '15px',
        lineHeight: '1.7',
        color: colors.ink,
        margin: '0 0 28px 0',
    },
    ctaSection: {
        textAlign: 'center' as const,
        margin: '0 0 32px 0',
    },
    ctaButton: {
        display: 'inline-block',
        backgroundColor: colors.accent,
        color: '#3F3622',
        fontSize: '15px',
        fontWeight: 700,
        textDecoration: 'none',
        borderRadius: '999px',
        padding: '13px 30px',
    },
    footer: {
        fontFamily: fonts.mono,
        fontSize: '11px',
        letterSpacing: '0.06em',
        color: colors.muted,
        textAlign: 'center' as const,
        margin: '24px 0 0 0',
    },
    pixel: {
        display: 'block',
        width: '1px',
        height: '1px',
        border: '0',
    },
};

const h = React.createElement;

/** Renderizza il `message` rispettando i newline (no white-space CSS: Outlook). */
function renderMessageLines(message: string): React.ReactNode[] {
    return message
        .split('\n')
        .flatMap((line, i) => (i === 0 ? [line] : [h('br', { key: `br-${i}` }), line]));
}

export function GuestInviteEmail({
    eventTitle,
    firstName,
    message,
    ctaUrl,
    pixelUrl,
    appName,
    appHost,
}: GuestInviteEmailProps): React.ReactElement {
    const footerText = appHost ? `Inviato con ${appName} · ${appHost}` : `Inviato con ${appName}`;

    return h(Html, { lang: 'it' },
        h(Head),
        h(Preview, null, `Un invito per te — ${eventTitle}`),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, 'Un invito per te'),
                    h(Text, { style: styles.title }, eventTitle),
                    h(Text, { style: styles.message }, ...renderMessageLines(message)),
                    h(Section, { style: styles.ctaSection },
                        h(Button, { href: ctaUrl, style: styles.ctaButton }, `Apri l'invito di ${firstName}`)
                    )
                ),
                h(Text, { style: styles.footer }, footerText),
                h('img', { src: pixelUrl, width: 1, height: 1, alt: '', style: styles.pixel })
            )
        )
    );
}

export default GuestInviteEmail;
