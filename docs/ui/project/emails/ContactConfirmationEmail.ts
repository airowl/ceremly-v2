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
  siteUrl?: string;
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
  title: { fontFamily: fonts.serif, fontSize: '30px', lineHeight: 1.2, fontWeight: 600, color: colors.wineDeep, margin: '0 0 20px' },
  text: { fontFamily: fonts.sans, fontSize: '15px', lineHeight: 1.7, color: colors.ink, margin: '0 0 16px' },
  box: { backgroundColor: colors.bone, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '16px 18px', margin: '4px 0 22px' },
  boxLabel: { fontFamily: fonts.mono, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: colors.muted, margin: '0 0 6px' },
  boxValue: { fontFamily: fonts.sans, fontSize: '15px', fontWeight: 600, color: colors.ink, margin: 0 },
  ctaWrap: { margin: '28px 0 8px' },
  button: { backgroundColor: colors.accent, color: colors.ink, fontFamily: fonts.mono, fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textDecoration: 'none', padding: '14px 30px', borderRadius: '999px', display: 'inline-block' },
  hr: { borderColor: colors.border, borderTopWidth: '1px', margin: '32px 0 18px' },
  footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: 0 },
};

const buildTranslations = (appName: string) => ({
  it: {
    preview: 'Abbiamo ricevuto il tuo messaggio — ti rispondiamo a breve',
    eyebrow: 'Messaggio ricevuto',
    title: 'Ci pensiamo noi',
    greeting: (name: string) => `Ciao ${name},`,
    body1: 'abbiamo ricevuto il tuo messaggio e lo stiamo leggendo. Ti rispondiamo a breve — di solito entro un giorno lavorativo.',
    boxLabel: 'Oggetto',
    body2: 'Non serve che tu faccia altro: ti scriviamo noi appena possiamo.',
    cta: (app: string) => `Torna su ${app}`,
    footer: 'Inviti digitali e RSVP intelligenti',
  },
  en: {
    preview: "We've received your message — we'll reply shortly",
    eyebrow: 'Message received',
    title: "We're on it",
    greeting: (name: string) => `Hi ${name},`,
    body1: "we've received your message and we're reading it now. We'll get back to you shortly — usually within one business day.",
    boxLabel: 'Subject',
    body2: "There's nothing else you need to do: we'll write to you as soon as we can.",
    cta: (app: string) => `Back to ${app}`,
    footer: 'Digital invitations & smart RSVP',
  },
});

const h = React.createElement;

export function ContactConfirmationEmail({
  language = 'it',
  userName,
  subject,
  siteUrl,
  appName,
}: ContactConfirmationEmailProps): React.ReactElement {
  const t = buildTranslations(appName)[language];

  return h(
    Html,
    { lang: language },
    h(Head),
    h(Preview, null, t.preview),
    h(
      Body,
      { style: styles.body },
      h(
        Container,
        { style: styles.container },
        h(Text, { style: styles.eyebrow }, t.eyebrow),
        h(Text, { style: styles.title }, t.title),
        h(Text, { style: styles.text }, t.greeting(userName)),
        h(Text, { style: styles.text }, t.body1),
        h(
          Section,
          { style: styles.box },
          h(Text, { style: styles.boxLabel }, t.boxLabel),
          h(Text, { style: styles.boxValue }, subject),
        ),
        h(Text, { style: styles.text }, t.body2),
        siteUrl
          ? h(
              Section,
              { style: styles.ctaWrap },
              h(Button, { href: siteUrl, style: styles.button }, t.cta(appName)),
            )
          : null,
        h(Hr, { style: styles.hr }),
        h(Text, { style: styles.footer }, `${appName} — ${t.footer}`),
      ),
    ),
  );
}

export default ContactConfirmationEmail;
