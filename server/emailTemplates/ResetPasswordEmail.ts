// React Email template for password reset
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

interface ResetPasswordEmailProps {
    language?: 'it' | 'en';
    resetUrl: string;
    userName?: string;
    appName: string;
}

// Translations
const buildTranslations = (appName: string) => ({
    it: {
        preview: `Reimposta la tua password di ${appName}`,
        title: 'Reimposta la tua password',
        greeting: (name?: string) => name ? `Ciao ${name},` : 'Ciao,',
        intro: `Abbiamo ricevuto una richiesta per reimpostare la password del tuo account ${appName}.`,
        resetTitle: 'Reimposta la tua password',
        resetText: 'Clicca il pulsante qui sotto per creare una nuova password per il tuo account.',
        ctaButton: 'Reimposta Password',
        expiryNote: 'Questo link scadrà tra 1 ora.',
        alternativeText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
        securityNote: 'Se non hai richiesto il reset della password, puoi ignorare questa email. La tua password rimarrà invariata.',
        securityTip: 'Per la tua sicurezza, non condividere mai questo link con nessuno.',
        signature: 'Cordiali saluti,',
        team: `Il Team di ${appName}`,
        copyright: `© ${new Date().getFullYear()} ${appName}. Tutti i diritti riservati.`,
        privacy: 'Privacy Policy',
        terms: 'Termini di Servizio',
        dpa: 'Data Processing Agreement',
        footer: `Hai ricevuto questa email perché hai richiesto il reset della password su ${appName}.`,
    },
    en: {
        preview: `Reset your ${appName} password`,
        title: 'Reset your password',
        greeting: (name?: string) => name ? `Hi ${name},` : 'Hi,',
        intro: `We received a request to reset the password for your ${appName} account.`,
        resetTitle: 'Reset your password',
        resetText: 'Click the button below to create a new password for your account.',
        ctaButton: 'Reset Password',
        expiryNote: 'This link will expire in 1 hour.',
        alternativeText: "If the button doesn't work, copy and paste this link into your browser:",
        securityNote: "If you didn't request a password reset, you can ignore this email. Your password will remain unchanged.",
        securityTip: 'For your security, never share this link with anyone.',
        signature: 'Best regards,',
        team: `The ${appName} Team`,
        copyright: `© ${new Date().getFullYear()} ${appName}. All rights reserved.`,
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        dpa: 'Data Processing Agreement',
        footer: `You received this email because you requested a password reset on ${appName}.`,
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
    warning: '#fff3cd',
    warningBorder: '#ffc107',
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
    warningBox: {
        backgroundColor: colors.warning,
        borderLeft: `4px solid ${colors.warningBorder}`,
        padding: '15px',
        margin: '20px 0',
    },
    securityNote: {
        fontSize: '14px',
        margin: '0 0 10px 0',
    },
    securityTip: {
        fontSize: '14px',
        fontWeight: 'bold',
        margin: 0,
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

export function ResetPasswordEmail({
    language = 'it',
    resetUrl,
    userName,
    appName,
}: ResetPasswordEmailProps): React.ReactElement {
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
                        ...t.intro.split(appName).flatMap((part, i) => i === 0 ? [part] : [h('strong', { key: i }, appName), part])
                    ),
                    // Highlight Box
                    h(Section, { style: styles.highlightBox },
                        h(Text, { style: styles.highlightTitle }, t.resetTitle),
                        h(Text, { style: styles.highlightText }, t.resetText)
                    ),
                    h(Section, { style: styles.buttonContainer },
                        h(Button, { href: resetUrl, style: styles.button }, t.ctaButton)
                    ),
                    h(Text, { style: styles.expiryNote }, t.expiryNote),
                    h(Text, { style: styles.alternativeText }, t.alternativeText),
                    h(Text, { style: styles.linkText },
                        h(Link, { href: resetUrl, style: styles.link }, resetUrl)
                    ),
                    // Security Warning Box
                    h(Section, { style: styles.warningBox },
                        h(Text, { style: styles.securityNote }, t.securityNote),
                        h(Text, { style: styles.securityTip }, t.securityTip)
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
                        h(Link, { href: 'https://example.com/privacy', style: styles.footerLink }, t.privacy),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: 'https://example.com/tos', style: styles.footerLink }, t.terms),
                        h(Text, { style: styles.footerSeparator }, '|'),
                        h(Link, { href: 'https://example.com/dpa', style: styles.footerLink }, t.dpa)
                    ),
                    h(Hr, { style: styles.divider }),
                    h(Text, { style: styles.footerNote }, t.footer)
                )
            )
        )
    );
}

export default ResetPasswordEmail;
