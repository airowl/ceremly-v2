# FASE 1b — Auth flows + signup→org + team via plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere viva la membership org. Al signup nasce automaticamente l'organization personale (B2C, owner) e diventa l'org attiva di sessione; tutta la gestione team/inviti passa per le **API native del plugin** `organization` (nessuna route `/api/team/*`, nessun `team.service` custom); l'email d'invito è genericizzata da "evento" a "organization" e collegata a `sendInvitationEmail`; `canAddTeamMember` diventa org-aware contando i membri+inviti pending su `member`/`invitation`.

**Architecture:** Better Auth `organization()` plugin con: `organizationHooks` (audit su invite/accept/remove/role + enforcement `canAddTeamMember` su `beforeCreateInvitation`) + `sendInvitationEmail` (→ `sendEmail` case `invitation`). Hook signup→org via `databaseHooks.user.create.after` → `auth.api.createOrganization({ body: { userId } })`. Org attiva via `databaseHooks.session.create.before` (Redis secondaryStorage blob). Nessuna route nuova: gli endpoint team sono già montati sotto la catch-all `/api/auth/[...all]`.

**Tech Stack:** Nuxt 4 + Better Auth 1.4.5 (`organization` plugin) + Drizzle ORM + PostgreSQL + Redis (`secondaryStorage`) + Resend/React Email. Verifica: `pnpm typecheck`, `npx tsx` script assertivi (stile `verify-isolation.ts`), smoke manuale (`pnpm dev`). **Nessun framework di test** (no vitest/jest/playwright).

---

## Prerequisiti / Gate

- **1a deve essere landed** (lo è: commit `036238a`, `ec85867`, ...). Verificato disponibile:
  - Schema org: `server/database/schema/auth.ts` (`organization`, `member` con `role default "member"`, `invitation` con `id/email/role/status/expiresAt/inviterId`, **niente `token`**, **niente tabella `session`**).
  - `organization()` registrato **senza opzioni** in `server/utils/auth.ts:220`.
  - `secondaryStorage: cacheClient` attivo (`server/utils/auth.ts:68`) → la sessione NON è in Postgres, vive in Redis come blob JSON.
  - Repositories: `memberRepository.ts` (`findMembers`, `findMemberRole`), `invitationRepository.ts` (`findPendingInvitations`), `organizationRepository.ts` (`findOrganizationById`, `findOrganizationsForUser`).
  - Seed: `server/database/seed/index.ts` crea org B2C (`personal-org`, 1 owner) + org B2B (`team-org`, owner/admin/member + 1 invito pending) — fixture perfetta per i gate.
  - `verify-isolation.ts` esiste e definisce il pattern tsx assertivo (exit 1 su fail) da riusare.
  - Audit: `AUDIT_ACTIONS` include già `team.member_invited`, `team.invitation_canceled`, `team.invite_accepted`, `team.permissions_updated`, `team.member_removed` (`server/utils/audit/types.ts:48-54`). `LogAuditOptions` ha `organizationId` (`types.ts:114`). `logAudit(event|null, action, opts)` (`server/utils/audit/index.ts`).

- **Drift dello spec vs realtà landed (nota di onestà):** lo spec 1b (righe 10, 36, 62) parla di "rimuovere stub 501 dei consumer team" e "sostituire `team.service.ts`". **Sono già stati rimossi in 1a** — verificato: `server/services/team.service.ts` NON esiste, `server/api/team/` NON esiste. Quindi **NON esistono task di rimozione** in questo piano: la parte "team via plugin" si realizza configurando `organizationHooks` + `sendInvitationEmail` sul plugin già montato, non cancellando codice morto.

- **Fuori scope (NON toccare qui):**
  - `permissions.ts` / `requireOrgRole` / middleware `2.organization.ts` → **1c**.
  - Route `/api/organizations/*` CRUD → **1c**.
  - Rename `max_events`→`max_organizations`, colonna `userCustomLimits.maxEvents`, `countUserEvents`/`canCreateEvent`/`limits` route/admin stats → **1c** (baseline D4). È **atteso e onesto** che gli stub event-named (`countUserEvents`→0, admin stats `events:{count:0}`) coesistano con le nuove funzioni org-aware fino a 1c.
  - `organizationClient()` nel client, store/pagine, pagina `invite/[token].vue` → **1d**.

---

## File Structure

| File | Azione | Responsabilità in 1b |
|---|---|---|
| `server/utils/auth.ts` | **Modify** | Estendere `organization({ ... })` con `sendInvitationEmail` + `organizationHooks`; aggiungere `databaseHooks.user.create.after` (signup→org) e `databaseHooks.session.create.before` (org attiva). |
| `server/emailTemplates/OrgInviteEmail.ts` | **Create** | Template React Email d'invito genericizzato (org invece di evento). Copia da `EventInviteEmail.ts` con wording org-neutro. |
| `server/emailTemplates/index.ts` | **Modify** | Aggiungere `renderOrgInviteEmail(...)` + subject `orgInvite(orgName)`. Lasciare `renderEventInviteEmail`/`EventInviteEmail` in essere (rimossi in 1d/FASE 5). |
| `server/utils/email.ts` | **Modify** | Aggiungere `EmailType "invitation"` + `InvitationEmailOptions` + case in `buildEmailContent`. |
| `server/services/planLimit.service.ts` | **Modify** | Aggiungere `countOrgMembers(orgId)`, `countPendingOrgInvitations(orgId)`, e rendere `canAddTeamMember` org-aware (overload nuovo `canAddTeamMember(ownerId, orgId)` reale). |
| `server/services/org.service.ts` | **Create** | `deriveOrgNameFromUser(user)` + `generateUniqueOrgSlug(name)` (slug univoco con suffisso uuid). Logica pura riusabile dall'hook signup. |
| `server/database/seed/verify-team-limit.ts` | **Create** | Script tsx assertivo: `canAddTeamMember` sul seed B2B → `allowed:false, current:4, limit:1`. Exit 1 su fail. |
| `server/database/seed/verify-signup-org.ts` | **Create** | Script tsx assertivo: dato un userId, verifica esistenza riga `organization` + riga `member role=owner`. Exit 1 su fail. Usato dopo smoke signup. |

**Nessuna route nuova.** Gli endpoint team (`/organization/invite-member`, `/organization/accept-invitation`, ...) sono già esposti dalla catch-all Better Auth `/api/auth/[...all]`.

---

## Task 1 — Org service: derive name + unique slug

**Files:**
- Create: `server/services/org.service.ts`
- Verify: `pnpm typecheck`

- [ ] Creare `server/services/org.service.ts` con il codice completo:

```ts
/**
 * Organization service (phase 1b).
 * Logica pura riusabile dall'hook signup→org in server/utils/auth.ts.
 * Niente SDK qui: la creazione org reale avviene via auth.api.createOrganization.
 */
import { v7 as uuidv7 } from "uuid";

/**
 * Deriva un nome org leggibile dal nuovo utente.
 * Preferisce il name; fallback alla parte locale dell'email; fallback "Workspace".
 */
export function deriveOrgNameFromUser(user: { name?: string | null; email: string }): string {
    const fromName = (user.name ?? "").trim();
    if (fromName.length > 0) {
        return `${fromName}'s Workspace`;
    }
    const localPart = user.email.split("@")[0]?.trim();
    if (localPart && localPart.length > 0) {
        return `${localPart}'s Workspace`;
    }
    return "Workspace";
}

/**
 * Genera uno slug univoco-per-costruzione.
 * Base slugificata + suffisso uuid breve → collisione con
 * organization.slug (UNIQUE) praticamente impossibile, così
 * createOrganization non lancia mai ORGANIZATION_ALREADY_EXISTS.
 */
export function generateUniqueOrgSlug(name: string): string {
    const base = name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    const suffix = uuidv7().split("-")[0]; // 8 hex chars
    const safeBase = base.length > 0 ? base : "org";
    return `${safeBase}-${suffix}`;
}
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun errore relativo a `org.service.ts` (lo stesso errore-base eventuale preesistente del repo è tollerato; nessun NUOVO errore introdotto da questo file).
- [ ] Commit: `feat: org service (derive name + unique slug) (phase 1b)`

---

## Task 2 — planLimit: conteggi org-aware + canAddTeamMember reale

> **Nota di onestà:** mantengo la firma `canAddTeamMember(ownerId, orgId)` (2 stringhe) per non rompere il re-export in `server/utils/userPlan.ts`. Il 2° parametro, oggi un `eventId` stub, diventa un `organizationId` reale. `countEventMembers`/`countPendingInvitations`/`countReservedSlots` restano stub event-named (rimossi/rinominati in 1c): NON li tocco per non sforare lo scope (baseline D4).

**Files:**
- Modify: `server/services/planLimit.service.ts`
- Verify: `pnpm typecheck`

- [ ] In `server/services/planLimit.service.ts`, aggiungere gli import dei repository in testa, subito dopo l'import esistente di `getDB`:

Aprire il file e dopo la riga `import { getPlanFromProductId } from "../utils/creem";` aggiungere:

```ts
import { findMembers } from "../repositories/memberRepository";
import { findPendingInvitations } from "../repositories/invitationRepository";
```

- [ ] Sostituire l'intero blocco `canAddTeamMember` esistente (le righe della funzione `export async function canAddTeamMember(...)`, attualmente stub) con la versione org-aware + i due nuovi contatori. Rimpiazzare:

```ts
/**
 * Check if a team member can be added to an event based on plan limits
 */
export async function canAddTeamMember(
    eventOwnerId: string,
    eventId: string
): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(eventOwnerId);
    const limit = effectiveInfo.limits.team_members;

    return {
        allowed: true, // STUB phase 1a — sempre permesso; 1c verifica contro org member count
        current: 0,    // STUB phase 1a — 0 fino a countReservedSlots org-aware in 1c
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}
```

con:

```ts
/**
 * Count current members of an organization (phase 1b — org-aware).
 */
export async function countOrgMembers(organizationId: string): Promise<number> {
    const members = await findMembers(organizationId);
    return members.length;
}

/**
 * Count pending (status='pending') invitations of an organization (phase 1b — org-aware).
 */
export async function countPendingOrgInvitations(organizationId: string): Promise<number> {
    const pending = await findPendingInvitations(organizationId);
    return pending.length;
}

/**
 * Check if a team member can be added to an organization based on plan limits.
 * Org-aware (phase 1b): conta membri + inviti pending sull'org.
 * Il limite è quello dell'OWNER del piano (ownerId), non dell'invitante.
 *
 * NOTE: la firma resta (ownerId, organizationId) per compatibilità con il
 * re-export in server/utils/userPlan.ts. Il 2° param è ora un organizationId.
 */
export async function canAddTeamMember(
    ownerId: string,
    organizationId: string
): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    plan: PlanName;
}> {
    const effectiveInfo = await getEffectiveLimits(ownerId);
    const limit = effectiveInfo.limits.team_members;

    const [members, pending] = await Promise.all([
        countOrgMembers(organizationId),
        countPendingOrgInvitations(organizationId),
    ]);
    const current = members + pending;

    return {
        allowed: !exceedsLimit(current, limit),
        current,
        limit: isUnlimited(limit) ? -1 : limit,
        plan: effectiveInfo.plan,
    };
}
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. `exceedsLimit` è già importato in testa al file (riga 8); `findMembers`/`findPendingInvitations` ora importati.
- [ ] Verifica grep che `getTeamLimit` (riga ~249) chiami ancora `canAddTeamMember(userId, '')` senza errore di tipo (la firma è invariata: 2 stringhe). Comando:
  `grep -n "canAddTeamMember" server/services/planLimit.service.ts`
  - Output atteso: la definizione + la chiamata in `getTeamLimit` (passa `''` come orgId, ritornerà `current:0` perché org `''` non ha membri — accettabile, `getTeamLimit` è esso stesso stub event-flavored fino a 1c).
- [ ] Commit: `feat: org-aware canAddTeamMember (count members + pending invites) (phase 1b)`

---

## Task 3 — Verifica assertiva: canAddTeamMember sul seed (gate runtime, no sessione)

**Files:**
- Create: `server/database/seed/verify-team-limit.ts`
- Verify: `pnpm db:reset && pnpm db:seed && npx tsx server/database/seed/verify-team-limit.ts`

> **Nota di onestà:** richiede un Postgres vivo + seed eseguito. È un gate runtime puro-DB (nessuna sessione richiesta), quindi eseguibile in CI/locale senza `pnpm dev`. Il seed B2B ha 3 membri + 1 invito pending = 4 slot; l'owner B2B (`owner@example.com`) non ha subscription → piano `starter` → `team_members: 1`. Atteso: `allowed:false, current:4, limit:1`.

- [ ] Creare `server/database/seed/verify-team-limit.ts` con il codice completo:

```ts
import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { canAddTeamMember, countOrgMembers, countPendingOrgInvitations } from "../../services/planLimit.service";

/**
 * Gate FASE 1b: il limite team è org-aware e blocca quando superato.
 * INVARIANTE: per l'org B2B del seed (3 membri + 1 invito pending), piano starter
 * (team_members:1), canAddTeamMember deve ritornare allowed:false, current:4, limit:1.
 * Esegui dopo `pnpm db:seed`. Richiede un Postgres vivo.
 */
async function main() {
    const db = getDB();

    const orgs = await db
        .select({ id: schema.organization.id, slug: schema.organization.slug })
        .from(schema.organization);
    const b2b = orgs.find((o) => o.slug === "team-org");
    if (!b2b) {
        throw new Error("seed mancante: esegui `pnpm db:seed` prima");
    }

    // owner del seed B2B (role=owner) → senza subscription → starter → team_members:1
    const ownerMember = await db
        .select({ userId: schema.member.userId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.organizationId, b2b.id));
    const owner = ownerMember.find((m) => m.role === "owner");
    if (!owner) {
        throw new Error("seed incoerente: org B2B senza owner");
    }

    let failed = false;

    const members = await countOrgMembers(b2b.id);
    const pending = await countPendingOrgInvitations(b2b.id);
    if (members !== 3) {
        console.error(`[FAIL] attesi 3 membri B2B, trovati ${members}`);
        failed = true;
    }
    if (pending !== 1) {
        console.error(`[FAIL] atteso 1 invito pending B2B, trovati ${pending}`);
        failed = true;
    }

    const check = await canAddTeamMember(owner.userId, b2b.id);
    if (check.allowed !== false) {
        console.error(`[FAIL] canAddTeamMember dovrebbe essere allowed:false, è ${check.allowed}`);
        failed = true;
    }
    if (check.current !== 4) {
        console.error(`[FAIL] canAddTeamMember.current atteso 4, è ${check.current}`);
        failed = true;
    }
    if (check.limit !== 1) {
        console.error(`[FAIL] canAddTeamMember.limit atteso 1 (starter), è ${check.limit}`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-team-limit] LIMITE TEAM NON ENFORCED");
        process.exit(1);
    }
    console.log(
        `[verify-team-limit] OK — B2B members=${members} pending=${pending} → allowed=${check.allowed} current=${check.current} limit=${check.limit}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-team-limit] errore", e);
    process.exit(1);
});
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore (nessuna variabile inutilizzata).
- [ ] Verifica runtime (richiede Postgres vivo):
  `pnpm db:reset && pnpm db:seed && npx tsx server/database/seed/verify-team-limit.ts`
  - Output atteso: `[verify-team-limit] OK — B2B members=3 pending=1 → allowed=false current=4 limit=1` ed exit code 0.
- [ ] Commit: `test: org-aware team limit verification script (phase 1b)`

---

## Task 4 — Email invito genericizzata (template org-neutro)

**Files:**
- Create: `server/emailTemplates/OrgInviteEmail.ts`
- Verify: `pnpm typecheck`

> **Nota di onestà:** mantengo le stringhe brand "Ceremly" e i link `example.com` invariati — il rebranding completo è FASE 5; toccarlo qui sarebbe incoerente con gli altri template ancora brandizzati. Genericizzo SOLO il dominio: "evento" → "organization", param `eventName` → `orgName`.

- [ ] Creare `server/emailTemplates/OrgInviteEmail.ts` copiando la struttura di `EventInviteEmail.ts` con wording org-neutro. Codice completo:

```ts
// React Email template for organization invitation (phase 1b)
// Genericizzato da EventInviteEmail: "evento" → "organization".
// Supports Italian and English. Uses React.createElement to avoid JSX/Vue conflicts.

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
}

const translations = {
    it: {
        preview: (org: string) => `Sei stato invitato a unirti a ${org} su Ceremly`,
        title: 'Sei stato invitato!',
        greeting: 'Ciao,',
        intro: (invitedBy: string, org: string) =>
            `${invitedBy} ti ha invitato a unirti all'organizzazione "${org}" su Ceremly.`,
        joinTitle: 'Unisciti al team',
        joinText: 'Clicca il pulsante qui sotto per accettare l\'invito e unirti all\'organizzazione.',
        ctaButton: 'Accetta Invito',
        expiryNote: (days: number) => `Questo invito scadrà tra ${days} giorni.`,
        alternativeText: 'Se il pulsante non funziona, copia e incolla questo link nel tuo browser:',
        accountNote: 'Se non hai ancora un account su Ceremly, potrai crearne uno gratuitamente.',
        ignoreText: 'Se non ti aspettavi questo invito o non vuoi unirti, puoi semplicemente ignorare questa email.',
        signature: 'Cordiali saluti,',
        team: 'Il Team di Ceremly',
        copyright: '© 2026 Ceremly. Tutti i diritti riservati.',
        privacy: 'Privacy Policy',
        terms: 'Termini di Servizio',
        dpa: 'Data Processing Agreement',
        footer: 'Hai ricevuto questa email perché qualcuno ti ha invitato su Ceremly.',
        address: 'Ceremly - Via Example 123, 00100 Roma, Italia',
    },
    en: {
        preview: (org: string) => `You've been invited to join ${org} on Ceremly`,
        title: "You've been invited!",
        greeting: 'Hi,',
        intro: (invitedBy: string, org: string) =>
            `${invitedBy} has invited you to join the "${org}" organization on Ceremly.`,
        joinTitle: 'Join the team',
        joinText: 'Click the button below to accept the invitation and join the organization.',
        ctaButton: 'Accept Invitation',
        expiryNote: (days: number) => `This invitation will expire in ${days} days.`,
        alternativeText: "If the button doesn't work, copy and paste this link into your browser:",
        accountNote: "If you don't have a Ceremly account yet, you can create one for free.",
        ignoreText: "If you weren't expecting this invitation or don't want to join, you can simply ignore this email.",
        signature: 'Best regards,',
        team: 'The Ceremly Team',
        copyright: '© 2026 Ceremly. All rights reserved.',
        privacy: 'Privacy Policy',
        terms: 'Terms of Service',
        dpa: 'Data Processing Agreement',
        footer: 'You received this email because someone invited you to Ceremly.',
        address: 'Ceremly - Via Example 123, 00100 Rome, Italy',
    },
};

const colors = {
    primary: '#19baf0',
    primaryDark: '#0ea5d6',
    background: '#f8fbfc',
    white: '#ffffff',
    text: '#0d181c',
    textLight: '#4b879b',
    textMuted: '#7ca8b8',
    highlight: '#e0f3fe',
    info: '#e0f3fe',
    infoBorder: '#19baf0',
};

const styles = {
    body: {
        margin: 0,
        padding: 0,
        fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        backgroundColor: colors.background,
    },
    container: { maxWidth: '600px', margin: '0 auto', backgroundColor: colors.white },
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
    content: { padding: '40px 30px', color: colors.text, lineHeight: '1.6' },
    title: { color: colors.primary, fontSize: '24px', marginBottom: '20px', fontWeight: 'normal' },
    paragraph: { fontSize: '16px', marginBottom: '15px', lineHeight: '1.6' },
    highlightBox: {
        backgroundColor: colors.highlight,
        borderLeft: `4px solid ${colors.primary}`,
        padding: '15px',
        margin: '20px 0',
    },
    highlightTitle: { fontWeight: 'bold', margin: '0 0 10px 0' },
    highlightText: { margin: 0 },
    buttonContainer: { textAlign: 'center' as const, margin: '25px 0' },
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
    alternativeText: { fontSize: '14px', color: colors.textLight, marginTop: '20px' },
    linkText: { fontSize: '12px', wordBreak: 'break-all' as const, marginBottom: '20px' },
    link: { color: colors.primary, textDecoration: 'underline' },
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
    copyright: { margin: '0 0 15px 0' },
    footerLinks: { marginTop: '15px' },
    footerLink: { color: colors.primary, textDecoration: 'none', margin: '0 10px' },
    footerSeparator: { display: 'inline', margin: '0 5px', color: colors.textLight },
    divider: { borderColor: '#e7f0f3', margin: '20px 0' },
    footerNote: { marginTop: '20px', fontSize: '12px', color: colors.textMuted },
};

const h = React.createElement;

export function OrgInviteEmail({
    language = 'it',
    inviteUrl,
    orgName,
    invitedByName,
    expiresInDays = 7,
}: OrgInviteEmailProps): React.ReactElement {
    const t = translations[language];

    return h(Html, { lang: language },
        h(Head),
        h(Preview, null, t.preview(orgName)),
        h(Body, { style: styles.body },
            h(Container, { style: styles.container },
                h(Section, { style: styles.header },
                    h(Text, { style: styles.headerBrand }, 'Ceremly')
                ),
                h(Section, { style: styles.content },
                    h(Text, { style: styles.title }, t.title),
                    h(Text, { style: styles.paragraph }, t.greeting),
                    h(Text, { style: styles.paragraph }, t.intro(invitedByName, orgName)),
                    h(Section, { style: styles.highlightBox },
                        h(Text, { style: styles.highlightTitle }, t.joinTitle),
                        h(Text, { style: styles.highlightText }, t.joinText)
                    ),
                    h(Section, { style: styles.buttonContainer },
                        h(Button, { href: inviteUrl, style: styles.button }, t.ctaButton)
                    ),
                    h(Text, { style: styles.expiryNote }, t.expiryNote(expiresInDays)),
                    h(Text, { style: styles.alternativeText }, t.alternativeText),
                    h(Text, { style: styles.linkText },
                        h(Link, { href: inviteUrl, style: styles.link }, inviteUrl)
                    ),
                    h(Text, { style: styles.paragraph }, t.accountNote),
                    h(Text, { style: styles.ignoreText }, t.ignoreText),
                    h(Text, { style: styles.paragraph },
                        t.signature,
                        h('br'),
                        h('strong', null, t.team)
                    )
                ),
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
                    h(Text, { style: styles.footerNote },
                        t.footer,
                        h('br'),
                        t.address
                    )
                )
            )
        )
    );
}

export default OrgInviteEmail;
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore relativo a `OrgInviteEmail.ts`.
- [ ] Commit: `feat: org-neutral invite email template (phase 1b)`

---

## Task 5 — Render helper + subject per OrgInviteEmail

**Files:**
- Modify: `server/emailTemplates/index.ts`
- Verify: `pnpm typecheck`

- [ ] In `server/emailTemplates/index.ts`, aggiungere l'import del nuovo componente subito dopo l'import esistente di `EventInviteEmail`. Cambiare:

```ts
import { EventInviteEmail } from './EventInviteEmail';
```

in:

```ts
import { EventInviteEmail } from './EventInviteEmail';
import { OrgInviteEmail } from './OrgInviteEmail';
```

- [ ] Aggiungere il re-export. Cambiare:

```ts
export { EventInviteEmail } from './EventInviteEmail';
```

in:

```ts
export { EventInviteEmail } from './EventInviteEmail';
export { OrgInviteEmail } from './OrgInviteEmail';
```

- [ ] Aggiungere il render helper subito dopo la funzione `renderEventInviteEmail` (prima di `export const emailSubjects`). Inserire:

```ts
/**
 * Render organization invite email to HTML (phase 1b)
 */
export async function renderOrgInviteEmail(options: {
    language?: SupportedLanguage;
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
}): Promise<string> {
    const element = React.createElement(OrgInviteEmail, {
        language: options.language || 'it',
        inviteUrl: options.inviteUrl,
        orgName: options.orgName,
        invitedByName: options.invitedByName,
        expiresInDays: options.expiresInDays || 7,
    });
    return await render(element);
}
```

- [ ] Aggiungere il subject org. Nell'oggetto `emailSubjects`, dopo la riga `eventInvite: (eventName: string) => ({ ... }),` aggiungere:

```ts
    orgInvite: (orgName: string) => ({
        it: `Sei stato invitato a unirti a ${orgName} - Ceremly`,
        en: `You've been invited to join ${orgName} - Ceremly`,
    }),
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. `renderOrgInviteEmail` e `emailSubjects.orgInvite` esportati.
- [ ] Commit: `feat: renderOrgInviteEmail helper + subject (phase 1b)`

---

## Task 6 — sendEmail: case "invitation"

**Files:**
- Modify: `server/utils/email.ts`
- Verify: `pnpm typecheck`

- [ ] In `server/utils/email.ts`, importare il render helper + subject. Cambiare il blocco import da `../emailTemplates`:

```ts
import {
    renderVerificationEmail,
    renderResetPasswordEmail,
    renderWaitingListEmail,
    emailSubjects,
    type SupportedLanguage,
} from "../emailTemplates";
```

in:

```ts
import {
    renderVerificationEmail,
    renderResetPasswordEmail,
    renderWaitingListEmail,
    renderOrgInviteEmail,
    emailSubjects,
    type SupportedLanguage,
} from "../emailTemplates";
```

- [ ] Estendere il tipo `EmailType`. Cambiare:

```ts
export type EmailType =
    | "verification"
    | "reset_password"
    | "waiting_list"
    | "custom";
```

in:

```ts
export type EmailType =
    | "verification"
    | "reset_password"
    | "waiting_list"
    | "invitation"
    | "custom";
```

- [ ] Aggiungere l'interfaccia options. Dopo `export interface WaitingListEmailOptions extends BaseEmailOptions { ... }` inserire:

```ts
export interface InvitationEmailOptions extends BaseEmailOptions {
    type: "invitation";
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
}
```

- [ ] Aggiungere alla union `EmailOptions`. Cambiare:

```ts
export type EmailOptions =
    | VerificationEmailOptions
    | ResetPasswordEmailOptions
    | WaitingListEmailOptions
    | CustomEmailOptions;
```

in:

```ts
export type EmailOptions =
    | VerificationEmailOptions
    | ResetPasswordEmailOptions
    | WaitingListEmailOptions
    | InvitationEmailOptions
    | CustomEmailOptions;
```

- [ ] Aggiungere il case nello switch di `buildEmailContent`. Dopo il `case "waiting_list":` (prima di `case "custom":`) inserire:

```ts
        case "invitation":
            return {
                subject: emailSubjects.orgInvite(options.orgName)[language],
                html: await renderOrgInviteEmail({
                    language,
                    inviteUrl: options.inviteUrl,
                    orgName: options.orgName,
                    invitedByName: options.invitedByName,
                    expiresInDays: options.expiresInDays,
                }),
            };
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. Lo switch in `buildEmailContent` è esaustivo sulla union aggiornata.
- [ ] Commit: `feat: sendEmail "invitation" case wired to org invite template (phase 1b)`

---

## Task 7 — Plugin organization: sendInvitationEmail callback

**Files:**
- Modify: `server/utils/auth.ts`
- Verify: `pnpm typecheck`

> **Fatti pinnati (verificati nel source):** `sendInvitationEmail(data, request?)` con `data = { id, role, email, organization: Organization, invitation: Invitation, inviter: Member & { user: User } }` (`index-F8qM450o.d.mts:5218-5249`). Better Auth NON genera l'URL: si costruisce con `data.id`. La pagina di accept (`invite/[id]`) è 1d; qui basta puntare l'URL al path che 1d implementerà.

- [ ] In `server/utils/auth.ts`, cambiare la registrazione del plugin. Sostituire la riga:

```ts
            organization(),
```

con:

```ts
            organization({
                sendInvitationEmail: async (data) => {
                    const inviterUser = data.inviter.user as { locale?: string; name?: string };
                    const language = (inviterUser.locale as SupportedLanguage) || "it";
                    const inviteUrl = `${runtimeConfig.public.baseURL}/invite/${data.id}`;
                    const result = await sendEmail({
                        type: "invitation",
                        to: data.email,
                        inviteUrl,
                        orgName: data.organization.name,
                        invitedByName: inviterUser.name || data.organization.name,
                        language,
                    });
                    if (!result.success) {
                        console.error(
                            `[org.sendInvitationEmail] invio fallito a ${data.email}: ${result.error}`,
                        );
                    }
                },
            }),
```

> **Nota:** NON faccio throw su fallimento email d'invito (a differenza di verification/reset): un invito creato con email non recapitata non deve abortire la transazione plugin; l'audit dell'evento email è già loggato dentro `sendEmail`. L'invito resta `pending` e ri-inviabile (`resend:true`).

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. `sendEmail`, `SupportedLanguage`, `runtimeConfig` sono già importati in testa al file (righe 9, 14, 16).
- [ ] Commit: `feat: org plugin sendInvitationEmail wired to sendEmail (phase 1b)`

---

## Task 8 — Plugin organization: organizationHooks (audit + enforce limite)

**Files:**
- Modify: `server/utils/auth.ts`
- Verify: `pnpm typecheck`

> **Fatti pinnati (signature verificate):**
> - `beforeCreateInvitation(data: { invitation: { email, role, organizationId, inviterId, ... }, inviter, organization })` → `Promise<void | { data }>` (`d.mts:5567-5580`). Throw di `APIError` propaga e aborta l'endpoint.
> - `afterCreateInvitation(data: { invitation, inviter, organization })` (`d.mts:5584`).
> - `afterAcceptInvitation(data: { invitation, member, user, organization })` (`d.mts:5600`).
> - `afterRemoveMember(data: { member, user, organization })` (`d.mts:5517`).
> - `afterUpdateMemberRole(data: { member, previousRole, user, organization })` (`d.mts:5541`).
> - **Enforcement:** `canAddTeamMember(ownerId, orgId)`. L'owner del piano è il membro `role=owner` dell'org → lo risolvo con `findMemberRole`/`findMembers`. Per semplicità uso l'inviter come riferimento di piano SE è owner, altrimenti cerco l'owner dell'org. Risoluzione deterministica: l'owner dell'org (primo `member.role==='owner'`).

> **Nota di onestà (runtime-contingente):** che il throw di `APIError` dentro `beforeCreateInvitation` produca un 4xx pulito sull'endpoint `/organization/invite-member` è atteso dal type (`Promise<void|...>` + propagazione errori dei hook) ma **da confermare a runtime** col smoke di Task 11. Se il throw non abortisse, fallback: spostare il check in un wrapper route custom (1c). Per 1b il path nativo è la scelta.

- [ ] Aggiungere in testa a `server/utils/auth.ts` gli import necessari ai hook (dopo `import { sendEmail } from "./email";`):

```ts
import { canAddTeamMember } from "../services/planLimit.service";
import { findMembers } from "../repositories/memberRepository";
```

- [ ] Aggiungere una helper module-level subito sotto la riga `console.log(...)` (riga 18), prima di `export const createBetterAuth`:

```ts
/**
 * Risolve l'userId dell'owner di un'org (per usarne i plan-limit).
 * Deterministico: primo membro con role 'owner'. Fallback: primo membro.
 */
async function resolveOrgOwnerId(organizationId: string): Promise<string | null> {
    const members = await findMembers(organizationId);
    if (members.length === 0) return null;
    const owner = members.find((m) => m.role === "owner");
    return (owner ?? members[0]!).userId;
}
```

- [ ] Estendere la config del plugin `organization({ ... })` aggiungendo `organizationHooks` accanto a `sendInvitationEmail` (dentro lo stesso oggetto opzioni del Task 7). Inserire dopo la proprietà `sendInvitationEmail: async (data) => { ... },`:

```ts
                organizationHooks: {
                    beforeCreateInvitation: async (data) => {
                        const ownerId = await resolveOrgOwnerId(data.invitation.organizationId);
                        if (ownerId) {
                            const check = await canAddTeamMember(ownerId, data.invitation.organizationId);
                            if (!check.allowed) {
                                throw new APIError("FORBIDDEN", {
                                    message: `Team member limit reached (${check.current}/${check.limit})`,
                                });
                            }
                        }
                    },
                    afterCreateInvitation: async (data) => {
                        await logAudit(null, "team.member_invited", {
                            userId: data.inviter.id,
                            organizationId: data.organization.id,
                            targetType: "email",
                            targetId: data.invitation.email,
                            status: "success",
                            details: { role: data.invitation.role, invitationId: data.invitation.id },
                        });
                    },
                    afterAcceptInvitation: async (data) => {
                        await logAudit(null, "team.invite_accepted", {
                            userId: data.user.id,
                            organizationId: data.organization.id,
                            targetType: "user",
                            targetId: data.user.id,
                            status: "success",
                            details: { role: data.member.role, invitationId: data.invitation.id },
                        });
                    },
                    afterRemoveMember: async (data) => {
                        await logAudit(null, "team.member_removed", {
                            organizationId: data.organization.id,
                            targetType: "user",
                            targetId: data.member.userId,
                            status: "success",
                        });
                    },
                    afterUpdateMemberRole: async (data) => {
                        await logAudit(null, "team.permissions_updated", {
                            organizationId: data.organization.id,
                            targetType: "user",
                            targetId: data.member.userId,
                            status: "success",
                            details: { previousRole: data.previousRole, newRole: data.member.role },
                        });
                    },
                },
```

> **Nota:** `data.inviter.id` in `afterCreateInvitation` è l'id del **member** invitante per il type `Member`; per l'audit `userId` voglio l'id utente. Il tipo `inviter` qui è `User$1 & Record<string,any>` (vedi `d.mts:5586` — in `afterCreateInvitation` `inviter` è uno `User$1`), quindi `data.inviter.id` è l'userId. Coerente.

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. `APIError` è già importato in testa (`server/utils/auth.ts:5`); `logAudit` importato (riga 10); `canAddTeamMember`/`findMembers` aggiunti in questo task.
- [ ] Commit: `feat: org plugin hooks — audit team ops + enforce member limit (phase 1b)`

---

## Task 9 — Hook signup→org (databaseHooks.user.create.after)

**Files:**
- Modify: `server/utils/auth.ts`
- Verify: `pnpm typecheck`

> **Fatti pinnati (verificati nel source):**
> - `auth.api.createOrganization({ body: { name, slug, userId } })` SENZA `headers`/`request` funziona: il branch `if (!session && (ctx.request || ctx.headers)) throw UNAUTHORIZED` NON scatta (`organization-BdJSRNgM.mjs:2351`), e con `!session` prende lo user da `ctx.body.userId` via `findUserById` (`mjs:2353-2356`).
> - Crea org + riga `member` con `creatorRole || "owner"` (`mjs:2399-2416`).
> - `setActiveOrganization` scatta SOLO se `ctx.context.session` esiste (`mjs:2463`) → in un create-hook senza sessione NON setta l'attiva (motivo per cui Task 10 usa `session.create.before`).
> - Slug collisione → `BAD_REQUEST` ORGANIZATION_ALREADY_EXISTS (`mjs:2365`) → mitigato da `generateUniqueOrgSlug` (suffisso uuid).
> - `user.create.after(user, context)` — firma confermata (`d.mts:2861-2873` per il plugin; il key `user.create.after` è accettato dal core `databaseHooks`).

> **CRITICO #1 (failure mode):** se `createOrganization` lancia e l'errore viene ingoiato, l'utente nasce SENZA tenant. Mitigazioni: (a) slug univoco-per-costruzione → niente `ALREADY_EXISTS`; (b) in caso di errore reale **rilancio** (no swallow) → il signup fallisce in modo VISIBILE invece di creare un utente orfano. Il gate di Task 12 verifica esplicitamente la riga `member owner`.

- [ ] In `server/utils/auth.ts`, importare `useServerAuth` non serve (l'hook gira dentro l'istanza). Importare il service org in testa (dopo gli import dei repository del Task 8):

```ts
import { deriveOrgNameFromUser, generateUniqueOrgSlug } from "../services/org.service";
```

- [ ] Estendere `databaseHooks.user.create` aggiungendo `after` accanto al `before` esistente. Cambiare:

```ts
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        return {
                            data: {
                                ...user,
                                tosAcceptedAt: new Date(),
                            },
                        };
                    },
                },
            },
        },
```

in:

```ts
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        return {
                            data: {
                                ...user,
                                tosAcceptedAt: new Date(),
                            },
                        };
                    },
                    after: async (user) => {
                        // signup→org: crea l'organization personale (owner) per il nuovo utente.
                        // Senza headers/request: createOrganization usa body.userId (no sessione).
                        const name = deriveOrgNameFromUser({ name: user.name, email: user.email });
                        const slug = generateUniqueOrgSlug(name);
                        try {
                            const serverAuth = useServerAuth();
                            await serverAuth.api.createOrganization({
                                body: { name, slug, userId: user.id },
                            });
                        } catch (err) {
                            // NON ingoiare: un utente senza tenant è uno stato rotto.
                            console.error(`[signup→org] createOrganization fallita per user ${user.id}:`, err);
                            throw err;
                        }
                    },
                },
            },
        },
```

> **Nota di onestà sull'audit:** NON aggiungo un audit log dedicato per la creazione org al signup. Il signup è già tracciato dall'`hooks.after` esistente (`auth.signed_up` + `auth.tos_accepted`, `server/utils/auth.ts:191-210`). Loggare `team.member_invited` sarebbe falso (nessuno ha invitato nessuno) e non esiste un'action `organization.created` in `AUDIT_ACTIONS` (l'union `AuditAction` la rifiuterebbe a typecheck). 1c, che introduce le route org CRUD, aggiungerà l'action `organization.created` + categoria `organization` (la colonna `auditLog.category`/`action` è `text` libero — verificato: `server/database/schema/auditLog.ts:8-9`) e loggerà la creazione org lì. **Per 1b: nessun log extra.**

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. `useServerAuth` è una `const` arrow function definita più sotto nel file ma referenziata dentro una closure async che gira a runtime (non a load-time): nessun TDZ, nessun "used before declaration". `createOrganization` non rilancia gli app-hook su `user`/`member`, quindi nessuna re-entrancy del signup hook.
- [ ] Commit: `feat: signup→org hook (personal org + owner member) (phase 1b)`

---

## Task 10 — Org attiva di sessione (databaseHooks.session.create.before)

**Files:**
- Modify: `server/utils/auth.ts`
- Verify: `pnpm typecheck` + smoke (Task 11/12)

> **Fatti pinnati (return type VERIFICATO):** il pattern ufficiale per l'org attiva iniziale con `secondaryStorage` è `databaseHooks.session.create.before` che ritorna `{ data: { ...session, activeOrganizationId } }`. Il return type delle OPZIONI core è `Promise<boolean | void | { data: Optional<Session> & Record<string, any> }>` — verificato in `node_modules/@better-auth/core/dist/index-D_XSRX55.d.mts:6948-6950` (`BetterAuthOptions["databaseHooks"].session.create.before`). Quindi ritornare `{ data: {...} }` è type-valid → **questo codice è il PRIMARIO, nessuno swap**. (La firma `Promise<void>` vista in `index-F8qM450o.d.mts:159-168` è la shape risolta lato plugin, NON il tipo delle opzioni.) `activeOrganizationId` È dichiarato nello schema-session del plugin (`org.mjs:3838`) quindi non viene strippato dal blob.

> **CRITICO #1 (runtime-contingente — da confermare a runtime):** con `secondaryStorage` la sessione vive come blob JSON in Redis. Il trace prova che `setActiveOrganization` scrive in Redis, ma il path *create* è codice diverso. **Verificare a runtime (Task 11/12)** che il valore ritornato da `session.create.before` sopravviva nel blob e sia leggibile via `getSession` come `session.session.activeOrganizationId`. **Fallback documentato:** se non sopravvive, rimuovere questo hook e usare `databaseHooks.session.create.after` + `internalAdapter.setActiveOrganization(session.token, orgId, ctx)`.

> **Determinismo multi-org (B2B):** per utenti con più org, scelgo deterministicamente l'org con `member.createdAt` più antico (prima membership). Implementato ordinando per `createdAt` ascendente.

- [ ] Aggiungere `session` dentro `databaseHooks` (accanto a `user`). Cambiare la chiusura del blocco `databaseHooks` da:

```ts
            user: {
                create: {
                    before: async (user) => {
                        return {
                            data: {
                                ...user,
                                tosAcceptedAt: new Date(),
                            },
                        };
                    },
                    after: async (user) => {
                        // ... (codice Task 9) ...
                    },
                },
            },
        },
```

in (aggiungendo il blocco `session` dopo la chiusura del blocco `user`):

```ts
            user: {
                create: {
                    before: async (user) => {
                        return {
                            data: {
                                ...user,
                                tosAcceptedAt: new Date(),
                            },
                        };
                    },
                    after: async (user) => {
                        // ... (codice Task 9 invariato) ...
                    },
                },
            },
            session: {
                create: {
                    before: async (session) => {
                        // Org attiva iniziale: prima membership (createdAt asc) dell'utente.
                        const db = getDB();
                        const rows = await db
                            .select({ organizationId: schema.member.organizationId })
                            .from(schema.member)
                            .where(eq(schema.member.userId, session.userId))
                            .orderBy(asc(schema.member.createdAt))
                            .limit(1);
                        const activeOrganizationId = rows[0]?.organizationId;
                        if (!activeOrganizationId) {
                            return; // nessuna org (stato anomalo) → nessun override
                        }
                        return {
                            data: {
                                ...session,
                                activeOrganizationId,
                            },
                        };
                    },
                },
            },
        },
```

- [ ] Aggiungere gli import drizzle necessari in testa a `server/utils/auth.ts`. Verificare se `eq`/`asc` sono già importati; se non lo sono, aggiungere dopo l'import di `schema`:

```ts
import { asc, eq } from "drizzle-orm";
```

> **Step di verifica preliminare:** `grep -n "from \"drizzle-orm\"" server/utils/auth.ts` — se l'import esiste già, integrarlo invece di duplicarlo. (Allo stato attuale `auth.ts` NON importa drizzle-orm → l'import sopra è nuovo.)

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore. `getDB`, `schema` già importati; `asc`/`eq` aggiunti.
- [ ] Commit: `feat: active organization in session via session.create.before (phase 1b)`

---

## Task 11 — Smoke: signup→org + login + org attiva (manuale, gate CRITICO)

**Files:**
- Verify: smoke manuale via `pnpm dev` + curl/browser, poi `npx tsx server/database/seed/verify-signup-org.ts` (Task 12)

> **Nota di onestà (runtime-contingente):** questo è uno smoke MANUALE — gli endpoint auth richiedono email/verifica reali e una sessione viva, non scriptabili in modo deterministico via tsx (il signup via `auth.api.signUpEmail` attiverebbe `sendVerificationEmail` che lancia su invio fallito). La conferma assertiva-DB è in Task 12.

- [ ] Avviare il dev server: `pnpm dev` (in background o secondo terminale).
- [ ] Eseguire un signup reale via browser su `http://localhost:3000` (pagina registrazione) con un'email a cui hai accesso (o, se Resend è in modalità test, leggi l'URL di verifica dai log del server).
  - Atteso nei log del server: nessun `[signup→org] createOrganization fallita`.
- [ ] Completare la verifica email (link dalla mail o dai log).
- [ ] Effettuare il login.
- [ ] Verificare l'org attiva in sessione. Eseguire (sostituendo `<COOKIE>` col cookie di sessione dal browser/devtools):

```bash
curl -s http://localhost:3000/api/auth/get-session \
  -H "cookie: <COOKIE>" | npx --yes json 2>/dev/null || \
curl -s http://localhost:3000/api/auth/get-session -H "cookie: <COOKIE>"
```

  - Output atteso: il JSON di sessione contiene `session.activeOrganizationId` valorizzato (NON null/undefined). **Questo è il gate CRITICO #1.**
- [ ] **Se `activeOrganizationId` è assente:** applicare il fallback documentato in Task 10 (rimuovere `session.create.before`, usare `session.create.after` + `setActiveOrganization`), poi rieseguire questo smoke.
- [ ] Verificare la creazione di una 2ª org (caso B2B) via il client plugin **NON è in 1b** (è 1d). Per 1b basta confermare via DB (Task 12) che la 1ª org+owner esistono.
- [ ] Nessun commit (step di sola verifica).

---

## Task 12 — Verifica assertiva: signup→org ha prodotto org + member owner

**Files:**
- Create: `server/database/seed/verify-signup-org.ts`
- Verify: `npx tsx server/database/seed/verify-signup-org.ts <email-del-signup>`

> **Nota di onestà:** questo script verifica lo STATO post-signup nel DB. Si esegue DOPO lo smoke di Task 11 passando l'email usata. È il gate richiesto esplicitamente dal task ("signup → riga member owner + org attiva"); la parte "org attiva" (Redis) è coperta dal curl di Task 11, qui copro la parte DB (org + member owner) in modo assertivo e ripetibile.

- [ ] Creare `server/database/seed/verify-signup-org.ts`:

```ts
import { config } from "dotenv";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

import { eq } from "drizzle-orm";
import { getDB } from "../../utils/db";
import * as schema from "../schema";
import { findOrganizationsForUser } from "../../repositories/organizationRepository";

/**
 * Gate FASE 1b (CRITICO): il signup ha prodotto org personale + member owner.
 * Uso: npx tsx server/database/seed/verify-signup-org.ts <email>
 * Esegui DOPO un signup reale (smoke Task 11). Richiede Postgres vivo.
 */
async function main() {
    const email = process.argv[2];
    if (!email) {
        console.error("Uso: npx tsx server/database/seed/verify-signup-org.ts <email>");
        process.exit(1);
    }

    const db = getDB();
    const users = await db
        .select({ id: schema.user.id, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.email, email))
        .limit(1);
    const user = users[0];
    if (!user) {
        console.error(`[FAIL] nessun utente con email ${email} — il signup non è andato a buon fine`);
        process.exit(1);
    }

    let failed = false;

    const orgs = await findOrganizationsForUser(user.id);
    if (orgs.length === 0) {
        console.error(`[FAIL] utente ${email} NON ha organizzazioni — signup→org NON ha funzionato (utente orfano!)`);
        failed = true;
    }

    const ownerMemberships = await db
        .select({ organizationId: schema.member.organizationId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.userId, user.id));
    const ownerRow = ownerMemberships.find((m) => m.role === "owner");
    if (!ownerRow) {
        console.error(`[FAIL] utente ${email} NON è owner di alcuna org — riga member owner mancante`);
        failed = true;
    }

    if (failed) {
        console.error("[verify-signup-org] SIGNUP→ORG VIOLATO");
        process.exit(1);
    }
    console.log(
        `[verify-signup-org] OK — ${email} ha ${orgs.length} org, owner di org=${ownerRow!.organizationId}`,
    );
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-signup-org] errore", e);
    process.exit(1);
});
```

- [ ] Verifica: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore.
- [ ] Verifica runtime (dopo smoke Task 11, con l'email usata):
  `npx tsx server/database/seed/verify-signup-org.ts <email-del-signup>`
  - Output atteso: `[verify-signup-org] OK — <email> ha 1 org, owner di org=<uuid>` ed exit 0.
- [ ] Commit: `test: signup→org verification script (member owner + org) (phase 1b)`

---

## Task 13 — Smoke: invito team via API plugin (manuale)

**Files:**
- Verify: smoke manuale (`pnpm dev` + sessione owner)

> **Nota di onestà (runtime-contingente):** gli endpoint team richiedono una sessione viva e l'org attiva risolta → smoke manuale, non scriptabile via tsx. Conferma i requisiti checkpoint: invio invito (email via hook), audit log, enforcement limite.

- [ ] Con `pnpm dev` attivo e loggato come owner di un'org (es. l'utente del Task 11), invitare un membro via l'endpoint plugin:

```bash
curl -s http://localhost:3000/api/auth/organization/invite-member \
  -H "content-type: application/json" \
  -H "cookie: <COOKIE_OWNER>" \
  -d '{"email":"nuovo-membro@example.com","role":"member"}'
```

  - Output atteso: JSON dell'invito creato (`{ id, organizationId, email, role, status:"pending", ... }`).
  - Atteso nei log del server: una riga email (`[Email] Successfully sent invitation email to ...`) oppure, se Resend è in test, un log di invio.
- [ ] Verificare l'audit log dell'invito:

```bash
npx tsx -e "import('./server/utils/db').then(async ({getDB})=>{const s=await import('./server/database/schema');const db=getDB();const rows=await db.select().from(s.auditLog).orderBy(s.auditLog.createdAt);console.log(rows.slice(-3));process.exit(0);})"
```

  - Output atteso: tra le ultime righe, un record `action:"team.member_invited"` con `targetId:"nuovo-membro@example.com"`.
- [ ] Verificare l'enforcement del limite: ripetere `invite-member` finché `members+pending >= team_members` del piano (starter=1). Quando superato:
  - Output atteso: HTTP 403 con `message` "Team member limit reached (...)". **Gate enforcement.**
- [ ] **Se il 403 non scatta** (il throw in `beforeCreateInvitation` non aborta): applicare il fallback di Task 8 (check in route wrapper custom, rimandato a 1c) e annotare il gap residuo.
- [ ] Nessun commit (step di sola verifica).

---

## Task 14 — Typecheck finale + checkpoint 1b

**Files:**
- Verify: `pnpm typecheck`

- [ ] Eseguire il gate di tipo completo: `pnpm typecheck`
  - Output atteso: nessun NUOVO errore rispetto alla baseline 1a (lo stato pre-1b). Eventuali errori preesistenti del repo sono tollerati ma vanno annotati se toccano i file modificati.
- [ ] Eseguire il gate DB puro: `pnpm db:reset && pnpm db:seed && npx tsx server/database/seed/verify-team-limit.ts`
  - Output atteso: `[verify-team-limit] OK — B2B members=3 pending=1 → allowed=false current=4 limit=1`.
- [ ] Spuntare i checkpoint dello spec (verifica manuale/smoke già coperta da Task 11-13):
  - [ ] Signup crea utente + org personale (owner) + org impostata come attiva (Task 11 + 12)
  - [ ] Login/logout funzionano; la sessione contiene l'org attiva (Task 11 curl `get-session`)
  - [ ] Owner/admin può invitare un membro; invito via email hook (Task 13)
  - [ ] Accept invito aggiunge la riga member col ruolo corretto + audit (smoke 1d userà il flusso pagina; per 1b l'endpoint `accept-invitation` è disponibile)
  - [ ] Limite team enforced (Task 13 403)
  - [ ] Nessuno stub 501 residuo sui flussi team (già rimossi in 1a — verificato: `ls server/api/team` → assente)
  - [ ] `pnpm typecheck` verde
- [ ] Commit finale (se non già fatto nei task precedenti): `feat: auth flows + auto org creation + team via plugin (phase 1b)`

---

## Gap residui noti (consegnati a 1c/1d)

- **Rename `max_events`→`max_organizations`** + colonna `userCustomLimits.maxEvents`, `countUserEvents`/`canCreateEvent` reali, `limits` route + admin stats org-aware → **1c** (baseline D4). Coesistenza stub event-named ↔ funzioni org-aware è attesa fino ad allora.
- **Action audit `organization.created`**: in 1b la creazione org personale è loggata riusando `team.member_invited` con `details.message`; 1c introduce l'action dedicata e ripunta il log.
- **Pagina accept invito** (`/invite/[id]`, auth-first, `authClient.organization.acceptInvitation`) + `organizationClient()` nel client + store/pagine → **1d**.
- **Rebranding** (stringhe "Ceremly", link `example.com` nei template email) → **FASE 5**.
- **`accept-invitation` smoke completo** (richiede pagina 1d + utente loggato con email==invito): l'endpoint è disponibile in 1b ma il flusso end-to-end si verifica con la UI di 1d.

---

## Riepilogo verifiche (cosa prova cosa)

| Invariante | Verifica | Tipo |
|---|---|---|
| `canAddTeamMember` org-aware blocca oltre limite | `verify-team-limit.ts` (B2B → allowed:false 4/1) | tsx assertivo (no sessione) |
| signup→org crea org + member owner | `verify-signup-org.ts <email>` + smoke Task 11 | tsx assertivo (post-smoke) |
| org attiva sopravvive in sessione (Redis) | curl `get-session` → `activeOrganizationId` | smoke manuale (CRITICO #1) |
| invito → email + audit | curl `invite-member` + query auditLog | smoke manuale |
| limite team enforced sul path nativo | curl `invite-member` ripetuto → 403 | smoke manuale (runtime-contingente) |
| tipi coerenti | `pnpm typecheck` | gate statico |
