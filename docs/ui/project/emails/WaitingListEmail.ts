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
  siteUrl: string;
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
  hr: { borderColor: colors.border, borderTopWidth: '1px', margin: '32px 0 18px' },
  footer: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: '0 0 8px' },
  footerLinks: { fontFamily: fonts.mono, fontSize: '11px', letterSpacing: '0.06em', color: colors.muted, margin: 0 },
  footerLink: { color: colors.muted, textDecoration: 'underline' },
};

const buildTranslations = (appName: string) => ({
  it: {
    preview: `Sei in lista d'attesa per ${appName} — ti avvisiamo noi`,
    eyebrow: 'Sei in lista',
    title: 'Ci sei. Ti avvisiamo noi.',
    body1: `grazie per esserti iscritto alla lista d'attesa di ${appName}. È un bel segnale, e ci fa piacere.`,
    body2: 'Stiamo lavorando per aprire le porte al più presto. Appena saremo pronti, sarai tra i primi a saperlo — niente code, niente sorprese.',
    cta: `Scopri ${appName}`,
    note: 'Nel frattempo, dai un’occhiata a cosa stiamo costruendo. E se conosci qualcuno che organizza un evento, sai dove mandarlo.',
    footerTagline: 'Inviti digitali e RSVP intelligenti',
    privacy: 'Privacy',
    tos: 'Termini',
    dpa: 'DPA',
  },
  en: {
    preview: `You're on the ${appName} waiting list — we'll be in touch`,
    eyebrow: "You're on the list",
    title: "You're in. We'll be in touch.",
    body1: `thanks for joining the ${appName} waiting list. It means a lot, and we're glad you're here.`,
    body2: "We're working hard to open the doors soon. The moment we're ready, you'll be among the first to know — no queues, no surprises.",
    cta: `Discover ${appName}`,
    note: "In the meantime, take a look at what we're building. And if you know someone planning an event, you know where to send them.",
    footerTagline: 'Digital invitations & smart RSVP',
    privacy: 'Privacy',
    tos: 'Terms',
    dpa: 'DPA',
  },
});

const h = React.createElement;

export function WaitingListEmail({
  language = 'it',
  appName,
  siteUrl,
  legalLinks,
}: WaitingListEmailProps): React.ReactElement {
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
        h(Text, { style: styles.text }, t.body1),
        h(Text, { style: styles.text }, t.body2),
        h(
          Section,
          { style: styles.ctaWrap },
          h(Button, { href: siteUrl, style: styles.button }, t.cta),
        ),
        h(Text, { style: styles.note }, t.note),
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

export default WaitingListEmail;
