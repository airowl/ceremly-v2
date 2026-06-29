// React Email template — admin notification for a new contact-form message.
// "Soft Meadow" design (shared tokens/styles from ./_softMeadow). Italian only.
// Uses React.createElement to avoid JSX/Vue conflicts.

import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Button, Link } from '@react-email/components';
import { styles, renderFooter, renderMessageLines } from './_softMeadow';

interface ContactNotificationEmailProps {
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
    language: string;
    submittedAt: string;
    appName: string;
}

const h = React.createElement;

export function ContactNotificationEmail({
    senderName,
    senderEmail,
    subject,
    message,
    language,
    submittedAt,
    appName,
}: ContactNotificationEmailProps): React.ReactElement {
    const languageLabel = language === 'en' ? 'English' : 'Italiano';

    return h(Html, { lang: 'it' },
        h(Head),
        h(Preview, null, `Nuovo messaggio dal form contatti — ${subject}`),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.card },
                    h(Text, { style: styles.eyebrow }, `${appName} · notifica interna`),
                    h(Text, { style: styles.titleSm }, 'Nuovo messaggio dal form contatti'),
                    h(Section, { style: styles.nrow },
                        h(Text, { style: styles.nrowLbl }, 'Da'),
                        h(Text, { style: styles.nrowVal }, senderName),
                    ),
                    h(Section, { style: styles.nrow },
                        h(Text, { style: styles.nrowLbl }, 'Email'),
                        h(Text, { style: styles.nrowVal },
                            h(Link, { href: `mailto:${senderEmail}`, style: styles.nrowLink }, senderEmail),
                        ),
                    ),
                    h(Section, { style: styles.nrow },
                        h(Text, { style: styles.nrowLbl }, 'Oggetto'),
                        h(Text, { style: styles.nrowVal }, subject),
                    ),
                    h(Section, { style: styles.nrow },
                        h(Text, { style: styles.nrowLbl }, 'Ricevuto il'),
                        h(Text, { style: styles.nrowVal }, `${submittedAt} · lingua: ${languageLabel}`),
                    ),
                    h(Section, { style: styles.msgbox },
                        h(Text, { style: styles.boxLbl }, 'Messaggio'),
                        h(Text, { style: styles.msgboxVal }, ...renderMessageLines(message)),
                    ),
                    h(Button, { href: `mailto:${senderEmail}`, style: { ...styles.btn, margin: '22px 0 8px 0' } }, 'Rispondi al mittente'),
                    ...renderFooter({ appName, lang: 'it', tagline: 'Notifica automatica · non rispondere a questo indirizzo' }),
                ),
            ),
        ),
    );
}

export default ContactNotificationEmail;
