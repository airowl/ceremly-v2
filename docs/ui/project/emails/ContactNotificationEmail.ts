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

interface ContactNotificationEmailProps {
  senderName: string;
  senderEmail: string;
  subject: string;
  message: string;
  language: 'it' | 'en';
  submittedAt: string;
  appName: string;
}

const colors = {
  bone: '#fefae0',
  card: '#ffffff',
  border: '#e9e4ce',
  accent: '#d4a373',
  ink: '#3F3622',
  wineDeep: '#5E4426',
  muted: '#a89e7e',
  sage: '#ccd5ae',
  success: '#6B8E23',
  error: '#B0481A',
};

const fonts = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  mono: "'Space Mono', 'Courier New', monospace",
};

const styles: Record<string, React.CSSProperties> = {
  body: { backgroundColor: colors.bone, margin: 0, padding: '40px 16px', fontFamily: fonts.sans },
  container: { maxWidth: '560px', margin: '0 auto', backgroundColor: colors.card, border: `1px solid ${colors.border}`, borderRadius: '18px', padding: '44px 40px' },
  eyebrow: { fontFamily: fonts.mono, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.18em', color: colors.accent, margin: '0 0 16px' },
  title: { fontFamily: fonts.serif, fontSize: '28px', lineHeight: 1.2, fontWeight: 600, color: colors.wineDeep, margin: '0 0 24px' },
  row: { borderTop: `1px solid ${colors.border}`, padding: '14px 0 0', margin: '0 0 14px' },
  rowLabel: { fontFamily: fonts.mono, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: colors.muted, margin: '0 0 4px' },
  rowValue: { fontFamily: fonts.sans, fontSize: '15px', fontWeight: 500, color: colors.ink, margin: 0, wordBreak: 'break-word' },
  rowLink: { fontFamily: fonts.sans, fontSize: '15px', fontWeight: 500, color: colors.accent, textDecoration: 'none' },
  messageBox: { backgroundColor: colors.bone, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '18px 20px', margin: '6px 0 0' },
  messageLabel: { fontFamily: fonts.mono, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: colors.muted, margin: '0 0 8px' },
  messageText: { fontFamily: fonts.sans, fontSize: '15px', lineHeight: 1.7, color: colors.ink, margin: 0 },
  ctaWrap: { margin: '26px 0 8px' },
  button: { backgroundColor: colors.accent, color: colors.ink, fontFamily: fonts.mono, fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textDecoration: 'none', padding: '14px 30px', borderRadius: '999px', display: 'inline-block' },
  hr: { borderColor: colors.border, borderTopWidth: '1px', margin: '32px 0 18px' },
  footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: 0 },
};

// Notifica interna — solo italiano.
const buildTranslations = (appName: string) => ({
  it: {
    preview: 'Nuovo messaggio dal form contatti',
    eyebrow: `${appName} · notifica interna`,
    title: 'Nuovo messaggio dal form contatti',
    from: 'Da',
    email: 'Email',
    subject: 'Oggetto',
    date: 'Ricevuto il',
    message: 'Messaggio',
    cta: 'Rispondi al mittente',
    footer: 'Notifica automatica · non rispondere a questo indirizzo',
  },
});

const h = React.createElement;

function multiline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) out.push(h('br', { key: `br-${i}` }));
    out.push(line);
  });
  return out;
}

export function ContactNotificationEmail({
  senderName,
  senderEmail,
  subject,
  message,
  submittedAt,
  appName,
}: ContactNotificationEmailProps): React.ReactElement {
  // Template interno: sempre in italiano, a prescindere dalla lingua dell'utente.
  const t = buildTranslations(appName).it;

  return h(
    Html,
    { lang: 'it' },
    h(Head),
    h(Preview, null, `${t.preview} — ${subject}`),
    h(
      Body,
      { style: styles.body },
      h(
        Container,
        { style: styles.container },
        h(Text, { style: styles.eyebrow }, t.eyebrow),
        h(Text, { style: styles.title }, t.title),
        h(
          Section,
          { style: styles.row },
          h(Text, { style: styles.rowLabel }, t.from),
          h(Text, { style: styles.rowValue }, senderName),
        ),
        h(
          Section,
          { style: styles.row },
          h(Text, { style: styles.rowLabel }, t.email),
          h(Link, { href: `mailto:${senderEmail}`, style: styles.rowLink }, senderEmail),
        ),
        h(
          Section,
          { style: styles.row },
          h(Text, { style: styles.rowLabel }, t.subject),
          h(Text, { style: styles.rowValue }, subject),
        ),
        h(
          Section,
          { style: styles.row },
          h(Text, { style: styles.rowLabel }, t.date),
          h(Text, { style: styles.rowValue }, submittedAt),
        ),
        h(
          Section,
          { style: styles.messageBox },
          h(Text, { style: styles.messageLabel }, t.message),
          h(Text, { style: styles.messageText }, ...multiline(message)),
        ),
        h(
          Section,
          { style: styles.ctaWrap },
          h(
            Button,
            { href: `mailto:${senderEmail}?subject=Re: ${encodeURIComponent(subject)}`, style: styles.button },
            t.cta,
          ),
        ),
        h(Hr, { style: styles.hr }),
        h(Text, { style: styles.footer }, `${appName} — ${t.footer}`),
      ),
    ),
  );
}

export default ContactNotificationEmail;
