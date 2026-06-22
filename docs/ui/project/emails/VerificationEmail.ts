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
  ctaWrap: { margin: '28px 0 8px' },
  button: { backgroundColor: colors.accent, color: colors.ink, fontFamily: fonts.mono, fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', textDecoration: 'none', padding: '14px 30px', borderRadius: '999px', display: 'inline-block' },
  note: { fontFamily: fonts.sans, fontSize: '13px', lineHeight: 1.6, color: colors.muted, margin: '20px 0 0' },
  fallbackLabel: { fontFamily: fonts.sans, fontSize: '13px', lineHeight: 1.6, color: colors.muted, margin: '24px 0 6px' },
  fallbackLink: { fontFamily: fonts.mono, fontSize: '12px', color: colors.accent, wordBreak: 'break-all' },
  hr: { borderColor: colors.border, borderTopWidth: '1px', margin: '32px 0 18px' },
  footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: '0 0 8px' },
  footerLinks: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: 0 },
  footerLink: { color: colors.muted, textDecoration: 'underline' },
};

const buildTranslations = (appName: string) => ({
  it: {
    preview: `Conferma il tuo indirizzo email per attivare ${appName}`,
    eyebrow: 'Benvenuto',
    title: 'Confermiamo che sei tu',
    greeting: (name?: string) => (name ? `Ciao ${name},` : 'Ciao,'),
    body1: `che bello averti qui. Manca solo un passaggio per attivare il tuo account su ${appName}: conferma che questo indirizzo email è davvero tuo.`,
    body2: 'Bastano pochi secondi e poi sei pronto a creare il tuo primo invito.',
    cta: 'Conferma la mia email',
    note: 'Il link è valido per 24 ore. Se non hai creato tu un account, puoi ignorare tranquillamente questa email.',
    fallback: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    footerTagline: 'Inviti digitali e RSVP intelligenti',
    privacy: 'Privacy',
    tos: 'Termini',
    dpa: 'DPA',
  },
  en: {
    preview: `Confirm your email address to activate ${appName}`,
    eyebrow: 'Welcome',
    title: "Let's confirm it's you",
    greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi,'),
    body1: `lovely to have you here. There's just one step left to activate your ${appName} account: confirm that this email address is really yours.`,
    body2: 'It only takes a few seconds, and then you are ready to create your first invitation.',
    cta: 'Confirm my email',
    note: "The link is valid for 24 hours. If you didn't create an account, you can safely ignore this email.",
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    footerTagline: 'Digital invitations & smart RSVP',
    privacy: 'Privacy',
    tos: 'Terms',
    dpa: 'DPA',
  },
});

const h = React.createElement;

export function VerificationEmail({
  language = 'it',
  verificationUrl,
  userName,
  appName,
  legalLinks,
}: VerificationEmailProps): React.ReactElement {
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
        h(Text, { style: styles.text }, t.body2),
        h(
          Section,
          { style: styles.ctaWrap },
          h(Button, { href: verificationUrl, style: styles.button }, t.cta),
        ),
        h(Text, { style: styles.note }, t.note),
        h(Text, { style: styles.fallbackLabel }, t.fallback),
        h(Link, { href: verificationUrl, style: styles.fallbackLink }, verificationUrl),
        h(Hr, { style: styles.hr }),
        h(Text, { style: styles.footer }, `${appName} — ${t.footerTagline}`),
        h(
          Text,
          { style: styles.footerLinks },
          h(Link, { href: legalLinks.privacy, style: styles.footerLink }, t.privacy),
          '   ·   ',
          h(Link, { href: legalLinks.tos, style: styles.footerLink }, t.tos),
          '   ·   ',
          h(Link, { href: legalLinks.dpa, style: styles.footerLink }, t.dpa),
        ),
      ),
    ),
  );
}

export default VerificationEmail;
