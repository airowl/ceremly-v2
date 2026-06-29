// React Email template — waiting list subscription confirmation.
// "Soft Meadow" design (shared tokens/styles from ./_softMeadow).
// Uses React.createElement to avoid JSX/Vue conflicts. Languages: it/en.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button } from '@react-email/components';
import { styles, renderFooter, type LegalLinks, type SoftMeadowLang } from './_softMeadow';

interface WaitingListEmailProps {
    language?: SoftMeadowLang;
    appName: string;
    siteUrl: string;
    legalLinks: LegalLinks;
}

const buildTranslations = (appName: string) => ({
    it: {
        preview: `Ci sei. Ti avvisiamo noi. — ${appName}`,
        eyebrow: 'Sei in lista',
        title: 'Ci sei. Ti avvisiamo noi.',
        body1: `grazie per esserti iscritto alla lista d'attesa di ${appName}. È un bel segnale, e ci fa piacere.`,
        body2: 'Stiamo lavorando per aprire le porte al più presto. Appena saremo pronti, sarai tra i primi a saperlo — niente code, niente sorprese.',
        ctaButton: `Scopri ${appName}`,
        note: 'Nel frattempo, dai un’occhiata a cosa stiamo costruendo. E se conosci qualcuno che organizza un evento, sai dove mandarlo.',
    },
    en: {
        preview: `You're in. We'll be in touch. — ${appName}`,
        eyebrow: "You're on the list",
        title: "You're in. We'll be in touch.",
        body1: `thanks for joining the ${appName} waiting list. It means a lot, and we're glad you're here.`,
        body2: "We're working hard to open the doors soon. The moment we're ready, you'll be among the first to know — no queues, no surprises.",
        ctaButton: `Discover ${appName}`,
        note: "In the meantime, take a look at what we're building. And if you know someone planning an event, you know where to send them.",
    },
});

const h = React.createElement;

export function WaitingListEmail({
    language = 'it',
    appName,
    siteUrl,
    legalLinks,
}: WaitingListEmailProps): React.ReactElement {
    const t = buildTranslations(appName)[language];

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, t.preview),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, t.eyebrow),
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.text }, t.body1),
                    h(Text, { style: styles.text }, t.body2),
                    h(Button, { href: siteUrl, style: styles.btn }, t.ctaButton),
                    h(Text, { style: styles.note }, t.note),
                    ...renderFooter({ appName, lang: language, legalLinks }),
                ),
            ),
        ),
    );
}

export default WaitingListEmail;
