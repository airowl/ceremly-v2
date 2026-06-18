// React Email template for contact form confirmation
// Sent to the user after submitting the contact form
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

interface ContactConfirmationEmailProps {
    language?: 'it' | 'en';
    userName: string;
    subject: string;
    appName: string;
    siteUrl?: string;
}

// Translations
const buildTranslations = (appName: string) => ({
    it: {
        preview: `Abbiamo ricevuto il tuo messaggio - ${appName}`,
        title: 'Messaggio ricevuto!',
        greeting: (name: string) => `Ciao ${name},`,
        intro: 'Grazie per averci contattato! Abbiamo ricevuto il tuo messaggio e il nostro team lo esaminerà al più presto.',
        subjectLabel: 'Oggetto del tuo messaggio:',
        responseNote: 'Ti risponderemo entro 24-48 ore lavorative.',
        ctaButton: `Visita ${appName}`,
        ctaText: `Nel frattempo, scopri tutte le funzionalità che ${appName} ha da offrirti.`,
        signature: 'Cordiali saluti,',
        team: `Il Team di ${appName}`,
        copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
        privacy: 'Privacy Policy',
        terms: 'Termini di Servizio',
        footer: 'Hai ricevuto questa email perché hai inviato un messaggio tramite il nostro modulo di contatto.',
    },
    en: {
        preview: `We received your message - ${appName}`,
        title: 'Message received!',
        greeting: (name: string) => `Hi ${name},`,
        intro: 'Thank you for contacting us! We have received your message and our team will review it as soon as possible.',
        subjectLabel: 'Subject of your message:',
        responseNote: 'We will get back to you within 24-48 business hours.',
        ctaButton: `Visit ${appName}`,
        ctaText: `In the meantime, discover all the features that ${appName} has to offer.`,
        signature: 'Best regards,',
        team: `The ${appName} Team`,
        copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        footer: 'You received this email because you sent a message through our contact form.',
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
    success: '#22c55e',
    successBg: '#f0fdf4',
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
        color: colors.success,
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
        backgroundColor: colors.successBg,
        borderLeft: `4px solid ${colors.success}`,
        padding: '15px',
        margin: '20px 0',
    },
    highlightTitle: {
        fontWeight: 'bold',
        margin: '0 0 10px 0',
        fontSize: '14px',
        color: colors.textLight,
    },
    highlightText: {
        margin: 0,
        fontWeight: '600',
    },
    responseNote: {
        fontSize: '14px',
        color: colors.textLight,
        textAlign: 'center' as const,
        marginBottom: '20px',
        fontStyle: 'italic',
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
    ctaText: {
        fontSize: '14px',
        color: colors.textLight,
        textAlign: 'center' as const,
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

export function ContactConfirmationEmail({
    language = 'it',
    userName,
    subject,
    appName,
    siteUrl = '',
}: ContactConfirmationEmailProps): React.ReactElement {
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
                    h(Text, { style: styles.paragraph }, t.greeting(userName)),
                    h(Text, { style: styles.paragraph }, t.intro),
                    // Highlight Box - Subject
                    h(Section, { style: styles.highlightBox },
                        h(Text, { style: styles.highlightTitle }, t.subjectLabel),
                        h(Text, { style: styles.highlightText }, subject)
                    ),
                    h(Text, { style: styles.responseNote }, t.responseNote),
                    h(Text, { style: styles.ctaText }, t.ctaText),
                    h(Section, { style: styles.buttonContainer },
                        h(Button, { href: siteUrl, style: styles.button }, t.ctaButton)
                    ),
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
                        h(Link, { href: `${siteUrl}/privacy`, style: styles.footerLink }, t.privacy),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: `${siteUrl}/tos`, style: styles.footerLink }, t.terms)
                    ),
                    h(Hr, { style: styles.divider }),
                    h(Text, { style: styles.footerNote },
                        t.footer
                    )
                )
            )
        )
    );
}

export default ContactConfirmationEmail;
