// React Email template — conferma all'utente che il messaggio è stato ricevuto.
// Design "Soft Meadow" (token/stili condivisi da ./_softMeadow).
// Uses React.createElement to avoid JSX/Vue conflicts. Lingue: it/en.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button } from '@react-email/components';
import { styles, renderFooter, type SoftMeadowLang } from './_softMeadow';

interface ContactConfirmationEmailProps {
    language?: SoftMeadowLang;
    userName: string;
    subject: string;
    siteUrl?: string;
    appName: string;
}

const buildTranslations = (appName: string) => ({
    it: {
        preview: `Ci pensiamo noi — ${appName}`,
        eyebrow: 'Messaggio ricevuto',
        title: 'Ci pensiamo noi',
        greeting: (name: string) => `Ciao ${name},`,
        body1: 'abbiamo ricevuto il tuo messaggio e lo stiamo leggendo. Ti rispondiamo a breve — di solito entro un giorno lavorativo.',
        boxLabel: 'Oggetto',
        body2: 'Non serve che tu faccia altro: ti scriviamo noi appena possiamo.',
        ctaButton: `Torna su ${appName}`,
    },
    en: {
        preview: `We're on it — ${appName}`,
        eyebrow: 'Message received',
        title: "We're on it",
        greeting: (name: string) => `Hi ${name},`,
        body1: "we've received your message and we're reading it now. We'll get back to you shortly — usually within one business day.",
        boxLabel: 'Subject',
        body2: "There's nothing else you need to do: we'll write to you as soon as we can.",
        ctaButton: `Back to ${appName}`,
    },
});

const h = React.createElement;

export function ContactConfirmationEmail({
    language = 'it',
    userName,
    subject,
    siteUrl = '',
    appName,
}: ContactConfirmationEmailProps): React.ReactElement {
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
                    h(Section, { style: styles.box },
                        h(Text, { style: styles.boxLbl }, t.boxLabel),
                        h(Text, { style: { ...styles.boxValSans, wordBreak: 'normal' as const } }, subject),
                    ),
                    h(Text, { style: styles.text }, t.body2),
                    h(Button, { href: siteUrl, style: styles.btn }, t.ctaButton),
                    ...renderFooter({ appName, lang: language }),
                ),
            ),
        ),
    );
}

export default ContactConfirmationEmail;
