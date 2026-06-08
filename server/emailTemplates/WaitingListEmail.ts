// React Email template for waiting list confirmation
// Supports Italian and English languages
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

interface WaitingListEmailProps {
    language?: 'it' | 'en';
    appName: string;
}

// Translations
const buildTranslations = (appName: string) => ({
    it: {
        preview: `Benvenuto nella Waiting List di ${appName}!`,
        title: `Benvenuto nella Waiting List di ${appName}!`,
        greeting: 'Gentile utente,',
        intro: `Grazie per il tuo interesse in ${appName}, il boilerplate SaaS multi-tenant.`,
        successTitle: 'La tua email è stata registrata con successo!',
        successText: `Riceverai una notifica non appena la piattaforma sarà disponibile. Sarai tra i primi ad accedere a tutte le funzionalità innovative di ${appName}.`,
        ctaIntro: 'Nel frattempo, puoi scoprire di più sul nostro progetto visitando il nostro sito:',
        ctaButton: 'Visita il Sito',
        contactText: 'Se hai domande o suggerimenti, non esitare a contattarci rispondendo a questa email.',
        signature: 'Cordiali saluti,',
        team: `Il Team di ${appName}`,
        copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
        privacy: 'Privacy Policy',
        terms: 'Termini di Servizio',
        dpa: 'Data Processing Agreement',
        social: 'Seguici sui social:',
        footer: `Hai ricevuto questa email perché ti sei iscritto alla waiting list di ${appName}.`,
    },
    en: {
        preview: `Welcome to ${appName}'s Waiting List!`,
        title: `Welcome to ${appName}'s Waiting List!`,
        greeting: 'Dear User,',
        intro: `Thank you for your interest in ${appName}, the multi-tenant SaaS boilerplate.`,
        successTitle: 'Your email has been successfully registered!',
        successText: `You will receive a notification as soon as the platform is available. You'll be among the first to access all of ${appName}'s innovative features.`,
        ctaIntro: 'In the meantime, you can learn more about our project by visiting our website:',
        ctaButton: 'Visit Website',
        contactText: "If you have any questions or suggestions, please don't hesitate to contact us by replying to this email.",
        signature: 'Best regards,',
        team: `The ${appName} Team`,
        copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        dpa: 'Data Processing Agreement',
        social: 'Follow us on social media:',
        footer: `You received this email because you signed up for ${appName}'s waiting list.`,
    },
});

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
    buttonContainer: {
        textAlign: 'center' as const,
        margin: '20px 0',
    },
    button: {
        display: 'inline-block',
        padding: '12px 30px',
        background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        color: colors.white,
        textDecoration: 'none',
        borderRadius: '6px',
        fontWeight: '600',
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
    socialText: {
        marginTop: '20px',
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

export function WaitingListEmail({
    language = 'it',
    appName,
}: WaitingListEmailProps): React.ReactElement {
    const t = buildTranslations(appName)[language];

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, t.preview),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                // Header
                h(Section, { style: styles.header },
                    h(Text, { style: styles.headerBrand }, appName)
                ),
                // Content
                h(Section, { style: styles.content },
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.paragraph }, t.greeting),
                    h(Text, { style: styles.paragraph },
                        ...t.intro.split(appName).flatMap((part, i) => i === 0 ? [part] : [h('strong', { key: i }, appName), part])
                    ),
                    // Highlight Box
                    h(Section, { style: styles.highlightBox },
                        h(Text, { style: styles.highlightTitle }, t.successTitle),
                        h(Text, { style: styles.highlightText }, t.successText)
                    ),
                    h(Text, { style: styles.paragraph }, t.ctaIntro),
                    h(Section, { style: styles.buttonContainer },
                        h(Button, { href: 'https://example.com', style: styles.button }, t.ctaButton)
                    ),
                    h(Text, { style: styles.paragraph }, t.contactText),
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
                    h(Text, { style: styles.socialText }, t.social),
                    h(Hr, { style: styles.divider }),
                    h(Text, { style: styles.footerNote },
                        t.footer
                    )
                )
            )
        )
    );
}

export default WaitingListEmail;
