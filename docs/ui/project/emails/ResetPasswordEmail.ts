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
  securityBox: { backgroundColor: colors.bone, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '16px 18px', margin: '22px 0 0' },
  securityLabel: { fontFamily: fonts.mono, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: colors.muted, margin: '0 0 6px' },
  securityText: { fontFamily: fonts.sans, fontSize: '13px', lineHeight: 1.6, color: colors.ink, margin: 0 },
  fallbackLabel: { fontFamily: fonts.sans, fontSize: '13px', lineHeight: 1.6, color: colors.muted, margin: '24px 0 6px' },
  fallbackLink: { fontFamily: fonts.mono, fontSize: '12px', color: colors.accent, wordBreak: 'break-all' },
  hr: { borderColor: colors.border, borderTopWidth: '1px', margin: '32px 0 18px' },
  footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: '0 0 8px' },
  footerLinks: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: 0 },
  footerLink: { color: colors.muted, textDecoration: 'underline' },
};

const buildTranslations = (appName: string) => ({
  it: {
    preview: `Reimposta la password del tuo account ${appName}`,
    eyebrow: 'Sicurezza',
    title: 'Reimposta la password',
    greeting: (name?: string) => (name ? `Ciao ${name},` : 'Ciao,'),
    body1: `hai chiesto di reimpostare la password del tuo account ${appName}. Clicca qui sotto per sceglierne una nuova.`,
    cta: 'Scegli una nuova password',
    securityLabel: 'Nota di sicurezza',
    securityText: 'Per la tua sicurezza, questo link scade tra 60 minuti. Se non hai richiesto tu il reset, ignora questa email: la tua password resta invariata e il tuo account è al sicuro.',
    fallback: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    footerTagline: 'Inviti digitali e RSVP intelligenti',
    privacy: 'Privacy',
    tos: 'Termini',
    dpa: 'DPA',
  },
  en: {
    preview: `Reset the password for your ${appName} account`,
    eyebrow: 'Security',
    title: 'Reset your password',
    greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi,'),
    body1: `you asked to reset the password for your ${appName} account. Click below to choose a new one.`,
    cta: 'Choose a new password',
    securityLabel: 'Security note',
    securityText: "For your security, this link expires in 60 minutes. If you didn't request a reset, just ignore this email: your password stays the same and your account is safe.",
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    footerTagline: 'Digital invitations & smart RSVP',
    privacy: 'Privacy',
    tos: 'Terms',
    dpa: 'DPA',
  },
});

const h = React.createElement;

export function ResetPasswordEmail({
  language = 'it',
  resetUrl,
  userName,
  appName,
  legalLinks,
}: ResetPasswordEmailProps): React.ReactElement {
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
          { style: styles.ctaWrap },
          h(Button, { href: resetUrl, style: styles.button }, t.cta),
        ),
        h(
          Section,
          { style: styles.securityBox },
          h(Text, { style: styles.securityLabel }, t.securityLabel),
          h(Text, { style: styles.securityText }, t.securityText),
        ),
        h(Text, { style: styles.fallbackLabel }, t.fallback),
        h(Link, { href: resetUrl, style: styles.fallbackLink }, resetUrl),
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

export default ResetPasswordEmail;
