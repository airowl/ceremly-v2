// React Email template — Ceremly guest RSVP reminder (SPEC §6 Reminder, owner B3).
// Same "Soft Meadow" design as the invite (GuestInviteEmail), with a gentle reminder
// tone. Uses React.createElement to avoid JSX/Vue conflicts.
//
// `message` is the reminder text configured by the organiser with the
// {name}/{link} placeholders ALREADY substituted upstream: here it is only
// rendered preserving newlines.

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
import { colors, fonts } from './_softMeadow';

export interface GuestReminderEmailProps {
    eventTitle: string;
    firstName: string;
    /** Reminder text with placeholders already substituted. */
    message: string;
    /** Guest's personal link `{baseURL}/e/{slug}/{token}`. */
    ctaUrl: string;
    /** Open-tracking pixel `{baseURL}/api/public/pixel/{token}.gif`. */
    pixelUrl: string;
    appName: string;
    /** Public host (e.g. "ceremly.app") for the footer, derived from baseURL. */
    appHost: string;
}

// Soft Meadow palette/fonts: shared tokens imported from ./_softMeadow

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
        margin: '0 0 12px 0',
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
    ctaNote: {
        fontSize: '12px',
        color: colors.muted,
        textAlign: 'center' as const,
        margin: '0 0 20px 0',
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

/** Renders `message` preserving newlines (white-space CSS unsupported in Outlook). */
function renderMessageLines(message: string): React.ReactNode[] {
    return message
        .split('\n')
        .flatMap((line, i) => (i === 0 ? [line] : [h('br', { key: `br-${i}` }), line]));
}

export function GuestReminderEmail({
    eventTitle,
    firstName,
    message,
    ctaUrl,
    pixelUrl,
    appName,
    appHost,
}: GuestReminderEmailProps): React.ReactElement {
    const footerText = appHost ? `Inviato con ${appName} · ${appHost}` : `Inviato con ${appName}`;

    return h(Html, { lang: 'it' },
        h(Head),
        h(Preview, null, `Un promemoria gentile — ${eventTitle}`),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, 'Un promemoria gentile'),
                    h(Text, { style: styles.title }, eventTitle),
                    h(Text, { style: styles.message }, ...renderMessageLines(message)),
                    h(Section, { style: styles.ctaSection },
                        h(Button, { href: ctaUrl, style: styles.ctaButton }, `Apri l'invito di ${firstName}`)
                    ),
                    h(Text, { style: styles.ctaNote }, 'Bastano due minuti per confermare la tua presenza.')
                ),
                h(Text, { style: styles.footer }, footerText),
                h('img', { src: pixelUrl, width: 1, height: 1, alt: '', style: styles.pixel })
            )
        )
    );
}

export default GuestReminderEmail;
