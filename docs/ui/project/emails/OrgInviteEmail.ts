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

interface OrgInviteEmailProps {
  language?: 'it' | 'en';
  inviteUrl: string;
  orgName: string;
  invitedByName: string;
  expiresInDays?: number;
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
  boxValue: { fontFamily: fonts.serif, fontSize: '20px', fontWeight: 600, color: colors.wineDeep, margin: 0 },
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
    preview: (org: string) => `Sei stato invitato a collaborare in ${org}`,
    eyebrow: 'Un invito',
    title: 'Ti hanno invitato nel team',
    body1: (by: string, org: string) =>
      `${by} ti ha invitato a collaborare nello spazio di ${org} su ${appName}.`,
    boxLabel: 'Organizzazione',
    body2: 'Accetta l’invito per accedere agli eventi del team, gestire gli inviti e seguire le risposte insieme — tutto da un unico posto.',
    cta: 'Accetta l’invito',
    expiry: (days: number) =>
      `Questo invito scade tra ${days} ${days === 1 ? 'giorno' : 'giorni'}.`,
    note: 'Se non ti aspettavi questo invito, puoi ignorare l’email senza problemi.',
    fallback: 'Se il pulsante non funziona, copia e incolla questo link nel browser:',
    footerTagline: 'Inviti digitali e RSVP intelligenti',
    privacy: 'Privacy',
    tos: 'Termini',
    dpa: 'DPA',
  },
  en: {
    preview: (org: string) => `You've been invited to collaborate in ${org}`,
    eyebrow: 'An invitation',
    title: "You're invited to the team",
    body1: (by: string, org: string) =>
      `${by} has invited you to collaborate in the ${org} workspace on ${appName}.`,
    boxLabel: 'Organization',
    body2: 'Accept the invitation to access the team’s events, manage invites and track responses together — all in one place.',
    cta: 'Accept the invitation',
    expiry: (days: number) =>
      `This invitation expires in ${days} ${days === 1 ? 'day' : 'days'}.`,
    note: "If you weren't expecting this invitation, you can safely ignore this email.",
    fallback: "If the button doesn't work, copy and paste this link into your browser:",
    footerTagline: 'Digital invitations & smart RSVP',
    privacy: 'Privacy',
    tos: 'Terms',
    dpa: 'DPA',
  },
});

const h = React.createElement;

export function OrgInviteEmail({
  language = 'it',
  inviteUrl,
  orgName,
  invitedByName,
  expiresInDays,
  appName,
  legalLinks,
}: OrgInviteEmailProps): React.ReactElement {
  const t = buildTranslations(appName)[language];

  return h(
    Html,
    { lang: language },
    h(Head),
    h(Preview, null, t.preview(orgName)),
    h(
      Body,
      { style: styles.body },
      h(
        Container,
        { style: styles.container },
        h(Text, { style: styles.eyebrow }, t.eyebrow),
        h(Text, { style: styles.title }, t.title),
        h(Text, { style: styles.text }, t.body1(invitedByName, orgName)),
        h(
          Section,
          { style: styles.box },
          h(Text, { style: styles.boxLabel }, t.boxLabel),
          h(Text, { style: styles.boxValue }, orgName),
        ),
        h(Text, { style: styles.text }, t.body2),
        h(
          Section,
          { style: styles.ctaWrap },
          h(Button, { href: inviteUrl, style: styles.button }, t.cta),
        ),
        typeof expiresInDays === 'number'
          ? h(Text, { style: styles.note }, t.expiry(expiresInDays))
          : null,
        h(Text, { style: styles.note }, t.note),
        h(Text, { style: styles.fallbackLabel }, t.fallback),
        h(Link, { href: inviteUrl, style: styles.fallbackLink }, inviteUrl),
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

export default OrgInviteEmail;
