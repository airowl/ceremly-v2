// React Email template — password reset.
// "Soft Meadow" design (shared tokens/styles from ./_softMeadow).
// Uses React.createElement to avoid JSX/Vue conflicts. Languages: it/en.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button } from '@react-email/components';
import { styles, renderFooter, renderFallback, type LegalLinks, type SoftMeadowLang } from './_softMeadow';

interface ResetPasswordEmailProps {
    language?: SoftMeadowLang;
    resetUrl: string;
    userName?: string;
    appName: string;
    legalLinks: LegalLinks;
}

const buildTranslations = (appName: string) => ({
    it: {
        preview: `Reimposta la password — ${appName}`,
        eyebrow: 'Sicurezza',
        title: 'Reimposta la password',
        greeting: (name?: string) => (name ? `Ciao ${name},` : 'Ciao,'),
        body1: `hai chiesto di reimpostare la password del tuo account ${appName}. Clicca qui sotto per sceglierne una nuova.`,
        ctaButton: 'Scegli una nuova password',
        securityLabel: 'Nota di sicurezza',
        securityNote: 'Per la tua sicurezza, questo link scade tra 60 minuti. Se non hai richiesto tu il reset, ignora questa email: la tua password resta invariata e il tuo account è al sicuro.',
        fallbackLabel: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    },
    en: {
        preview: `Reset your password — ${appName}`,
        eyebrow: 'Security',
        title: 'Reset your password',
        greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi,'),
        body1: `you asked to reset the password for your ${appName} account. Click below to choose a new one.`,
        ctaButton: 'Choose a new password',
        securityLabel: 'Security note',
        securityNote: "For your security, this link expires in 60 minutes. If you didn't request a reset, just ignore this email: your password stays the same and your account is safe.",
        fallbackLabel: "If the button doesn't work, copy and paste this link into your browser:",
    },
});

const h = React.createElement;

export function ResetPasswordEmail({
    language = 'it',
    resetUrl,
    userName,
    appName,
    legalLinks,
}: ResetPasswordEmailProps): React.ReactElement {
    const t = buildTranslations(appName)[language];

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, t.preview),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, t.eyebrow),
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.text }, t.greeting(userName)),
                    h(Text, { style: styles.text }, t.body1),
                    h(Button, { href: resetUrl, style: styles.btn }, t.ctaButton),
                    h(Section, { style: { ...styles.box, margin: '22px 0 0 0' } },
                        h(Text, { style: styles.boxLbl }, t.securityLabel),
                        h(Text, { style: styles.boxNote }, t.securityNote),
                    ),
                    ...renderFallback(t.fallbackLabel, resetUrl),
                    ...renderFooter({ appName, lang: language, legalLinks }),
                ),
            ),
        ),
    );
}

export default ResetPasswordEmail;
