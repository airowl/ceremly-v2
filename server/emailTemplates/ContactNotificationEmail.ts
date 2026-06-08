// React Email template for contact form admin notification
// Sent to admin when someone submits the contact form
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
    Hr,
} from '@react-email/components';

interface ContactNotificationEmailProps {
    appName: string;
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
    language: string;
    submittedAt: string;
}

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
    info: '#3b82f6',
    infoBg: '#eff6ff',
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
        padding: '30px 20px',
        textAlign: 'center' as const,
    },
    headerBrand: {
        color: colors.white,
        fontSize: '28px',
        fontWeight: '800',
        letterSpacing: '-0.5px',
        margin: '0',
    },
    headerTitle: {
        color: colors.white,
        fontSize: '18px',
        marginTop: '15px',
        fontWeight: 'normal',
    },
    content: {
        padding: '30px',
        color: colors.text,
        lineHeight: '1.6',
    },
    title: {
        color: colors.info,
        fontSize: '22px',
        marginBottom: '20px',
        fontWeight: '600',
    },
    infoBox: {
        backgroundColor: colors.infoBg,
        borderLeft: `4px solid ${colors.info}`,
        padding: '20px',
        margin: '20px 0',
        borderRadius: '0 8px 8px 0',
    },
    infoRow: {
        marginBottom: '12px',
    },
    infoLabel: {
        fontSize: '12px',
        color: colors.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: '4px',
    },
    infoValue: {
        fontSize: '16px',
        color: colors.text,
        fontWeight: '500',
        margin: 0,
    },
    emailLink: {
        color: colors.info,
        textDecoration: 'none',
    },
    messageBox: {
        backgroundColor: colors.highlight,
        padding: '20px',
        margin: '20px 0',
        borderRadius: '8px',
        border: `1px solid ${colors.primary}20`,
    },
    messageLabel: {
        fontSize: '12px',
        color: colors.textMuted,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: '10px',
    },
    messageText: {
        fontSize: '15px',
        color: colors.text,
        lineHeight: '1.7',
        whiteSpace: 'pre-wrap' as const,
        margin: 0,
    },
    metaInfo: {
        fontSize: '13px',
        color: colors.textMuted,
        marginTop: '20px',
        padding: '15px',
        backgroundColor: colors.background,
        borderRadius: '6px',
    },
    metaRow: {
        marginBottom: '5px',
    },
    footer: {
        backgroundColor: colors.background,
        padding: '20px 30px',
        textAlign: 'center' as const,
        fontSize: '12px',
        color: colors.textMuted,
    },
    divider: {
        borderColor: '#e7f0f3',
        margin: '15px 0',
    },
};

const h = React.createElement;

export function ContactNotificationEmail({
    appName,
    senderName,
    senderEmail,
    subject,
    message,
    language,
    submittedAt,
}: ContactNotificationEmailProps): React.ReactElement {
    const languageLabel = language === 'it' ? 'Italiano' : 'English';

    return h(Html, { lang: 'it' },
        h(Head),
        h(Preview, null, `Nuovo messaggio da ${senderName}: ${subject}`),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                // Header
                h(Section, { style: styles.header },
                    h(Text, { style: styles.headerBrand }, appName),
                    h(Text, { style: styles.headerTitle }, 'Notifica Modulo Contatti')
                ),
                // Content
                h(Section, { style: styles.content },
                    h(Text, { style: styles.title }, 'Nuovo messaggio ricevuto'),
                    // Sender Info Box
                    h(Section, { style: styles.infoBox },
                        h(Section, { style: styles.infoRow },
                            h(Text, { style: styles.infoLabel }, 'Da'),
                            h(Text, { style: styles.infoValue }, senderName)
                        ),
                        h(Section, { style: styles.infoRow },
                            h(Text, { style: styles.infoLabel }, 'Email'),
                            h(Link, { href: `mailto:${senderEmail}`, style: { ...styles.infoValue, ...styles.emailLink } }, senderEmail)
                        ),
                        h(Section, { style: { ...styles.infoRow, marginBottom: 0 } },
                            h(Text, { style: styles.infoLabel }, 'Oggetto'),
                            h(Text, { style: styles.infoValue }, subject)
                        )
                    ),
                    // Message Box
                    h(Section, { style: styles.messageBox },
                        h(Text, { style: styles.messageLabel }, 'Messaggio'),
                        h(Text, { style: styles.messageText }, message)
                    ),
                    // Meta Info
                    h(Section, { style: styles.metaInfo },
                        h(Text, { style: styles.metaRow },
                            h('strong', null, 'Lingua: '), languageLabel
                        ),
                        h(Text, { style: { ...styles.metaRow, marginBottom: 0 } },
                            h('strong', null, 'Data/Ora: '), submittedAt
                        )
                    )
                ),
                // Footer
                h(Section, { style: styles.footer },
                    h(Hr, { style: styles.divider }),
                    h(Text, null, `Questa email è stata generata automaticamente dal modulo contatti di ${appName}.`),
                    h(Text, null,
                        'Per rispondere, clicca su "Rispondi" oppure scrivi direttamente a ',
                        h(Link, { href: `mailto:${senderEmail}`, style: styles.emailLink }, senderEmail)
                    )
                )
            )
        )
    );
}

export default ContactNotificationEmail;
