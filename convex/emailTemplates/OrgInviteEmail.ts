// React Email template — invito a un team / organizzazione (Phase 1b).
// Design "Soft Meadow" (token/stili condivisi da ./_softMeadow).
// Uses React.createElement to avoid JSX/Vue conflicts. Lingue: it/en.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button } from '@react-email/components';
import { styles, renderFooter, renderFallback, type LegalLinks, type SoftMeadowLang } from './_softMeadow';

interface OrgInviteEmailProps {
    language?: SoftMeadowLang;
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
    appName: string;
    legalLinks: LegalLinks;
}

const buildTranslations = (appName: string, orgName: string, invitedByName: string, expiresInDays: number) => ({
    it: {
        preview: `Ti hanno invitato nel team — ${appName}`,
        eyebrow: 'Un invito',
        title: 'Ti hanno invitato nel team',
        body1: `${invitedByName} ti ha invitato a collaborare nello spazio di ${orgName} su ${appName}.`,
        boxLabel: 'Organizzazione',
        body2: 'Accetta l’invito per accedere agli eventi del team, gestire gli inviti e seguire le risposte insieme — tutto da un unico posto.',
        ctaButton: 'Accetta l’invito',
        noteExpiry: `Questo invito scade tra ${expiresInDays} giorni.`,
        noteIgnore: 'Se non ti aspettavi questo invito, puoi ignorare l’email senza problemi.',
        fallbackLabel: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    },
    en: {
        preview: `You're invited to the team — ${appName}`,
        eyebrow: 'An invitation',
        title: "You're invited to the team",
        body1: `${invitedByName} has invited you to collaborate in the ${orgName} workspace on ${appName}.`,
        boxLabel: 'Organization',
        body2: "Accept the invitation to access the team's events, manage invites and track responses together — all in one place.",
        ctaButton: 'Accept the invitation',
        noteExpiry: `This invitation expires in ${expiresInDays} days.`,
        noteIgnore: "If you weren't expecting this invitation, you can safely ignore this email.",
        fallbackLabel: "If the button doesn't work, copy and paste this link into your browser:",
    },
});

const h = React.createElement;

export function OrgInviteEmail({
    language = 'it',
    inviteUrl,
    orgName,
    invitedByName,
    expiresInDays = 7,
    appName,
    legalLinks,
}: OrgInviteEmailProps): React.ReactElement {
    const t = buildTranslations(appName, orgName, invitedByName, expiresInDays)[language];

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, t.preview),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, t.eyebrow),
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.text }, t.body1),
                    h(Section, { style: styles.box },
                        h(Text, { style: styles.boxLbl }, t.boxLabel),
                        h(Text, { style: styles.boxValSerif }, orgName),
                    ),
                    h(Text, { style: styles.text }, t.body2),
                    h(Button, { href: inviteUrl, style: styles.btn }, t.ctaButton),
                    h(Text, { style: styles.note }, t.noteExpiry),
                    h(Text, { style: styles.note }, t.noteIgnore),
                    ...renderFallback(t.fallbackLabel, inviteUrl),
                    ...renderFooter({ appName, lang: language, legalLinks }),
                ),
            ),
        ),
    );
}

export default OrgInviteEmail;
