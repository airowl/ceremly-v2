# Programmatic SEO "Frasi di invito" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 32 programmatic SEO pages ("frasi di invito per [occasione]" / "invitation wording for [occasion]"): 1 hub + 15 spokes per locale, content-driven, with copy-to-clipboard phrase cards and conversion CTAs.

**Architecture:** A static slug registry (`shared/constants/frasiSlugs.ts`) is the single source of truth for routing (IT/EN slug pairs, prerender route rules, sitemap URLs). Page copy lives in a new `@nuxt/content` data collection (`content/frasi/**/*.yml`) validated by a shared Zod schema, rendered by one dynamic page template. EN URLs are localized via i18n `customRoutes` (`/en/invitation-wording/...`).

**Tech Stack:** Nuxt 4, @nuxt/content v3 (data collection, YAML), @nuxtjs/i18n (customRoutes + `useSetI18nParams`), @nuxtjs/seo (`useSchemaOrg`, sitemap), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-pseo-frasi-invito-design.md`

## Global Constraints

- **Prerequisite:** the site-architecture plan (`docs/superpowers/plans/2026-07-11-site-architecture.md`) must be implemented first — this plan consumes `CerBreadcrumb` (prop `trail`), `CerRelatedLinks` (prop `links`), and `app/data/siteArchitecture.ts` (`RelatedLinkEntry`, `SITE_RELATED_LINKS`, `rel()`).
- Code comments, tests, and dev logs in **English**; product copy in **Italian** (locale `it`) and **English** (locale `en`) — repo convention.
- i18n gotcha: a literal `@` inside vue-i18n messages breaks the whole locale file — final verification MUST include `pnpm build`.
- No invented social proof anywhere in the copy (honesty rule).
- Content quality gates (enforced by tests): per page ≥30 phrases total, ≥3 tone sections, ≥3 FAQ, ≥4 tips, ≥600 words of body copy, no phrase duplicated across pages of the same locale.
- EN content is **rewritten for anglophone customs** (RSVP-by date, registry etiquette), never a literal translation of the IT file.
- Existing URLs never change; the i18n `pages` customRoutes config must cover ONLY the `frasi-invito` route family.

---

### Task 1: Slug registry, shared schema, content collection, content tests

**Files:**
- Create: `shared/constants/frasiSlugs.ts`
- Create: `shared/schemas/frasi.ts`
- Modify: `content.config.ts`
- Create: `test/content/frasi.test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: `FRASI_SLUGS: FrasiSlugEntry[]`, `FRASI_BASE: { it: '/frasi-invito', en: '/en/invitation-wording' }`, `frasiPath(key, locale): string`, `frasiPageSchema` (Zod) + type `FrasiPage`, content collection `frasi`.

- [ ] **Step 1: Create `shared/constants/frasiSlugs.ts`**

```ts
/**
 * Static registry of the programmatic-SEO "frasi di invito" pages.
 * Single source of truth for: route slugs per locale, prerender route
 * rules, sitemap URLs, content pairing (translationSlug) and tests.
 */
export interface FrasiSlugEntry {
    /** Locale-independent pairing key — equals `translationSlug` in content files. */
    key: string
    /** IT slug under /frasi-invito/ */
    it: string
    /** EN slug under /en/invitation-wording/ */
    en: string
    /** Existing event landing page this spoke cross-links to (locale-less), if any. */
    eventPage?: string
}

export const FRASI_BASE = {
    it: '/frasi-invito',
    en: '/en/invitation-wording',
} as const

export const FRASI_SLUGS: FrasiSlugEntry[] = [
    { key: 'wedding', it: 'matrimonio', en: 'wedding', eventPage: '/weddings' },
    { key: 'christening', it: 'battesimo', en: 'christening', eventPage: '/baptisms' },
    { key: 'first-communion', it: 'prima-comunione', en: 'first-communion' },
    { key: 'confirmation', it: 'cresima', en: 'confirmation' },
    { key: 'graduation', it: 'laurea', en: 'graduation', eventPage: '/graduations' },
    { key: 'birthday', it: 'compleanno', en: 'birthday', eventPage: '/birthdays' },
    { key: '18th-birthday', it: '18-anni', en: '18th-birthday', eventPage: '/birthdays' },
    { key: '40th-birthday', it: '40-anni', en: '40th-birthday', eventPage: '/birthdays' },
    { key: '50th-birthday', it: '50-anni', en: '50th-birthday', eventPage: '/birthdays' },
    { key: '60th-birthday', it: '60-anni', en: '60th-birthday', eventPage: '/birthdays' },
    { key: 'wedding-anniversary', it: 'anniversario-matrimonio', en: 'wedding-anniversary' },
    { key: 'baby-shower', it: 'baby-shower', en: 'baby-shower' },
    { key: 'retirement', it: 'pensionamento', en: 'retirement' },
    { key: 'housewarming', it: 'inaugurazione-casa', en: 'housewarming' },
    { key: 'engagement', it: 'fidanzamento', en: 'engagement' },
]

/** Full localized path for a frasi page (EN path includes the /en prefix). */
export function frasiPath(key: string, locale: 'it' | 'en'): string {
    const entry = FRASI_SLUGS.find(s => s.key === key)
    if (!entry) throw new Error(`Unknown frasi key: ${key}`)
    return `${FRASI_BASE[locale]}/${entry[locale]}`
}
```

- [ ] **Step 2: Create `shared/schemas/frasi.ts`**

```ts
import { z } from 'zod'

/** One tone section (formali, semplici, spiritose, religiose, whatsapp). */
export const frasiToneSchema = z.object({
    /** In-page anchor id, e.g. "formali" */
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(5),
    intro: z.string().min(40),
    frasi: z.array(z.string().min(20)).min(5),
})

export const frasiPageSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    locale: z.enum(['it', 'en']),
    /** Pairing key across locales — must equal a FrasiSlugEntry.key. */
    translationSlug: z.string(),
    /** SEO <title> — unique per page. */
    title: z.string().min(20).max(70),
    /** Meta description — unique per page. */
    description: z.string().min(80).max(170),
    h1: z.string().min(10),
    /** Answer block, 40-60 words (~250-450 chars). */
    answer: z.string().min(200),
    /** Short display name for cards/breadcrumb, e.g. "Matrimonio". */
    occasione: z.string().min(3),
    sezioni: z.array(frasiToneSchema).min(3),
    consigli: z.array(z.object({ title: z.string().min(5), text: z.string().min(60) })).min(4),
    faq: z.array(z.object({ q: z.string().min(10), a: z.string().min(60) })).min(3),
    /** translationSlug keys of 2 sibling frasi pages to cross-link. */
    related: z.array(z.string()).min(2).max(3),
    published: z.boolean().default(true),
})

export type FrasiPage = z.infer<typeof frasiPageSchema>
```

- [ ] **Step 3: Register the collection in `content.config.ts`**

Add the import and the collection alongside `blog`:

```ts
import { frasiPageSchema } from './shared/schemas/frasi'

// inside defineContentConfig({ collections: { ... } })
        frasi: defineCollection({
            type: 'data',
            source: 'frasi/**/*.yml',
            schema: frasiPageSchema,
        }),
```

- [ ] **Step 4: Add the `yaml` dev dependency (test-side parser)**

Run: `pnpm add -D yaml`
Expected: added to `devDependencies` in `package.json`.

- [ ] **Step 5: Write the content tests**

Create `test/content/frasi.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { FRASI_SLUGS } from '../../shared/constants/frasiSlugs'
import { frasiPageSchema, type FrasiPage } from '../../shared/schemas/frasi'

const CONTENT_DIR = join(__dirname, '../../content/frasi')

function loadLocale(locale: 'it' | 'en'): Map<string, FrasiPage> {
    const dir = join(CONTENT_DIR, locale)
    if (!existsSync(dir)) return new Map()
    const pages = new Map<string, FrasiPage>()
    for (const file of readdirSync(dir).filter(f => f.endsWith('.yml'))) {
        const raw = parse(readFileSync(join(dir, file), 'utf8'))
        pages.set(file.replace(/\.yml$/, ''), frasiPageSchema.parse(raw))
    }
    return pages
}

function wordCount(page: FrasiPage): number {
    const parts = [
        page.answer,
        ...page.sezioni.flatMap(s => [s.intro, ...s.frasi]),
        ...page.consigli.flatMap(c => [c.title, c.text]),
        ...page.faq.flatMap(f => [f.q, f.a]),
    ]
    return parts.join(' ').split(/\s+/).filter(Boolean).length
}

for (const locale of ['it', 'en'] as const) {
    describe(`frasi content (${locale})`, () => {
        const pages = loadLocale(locale)

        it('has one file per registry entry, named after the locale slug', () => {
            for (const entry of FRASI_SLUGS) {
                expect(pages.has(entry[locale]), `missing ${locale}/${entry[locale]}.yml`).toBe(true)
            }
            expect(pages.size).toBe(FRASI_SLUGS.length)
        })

        it('slug/locale/translationSlug fields are consistent with the registry', () => {
            for (const [fileSlug, page] of pages) {
                expect(page.slug).toBe(fileSlug)
                expect(page.locale).toBe(locale)
                const entry = FRASI_SLUGS.find(s => s.key === page.translationSlug)
                expect(entry, `unknown translationSlug ${page.translationSlug}`).toBeDefined()
                expect(entry![locale]).toBe(fileSlug)
            }
        })

        it('meets quality gates: ≥30 phrases, ≥600 words, unique title/description', () => {
            const titles = new Set<string>()
            const descriptions = new Set<string>()
            for (const [fileSlug, page] of pages) {
                const phraseCount = page.sezioni.reduce((n, s) => n + s.frasi.length, 0)
                expect(phraseCount, `${fileSlug}: phrases`).toBeGreaterThanOrEqual(30)
                expect(wordCount(page), `${fileSlug}: words`).toBeGreaterThanOrEqual(600)
                titles.add(page.title)
                descriptions.add(page.description)
            }
            expect(titles.size).toBe(pages.size)
            expect(descriptions.size).toBe(pages.size)
        })

        it('has no phrase duplicated across pages of the same locale', () => {
            const seen = new Map<string, string>()
            for (const [fileSlug, page] of pages) {
                for (const frase of page.sezioni.flatMap(s => s.frasi)) {
                    const key = frase.trim().toLowerCase()
                    expect(seen.has(key), `duplicate phrase in ${fileSlug} and ${seen.get(key)}: "${frase}"`).toBe(false)
                    seen.set(key, fileSlug)
                }
            }
        })

        it('related keys point to existing sibling pages (not itself)', () => {
            for (const [fileSlug, page] of pages) {
                for (const rel of page.related) {
                    expect(FRASI_SLUGS.some(s => s.key === rel), `${fileSlug}: unknown related ${rel}`).toBe(true)
                    expect(rel).not.toBe(page.translationSlug)
                }
            }
        })
    })
}
```

- [ ] **Step 6: Run tests to verify they fail on missing content**

Run: `pnpm vitest run test/content/frasi.test.ts`
Expected: FAIL — both locales fail `has one file per registry entry` (0 of 15 files exist). Schema/registry code compiles.

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm typecheck`
Expected: green.

```bash
git add shared/constants/frasiSlugs.ts shared/schemas/frasi.ts content.config.ts test/content/frasi.test.ts package.json pnpm-lock.yaml
git commit -m "feat(pseo): frasi slug registry, shared schema, content collection, content tests"
```

---

### Task 2: Italian content — 15 YAML files

**Files:**
- Create: `content/frasi/it/matrimonio.yml`, `battesimo.yml`, `prima-comunione.yml`, `cresima.yml`, `laurea.yml`, `compleanno.yml`, `18-anni.yml`, `40-anni.yml`, `50-anni.yml`, `60-anni.yml`, `anniversario-matrimonio.yml`, `baby-shower.yml`, `pensionamento.yml`, `inaugurazione-casa.yml`, `fidanzamento.yml`

**Interfaces:**
- Consumes: `frasiPageSchema` field names (Task 1) — files must parse against it.
- Produces: 15 IT content files that make the `frasi content (it)` test suite pass.

**Content quality rules (binding, checked by tests where quantifiable):**
- Phrases are ORIGINAL, written ad hoc, culturally Italian (galateo: chi firma l'invito, cerimonia vs rinfresco, bomboniere, dress code, tempistiche RSVP). Never scraped, never the same phrase with a swapped word across occasions.
- 30-50 phrases per page across 3-5 tone sections; every page gets `formali`, `semplici`, `whatsapp`; add `spiritose` everywhere except battesimo/prima-comunione/cresima; add `religiose` ONLY for matrimonio, battesimo, prima-comunione, cresima.
- Milestone birthdays (18/40/50/60) must anchor every section to the specific milestone (maggiore età, bilanci, traguardi) so pages do not cannibalize each other.
- `answer` is a 40-60 word direct answer to "cosa scrivere in un invito per [occasione]".
- `consigli`: 4-5 occasion-specific tips (who signs, plus-one handling, RSVP deadline, dress code, occasion-specific etiquette).
- `faq`: 3-4 real questions people ask (e.g. "Chi si nomina nell'invito di battesimo?", "Quanto tempo prima si mandano gli inviti di matrimonio?").
- `related`: 2-3 keys of adjacent occasions (e.g. matrimonio → fidanzamento, anniversario-matrimonio).
- No invented statistics or testimonials.

- [ ] **Step 1: Write `content/frasi/it/matrimonio.yml` (reference file — full structure)**

Structure below is normative; the two phrases shown per section are real examples of the expected register — write 8-12 per section following the same quality:

```yaml
slug: matrimonio
locale: it
translationSlug: wedding
title: "Frasi di invito per matrimonio: esempi pronti da copiare"
description: "Oltre 40 frasi di invito per matrimonio: formali, semplici, spiritose e per WhatsApp. Copia la frase, poi trasformala in un invito digitale con RSVP."
h1: "Frasi di invito per matrimonio"
answer: >-
  Un invito di matrimonio efficace dice chi si sposa, quando, dove e come
  confermare la presenza. Il tono dipende da voi: formale se invitano le
  famiglie, diretto se invitate voi. Qui trovi frasi pronte da copiare —
  formali, semplici, spiritose e pensate per WhatsApp — da adattare in un minuto.
occasione: "Matrimonio"
sezioni:
  - id: formali
    title: "Frasi formali"
    intro: >-
      Le frasi formali sono la scelta giusta quando l'invito parte dalle
      famiglie o quando la cerimonia richiede un registro classico.
      Tradizionalmente annunciano le nozze in terza persona.
    frasi:
      - "Le famiglie Rossi e Bianchi sono liete di annunciare il matrimonio di Elena e Marco e di invitarvi alla cerimonia che si celebrerà sabato 12 settembre alle ore 16:00 presso la Chiesa di San Lorenzo."
      - "Elena e Marco, insieme alle loro famiglie, hanno la gioia di invitarvi al loro matrimonio. Vi aspettiamo per condividere questo giorno e festeggiare insieme al ricevimento che seguirà."
      # ... 8-12 phrases total in this register
  - id: semplici
    title: "Frasi semplici e brevi"
    intro: >-
      Poche parole, tutte le informazioni essenziali: queste frasi funzionano
      quando l'invito viaggia insieme a un link con i dettagli completi.
    frasi:
      - "Ci sposiamo! Sabato 12 settembre, ore 16:00. Ci farebbe immensamente felici averti con noi: trovi tutti i dettagli e la conferma nel link."
      - "Elena & Marco — 12.09.2026. Una chiesa, una festa, le persone che amiamo. Confermaci entro il 31 luglio."
      # ... 8-12 phrases
  - id: spiritose
    title: "Frasi spiritose e originali"
    intro: >-
      Se il vostro matrimonio non si prende troppo sul serio, l'invito può
      dirlo subito. Attenzione solo a non sacrificare le informazioni pratiche.
    frasi:
      - "Dopo anni di 'quando vi sposate?', abbiamo finito le scuse: il 12 settembre diciamo sì. Vieni a controllare che succeda davvero."
      # ... 8-12 phrases
  - id: religiose
    title: "Frasi religiose"
    intro: >-
      Per una cerimonia religiosa l'invito può richiamare il significato del
      sacramento, con un tono raccolto ma caloroso.
    frasi:
      - "Con la benedizione delle nostre famiglie, uniremo le nostre vite davanti a Dio sabato 12 settembre alle ore 16:00 nella Chiesa di San Lorenzo. Sarebbe un dono avervi accanto."
      # ... 6-10 phrases
  - id: whatsapp
    title: "Frasi pronte per WhatsApp"
    intro: >-
      Dirette, personali, con il link in chiusura: pensate per essere incollate
      in un messaggio individuale, non in un gruppo.
    frasi:
      - "Ciao zia! Io e Marco ci sposiamo il 12 settembre e vogliamo te in prima fila. Qui trovi l'invito con tutti i dettagli e la conferma: [link]"
      # ... 6-10 phrases
consigli:
  - title: "Decidete chi firma l'invito"
    text: >-
      Nella tradizione italiana l'invito formale parte dalle famiglie; oggi
      firmano quasi sempre gli sposi. Scegliete prima di scrivere: cambia la
      persona grammaticale di tutta la frase.
  - title: "Specificate subito cerimonia e ricevimento"
    text: >-
      Se alcuni ospiti sono invitati solo al ricevimento (o solo alla
      cerimonia), ditelo nell'invito: evita imbarazzi e conteggi sbagliati
      con il catering.
  # ... 4-5 tips total
faq:
  - q: "Quanto tempo prima si mandano gli inviti di matrimonio?"
    a: >-
      Il save-the-date parte 6-9 mesi prima, l'invito completo 2-3 mesi prima,
      con richiesta di conferma entro 3-4 settimane dalla data: è il margine
      che serve per dare i numeri definitivi a catering e ristorante.
  # ... 3-4 questions total
related:
  - engagement
  - wedding-anniversary
published: true
```

- [ ] **Step 2: Write the other 14 IT files**

Same structure. Per-occasion direction:

| File | Tone sections | Cultural angle / FAQ themes |
|---|---|---|
| `battesimo.yml` | formali, semplici, religiose, whatsapp | Firmano i genitori; ruolo di padrino/madrina; pranzo dopo il rito; FAQ: chi si nomina, quanto anticipo |
| `prima-comunione.yml` | formali, semplici, religiose, whatsapp | Invito a nome del bambino o dei genitori; messa + pranzo; FAQ: cosa scrivere per i compagni di classe |
| `cresima.yml` | formali, semplici, religiose, whatsapp | Ragazzo/a protagonista; padrino/madrina; FAQ: differenze con comunione |
| `laurea.yml` | formali, semplici, spiritose, whatsapp | Proclamazione + festa separate; corona d'alloro; FAQ: si invita alla proclamazione o solo alla festa |
| `compleanno.yml` | formali, semplici, spiritose, whatsapp | Feste adulti generiche; location e orario; FAQ: come chiedere conferma senza sembrare formali |
| `18-anni.yml` | formali, semplici, spiritose, whatsapp | Maggiore età, festa serale, dress code; FAQ: invito firmato dal festeggiato o dai genitori |
| `40-anni.yml` | semplici, spiritose, whatsapp | Ironia sui bilanci di metà percorso; FAQ: festa a sorpresa |
| `50-anni.yml` | formali, semplici, spiritose, whatsapp | Traguardo importante, festa più strutturata; FAQ: regali sì/no |
| `60-anni.yml` | formali, semplici, spiritose, whatsapp | Famiglia allargata, nipoti; tono affettuoso |
| `anniversario-matrimonio.yml` | formali, semplici, spiritose, whatsapp | Nozze d'argento/oro, rinnovo promesse; FAQ: chi organizza (figli) |
| `baby-shower.yml` | semplici, spiritose, whatsapp | Usanza recente in Italia; chi invita (amica/futura mamma); FAQ: gift list |
| `pensionamento.yml` | formali, semplici, spiritose, whatsapp | Colleghi vs famiglia; brindisi in ufficio vs cena; FAQ: chi organizza |
| `inaugurazione-casa.yml` | semplici, spiritose, whatsapp | Housewarming informale; FAQ: cosa portare |
| `fidanzamento.yml` | formali, semplici, spiritose, whatsapp | Annuncio + festa; FAQ: differenza con save-the-date |

- [ ] **Step 3: Run the IT content tests**

Run: `pnpm vitest run test/content/frasi.test.ts`
Expected: `frasi content (it)` suite PASS (all 5 tests). `frasi content (en)` still FAILS on missing files.

- [ ] **Step 4: Commit**

```bash
git add content/frasi/it/
git commit -m "feat(pseo): Italian content for 15 frasi-invito pages"
```

---

### Task 3: English content — 15 YAML files

**Files:**
- Create: `content/frasi/en/wedding.yml`, `christening.yml`, `first-communion.yml`, `confirmation.yml`, `graduation.yml`, `birthday.yml`, `18th-birthday.yml`, `40th-birthday.yml`, `50th-birthday.yml`, `60th-birthday.yml`, `wedding-anniversary.yml`, `baby-shower.yml`, `retirement.yml`, `housewarming.yml`, `engagement.yml`

**Interfaces:**
- Consumes: `frasiPageSchema` (Task 1); pairing via `translationSlug` = same `key` as the IT file.
- Produces: 15 EN files; whole `test/content/frasi.test.ts` goes green.

- [ ] **Step 1: Write the 15 EN files**

Same YAML structure as Task 2 with `locale: en` and the EN slug as `slug`/filename. Content is REWRITTEN for anglophone customs, not translated:

- Registers: `formal`, `short-and-simple` (id `semplici` → use `simple`), `funny`, `religious` (same restriction: wedding, christening, first-communion, confirmation only), `whatsapp` → id `text-message` titled "Ready to text".
- Section ids must still match `^[a-z0-9-]+$` — use `formal`, `simple`, `funny`, `religious`, `text-message`.
- Anglophone conventions: "RSVP by [date]", "adults-only reception", registry/no-gifts wording, "black tie optional", graduation announcements vs. party invitations, christening vs. baptism phrasing.
- `title`/`description` target "wording" queries, e.g. `title: "Wedding invitation wording: ready-to-copy examples"`.
- Same quality gates (≥30 phrases, ≥600 words, unique titles, no cross-file duplicates — tests enforce).

Reference head for `content/frasi/en/wedding.yml`:

```yaml
slug: wedding
locale: en
translationSlug: wedding
title: "Wedding invitation wording: ready-to-copy examples"
description: "40+ wedding invitation wording examples: formal, simple, funny and ready to text. Copy your favorite, then turn it into a digital invitation with RSVP."
h1: "Wedding invitation wording"
answer: >-
  Great wedding invitation wording covers who is getting married, when, where,
  and how to RSVP. The register depends on the host line: classic third-person
  when families host, first-person when you do. Below you'll find ready-to-copy
  examples — formal, simple, funny and text-friendly — easy to adapt in a minute.
occasione: "Wedding"
# sections/tips/faq/related: same structure as the IT reference file
related:
  - engagement
  - wedding-anniversary
published: true
```

- [ ] **Step 2: Run the full content test file**

Run: `pnpm vitest run test/content/frasi.test.ts`
Expected: PASS — both `frasi content (it)` and `frasi content (en)` suites green (10 tests).

- [ ] **Step 3: Commit**

```bash
git add content/frasi/en/
git commit -m "feat(pseo): English content for 15 invitation-wording pages"
```

---

### Task 4: Routing (i18n customRoutes), prerender, sitemap, UI i18n labels

**Files:**
- Modify: `nuxt.config.ts` (i18n block ~line 210, `routeRules` block ~line 55-160, `sitemap` block ~line 230)
- Modify: `i18n/locales/it-IT.json`, `i18n/locales/en-US.json`

**Interfaces:**
- Consumes: `FRASI_SLUGS`, `FRASI_BASE` from `shared/constants/frasiSlugs.ts` (Task 1).
- Produces: localized route family (`/frasi-invito/...` IT, `/en/invitation-wording/...` EN), prerender rules + sitemap URLs for all 32 pages, i18n keys `ceremly.site.frasi.*` and `ceremly.home.footer.cols.resources.frasiInvito`.

- [ ] **Step 1: Add imports and derived route tables at the top of `nuxt.config.ts`**

```ts
import { FRASI_BASE, FRASI_SLUGS } from "./shared/constants/frasiSlugs";

// Programmatic SEO "frasi di invito": prerender + sitemap entries derived
// from the static slug registry (32 pages).
const frasiRoutes: string[] = [
    FRASI_BASE.it,
    FRASI_BASE.en,
    ...FRASI_SLUGS.flatMap(s => [
        `${FRASI_BASE.it}/${s.it}`,
        `${FRASI_BASE.en}/${s.en}`,
    ]),
];
const frasiRouteRules = Object.fromEntries(
    frasiRoutes.map(r => [r, { prerender: true }]),
);
```

- [ ] **Step 2: Spread the rules into `routeRules`**

Inside the existing `routeRules` object (next to the other public prerender rules):

```ts
        // Programmatic SEO: frasi di invito / invitation wording (32 pages)
        ...frasiRouteRules,
```

- [ ] **Step 3: Add i18n customRoutes for the frasi family only**

In the existing `i18n` block add:

```ts
        customRoutes: "config",
        pages: {
            "frasi-invito/index": {
                it: "/frasi-invito",
                en: "/invitation-wording",
            },
            "frasi-invito/[slug]": {
                it: "/frasi-invito/[slug]",
                en: "/invitation-wording/[slug]",
            },
        },
```

Note: with `customRoutes: "config"`, pages not listed in `pages` keep their file-based routes — existing URLs are untouched. Verify in Step 6.

- [ ] **Step 4: Add sitemap URLs**

In the existing `sitemap` block add:

```ts
        urls: frasiRoutes,
```

- [ ] **Step 5: Add UI i18n labels**

`i18n/locales/it-IT.json` — under `ceremly.site` add sibling object `frasi`, and under `ceremly.home.footer.cols.resources` add `frasiInvito` (do NOT use the `@` character anywhere in the values):

```json
"frasi": {
    "hubTitle": "Frasi di invito",
    "tocTitle": "In questa pagina",
    "copy": "Copia",
    "copied": "Copiata!",
    "tipsTitle": "Come scrivere l'invito",
    "faqTitle": "Domande frequenti",
    "ctaTitle": "Hai trovato la frase giusta?",
    "ctaText": "Trasformala in un invito digitale con RSVP: link personalizzato per ogni ospite, conferme e allergie in una sola dashboard.",
    "ctaButton": "Crea il tuo invito gratis",
    "relatedTitle": "Frasi per altre occasioni",
    "hubAnswer": "Cosa scrivere in un invito? Dipende dall'occasione e dal tono. Qui trovi frasi pronte da copiare per matrimoni, battesimi, lauree, compleanni e altre 11 occasioni: formali, semplici, spiritose o pronte per WhatsApp.",
    "hubCardCta": "Vedi le frasi"
}
```

```json
"frasiInvito": "Frasi di invito"
```

`i18n/locales/en-US.json` — same keys:

```json
"frasi": {
    "hubTitle": "Invitation wording",
    "tocTitle": "On this page",
    "copy": "Copy",
    "copied": "Copied!",
    "tipsTitle": "How to word your invitation",
    "faqTitle": "Frequently asked questions",
    "ctaTitle": "Found the right wording?",
    "ctaText": "Turn it into a digital invitation with RSVP: a personal link for every guest, confirmations and dietary needs in one dashboard.",
    "ctaButton": "Create your invitation for free",
    "relatedTitle": "Wording for other occasions",
    "hubAnswer": "What should an invitation say? It depends on the occasion and the tone. Here you'll find ready-to-copy wording for weddings, christenings, graduations, birthdays and 11 more occasions: formal, simple, funny or ready to text.",
    "hubCardCta": "See the wording"
}
```

```json
"frasiInvito": "Invitation wording"
```

- [ ] **Step 6: Verify routing config**

Run: `pnpm typecheck`
Expected: green.

Run: `pnpm dev` (background), then:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/pricing` → `200` (existing routes intact)
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/frasi-invito/matrimonio` → `404` is EXPECTED here (pages don't exist yet — route config is validated in Task 5). What must NOT happen: dev server startup errors about `pages` config.

- [ ] **Step 7: Commit**

```bash
git add nuxt.config.ts i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "feat(pseo): frasi-invito routing, customRoutes EN, prerender + sitemap, i18n labels"
```

---

### Task 5: Phrase card component + spoke page template

**Files:**
- Create: `app/components/ceremly/CerFraseCard.vue`
- Create: `app/pages/frasi-invito/[slug].vue`

**Interfaces:**
- Consumes: `FRASI_SLUGS`, `frasiPath` (Task 1); `frasi` collection (Tasks 1-3); i18n keys `ceremly.site.frasi.*` (Task 4); `CerBreadcrumb` (prop `trail`) and `CerRelatedLinks` (prop `links: { label, desc, to }[]`) from the site-architecture plan.
- Produces: `<CerFraseCard :text="frase" />`; live spoke pages at `/frasi-invito/[it-slug]` and `/en/invitation-wording/[en-slug]`.

- [ ] **Step 1: Create `app/components/ceremly/CerFraseCard.vue`**

```vue
<script setup lang="ts">
// One copyable phrase. Clipboard API with a legacy execCommand fallback
// (older Safari / non-secure contexts).
const props = defineProps<{ text: string }>()
const { t } = useI18n()
const copied = ref(false)

async function copy() {
    try {
        await navigator.clipboard.writeText(props.text)
    }
    catch {
        const ta = document.createElement('textarea')
        ta.value = props.text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
    }
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
}
</script>

<template>
    <figure class="cer-frase-card group relative rounded-xl border border-stone-200 bg-white p-5 pr-14">
        <blockquote class="text-stone-700 leading-relaxed">
            {{ text }}
        </blockquote>
        <button
            type="button"
            class="absolute right-3 top-3 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-500 transition hover:border-stone-300 hover:text-stone-700"
            :aria-label="t('ceremly.site.frasi.copy')"
            @click="copy"
        >
            {{ copied ? t('ceremly.site.frasi.copied') : t('ceremly.site.frasi.copy') }}
        </button>
    </figure>
</template>
```

- [ ] **Step 2: Create `app/pages/frasi-invito/[slug].vue`**

```vue
<script setup lang="ts">
import { FRASI_SLUGS, frasiPath } from '~~/shared/constants/frasiSlugs'
import CerBreadcrumb from '~/components/ceremly/CerBreadcrumb.vue'
import CerRelatedLinks from '~/components/ceremly/CerRelatedLinks.vue'
import CerFraseCard from '~/components/ceremly/CerFraseCard.vue'

definePageMeta({
    auth: false,
    layout: 'public-site',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const setI18nParams = useSetI18nParams()

const currentLocale = computed<'it' | 'en'>(() => (locale.value.startsWith('it') ? 'it' : 'en'))
const slugParam = route.params.slug as string

const entry = FRASI_SLUGS.find(s => s[currentLocale.value] === slugParam)
if (!entry) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

const { data: page } = await useAsyncData(`frasi-${currentLocale.value}-${slugParam}`, () =>
    queryCollection('frasi')
        .where('translationSlug', '=', entry.key)
        .where('locale', '=', currentLocale.value)
        .first(),
)
if (!page.value || page.value.published === false) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

// hreflang + locale switcher: map the slug param per locale (slugs differ).
setI18nParams({ it: { slug: entry.it }, en: { slug: entry.en } })

useSeoMeta({
    title: () => page.value?.title || '',
    description: () => page.value?.description || '',
    ogTitle: () => page.value?.title || '',
    ogDescription: () => page.value?.description || '',
})

// FAQPage structured data (raw node — resolved once, page is prerendered).
useSchemaOrg([
    {
        '@type': 'FAQPage',
        'mainEntity': page.value.faq.map(f => ({
            '@type': 'Question',
            'name': f.q,
            'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
        })),
    },
])

const breadcrumbTrail = computed(() => [
    { label: t('ceremly.site.frasi.hubTitle'), to: localePath({ name: 'frasi-invito' }) },
    { label: page.value?.occasione || '' },
])

// Sibling frasi pages for the related block (labels come from their content).
const { data: siblings } = await useAsyncData(`frasi-related-${currentLocale.value}-${slugParam}`, () =>
    queryCollection('frasi')
        .where('locale', '=', currentLocale.value)
        .all(),
)
// i18n item key of each event page in ceremly.site.related.items.*
const EVENT_ITEM_KEYS: Record<string, string> = {
    '/weddings': 'weddings',
    '/baptisms': 'baptisms',
    '/graduations': 'graduations',
    '/birthdays': 'birthdays',
}
const relatedLinks = computed(() => {
    const links: { label: string, desc: string, to: string }[] = []
    const eventKey = entry.eventPage && EVENT_ITEM_KEYS[entry.eventPage]
    if (entry.eventPage && eventKey) {
        links.push({
            label: t(`ceremly.site.related.items.${eventKey}.label`),
            desc: t(`ceremly.site.related.items.${eventKey}.desc`),
            to: localePath(entry.eventPage),
        })
    }
    links.push(
        { label: t('ceremly.site.related.items.templates.label'), desc: t('ceremly.site.related.items.templates.desc'), to: localePath('/templates') },
        { label: t('ceremly.site.related.items.rsvpGuide.label'), desc: t('ceremly.site.related.items.rsvpGuide.desc'), to: localePath('/rsvp-guide') },
    )
    for (const relKey of page.value?.related || []) {
        const sib = (siblings.value || []).find(s => s.translationSlug === relKey)
        if (sib) {
            links.push({ label: sib.h1, desc: sib.description, to: frasiPath(relKey, currentLocale.value) })
        }
    }
    return links.slice(0, 6)
})
</script>

<template>
    <div v-if="page" class="mx-auto max-w-3xl px-4 py-10">
        <CerBreadcrumb :trail="breadcrumbTrail" />

        <h1 class="mt-4 text-3xl font-bold text-stone-900">{{ page.h1 }}</h1>
        <p class="mt-4 text-lg leading-relaxed text-stone-600">{{ page.answer }}</p>

        <!-- TOC -->
        <nav class="mt-8 rounded-xl bg-stone-50 p-5" :aria-label="t('ceremly.site.frasi.tocTitle')">
            <p class="text-sm font-semibold text-stone-900">{{ t('ceremly.site.frasi.tocTitle') }}</p>
            <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <li v-for="sez in page.sezioni" :key="sez.id">
                    <a :href="`#${sez.id}`" class="text-stone-600 underline-offset-2 hover:underline">{{ sez.title }}</a>
                </li>
            </ul>
        </nav>

        <!-- Tone sections -->
        <section v-for="sez in page.sezioni" :id="sez.id" :key="sez.id" class="mt-12 scroll-mt-24">
            <h2 class="text-2xl font-semibold text-stone-900">{{ sez.title }}</h2>
            <p class="mt-2 text-stone-600">{{ sez.intro }}</p>
            <div class="mt-5 space-y-4">
                <CerFraseCard v-for="frase in sez.frasi" :key="frase" :text="frase" />
            </div>
        </section>

        <!-- Tips -->
        <section class="mt-12">
            <h2 class="text-2xl font-semibold text-stone-900">{{ t('ceremly.site.frasi.tipsTitle') }} — {{ page.occasione }}</h2>
            <div class="mt-5 space-y-5">
                <div v-for="c in page.consigli" :key="c.title">
                    <h3 class="font-semibold text-stone-800">{{ c.title }}</h3>
                    <p class="mt-1 text-stone-600">{{ c.text }}</p>
                </div>
            </div>
        </section>

        <!-- CTA -->
        <section class="mt-12 rounded-2xl bg-stone-900 p-8 text-center">
            <h2 class="text-2xl font-semibold text-white">{{ t('ceremly.site.frasi.ctaTitle') }}</h2>
            <p class="mx-auto mt-2 max-w-xl text-stone-300">{{ t('ceremly.site.frasi.ctaText') }}</p>
            <NuxtLink
                :to="localePath('/signup')"
                class="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-stone-900 transition hover:bg-stone-100"
            >
                {{ t('ceremly.site.frasi.ctaButton') }}
            </NuxtLink>
        </section>

        <!-- FAQ -->
        <section class="mt-12">
            <h2 class="text-2xl font-semibold text-stone-900">{{ t('ceremly.site.frasi.faqTitle') }}</h2>
            <div class="mt-5 space-y-6">
                <div v-for="f in page.faq" :key="f.q">
                    <h3 class="font-semibold text-stone-800">{{ f.q }}</h3>
                    <p class="mt-1 text-stone-600">{{ f.a }}</p>
                </div>
            </div>
        </section>

        <CerRelatedLinks :links="relatedLinks" class="mt-12" />
    </div>
</template>
```

Note: match the exact `ResolvedRelatedLink` prop shape of the implemented `CerRelatedLinks` (site-architecture Task 6) — adjust field names if they differ from `{ label, desc, to }`.

- [ ] **Step 3: Verify in dev**

Run: `pnpm dev` (background), then:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/frasi-invito/matrimonio` → `200`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/en/invitation-wording/wedding` → `200`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/frasi-invito/nope` → `404`
- `curl -s http://localhost:3000/frasi-invito/matrimonio | grep -c 'FAQPage'` → `1` (schema emitted)
- `curl -s http://localhost:3000/frasi-invito/matrimonio | grep -o 'hreflang="en-US" href="[^"]*"'` → href ends with `/en/invitation-wording/wedding` (setI18nParams works)

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm typecheck`
Expected: green.

```bash
git add app/components/ceremly/CerFraseCard.vue app/pages/frasi-invito/[slug].vue
git commit -m "feat(pseo): frasi-invito spoke page template with copyable phrase cards"
```

---

### Task 6: Hub page

**Files:**
- Create: `app/pages/frasi-invito/index.vue`

**Interfaces:**
- Consumes: `frasiPath` (Task 1), `frasi` collection, i18n keys `ceremly.site.frasi.*` (Task 4), `CerBreadcrumb`.
- Produces: hub at `/frasi-invito` and `/en/invitation-wording` listing the 15 spokes with `ItemList` schema.

- [ ] **Step 1: Create `app/pages/frasi-invito/index.vue`**

```vue
<script setup lang="ts">
import { frasiPath } from '~~/shared/constants/frasiSlugs'
import CerBreadcrumb from '~/components/ceremly/CerBreadcrumb.vue'

definePageMeta({
    auth: false,
    layout: 'public-site',
})

const { t, locale } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const currentLocale = computed<'it' | 'en'>(() => (locale.value.startsWith('it') ? 'it' : 'en'))

const { data: pages } = await useAsyncData(`frasi-hub-${currentLocale.value}`, () =>
    queryCollection('frasi')
        .where('locale', '=', currentLocale.value)
        .order('occasione', 'ASC')
        .all(),
)
const publishedPages = computed(() => (pages.value || []).filter(p => p.published !== false))

useSeoMeta({
    title: () => t('ceremly.site.frasi.hubTitle'),
    description: () => t('ceremly.site.frasi.hubAnswer'),
    ogTitle: () => t('ceremly.site.frasi.hubTitle'),
    ogDescription: () => t('ceremly.site.frasi.hubAnswer'),
})

useSchemaOrg([
    {
        '@type': 'ItemList',
        'itemListElement': publishedPages.value.map((p, i) => ({
            '@type': 'ListItem',
            'position': i + 1,
            'name': p.h1,
            'url': `${baseUrl}${frasiPath(p.translationSlug, currentLocale.value)}`,
        })),
    },
])
</script>

<template>
    <div class="mx-auto max-w-4xl px-4 py-10">
        <CerBreadcrumb :trail="[{ label: t('ceremly.site.frasi.hubTitle') }]" />

        <h1 class="mt-4 text-3xl font-bold text-stone-900">{{ t('ceremly.site.frasi.hubTitle') }}</h1>
        <p class="mt-4 max-w-2xl text-lg leading-relaxed text-stone-600">{{ t('ceremly.site.frasi.hubAnswer') }}</p>

        <div class="mt-10 grid gap-5 sm:grid-cols-2">
            <NuxtLink
                v-for="p in publishedPages"
                :key="p.slug"
                :to="frasiPath(p.translationSlug, currentLocale)"
                class="group rounded-xl border border-stone-200 bg-white p-5 transition hover:border-stone-300 hover:shadow-sm"
            >
                <h2 class="font-semibold text-stone-900 group-hover:underline">{{ p.h1 }}</h2>
                <p class="mt-1 line-clamp-2 text-sm text-stone-600">{{ p.description }}</p>
                <span class="mt-3 inline-block text-sm font-medium text-stone-500">{{ t('ceremly.site.frasi.hubCardCta') }} →</span>
            </NuxtLink>
        </div>

        <!-- Cross-links + CTA -->
        <section class="mt-12 rounded-2xl bg-stone-900 p-8 text-center">
            <h2 class="text-2xl font-semibold text-white">{{ t('ceremly.site.frasi.ctaTitle') }}</h2>
            <p class="mx-auto mt-2 max-w-xl text-stone-300">{{ t('ceremly.site.frasi.ctaText') }}</p>
            <NuxtLink
                :to="localePath('/signup')"
                class="mt-6 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-stone-900 transition hover:bg-stone-100"
            >
                {{ t('ceremly.site.frasi.ctaButton') }}
            </NuxtLink>
        </section>

        <div class="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <NuxtLink :to="localePath('/events')" class="text-stone-600 underline-offset-2 hover:underline">{{ t('ceremly.site.related.items.eventsHub.label') }}</NuxtLink>
            <NuxtLink :to="localePath('/templates')" class="text-stone-600 underline-offset-2 hover:underline">{{ t('ceremly.site.related.items.templates.label') }}</NuxtLink>
            <NuxtLink :to="localePath('/rsvp-guide')" class="text-stone-600 underline-offset-2 hover:underline">{{ t('ceremly.site.related.items.rsvpGuide.label') }}</NuxtLink>
        </div>
    </div>
</template>
```

- [ ] **Step 2: Verify in dev**

Run (dev server running):
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/frasi-invito` → `200`
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/en/invitation-wording` → `200`
- `curl -s http://localhost:3000/frasi-invito | grep -c 'ItemList'` → `1`
- `curl -s http://localhost:3000/frasi-invito | grep -c 'frasi-invito/matrimonio'` → ≥ `1` (cards link spokes)

- [ ] **Step 3: Typecheck and commit**

Run: `pnpm typecheck`
Expected: green.

```bash
git add app/pages/frasi-invito/index.vue
git commit -m "feat(pseo): frasi-invito hub page with ItemList schema"
```

---

### Task 7: Inbound linking — footer, event pages, rsvp-guide

**Files:**
- Modify: `app/components/ceremly/CerSiteFooter.vue` (resources column, ~line 33-39)
- Modify: `app/data/siteArchitecture.ts` (from site-architecture plan)
- Modify: `app/components/ceremly/CerRelatedLinks.vue` (from site-architecture plan)
- Modify: `i18n/locales/it-IT.json`, `i18n/locales/en-US.json` (related-items labels)

**Interfaces:**
- Consumes: `frasiPath` (Task 1); `RelatedLinkEntry`, `SITE_RELATED_LINKS`, `rel()` and `CerRelatedLinks` internals from the site-architecture plan.
- Produces: `RelatedLinkEntry.toByLocale?: { it: string, en: string }` (resolved by `CerRelatedLinks` instead of `localePath(to)` when present); footer link to the hub; frasi entries in the related-links map for `/weddings`, `/baptisms`, `/graduations`, `/birthdays`, `/rsvp-guide`.

- [ ] **Step 1: Footer link**

In `CerSiteFooter.vue`, resources column, append after the `apiPartners` item:

```ts
            { label: t('ceremly.home.footer.cols.resources.frasiInvito'), to: localePath({ name: 'frasi-invito' }) },
```

- [ ] **Step 2: Extend `RelatedLinkEntry` and the map in `app/data/siteArchitecture.ts`**

Add the optional field to the interface:

```ts
export interface RelatedLinkEntry {
    labelKey: string
    descKey: string
    to: string
    /**
     * Per-locale absolute paths (EN value already includes the /en prefix).
     * Used for the frasi-invito family whose EN slugs differ from IT
     * (localePath can't map them). When present, wins over `to`.
     */
    toByLocale?: { it: string, en: string }
}
```

Add frasi entries (near the other `rel()` consts):

```ts
import { frasiPath } from '~~/shared/constants/frasiSlugs'

const frasiRel = (itemKey: string, frasiKey: string): RelatedLinkEntry => ({
    labelKey: `ceremly.site.related.items.${itemKey}.label`,
    descKey: `ceremly.site.related.items.${itemKey}.desc`,
    to: frasiPath(frasiKey, 'it'),
    toByLocale: { it: frasiPath(frasiKey, 'it'), en: frasiPath(frasiKey, 'en') },
})
const FRASI_WEDDING = frasiRel('frasiWedding', 'wedding')
const FRASI_CHRISTENING = frasiRel('frasiChristening', 'christening')
const FRASI_GRADUATION = frasiRel('frasiGraduation', 'graduation')
const FRASI_BIRTHDAY = frasiRel('frasiBirthday', 'birthday')
const FRASI_HUB: RelatedLinkEntry = {
    labelKey: 'ceremly.site.related.items.frasiHub.label',
    descKey: 'ceremly.site.related.items.frasiHub.desc',
    to: '/frasi-invito',
    toByLocale: { it: '/frasi-invito', en: '/en/invitation-wording' },
}
```

Update the map entries — append the frasi link to each event page and to `/rsvp-guide` (keep existing links, trim to max 6 by dropping the LAST sibling-spoke entry where needed):

```ts
    '/weddings': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, FRASI_WEDDING, BAPTISMS],
    '/graduations': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, FRASI_GRADUATION, BIRTHDAYS],
    '/baptisms': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, FRASI_CHRISTENING, WEDDINGS],
    '/birthdays': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, FRASI_BIRTHDAY, GRADUATIONS],
    '/events': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, FRASI_HUB],
    '/rsvp-guide': [FEATURES, EVENTS_HUB, FRASI_HUB, WEDDINGS],
```

(`/events` gains `FRASI_HUB` — the spec requires the reciprocal hub↔hub cross-link; the frasi hub already links `/events` in Task 6.)

- [ ] **Step 3: Resolve `toByLocale` in `CerRelatedLinks.vue`**

In the component's `items` computed, where each map entry currently resolves `to: localePath(entry.to)`, change the resolution to:

```ts
const currentLocale = computed(() => (locale.value.startsWith('it') ? 'it' : 'en'))
// inside the map over entries:
    to: entry.toByLocale ? entry.toByLocale[currentLocale.value] : localePath(entry.to),
```

(`locale` from the component's existing `useI18n()`; add it to the destructuring if missing.)

- [ ] **Step 4: Add related-items i18n labels**

`it-IT.json`, under `ceremly.site.related.items`, add:

```json
"frasiWedding": { "label": "Frasi di invito per matrimonio", "desc": "Esempi pronti da copiare: formali, semplici, spiritose e per WhatsApp." },
"frasiChristening": { "label": "Frasi di invito per battesimo", "desc": "Frasi formali, religiose e per WhatsApp, pronte da copiare." },
"frasiGraduation": { "label": "Frasi di invito per laurea", "desc": "Idee e testi pronti per proclamazione e festa di laurea." },
"frasiBirthday": { "label": "Frasi di invito per compleanno", "desc": "Testi pronti per feste di compleanno di ogni età." },
"frasiHub": { "label": "Frasi di invito", "desc": "Frasi pronte da copiare per 15 occasioni: dal matrimonio al pensionamento." }
```

`en-US.json`, same keys:

```json
"frasiWedding": { "label": "Wedding invitation wording", "desc": "Ready-to-copy examples: formal, simple, funny and text-friendly." },
"frasiChristening": { "label": "Christening invitation wording", "desc": "Formal, religious and text-ready wording, ready to copy." },
"frasiGraduation": { "label": "Graduation invitation wording", "desc": "Ideas and ready-made wording for ceremony and party." },
"frasiBirthday": { "label": "Birthday invitation wording", "desc": "Ready-made wording for birthday parties of every age." },
"frasiHub": { "label": "Invitation wording", "desc": "Ready-to-copy wording for 15 occasions, from weddings to retirement." }
```

- [ ] **Step 5: Verify in dev**

Run (dev server running):
- `curl -s http://localhost:3000/weddings | grep -c 'frasi-invito/matrimonio'` → ≥ `1`
- `curl -s http://localhost:3000/en/weddings | grep -c 'invitation-wording/wedding'` → ≥ `1` (toByLocale resolution)
- `curl -s http://localhost:3000/pricing | grep -c 'frasi-invito'` → ≥ `1` (footer link on every public page)

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: green.

```bash
git add app/components/ceremly/CerSiteFooter.vue app/data/siteArchitecture.ts app/components/ceremly/CerRelatedLinks.vue i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "feat(pseo): inbound links to frasi-invito (footer, event pages, rsvp-guide)"
```

---

### Task 8: Final verification — full suite, build, prerender/sitemap audit

**Files:**
- No new files (fixes only, if verification fails).

**Interfaces:**
- Consumes: everything above.
- Produces: verified release state.

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all green (existing suite + 10 frasi content tests).

- [ ] **Step 2: Typecheck + production build (mandatory for the i18n `@` gotcha)**

Run: `pnpm typecheck && pnpm build`
Expected: both green (the pre-existing `sharp-wasm32` Nitro warning is known and acceptable).

- [ ] **Step 3: Prerender audit**

```bash
ls .output/public/frasi-invito/ && ls .output/public/en/invitation-wording/
```
Expected: `index.html` for the hub + 15 spoke directories per locale (32 documents total).

```bash
grep -o 'hreflang="en-US" href="[^"]*"' .output/public/frasi-invito/matrimonio/index.html
grep -c 'FAQPage' .output/public/frasi-invito/matrimonio/index.html
grep -c 'ItemList' .output/public/frasi-invito/index.html
```
Expected: hreflang href ends with `/en/invitation-wording/wedding`; both grep counts ≥ 1.

- [ ] **Step 4: Sitemap audit**

```bash
node .output/server/index.mjs &  # or `pnpm preview` in background
curl -s http://localhost:3000/sitemap.xml | grep -c 'frasi-invito\|invitation-wording'
```
Expected: ≥ 32 occurrences. Kill the server afterwards.

- [ ] **Step 5: Internal link audit**

```bash
curl -s http://localhost:3000/frasi-invito/matrimonio | grep -oE 'href="/[^"]*"' | sort -u
```
Expected: contains hub, signup, event page, templates, rsvp-guide, sibling frasi pages; no obviously broken paths. Spot-check 3 of them with `curl -o /dev/null -w "%{http_code}"` → `200`.

- [ ] **Step 6: Commit any verification fixes**

```bash
git status --short   # commit fixes if any, message: "fix(pseo): <what>"
```

Done. Push is manual (repo rule) — remind the user.
