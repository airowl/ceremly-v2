// React Email — archival warning for a closed and inactive event (SPEC §9.2).
// Sent to the organiser ~7 days before automatic deletion.
import * as React from 'react';
import {
    Html, Head, Preview, Body, Container, Section, Text, Button,
} from '@react-email/components';
import { colors, fonts } from './_softMeadow';

export interface EventCleanupWarningProps {
    language: 'it' | 'en';
    eventTitle: string;
    /** Link to the event page in the dashboard `{baseURL}/dashboard/events/{id}`. */
    dashboardUrl: string;
    /** Days remaining before deletion (typically 7). */
    daysLeft: number;
    appName: string;
    appHost: string;
}

const copy = {
    it: {
        eyebrow: 'Avviso archiviazione',
        body: (days: number) =>
            `Questo evento è concluso e inattivo da tempo. Verrà eliminato automaticamente tra ${days} giorni, insieme a ospiti e risposte. Se vuoi conservarlo, aprilo dalla tua dashboard: basta una modifica per mantenerlo attivo.`,
        cta: 'Apri evento',
        note: "Se non fai nulla, l'evento e i suoi dati saranno rimossi.",
    },
    en: {
        eyebrow: 'Archival notice',
        body: (days: number) =>
            `This event is closed and has been inactive for a while. It will be deleted automatically in ${days} days, along with its guests and responses. To keep it, just open it from your dashboard — any change keeps it active.`,
        cta: 'Open event',
        note: 'If you do nothing, the event and its data will be removed.',
    },
};

const styles = {
    body: { margin: 0, padding: 0, backgroundColor: colors.bone, fontFamily: fonts.sans },
    container: { maxWidth: '560px', margin: '0 auto', padding: '32px 16px' },
    card: { backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: '18px', padding: '40px 36px' },
    eyebrow: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase' as const, color: colors.accent, margin: '0 0 14px 0' },
    title: { fontFamily: fonts.serif, fontSize: '32px', lineHeight: '1.2', color: colors.wineDeep, fontWeight: 600, margin: '0 0 24px 0' },
    message: { fontSize: '15px', lineHeight: '1.7', color: colors.ink, margin: '0 0 28px 0' },
    ctaSection: { textAlign: 'center' as const, margin: '0 0 12px 0' },
    ctaButton: { display: 'inline-block', backgroundColor: colors.accent, color: '#3F3622', fontSize: '15px', fontWeight: 700, textDecoration: 'none', borderRadius: '999px', padding: '13px 30px' },
    ctaNote: { fontSize: '12px', color: colors.muted, textAlign: 'center' as const, margin: '0 0 20px 0' },
    footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, textAlign: 'center' as const, margin: '24px 0 0 0' },
};

const h = React.createElement;

export function EventCleanupWarning({
    language, eventTitle, dashboardUrl, daysLeft, appName, appHost,
}: EventCleanupWarningProps): React.ReactElement {
    const t = copy[language] ?? copy.it;
    const footerText = appHost ? `${appName} · ${appHost}` : appName;

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, `${t.eyebrow} — ${eventTitle}`),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, t.eyebrow),
                    h(Text, { style: styles.title }, eventTitle),
                    h(Text, { style: styles.message }, t.body(daysLeft)),
                    h(Section, { style: styles.ctaSection },
                        h(Button, { href: dashboardUrl, style: styles.ctaButton }, t.cta)
                    ),
                    h(Text, { style: styles.ctaNote }, t.note)
                ),
                h(Text, { style: styles.footer }, footerText)
            )
        )
    );
}

export default EventCleanupWarning;
