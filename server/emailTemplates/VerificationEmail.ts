// React Email template for email verification
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

interface VerificationEmailProps {
    language?: 'it' | 'en';
    verificationUrl: string;
    userName?: string;
    appName: string;
    legalLinks: { privacy: string; tos: string; dpa: string };
}

// Translations
const buildTranslations = (appName: string) => ({
    it: {
        preview: `Verifica il tuo indirizzo email per ${appName}`,
        title: 'Verifica il tuo indirizzo email',
        greeting: (name?: string) => name ? `Ciao ${name},` : 'Ciao,',
        intro: `Conferma il tuo indirizzo email per il tuo account ${appName}.`,
        verifyTitle: 'Verifica il tuo indirizzo email',
        verifyText: 'Clicca il pulsante qui sotto per verificare il tuo indirizzo email.',
        ctaButton: 'Verifica Email',
        expiryNote: 'Questo link scadrà tra 24 ore.',
        alternativeText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
        ignoreText: `Se non hai richiesto tu questa verifica, puoi ignorare questa email.`,
        signature: 'Cordiali saluti,',
        team: `Il Team di ${appName}`,
        copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
        privacy: 'Privacy Policy',
        terms: 'Termini di Servizio',
        dpa: 'Data Processing Agreement',
        footer: `Hai ricevuto questa email perché è stata richiesta la verifica di questo indirizzo per ${appName}.`,
    },
    en: {
        preview: `Verify your email address for ${appName}`,
        title: 'Verify your email address',
        greeting: (name?: string) => name ? `Hi ${name},` : 'Hi,',
        intro: `Confirm your email address for your ${appName} account.`,
        verifyTitle: 'Verify your email address',
        verifyText: 'Click the button below to verify your email address.',
        ctaButton: 'Verify Email',
        expiryNote: 'This link will expire in 24 hours.',
        alternativeText: "If the button doesn't work, copy and paste this link into your browser:",
        ignoreText: `If you didn't request this verification, you can ignore this email.`,
        signature: 'Best regards,',
        team: `The ${appName} Team`,
        copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        dpa: 'Data Processing Agreement',
        footer: `You received this email because verification was requested for this address on ${appName}.`,
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
                // Header
                h(Section, { style: styles.header },
                    h(Text, { style: styles.headerBrand }, appName)
                ),
                // Content
                h(Section, { style: styles.content },
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.paragraph }, t.greeting(userName)),
                    h(Text, { style: styles.paragraph },
                        ...t.intro.split(appName).flatMap((part, i) =>
                            i === 0 ? [part] : [h('strong', { key: i }, appName), part]
                        )
                    ),
                    // Highlight Box
                    h(Section, { style: styles.highlightBox },
                        h(Text, { style: styles.highlightTitle }, t.verifyTitle),
                        h(Text, { style: styles.highlightText }, t.verifyText)
                    ),
                    h(Section, { style: styles.buttonContainer },
                        h(Button, { href: verificationUrl, style: styles.button }, t.ctaButton)
                    ),
                    h(Text, { style: styles.expiryNote }, t.expiryNote),
                    h(Text, { style: styles.alternativeText }, t.alternativeText),
                    h(Text, { style: styles.linkText },
                        h(Link, { href: verificationUrl, style: styles.link }, verificationUrl)
                    ),
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
                        h(Link, { href: legalLinks.privacy, style: styles.footerLink }, t.privacy),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: legalLinks.tos, style: styles.footerLink }, t.terms),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: legalLinks.dpa, style: styles.footerLink }, t.dpa)
                    ),
                    h(Hr, { style: styles.divider }),
                    h(Text, { style: styles.footerNote }, t.footer)
                )
            )
        )
    );
}

export default VerificationEmail;
