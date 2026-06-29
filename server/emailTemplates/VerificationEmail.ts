// React Email template — email verification on sign-up.
// "Soft Meadow" design (shared tokens/styles from ./_softMeadow).
// Uses React.createElement to avoid JSX/Vue conflicts. Languages: it/en.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button } from '@react-email/components';
import { styles, renderFooter, renderFallback, type LegalLinks, type SoftMeadowLang } from './_softMeadow';

interface VerificationEmailProps {
    language?: SoftMeadowLang;
    verificationUrl: string;
    userName?: string;
    appName: string;
    legalLinks: LegalLinks;
}

const buildTranslations = (appName: string) => ({
    it: {
        preview: `Confermiamo che sei tu — ${appName}`,
        eyebrow: 'Benvenuto',
        title: 'Confermiamo che sei tu',
        greeting: (name?: string) => (name ? `Ciao ${name},` : 'Ciao,'),
        body1: `che bello averti qui. Manca solo un passaggio per attivare il tuo account su ${appName}: conferma che questo indirizzo email è davvero tuo.`,
        body2: 'Bastano pochi secondi e poi sei pronto a creare il tuo primo invito.',
        ctaButton: 'Conferma la mia email',
        note: 'Il link è valido per 24 ore. Se non hai creato tu un account, puoi ignorare tranquillamente questa email.',
        fallbackLabel: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    },
    en: {
        preview: `Let's confirm it's you — ${appName}`,
        eyebrow: 'Welcome',
        title: "Let's confirm it's you",
        greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi,'),
        body1: `lovely to have you here. There's just one step left to activate your ${appName} account: confirm that this email address is really yours.`,
        body2: 'It only takes a few seconds, and then you are ready to create your first invitation.',
        ctaButton: 'Confirm my email',
        note: "The link is valid for 24 hours. If you didn't create an account, you can safely ignore this email.",
        fallbackLabel: "If the button doesn't work, copy and paste this link into your browser:",
    },
});

const h = React.createElement;

export function VerificationEmail({
    language = 'it',
    verificationUrl,
    userName,
    appName,
    legalLinks,
}: VerificationEmailProps): React.ReactElement {
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
                    h(Text, { style: styles.text }, t.body2),
                    h(Button, { href: verificationUrl, style: styles.btn }, t.ctaButton),
                    h(Text, { style: styles.note }, t.note),
                    ...renderFallback(t.fallbackLabel, verificationUrl),
                    ...renderFooter({ appName, lang: language, legalLinks }),
                ),
            ),
        ),
    );
}

export default VerificationEmail;
