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

interface ChangeEmailEmailProps {
  language?: 'it' | 'en';
  confirmUrl: string;
  newEmail: string;
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
  box: { backgroundColor: colors.bone, border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '16px 18px', margin: '4px 0 22px' },
  boxLabel: { fontFamily: fonts.mono, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: colors.muted, margin: '0 0 6px' },
  boxValue: { fontFamily: fonts.sans, fontSize: '17px', fontWeight: 600, color: colors.wineDeep, margin: 0, wordBreak: 'break-all' },
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
    preview: 'Conferma il cambio del tuo indirizzo email',
    eyebrow: 'Cambio email',
    title: 'Confermi il nuovo indirizzo?',
    greeting: (name?: string) => (name ? `Ciao ${name},` : 'Ciao,'),
    body1: `hai chiesto di cambiare l'email associata al tuo account ${appName}. Il nuovo indirizzo sarà:`,
    boxLabel: 'Nuovo indirizzo',
    body2: 'Conferma qui sotto per procedere. Subito dopo invieremo un’email di verifica al nuovo indirizzo, così ci assicuriamo che sia raggiungibile.',
    cta: 'Conferma il cambio',
    note: 'Se non hai richiesto tu questa modifica, ignora pure questa email: nulla cambierà e il tuo indirizzo attuale resta attivo.',
    fallback: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    footerTagline: 'Inviti digitali e RSVP intelligenti',
    privacy: 'Privacy',
    tos: 'Termini',
    dpa: 'DPA',
  },
  en: {
    preview: 'Confirm the change to your email address',
    eyebrow: 'Email change',
    title: 'Confirm your new address?',
    greeting: (name?: string) => (name ? `Hi ${name},` : 'Hi,'),
    body1: `you asked to change the email linked to your ${appName} account. The new address will be:`,
    boxLabel: 'New address',
    body2: "Confirm below to go ahead. Right after, we'll send a verification email to the new address to make sure it's reachable.",
    cta: 'Confirm the change',
    note: "If you didn't request this change, just ignore this email: nothing will change and your current address stays active.",
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    footerTagline: 'Digital invitations & smart RSVP',
    privacy: 'Privacy',
    tos: 'Terms',
    dpa: 'DPA',
  },
});

const h = React.createElement;

export function ChangeEmailEmail({
  language = 'it',
  confirmUrl,
  newEmail,
  userName,
  appName,
  legalLinks,
}: ChangeEmailEmailProps): React.ReactElement {
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
          h(Text, { style: styles.boxValue }, newEmail),
        ),
        h(Text, { style: styles.text }, t.body2),
        h(
          Section,
          { style: styles.ctaWrap },
          h(Button, { href: confirmUrl, style: styles.button }, t.cta),
        ),
        h(Text, { style: styles.note }, t.note),
        h(Text, { style: styles.fallbackLabel }, t.fallback),
        h(Link, { href: confirmUrl, style: styles.fallbackLink }, confirmUrl),
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

export default ChangeEmailEmail;
