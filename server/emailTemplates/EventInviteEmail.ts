// React Email template for event invitation
// Supports Italian and English languages (Ceremly)
// Uses React.createElement to avoid JSX/Vue conflicts

import * as React from 'react';
import {
    Html,
    Head,
    Preview,
    Body,
    Container,
    Section,
    Text,
    Link,
    Button,
    Hr,
} from '@react-email/components';

interface EventInviteEmailProps {
    language?: 'it' | 'en';
    inviteUrl: string;
    eventName: string;
    invitedByName: string;
    expiresInDays?: number;
}

// Translations
const translations = {
    it: {
        preview: (event: string) => `Sei stato invitato a unirti a ${event} su Ceremly`,
        title: 'Sei stato invitato!',
        greeting: 'Ciao,',
        intro: (invitedBy: string, event: string) =>
            `${invitedBy} ti ha invitato a unirti al event "${event}" su Ceremly, la piattaforma SaaS completa per la gestione degli eventi.`,
        teamInfo: (team: string) => `Sarai aggiunto al team: ${team}`,
        joinTitle: 'Unisciti al team',
        joinText: 'Clicca il pulsante qui sotto per accettare l\'invito e unirti al event.',
        ctaButton: 'Accetta Invito',
        expiryNote: (days: number) => `Questo invito scadrà tra ${days} giorni.`,
        alternativeText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
        accountNote: 'Se non hai ancora un account su Ceremly, potrai crearne uno gratuitamente.',
        ignoreText: 'Se non ti aspettavi questo invito o non vuoi unirti, puoi semplicemente ignorare questa email.',
        signature: 'Cordiali saluti,',
        team: 'Il Team di Ceremly',
        copyright: '© 2026 Ceremly. Tutti i diritti riservati.',
        privacy: 'Privacy Policy',
        terms: 'Termini di Servizio',
        dpa: 'Data Processing Agreement',
        footer: 'Hai ricevuto questa email perché qualcuno ti ha invitato su Ceremly.',
        address: 'Ceremly - Via Example 123, 00100 Roma, Italia',
    },
    en: {
        preview: (event: string) => `You've been invited to join ${event} on Ceremly`,
        title: "You've been invited!",
        greeting: 'Hi,',
        intro: (invitedBy: string, event: string) =>
            `${invitedBy} has invited you to join the "${event}" event on Ceremly, the complete SaaS platform for event management.`,
        teamInfo: (team: string) => `You will be added to the team: ${team}`,
        joinTitle: 'Join the team',
        joinText: 'Click the button below to accept the invitation and join the event.',
        ctaButton: 'Accept Invitation',
        expiryNote: (days: number) => `This invitation will expire in ${days} days.`,
        alternativeText: "If the button doesn't work, copy and paste this link into your browser:",
        accountNote: "If you don't have a Ceremly account yet, you can create one for free.",
        ignoreText: "If you weren't expecting this invitation or don't want to join, you can simply ignore this email.",
        signature: 'Best regards,',
        team: 'The Ceremly Team',
        copyright: '© 2026 Ceremly. All rights reserved.',
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        dpa: 'Data Processing Agreement',
        footer: 'You received this email because someone invited you to Ceremly.',
        address: 'Ceremly - Via Example 123, 00100 Rome, Italy',
    },
};

// Brand colors
const colors = {
    primary: '#19baf0',
    primaryDark: '#0ea5d6',
    background: '#f8fbfc',
    white: '#ffffff',
    text: '#0d181c',
    textLight: '#4b879b',
    textMuted: '#7ca8b8',
    highlight: '#e0f3fe',
    info: '#e0f3fe',
    infoBorder: '#19baf0',
};

// Styles
const styles = {
    body: {
        margin: 0,
        padding: 0,
        fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        backgroundColor: colors.background,
    },
    container: {
        maxWidth: '600px',
        margin: '0 auto',
        backgroundColor: colors.white,
    },
    header: {
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        padding: '40px 20px',
        textAlign: 'center' as const,
    },
    headerBrand: {
        color: colors.white,
        fontSize: '28px',
        fontWeight: '800',
        letterSpacing: '-0.5px',
        margin: '0',
    },
    content: {
        padding: '40px 30px',
        color: colors.text,
        lineHeight: '1.6',
    },
    title: {
        color: colors.primary,
        fontSize: '24px',
        marginBottom: '20px',
        fontWeight: 'normal',
    },
    paragraph: {
        fontSize: '16px',
        marginBottom: '15px',
        lineHeight: '1.6',
    },
    highlightBox: {
        backgroundColor: colors.highlight,
        borderLeft: `4px solid ${colors.primary}`,
        padding: '15px',
        margin: '20px 0',
    },
    highlightTitle: {
        fontWeight: 'bold',
        margin: '0 0 10px 0',
    },
    highlightText: {
        margin: 0,
    },
    infoBox: {
        backgroundColor: colors.info,
        borderLeft: `4px solid ${colors.infoBorder}`,
        padding: '15px',
        margin: '20px 0',
    },
    buttonContainer: {
        textAlign: 'center' as const,
        margin: '25px 0',
    },
    button: {
        display: 'inline-block',
        padding: '14px 35px',
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        color: colors.white,
        textDecoration: 'none',
        borderRadius: '6px',
        fontWeight: '600',
        fontSize: '16px',
    },
    expiryNote: {
        fontSize: '14px',
        color: colors.textLight,
        textAlign: 'center' as const,
        marginBottom: '20px',
    },
    alternativeText: {
        fontSize: '14px',
        color: colors.textLight,
        marginTop: '20px',
    },
    linkText: {
        fontSize: '12px',
        wordBreak: 'break-all' as const,
        marginBottom: '20px',
    },
    link: {
        color: colors.primary,
        textDecoration: 'underline',
    },
    ignoreText: {
        fontSize: '14px',
        color: colors.textMuted,
        fontStyle: 'italic',
        marginTop: '20px',
        marginBottom: '20px',
    },
    footer: {
        backgroundColor: colors.background,
        padding: '30px',
        textAlign: 'center' as const,
        fontSize: '14px',
        color: colors.textLight,
    },
    copyright: {
        margin: '0 0 15px 0',
    },
    footerLinks: {
        marginTop: '15px',
    },
    footerLink: {
        color: colors.primary,
        textDecoration: 'none',
        margin: '0 10px',
    },
    footerSeparator: {
        display: 'inline',
        margin: '0 5px',
        color: colors.textLight,
    },
    divider: {
        borderColor: '#e7f0f3',
        margin: '20px 0',
    },
    footerNote: {
        marginTop: '20px',
        fontSize: '12px',
        color: colors.textMuted,
    },
};

const h = React.createElement;

export function EventInviteEmail({
    language = 'it',
    inviteUrl,
    eventName,
    invitedByName,
    expiresInDays = 7,
}: EventInviteEmailProps): React.ReactElement {
    const t = translations[language];

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, t.preview(eventName)),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                // Header
                h(Section, { style: styles.header },
                    h(Text, { style: styles.headerBrand }, 'Ceremly')
                ),
                // Content
                h(Section, { style: styles.content },
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.paragraph }, t.greeting),
                    h(Text, { style: styles.paragraph }, t.intro(invitedByName, eventName)),
                    // Highlight Box
                    h(Section, { style: styles.highlightBox },
                        h(Text, { style: styles.highlightTitle }, t.joinTitle),
                        h(Text, { style: styles.highlightText }, t.joinText)
                    ),
                    h(Section, { style: styles.buttonContainer },
                        h(Button, { href: inviteUrl, style: styles.button }, t.ctaButton)
                    ),
                    h(Text, { style: styles.expiryNote }, t.expiryNote(expiresInDays)),
                    h(Text, { style: styles.alternativeText }, t.alternativeText),
                    h(Text, { style: styles.linkText },
                        h(Link, { href: inviteUrl, style: styles.link }, inviteUrl)
                    ),
                    h(Text, { style: styles.paragraph }, t.accountNote),
                    h(Text, { style: styles.ignoreText }, t.ignoreText),
                    h(Text, { style: styles.paragraph },
                        t.signature,
                        h('br'),
                        h('strong', null, t.team)
                    )
                ),
                // Footer
                h(Section, { style: styles.footer },
                    h(Text, { style: styles.copyright }, t.copyright),
                    h(Section, { style: styles.footerLinks },
                        h(Link, { href: 'https://example.com/privacy', style: styles.footerLink }, t.privacy),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: 'https://example.com/tos', style: styles.footerLink }, t.terms),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: 'https://example.com/dpa', style: styles.footerLink }, t.dpa)
                    ),
                    h(Hr, { style: styles.divider }),
                    h(Text, { style: styles.footerNote },
                        t.footer,
                        h('br'),
                        t.address
                    )
                )
            )
        )
    );
}

export default EventInviteEmail;
