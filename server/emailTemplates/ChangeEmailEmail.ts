// React Email template — email-change confirmation (sent to the CURRENT address).
// "Soft Meadow" design (shared tokens/styles from ./_softMeadow).
// Uses React.createElement to avoid JSX/Vue conflicts. Languages: it/en.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button } from '@react-email/components';
import { styles, renderFooter, renderFallback, type LegalLinks, type SoftMeadowLang } from './_softMeadow';

interface ChangeEmailEmailProps {
    language?: SoftMeadowLang;
    confirmUrl: string;
    newEmail: string;
    userName?: string;
    appName: string;
    legalLinks: LegalLinks;
}

const buildTranslations = (appName: string) => ({
    it: {
        preview: `Confermi il nuovo indirizzo? — ${appName}`,
        eyebrow: 'Cambio email',
        title: 'Confermi il nuovo indirizzo?',
        greeting: (name?: string) => (name ? `Ciao ${name},` : 'Ciao,'),
        body1: `hai chiesto di cambiare l'email associata al tuo account ${appName}. Il nuovo indirizzo sarà:`,
        boxLabel: 'Nuovo indirizzo',
        body2: 'Conferma qui sotto per procedere. Subito dopo invieremo un’email di verifica al nuovo indirizzo, così ci assicuriamo che sia raggiungibile.',
        ctaButton: 'Conferma il cambio',
        note: 'Se non hai richiesto tu questa modifica, ignora pure questa email: nulla cambierà e il tuo indirizzo attuale resta attivo.',
        fallbackLabel: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    },
    en: {
        preview: `Confirm your new address? — ${appName}`,
        eyebrow: 'Email change',
        title: 'Confirm your new address?',
        greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi,'),
        body1: `you asked to change the email linked to your ${appName} account. The new address will be:`,
        boxLabel: 'New address',
        body2: "Confirm below to go ahead. Right after, we'll send a verification email to the new address to make sure it's reachable.",
        ctaButton: 'Confirm the change',
        note: "If you didn't request this change, just ignore this email: nothing will change and your current address stays active.",
        fallbackLabel: "If the button doesn't work, copy and paste this link into your browser:",
    },
});

const h = React.createElement;

export function ChangeEmailEmail({
    language = 'it',
    confirmUrl,
    newEmail,
    userName,
    appName,
    legalLinks,
}: ChangeEmailEmailProps): React.ReactElement {
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
                        h(Text, { style: styles.boxValWine }, newEmail),
                    ),
                    h(Text, { style: styles.text }, t.body2),
                    h(Button, { href: confirmUrl, style: styles.btn }, t.ctaButton),
                    h(Text, { style: styles.note }, t.note),
                    ...renderFallback(t.fallbackLabel, confirmUrl),
                    ...renderFooter({ appName, lang: language, legalLinks }),
                ),
            ),
        ),
    );
}

export default ChangeEmailEmail;
