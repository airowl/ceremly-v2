# Site Architecture (Events Hub + Nav + Breadcrumb + Internal Linking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved site architecture: new `/events` hub page, "Per chi" nav dropdown, visible breadcrumbs with schema, and contextual internal linking across the public site.

**Architecture:** A single IA source file (`app/data/siteArchitecture.ts`) drives breadcrumb trails, the "Per chi" menu, and related-links maps. New components (`CerBreadcrumb`, `CerNavForWho`, `CerRelatedLinks`) consume it. URLs stay flat and English — hierarchy is logical only (breadcrumb/nav/linking). Spec: `docs/superpowers/specs/2026-07-11-site-architecture-design.md`.

**Tech Stack:** Nuxt 4, Vue 3, @nuxtjs/i18n (`prefix_except_default`, IT default), @nuxtjs/seo (nuxt-schema-org `useSchemaOrg`/`defineBreadcrumb`), Vitest (server-side only), custom CSS (`cer-*` design system, no Nuxt UI on public pages).

## Global Constraints

- **URLs unchanged**: no renames, no redirects, no Italian slugs, `/blogs` stays. Only NEW route: `/events` (+ `/en/events`).
- **No `/confronta` links yet**: comparison pages are not live (ai-seo plan implements them). Do NOT add footer/related links to `/confronta` in this plan.
- **i18n**: every new user-facing string in BOTH `i18n/locales/it-IT.json` and `en-US.json`. NEVER use the `@` character in message values (breaks the whole locale file — verify with `pnpm build`, not dev).
- **Language convention**: product copy Italian-first + English; code comments/commit messages in English.
- **No fake social proof**: no invented metrics/testimonials in new copy (memory `ceremly-fake-social-proof`).
- **Frontend testing**: repo has NO component test infra (Vitest covers `server/` only). Verification for UI tasks = `pnpm typecheck` + `pnpm build` + greps on prerendered output in `.output/public/`.
- **Commits**: auto-commit OK when verified; push always manual.
- **Style**: public-site pages use the `cer-*` custom CSS system (`var(--bone)`, `var(--ink-700)`, `var(--line)`, `var(--orange)`, class `serif`, `row`, `col`, `l-wrap`). Match existing patterns in `CerSiteNav.vue` / `CerSiteHero.vue`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `app/data/siteArchitecture.ts` | Create | Single IA source: breadcrumb trails, "Per chi" links, related-links map, locale-prefix util |
| `app/composables/useSiteBreadcrumb.ts` | Create | Resolve trail (map or explicit) → UI items + BreadcrumbList schema |
| `app/components/ceremly/CerBreadcrumb.vue` | Create | Visible breadcrumb UI |
| `app/components/ceremly/CerNavForWho.vue` | Create | "Per chi" dropdown (desktop) |
| `app/components/ceremly/CerRelatedLinks.vue` | Create | Related-links card section |
| `app/pages/events.vue` | Create | Events hub page |
| `app/layouts/public-site.vue` | Modify | Mount `CerBreadcrumb` |
| `app/components/ceremly/CerSiteNav.vue` | Modify | Dropdown + mobile group |
| `app/components/ceremly/CerSiteFooter.vue` | Modify | +Tutti gli eventi, +Blog, +Brand assets |
| `app/pages/index.vue` | Modify | Nav anchors → real page links + dropdown |
| `app/pages/{weddings,graduations,baptisms,birthdays}.vue` | Untouched | Related links injected via `CerUseCase` |
| `app/components/ceremly/CerUseCase.vue` | Modify | Mount `CerRelatedLinks` before its CTA |
| `app/pages/{features,templates,examples,pricing,rsvp-guide}.vue` | Modify | Mount `CerRelatedLinks` before CTA |
| `app/pages/legal/{tos,privacy,cookie,dpa,subprocessors}.vue` | Modify | Manual `defineBreadcrumb` → `CerBreadcrumb` |
| `app/pages/blogs/{index,[slug]}.vue` | Modify | Same migration + related links on posts |
| `nuxt.config.ts` | Modify | Prerender `/events` + `/en/events` |
| `i18n/locales/{it-IT,en-US}.json` | Modify | New keys |
| `scripts/generate-og.mjs` | Modify | OG image for `/events` |

---

### Task 1: IA data source + i18n keys

**Files:**
- Create: `app/data/siteArchitecture.ts`
- Modify: `i18n/locales/it-IT.json`, `i18n/locales/en-US.json`

**Interfaces:**
- Produces: `SITE_BREADCRUMB_TRAILS: Record<string, BreadcrumbTrailEntry[]>`, `FOR_WHO_LINKS: ForWhoLink[]`, `SITE_RELATED_LINKS: Record<string, RelatedLinkEntry[]>`, `stripLocalePrefix(path: string): string` — consumed by Tasks 2, 4, 6.
- i18n keys under `ceremly.site.breadcrumb.*`, `ceremly.site.related.*`, `ceremly.site.events.*`, plus additions to `ceremly.home.nav.*` and `ceremly.home.footer.cols.*` — consumed by Tasks 2–6.

- [ ] **Step 1: Create `app/data/siteArchitecture.ts`**

```ts
// Single source of truth for the public site information architecture:
// logical hierarchy (breadcrumb trails), the "Per chi" menu, and the
// related-links map. URLs stay flat — hierarchy here is logical only.
// Spec: docs/superpowers/specs/2026-07-11-site-architecture-design.md

export interface BreadcrumbTrailEntry {
    /** i18n key for the label */
    labelKey: string
    /** Locale-less path. Omit on the last entry (current page). */
    to?: string
}

export interface ForWhoLink {
    labelKey: string
    to: string
}

export interface RelatedLinkEntry {
    labelKey: string
    descKey: string
    to: string
}

/** Strips the `/en` locale prefix and any trailing slash. */
export function stripLocalePrefix(path: string): string {
    const p = path.replace(/\/+$/, '') || '/'
    if (p === '/en') return '/'
    return p.startsWith('/en/') ? p.slice(3) : p
}

// ── Breadcrumb trails (Home is prepended by the composable) ──
// Every public-site-layout page must have an entry, otherwise no
// breadcrumb (UI hidden, but an empty BreadcrumbList node is emitted).
export const SITE_BREADCRUMB_TRAILS: Record<string, BreadcrumbTrailEntry[]> = {
    '/how-it-works': [{ labelKey: 'ceremly.home.nav.howItWorks' }],
    '/features': [{ labelKey: 'ceremly.home.nav.features' }],
    '/templates': [{ labelKey: 'ceremly.home.footer.cols.product.inviteTemplates' }],
    '/examples': [{ labelKey: 'ceremly.home.footer.cols.product.realExamples' }],
    '/pricing': [{ labelKey: 'ceremly.home.nav.pricing' }],
    '/events': [{ labelKey: 'ceremly.site.breadcrumb.events' }],
    '/weddings': [
        { labelKey: 'ceremly.site.breadcrumb.events', to: '/events' },
        { labelKey: 'ceremly.home.footer.cols.forWho.weddings' },
    ],
    '/graduations': [
        { labelKey: 'ceremly.site.breadcrumb.events', to: '/events' },
        { labelKey: 'ceremly.home.footer.cols.forWho.graduations' },
    ],
    '/baptisms': [
        { labelKey: 'ceremly.site.breadcrumb.events', to: '/events' },
        { labelKey: 'ceremly.home.footer.cols.forWho.baptisms' },
    ],
    '/birthdays': [
        { labelKey: 'ceremly.site.breadcrumb.events', to: '/events' },
        { labelKey: 'ceremly.home.footer.cols.forWho.birthdays' },
    ],
    '/wedding-planner': [{ labelKey: 'ceremly.home.footer.cols.forWho.weddingPlanners' }],
    '/rsvp-guide': [{ labelKey: 'ceremly.home.footer.cols.resources.rsvpGuide' }],
    '/help-center': [{ labelKey: 'ceremly.home.footer.cols.resources.helpCenter' }],
    '/status': [{ labelKey: 'ceremly.home.footer.cols.resources.serviceStatus' }],
    '/changelog': [{ labelKey: 'ceremly.home.footer.cols.resources.changelog' }],
    '/api': [{ labelKey: 'ceremly.home.footer.cols.resources.apiPartners' }],
    '/about': [{ labelKey: 'ceremly.home.footer.cols.company.about' }],
    '/contact': [{ labelKey: 'ceremly.home.footer.cols.company.contact' }],
    '/brand': [{ labelKey: 'ceremly.home.footer.cols.company.brandAssets' }],
}

// ── "Per chi" menu (nav dropdown + mobile group). Planner last, after divider. ──
export const FOR_WHO_LINKS: ForWhoLink[] = [
    { labelKey: 'ceremly.home.nav.allEvents', to: '/events' },
    { labelKey: 'ceremly.home.footer.cols.forWho.weddings', to: '/weddings' },
    { labelKey: 'ceremly.home.footer.cols.forWho.graduations', to: '/graduations' },
    { labelKey: 'ceremly.home.footer.cols.forWho.baptisms', to: '/baptisms' },
    { labelKey: 'ceremly.home.footer.cols.forWho.birthdays', to: '/birthdays' },
]
export const FOR_WHO_PLANNER: ForWhoLink = {
    labelKey: 'ceremly.home.footer.cols.forWho.weddingPlanners',
    to: '/wedding-planner',
}

// ── Related links per page (locale-less path → 3-6 cards) ──
const rel = (key: string, to: string): RelatedLinkEntry => ({
    labelKey: `ceremly.site.related.items.${key}.label`,
    descKey: `ceremly.site.related.items.${key}.desc`,
    to,
})
const TEMPLATES = rel('templates', '/templates')
const EXAMPLES = rel('examples', '/examples')
const RSVP_GUIDE = rel('rsvpGuide', '/rsvp-guide')
const PRICING = rel('pricing', '/pricing')
const HOW_IT_WORKS = rel('howItWorks', '/how-it-works')
const FEATURES = rel('features', '/features')
const EVENTS_HUB = rel('eventsHub', '/events')
const WEDDINGS = rel('weddings', '/weddings')
const GRADUATIONS = rel('graduations', '/graduations')
const BAPTISMS = rel('baptisms', '/baptisms')
const BIRTHDAYS = rel('birthdays', '/birthdays')

export const SITE_RELATED_LINKS: Record<string, RelatedLinkEntry[]> = {
    // Event pages: 4 product links (spec table) + 2 sibling spokes
    '/weddings': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, BAPTISMS, BIRTHDAYS],
    '/graduations': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, BIRTHDAYS, WEDDINGS],
    '/baptisms': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, WEDDINGS, BIRTHDAYS],
    '/birthdays': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING, GRADUATIONS, WEDDINGS],
    '/events': [TEMPLATES, EXAMPLES, RSVP_GUIDE, PRICING],
    '/features': [EVENTS_HUB, WEDDINGS, BIRTHDAYS, HOW_IT_WORKS],
    '/templates': [WEDDINGS, BAPTISMS, EVENTS_HUB, PRICING],
    '/examples': [WEDDINGS, GRADUATIONS, EVENTS_HUB, PRICING],
    // '/confronta' entry will be added by the ai-seo plan when comparisons go live
    '/pricing': [HOW_IT_WORKS, EXAMPLES, EVENTS_HUB],
    '/rsvp-guide': [FEATURES, EVENTS_HUB, WEDDINGS, BAPTISMS],
}
```

- [ ] **Step 2: Add i18n keys to `i18n/locales/it-IT.json`**

Merge into the existing objects (do not remove existing keys). Locations: `ceremly.home.nav`, `ceremly.home.footer.cols.*`, and new blocks under `ceremly.site`:

```json
{
  "ceremly": {
    "home": {
      "nav": {
        "forWho": "Per chi",
        "allEvents": "Tutti gli eventi"
      },
      "footer": {
        "cols": {
          "forWho": { "allEvents": "Tutti gli eventi" },
          "resources": { "blog": "Blog" },
          "company": { "brandAssets": "Brand assets" }
        }
      }
    },
    "site": {
      "breadcrumb": {
        "home": "Home",
        "events": "Eventi",
        "blog": "Blog",
        "ariaLabel": "Percorso di navigazione"
      },
      "related": {
        "title": "Continua a esplorare",
        "items": {
          "templates": { "label": "Modelli di invito", "desc": "Modelli già pensati per il tuo tipo di evento, pronti da personalizzare." },
          "examples": { "label": "Esempi reali", "desc": "Inviti d'esempio da sfogliare per farti un'idea del risultato." },
          "rsvpGuide": { "label": "Guida RSVP", "desc": "Come raccogliere conferme, allergie e plus-one senza rincorrere nessuno." },
          "pricing": { "label": "Prezzi", "desc": "Gratis fino a 30 ospiti. Si paga una volta per evento, senza sorprese." },
          "howItWorks": { "label": "Come funziona", "desc": "Dal primo invito alla dashboard: i quattro passi di Ceremly." },
          "features": { "label": "Funzionalità", "desc": "Link personalizzati, promemoria automatici, export per il catering." },
          "eventsHub": { "label": "Tutti gli eventi", "desc": "Matrimoni, lauree, battesimi e compleanni: scegli il tuo." },
          "weddings": { "label": "Inviti per matrimonio", "desc": "Partecipazioni digitali con RSVP, menu e conferme in tempo reale." },
          "graduations": { "label": "Inviti per laurea", "desc": "Festeggia il traguardo senza gestire le conferme a mano." },
          "baptisms": { "label": "Inviti per battesimo", "desc": "Un invito curato per una giornata che resta in famiglia." },
          "birthdays": { "label": "Inviti per compleanno", "desc": "Feste senza caos: chi viene, chi porta chi, tutto in un colpo d'occhio." }
        }
      },
      "events": {
        "seoTitle": "Inviti digitali per ogni evento | Ceremly",
        "seoDescription": "Crea inviti digitali con RSVP per matrimoni, lauree, battesimi e compleanni. Link personalizzato per ospite, conferme in tempo reale, promemoria automatici.",
        "tag": "Eventi",
        "heroTitlePart1": "Ogni evento ha",
        "heroTitleMark": "il suo invito",
        "heroSub": "Ceremly crea inviti digitali con RSVP per matrimoni, lauree, battesimi e compleanni: un link personalizzato per ogni ospite, domande su menu e allergie, promemoria automatici e una dashboard che dice chi viene davvero. Scegli il tipo di evento e parti da un modello pensato per l'occasione.",
        "itemListName": "Tipi di evento supportati da Ceremly",
        "cards": {
          "matrimoni": { "title": "Matrimoni", "desc": "Partecipazioni digitali con RSVP, scelta del menu e gestione degli accompagnatori per il giorno più importante.", "cta": "Scopri gli inviti per matrimonio" },
          "lauree": { "title": "Lauree", "desc": "Invita amici e parenti alla proclamazione e alla festa, e sappi in anticipo chi ci sarà.", "cta": "Scopri gli inviti per laurea" },
          "battesimi": { "title": "Battesimi", "desc": "Un invito delicato per la cerimonia e il pranzo, con conferme ordinate per il ristorante.", "cta": "Scopri gli inviti per battesimo" },
          "compleanni": { "title": "Compleanni", "desc": "Dai 18 anni ai compleanni importanti: conferme, plus-one e nessun messaggio perso.", "cta": "Scopri gli inviti per compleanno" }
        },
        "planner": {
          "title": "Organizzi eventi per lavoro?",
          "desc": "Atelier è il piano per wedding ed event planner: eventi illimitati, workspace con il tuo logo e le conferme di tutti i clienti in un solo pannello.",
          "cta": "Ceremly per i planner"
        },
        "ctaSub": "Crea il tuo primo invito gratis: fino a 30 ospiti, nessuna carta richiesta."
      }
    }
  }
}
```

- [ ] **Step 3: Add the same keys to `i18n/locales/en-US.json`**

```json
{
  "ceremly": {
    "home": {
      "nav": {
        "forWho": "For whom",
        "allEvents": "All events"
      },
      "footer": {
        "cols": {
          "forWho": { "allEvents": "All events" },
          "resources": { "blog": "Blog" },
          "company": { "brandAssets": "Brand assets" }
        }
      }
    },
    "site": {
      "breadcrumb": {
        "home": "Home",
        "events": "Events",
        "blog": "Blog",
        "ariaLabel": "Breadcrumb navigation"
      },
      "related": {
        "title": "Keep exploring",
        "items": {
          "templates": { "label": "Invitation templates", "desc": "Templates designed for your event type, ready to customize." },
          "examples": { "label": "Real examples", "desc": "Browse sample invitations to see what you will get." },
          "rsvpGuide": { "label": "RSVP guide", "desc": "How to collect confirmations, allergies and plus-ones without chasing anyone." },
          "pricing": { "label": "Pricing", "desc": "Free up to 30 guests. Pay once per event, no surprises." },
          "howItWorks": { "label": "How it works", "desc": "From the first invitation to the dashboard: Ceremly in four steps." },
          "features": { "label": "Features", "desc": "Personal links, automatic reminders, catering export." },
          "eventsHub": { "label": "All events", "desc": "Weddings, graduations, christenings and birthdays: pick yours." },
          "weddings": { "label": "Wedding invitations", "desc": "Digital invitations with RSVP, menu choices and real-time confirmations." },
          "graduations": { "label": "Graduation invitations", "desc": "Celebrate the milestone without managing confirmations by hand." },
          "baptisms": { "label": "Christening invitations", "desc": "A refined invitation for a day that stays in the family." },
          "birthdays": { "label": "Birthday invitations", "desc": "Parties without chaos: who is coming, who brings whom, at a glance." }
        }
      },
      "events": {
        "seoTitle": "Digital invitations for every event | Ceremly",
        "seoDescription": "Create digital invitations with RSVP for weddings, graduations, christenings and birthdays. A personal link per guest, real-time confirmations, automatic reminders.",
        "tag": "Events",
        "heroTitlePart1": "Every event deserves",
        "heroTitleMark": "its own invitation",
        "heroSub": "Ceremly creates digital invitations with RSVP for weddings, graduations, christenings and birthdays: a personal link for every guest, menu and allergy questions, automatic reminders and a dashboard that tells you who is really coming. Pick your event type and start from a template designed for the occasion.",
        "itemListName": "Event types supported by Ceremly",
        "cards": {
          "matrimoni": { "title": "Weddings", "desc": "Digital invitations with RSVP, menu selection and plus-one management for the most important day.", "cta": "Explore wedding invitations" },
          "lauree": { "title": "Graduations", "desc": "Invite friends and family to the ceremony and the party, and know in advance who will be there.", "cta": "Explore graduation invitations" },
          "battesimi": { "title": "Christenings", "desc": "A gentle invitation for the ceremony and the lunch, with tidy confirmations for the restaurant.", "cta": "Explore christening invitations" },
          "compleanni": { "title": "Birthdays", "desc": "From 18th birthdays to milestone parties: confirmations, plus-ones and no lost messages.", "cta": "Explore birthday invitations" }
        },
        "planner": {
          "title": "Organizing events for a living?",
          "desc": "Atelier is the plan for wedding and event planners: unlimited events, a workspace with your logo and every client confirmation in one panel.",
          "cta": "Ceremly for planners"
        },
        "ctaSub": "Create your first invitation for free: up to 30 guests, no card required."
      }
    }
  }
}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/locales/it-IT.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/en-US.json','utf8')); console.log('json ok')"`
Expected: `json ok`

Run: `grep -c '@' i18n/locales/it-IT.json` — compare with the count BEFORE your edit (run it first): must be unchanged (no `@` introduced).

- [ ] **Step 5: Commit**

```bash
git add app/data/siteArchitecture.ts i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "feat(site): IA data source and i18n keys for site architecture"
```

---

### Task 2: Breadcrumb (composable + component + rollout)

**Files:**
- Create: `app/composables/useSiteBreadcrumb.ts`
- Create: `app/components/ceremly/CerBreadcrumb.vue`
- Modify: `app/layouts/public-site.vue`
- Modify: `app/pages/legal/tos.vue`, `legal/privacy.vue`, `legal/cookie.vue`, `legal/dpa.vue`, `legal/subprocessors.vue`
- Modify: `app/pages/blogs/index.vue`, `app/pages/blogs/[slug].vue`

**Interfaces:**
- Consumes: `SITE_BREADCRUMB_TRAILS`, `stripLocalePrefix` from Task 1.
- Produces: `useSiteBreadcrumb(explicit?: MaybeRefOrGetter<SiteBreadcrumbItem[] | null>): { items: ComputedRef<SiteBreadcrumbItem[]> }` with `SiteBreadcrumbItem = { label: string; to?: string }` (`to` = locale-less path); `<CerBreadcrumb :trail="SiteBreadcrumbItem[]" />` (trail optional — omitted means resolve from map).

- [ ] **Step 1: Create `app/composables/useSiteBreadcrumb.ts`**

```ts
import type { MaybeRefOrGetter } from 'vue'
import { SITE_BREADCRUMB_TRAILS, stripLocalePrefix } from '~/data/siteArchitecture'

export interface SiteBreadcrumbItem {
    /** Already-translated label */
    label: string
    /** Locale-less path; localePath is applied here. Omit on the current page. */
    to?: string
}

/**
 * Visible breadcrumb + BreadcrumbList schema from ONE source.
 * Trail resolves from SITE_BREADCRUMB_TRAILS by route path; pass `explicit`
 * for dynamic pages (blog post title). Home is always prepended.
 * Call once per page (CerBreadcrumb does it — never call both).
 */
export function useSiteBreadcrumb(explicit?: MaybeRefOrGetter<SiteBreadcrumbItem[] | null>) {
    const route = useRoute()
    const { t } = useI18n()
    const localePath = useLocalePath()

    const items = computed<SiteBreadcrumbItem[]>(() => {
        const explicitVal = toValue(explicit)
        const trail: SiteBreadcrumbItem[] = explicitVal
            ?? (SITE_BREADCRUMB_TRAILS[stripLocalePrefix(route.path)] || [])
                .map(e => ({ label: t(e.labelKey), to: e.to }))
        if (!trail.length) return []
        return [
            { label: t('ceremly.site.breadcrumb.home'), to: '/' },
            ...trail,
        ].map(e => ({ label: e.label, to: e.to ? localePath(e.to) : undefined }))
    })

    useSchemaOrg([
        defineBreadcrumb({
            itemListElement: computed(() =>
                items.value.map(i => (i.to ? { name: i.label, item: i.to } : { name: i.label })),
            ),
        }),
    ])

    return { items }
}
```

- [ ] **Step 2: Create `app/components/ceremly/CerBreadcrumb.vue`**

```vue
<script setup lang="ts">
// Visible breadcrumb for public pages. Trail auto-resolves from
// SITE_BREADCRUMB_TRAILS; pass `trail` for dynamic pages (blog posts).
// Renders nothing on unmapped routes.
import type { SiteBreadcrumbItem } from '~/composables/useSiteBreadcrumb'

const props = defineProps<{ trail?: SiteBreadcrumbItem[] }>()
const { t } = useI18n()
const { items } = useSiteBreadcrumb(() => props.trail ?? null)
</script>

<template>
    <nav v-if="items.length" class="cer-breadcrumb" :aria-label="t('ceremly.site.breadcrumb.ariaLabel')">
        <ol>
            <li v-for="(it, i) in items" :key="`${it.label}-${i}`">
                <NuxtLink v-if="it.to && i < items.length - 1" :to="it.to">{{ it.label }}</NuxtLink>
                <span v-else aria-current="page">{{ it.label }}</span>
            </li>
        </ol>
    </nav>
</template>

<style scoped>
.cer-breadcrumb {
    max-width: 1400px;
    margin: 0 auto;
    padding: 14px var(--site-pad-x, clamp(20px, 5vw, 72px)) 0;
}

.cer-breadcrumb ol {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 13px;
    color: var(--ink-500);
}

.cer-breadcrumb li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.cer-breadcrumb li + li::before {
    content: '›';
    color: var(--ink-300);
}

.cer-breadcrumb a {
    color: var(--ink-500);
    text-decoration: none;
}

.cer-breadcrumb a:hover {
    color: var(--ink);
}

.cer-breadcrumb span[aria-current='page'] {
    color: var(--ink-700);
}
</style>
```

- [ ] **Step 3: Mount in `app/layouts/public-site.vue`**

Add the import and render before the slot:

```vue
<script setup lang="ts">
// Layout for public site sub-pages (Product · For whom · Resources ·
// Ceremly). Shared nav + content + footer. Content goes inside .l-wrap
// (max-width 1400 centred) in each individual page.
import CerSiteNav from '~/components/ceremly/CerSiteNav.vue'
import CerSiteFooter from '~/components/ceremly/CerSiteFooter.vue'
import CerBreadcrumb from '~/components/ceremly/CerBreadcrumb.vue'
</script>

<template>
    <div class="cer cer-site">
        <CerSiteNav />
        <main>
            <CerBreadcrumb />
            <slot />
        </main>
        <CerSiteFooter />
    </div>
</template>
```

(Keep the existing `<style scoped>` block unchanged.)

- [ ] **Step 4: Migrate the 5 legal pages**

In EACH of `app/pages/legal/{tos,privacy,cookie,dpa,subprocessors}.vue`:

1. In the `useSchemaOrg([...])` call, DELETE the `defineBreadcrumb({ itemListElement: [...] })` entry (keep all other nodes). If `defineBreadcrumb` was the only node, delete the whole `useSchemaOrg` call.
2. In the template, insert as first child of the innermost content container (`<UContainer>`):

```html
<CerBreadcrumb :trail="[{ label: seoTitle }]" />
```

Note: each legal page already defines a `seoTitle` (or equivalent const holding the page title) — reuse that exact variable name per file; if a file names it differently, use its title const.

- [ ] **Step 5: Migrate blog pages**

`app/pages/blogs/index.vue` — insert at the top of the page content container:

```html
<CerBreadcrumb :trail="[{ label: t('ceremly.site.breadcrumb.blog') }]" />
```

`app/pages/blogs/[slug].vue`:
1. DELETE the manual `defineBreadcrumb({...})` entry (around line 120) from its `useSchemaOrg([...])` array — keep the other nodes (Article etc.).
2. Insert at the top of the article content container (above the title):

```html
<CerBreadcrumb :trail="[{ label: t('ceremly.site.breadcrumb.blog'), to: '/blogs' }, { label: post?.title || '' }]" />
```

Note: use the actual post data variable in that file (it may be named `post`, `page`, or `data` — check the file; reference its `.title`).

- [ ] **Step 6: Verify**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `pnpm build`
Expected: green (the `sharp-wasm32` error is pre-existing and acceptable).

Run: `grep -c 'BreadcrumbList' .output/public/weddings/index.html && grep -c 'BreadcrumbList' .output/public/legal/privacy/index.html`
Expected: exactly `1` on each (no duplicate schema on legal pages).

Run: `grep -o '"itemListElement".\{0,200\}' .output/public/weddings/index.html | head -1`
Expected: contains `Eventi` and `/events` (3-level trail Home > Eventi > Matrimoni).

- [ ] **Step 7: Commit**

```bash
git add app/composables/useSiteBreadcrumb.ts app/components/ceremly/CerBreadcrumb.vue app/layouts/public-site.vue app/pages/legal app/pages/blogs
git commit -m "feat(site): visible breadcrumbs with unified BreadcrumbList schema"
```

---

### Task 3: `/events` hub page

**Files:**
- Create: `app/pages/events.vue`
- Modify: `nuxt.config.ts` (routeRules)
- Modify: `scripts/generate-og.mjs`

**Interfaces:**
- Consumes: i18n keys `ceremly.site.events.*` (Task 1); `CerSiteHero`, `CerSiteCTA`, `CerMark`, `CerIcon` (existing); breadcrumb arrives via layout (Task 2).
- Produces: route `/events` + `/en/events`, target of nav/footer/related links in Tasks 4–6.

- [ ] **Step 1: Create `app/pages/events.vue`**

```vue
<script setup lang="ts">
// Public site → Events hub. Lists the supported event types and routes
// visitors to the per-event pages (logical hub, spec 2026-07-11).
import CerSiteHero from '~/components/ceremly/CerSiteHero.vue'
import CerSiteCTA from '~/components/ceremly/CerSiteCTA.vue'
import CerMark from '~/components/ceremly/CerMark.vue'
import CerIcon from '~/components/ceremly/CerIcon.vue'

definePageMeta({ layout: 'public-site', auth: false })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const runtimeConfig = useRuntimeConfig()
const baseUrl = ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '')

const seoTitle = t('ceremly.site.events.seoTitle')
const seoDescription = t('ceremly.site.events.seoDescription')
useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: () => `${baseUrl}/og/events-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    twitterImage: () => `${baseUrl}/og/events-${locale.value.startsWith('it') ? 'it' : 'en'}.png`,
    ogType: 'website',
})
useAltHreflang()

interface EventCard { key: string, to: string, icon: string, c: string }
const cards: EventCard[] = [
    { key: 'matrimoni', to: '/weddings', icon: 'ring', c: 'var(--purple)' },
    { key: 'lauree', to: '/graduations', icon: 'cap', c: 'var(--orange)' },
    { key: 'battesimi', to: '/baptisms', icon: 'cross', c: 'var(--blue)' },
    { key: 'compleanni', to: '/birthdays', icon: 'cake', c: 'var(--confirm)' },
]

useSchemaOrg([
    {
        '@type': 'ItemList',
        name: t('ceremly.site.events.itemListName'),
        itemListElement: cards.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: t(`ceremly.site.events.cards.${c.key}.title`),
            url: `${baseUrl}${localePath(c.to)}`,
        })),
    },
])
</script>

<template>
    <div>
        <CerSiteHero :tag="t('ceremly.site.events.tag')" center>
            <template #title>
                {{ t('ceremly.site.events.heroTitlePart1') }}<br>
                <CerMark c="var(--orange)">{{ t('ceremly.site.events.heroTitleMark') }}</CerMark>
            </template>
            <template #sub>{{ t('ceremly.site.events.heroSub') }}</template>
        </CerSiteHero>

        <section class="l-wrap ev-grid-section">
            <div class="ev-grid">
                <NuxtLink v-for="c in cards" :key="c.key" :to="localePath(c.to)" class="ev-card">
                    <span class="ev-card-icon" :style="{ color: c.c }"><CerIcon :name="c.icon" :s="22" /></span>
                    <h2 class="serif ev-card-title">{{ t(`ceremly.site.events.cards.${c.key}.title`) }}</h2>
                    <p class="ev-card-desc">{{ t(`ceremly.site.events.cards.${c.key}.desc`) }}</p>
                    <span class="ev-card-cta">{{ t(`ceremly.site.events.cards.${c.key}.cta`) }} →</span>
                </NuxtLink>
            </div>

            <div class="ev-planner">
                <div>
                    <h2 class="serif ev-planner-title">{{ t('ceremly.site.events.planner.title') }}</h2>
                    <p class="ev-planner-desc">{{ t('ceremly.site.events.planner.desc') }}</p>
                </div>
                <NuxtLink :to="localePath('/wedding-planner')" class="cer-btn ghost">{{ t('ceremly.site.events.planner.cta') }}</NuxtLink>
            </div>
        </section>

        <CerSiteCTA :sub="t('ceremly.site.events.ctaSub')" />
    </div>
</template>

<style scoped>
.ev-grid-section {
    padding: 56px var(--site-pad-x, clamp(20px, 5vw, 72px)) 64px;
}

.ev-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 20px;
}

.ev-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 28px 26px;
    background: var(--bone-50);
    border: 1px solid var(--line);
    border-radius: 16px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s ease, transform 0.15s ease;
}

.ev-card:hover {
    border-color: var(--ink);
    transform: translateY(-2px);
}

.ev-card-title {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0;
}

.ev-card-desc {
    font-size: 14px;
    line-height: 1.55;
    color: var(--ink-700);
    margin: 0;
    flex: 1;
}

.ev-card-cta {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
}

.ev-planner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
    margin-top: 40px;
    padding: 28px 26px;
    background: var(--bone-100);
    border: 1px solid var(--line);
    border-radius: 16px;
}

.ev-planner-title {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0;
}

.ev-planner-desc {
    font-size: 14px;
    color: var(--ink-700);
    line-height: 1.55;
    max-width: 560px;
    margin: 8px 0 0;
}
</style>
```

Note: `CerRelatedLinks` (created in Task 6) is intentionally absent here — Task 6 Step 4 adds its import and tag to this page.

- [ ] **Step 2: Check the icons exist**

Run: `grep -n "ring\|cap\|cake\|cross" app/components/ceremly/CerIcon.vue | head`
Expected: the four names appear as icon keys. If any is missing, check `scripts/generate-og.mjs` lines 40-56 for the SVG paths of `ring`/`cap`/`cake`/`cross` and add the missing ones to `CerIcon.vue` following its existing structure.

- [ ] **Step 3: Add routeRules in `nuxt.config.ts`**

After the `"/en/examples": { prerender: true },` line (~line 113), insert:

```ts
        "/events": { prerender: true },
        "/en/events": { prerender: true },
```

- [ ] **Step 4: Add the OG route to `scripts/generate-og.mjs`**

In the `ROUTES` array, after the `examples` entry, add:

```js
    { slug: 'events', cat: 'perchi', title: { it: 'Inviti per ogni evento', en: 'Invitations for every event' }, desc: 'ceremly.site.events.seoDescription', tag: { it: 'Eventi', en: 'Events' }, icon: 'sparkle' },
```

Run: `pnpm og:generate`
Expected: regenerates images including `public/og/events-it.png` and `public/og/events-en.png`.

Run: `ls -la public/og/events-it.png public/og/events-en.png`
Expected: both files exist, non-zero size.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `pnpm build`
Expected: green.

Run: `ls .output/public/events/index.html .output/public/en/events/index.html`
Expected: both exist.

Run: `grep -o 'hreflang="[^"]*"' .output/public/events/index.html | sort -u`
Expected: `hreflang="en-US"`, `hreflang="it-IT"`, `hreflang="x-default"`.

Run: `grep -o '<link rel="canonical"[^>]*>' .output/public/events/index.html`
Expected: self-referencing canonical ending in `/events`.

Run: `grep -c 'ItemList' .output/public/events/index.html`
Expected: ≥ 1.

Run: `grep -o '<title>[^<]*</title>' .output/public/events/index.html`
Expected: `<title>Inviti digitali per ogni evento | Ceremly</title>`.

- [ ] **Step 6: Commit**

```bash
git add app/pages/events.vue nuxt.config.ts scripts/generate-og.mjs public/og/events-it.png public/og/events-en.png
git commit -m "feat(site): /events hub page with ItemList schema and OG image"
```

---

### Task 4: "Per chi" nav dropdown (CerSiteNav + homepage)

**Files:**
- Create: `app/components/ceremly/CerNavForWho.vue`
- Modify: `app/components/ceremly/CerSiteNav.vue`
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes: `FOR_WHO_LINKS`, `FOR_WHO_PLANNER` from Task 1; route `/events` from Task 3.
- Produces: `<CerNavForWho />` (no props) — used in both navs.

- [ ] **Step 1: Create `app/components/ceremly/CerNavForWho.vue`**

```vue
<script setup lang="ts">
// "Per chi" dropdown for desktop navs: events hub + event pages + planner.
// Click toggles; closes on Esc, outside click, and route change.
import { FOR_WHO_LINKS, FOR_WHO_PLANNER } from '~/data/siteArchitecture'

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

watch(() => route.fullPath, () => { open.value = false })

function onDocClick(e: MouseEvent) {
    if (root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
    <div ref="root" class="cer-forwho" @keydown.esc="open = false">
        <button
            type="button"
            class="cer-forwho-btn"
            :aria-expanded="open"
            aria-haspopup="true"
            aria-controls="cer-forwho-menu"
            @click="open = !open"
        >
            {{ t('ceremly.home.nav.forWho') }}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true" :style="{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div v-show="open" id="cer-forwho-menu" class="cer-forwho-menu">
            <NuxtLink v-for="l in FOR_WHO_LINKS" :key="l.to" :to="localePath(l.to)" class="cer-forwho-item">{{ t(l.labelKey) }}</NuxtLink>
            <div class="cer-forwho-divider" role="separator" />
            <NuxtLink :to="localePath(FOR_WHO_PLANNER.to)" class="cer-forwho-item">{{ t(FOR_WHO_PLANNER.labelKey) }}</NuxtLink>
        </div>
    </div>
</template>

<style scoped>
.cer-forwho {
    position: relative;
    display: inline-flex;
}

.cer-forwho-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
}

.cer-forwho-btn:hover {
    color: var(--ink);
}

.cer-forwho-menu {
    position: absolute;
    top: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 220px;
    display: flex;
    flex-direction: column;
    padding: 8px;
    background: var(--bone-50);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
    z-index: 20;
}

.cer-forwho-item {
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: var(--ink-700);
    text-decoration: none;
    white-space: nowrap;
}

.cer-forwho-item:hover {
    background: var(--bone-100);
    color: var(--ink);
}

.cer-forwho-divider {
    height: 1px;
    background: var(--line);
    margin: 6px 4px;
}
</style>
```

- [ ] **Step 2: Rework `app/components/ceremly/CerSiteNav.vue`**

Replace the `<script setup>` block's `links` computed and the desktop/mobile navs:

Script — replace

```ts
const links = computed(() => [
    { to: localePath('/how-it-works'), label: t('ceremly.home.nav.howItWorks') },
    { to: localePath('/features'), label: t('ceremly.home.nav.features') },
    { to: localePath('/pricing'), label: t('ceremly.home.nav.pricing') },
    { to: localePath('/examples'), label: t('ceremly.home.nav.examples') },
])
```

with

```ts
import CerNavForWho from '~/components/ceremly/CerNavForWho.vue'
import { FOR_WHO_LINKS, FOR_WHO_PLANNER } from '~/data/siteArchitecture'

// Desktop: first two links, then the "Per chi" dropdown, then the rest.
const leadLinks = computed(() => [
    { to: localePath('/how-it-works'), label: t('ceremly.home.nav.howItWorks') },
    { to: localePath('/features'), label: t('ceremly.home.nav.features') },
])
const tailLinks = computed(() => [
    { to: localePath('/pricing'), label: t('ceremly.home.nav.pricing') },
    { to: localePath('/examples'), label: t('ceremly.home.nav.examples') },
])
const forWhoLinks = computed(() =>
    [...FOR_WHO_LINKS, FOR_WHO_PLANNER].map(l => ({ to: localePath(l.to), label: t(l.labelKey) })),
)
```

Desktop nav — replace the single `v-for="l in links"` loop with:

```html
<nav class="row cer-site-nav-links" style="gap: 32px; font-size: 14px; color: var(--ink-700); font-weight: 500;" :aria-label="t('ceremly.home.nav.ariaLabel')">
    <NuxtLink v-for="l in leadLinks" :key="l.to" :to="l.to" class="cer-site-anchor">{{ l.label }}</NuxtLink>
    <CerNavForWho />
    <NuxtLink v-for="l in tailLinks" :key="l.to" :to="l.to" class="cer-site-anchor">{{ l.label }}</NuxtLink>
</nav>
```

Mobile panel — replace the `v-for="l in links"` loop with:

```html
<NuxtLink v-for="l in [...leadLinks, ...tailLinks]" :key="l.to" :to="l.to" class="cer-site-mobile-link">{{ l.label }}</NuxtLink>
<div class="cer-site-mobile-group mono">{{ t('ceremly.home.nav.forWho') }}</div>
<NuxtLink v-for="l in forWhoLinks" :key="l.to" :to="l.to" class="cer-site-mobile-link">{{ l.label }}</NuxtLink>
```

Add to the `<style scoped>` block:

```css
.cer-site-mobile-group {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-400);
    padding: 16px 4px 4px;
}
```

- [ ] **Step 3: Homepage nav → real page links**

In `app/pages/index.vue`:

1. Add imports/composables if missing in `<script setup>`:

```ts
import CerNavForWho from '~/components/ceremly/CerNavForWho.vue'
const localePath = useLocalePath()
```

(Check first — `localePath` may already be defined; do not redeclare.)

2. Replace the `navAnchors` const (~line 128) with:

```ts
// Nav now points to real pages (homepage internal links are the strongest
// on the site — anchors pass no signal). Landing sections keep in-page CTAs.
const navPages = [
    { to: '/how-it-works', label: t('ceremly.home.nav.howItWorks') },
    { to: '/features', label: t('ceremly.home.nav.features') },
]
const navPagesTail = [
    { to: '/pricing', label: t('ceremly.home.nav.pricing') },
    { to: '/examples', label: t('ceremly.home.nav.examples') },
]
```

3. Replace the nav template block (the `<a v-for="a in navAnchors" ...>` loop, ~line 174-180) with:

```html
<nav class="row l-nav-links" style="gap: 32px; font-size: 14px; color: var(--ink-700); font-weight: 500;" :aria-label="$t('ceremly.home.nav.ariaLabel')">
    <NuxtLink v-for="a in navPages" :key="a.to" :to="localePath(a.to)" class="l-anchor">{{ a.label }}</NuxtLink>
    <CerNavForWho />
    <NuxtLink v-for="a in navPagesTail" :key="a.to" :to="localePath(a.to)" class="l-anchor">{{ a.label }}</NuxtLink>
</nav>
```

4. Keep `scrollToId` — it is still used by the waitlist CTA (`scrollToWaitlist`/`scrollToId('waiting-list')`). If after the change `scrollToId` has no remaining callers, remove it (check with grep).

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `pnpm build`
Expected: green.

Run: `grep -c 'href="/events"' .output/public/index.html && grep -c 'href="/en/events"' .output/public/en/index.html`
Expected: ≥ 1 on both (dropdown links prerendered on the homepage, correct locale prefix).

Run: `grep -c 'href="/weddings"' .output/public/pricing/index.html`
Expected: ≥ 1 (dropdown present on sub-pages).

- [ ] **Step 5: Commit**

```bash
git add app/components/ceremly/CerNavForWho.vue app/components/ceremly/CerSiteNav.vue app/pages/index.vue
git commit -m "feat(site): 'Per chi' nav dropdown; homepage nav links to real pages"
```

---

### Task 5: Footer additions

**Files:**
- Modify: `app/components/ceremly/CerSiteFooter.vue`

**Interfaces:**
- Consumes: i18n keys from Task 1 (`allEvents`, `blog`, `brandAssets`); route `/events` from Task 3.

- [ ] **Step 1: Edit the `footerCols` computed**

In `app/components/ceremly/CerSiteFooter.vue`:

1. **"Per chi" column** — prepend as first item:

```ts
{ label: t('ceremly.home.nav.allEvents'), to: localePath('/events') },
```

2. **"Risorse" column** — add after the `rsvpGuide` item:

```ts
{ label: t('ceremly.home.footer.cols.resources.blog'), to: localePath('/blogs') },
```

(The blog was reachable ONLY from the legacy landing header — this de-orphans it in the shared footer.)

3. **"Ceremly" column** — add after the `contact` item:

```ts
{ label: t('ceremly.home.footer.cols.company.brandAssets'), to: localePath('/brand') },
```

(De-orphans `/brand` — currently zero inbound internal links.)

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: green.

Run: `grep -c 'href="/brand"' .output/public/about/index.html && grep -c 'href="/blogs"' .output/public/about/index.html && grep -c 'href="/events"' .output/public/about/index.html`
Expected: ≥ 1 each (footer rendered on every public-site page).

- [ ] **Step 3: Commit**

```bash
git add app/components/ceremly/CerSiteFooter.vue
git commit -m "feat(site): footer links to events hub, blog and brand assets"
```

---

### Task 6: CerRelatedLinks + rollout

**Files:**
- Create: `app/components/ceremly/CerRelatedLinks.vue`
- Modify: `app/components/ceremly/CerUseCase.vue`
- Modify: `app/pages/events.vue`, `app/pages/features.vue`, `app/pages/templates.vue`, `app/pages/examples.vue`, `app/pages/pricing.vue`, `app/pages/rsvp-guide.vue`
- Modify: `app/pages/blogs/[slug].vue`

**Interfaces:**
- Consumes: `SITE_RELATED_LINKS`, `stripLocalePrefix` from Task 1; i18n `ceremly.site.related.*`.
- Produces: `<CerRelatedLinks />` (auto-resolves from map by route) and `<CerRelatedLinks :links="[{ label, desc, to }]" />` (explicit, for dynamic pages).

- [ ] **Step 1: Create `app/components/ceremly/CerRelatedLinks.vue`**

```vue
<script setup lang="ts">
// Contextual internal links ("Continua a esplorare"). Auto-resolves the
// card list from SITE_RELATED_LINKS by route path; pass `links` to override
// (dynamic pages). Renders nothing when no entry exists.
import { SITE_RELATED_LINKS, stripLocalePrefix } from '~/data/siteArchitecture'

interface ResolvedRelatedLink { label: string, desc: string, to: string }

const props = defineProps<{ links?: ResolvedRelatedLink[] }>()
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const items = computed<ResolvedRelatedLink[]>(() => {
    if (props.links) return props.links.map(l => ({ ...l, to: localePath(l.to) }))
    return (SITE_RELATED_LINKS[stripLocalePrefix(route.path)] || [])
        .map(e => ({ label: t(e.labelKey), desc: t(e.descKey), to: localePath(e.to) }))
})
</script>

<template>
    <section v-if="items.length" class="cer-related">
        <div class="cer-related-wrap">
            <h2 class="serif cer-related-title">{{ t('ceremly.site.related.title') }}</h2>
            <div class="cer-related-grid">
                <NuxtLink v-for="it in items" :key="it.to" :to="it.to" class="cer-related-card">
                    <span class="cer-related-label">{{ it.label }}</span>
                    <span class="cer-related-desc">{{ it.desc }}</span>
                    <span class="cer-related-arrow" aria-hidden="true">→</span>
                </NuxtLink>
            </div>
        </div>
    </section>
</template>

<style scoped>
.cer-related {
    border-top: 1px solid var(--line);
    background: var(--bone);
}

.cer-related-wrap {
    max-width: 1400px;
    margin: 0 auto;
    padding: 56px var(--site-pad-x, clamp(20px, 5vw, 72px)) 64px;
}

.cer-related-title {
    font-size: clamp(24px, 3vw, 32px);
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0 0 24px;
}

.cer-related-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
}

.cer-related-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 18px 16px;
    background: var(--bone-50);
    border: 1px solid var(--line);
    border-radius: 12px;
    color: inherit;
    text-decoration: none;
    transition: border-color 0.15s ease;
}

.cer-related-card:hover {
    border-color: var(--ink);
}

.cer-related-label {
    font-size: 15px;
    font-weight: 700;
}

.cer-related-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--ink-700);
    flex: 1;
}

.cer-related-arrow {
    font-size: 14px;
    color: var(--ink-500);
}
</style>
```

- [ ] **Step 2: Mount in `app/components/ceremly/CerUseCase.vue`**

Covers the 4 event pages (+ planner, which has no map entry → renders nothing). Add the import:

```ts
import CerRelatedLinks from '~/components/ceremly/CerRelatedLinks.vue'
```

In the template, insert `<CerRelatedLinks />` immediately BEFORE the `<CerSiteCTA ...>` element (~line 154).

- [ ] **Step 3: Mount on product pages**

In each of `app/pages/{features,templates,examples,pricing,rsvp-guide}.vue`: add the same import and insert `<CerRelatedLinks />` immediately before the page's `<CerSiteCTA ...>` element. If a page has no `CerSiteCTA`, insert as the last element of the template's root `<div>`.

- [ ] **Step 4: Mount on `/events` and blog posts**

`app/pages/events.vue` (deferred from Task 3): add the `CerRelatedLinks` import and insert `<CerRelatedLinks />` between the closing `</section>` of the grid and `<CerSiteCTA ...>`.

`app/pages/blogs/[slug].vue`: add the import and insert at the end of the article content (after the content body, before any footer/CTA):

```html
<CerRelatedLinks :links="[
    { label: t('ceremly.site.related.items.rsvpGuide.label'), desc: t('ceremly.site.related.items.rsvpGuide.desc'), to: '/rsvp-guide' },
    { label: t('ceremly.site.related.items.eventsHub.label'), desc: t('ceremly.site.related.items.eventsHub.desc'), to: '/events' },
]" />
```

(Spec asks for "rsvp-guide + 1 pertinent event page" — the 2 current posts are generic how-to-start guides, so the events hub is the pertinent target. When future posts are event-specific, swap the second link per-post.)

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm build`
Expected: green.

Run: `grep -c 'cer-related' .output/public/weddings/index.html && grep -c 'href="/rsvp-guide"' .output/public/weddings/index.html`
Expected: ≥ 1 each.

Run: `grep -c 'cer-related' .output/public/wedding-planner/index.html`
Expected: `0` (planner has no map entry; grep exits 1 — that is the expected outcome).

Run: `grep -c 'href="/events"' .output/public/features/index.html`
Expected: ≥ 1 (related card, besides nav/footer).

- [ ] **Step 6: Commit**

```bash
git add app/components/ceremly/CerRelatedLinks.vue app/components/ceremly/CerUseCase.vue app/pages
git commit -m "feat(site): contextual related links across public pages"
```

---

### Task 7: Final verification (link audit + full suite)

**Files:**
- None created. Fixes only if audit finds issues.

- [ ] **Step 1: Full checks**

Run: `pnpm typecheck`
Expected: 0 errors.

Run: `pnpm test`
Expected: all pass (~140 tests, none touched by this plan).

Run: `pnpm build`
Expected: green.

- [ ] **Step 2: Internal link audit on prerendered output**

Broken-link check — every internal href must resolve to a prerendered page (or a known CSR route):

```bash
node -e "
const fs = require('fs'), path = require('path');
const root = '.output/public';
const known = new Set(['/login','/signup','/logout','/dashboard','/contact','/maintenance']);
const htmls = [];
(function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); const s = fs.statSync(p); s.isDirectory() ? walk(p) : f.endsWith('.html') && htmls.push(p); } })(root);
const missing = new Set();
for (const h of htmls) {
  const src = fs.readFileSync(h,'utf8');
  for (const m of src.matchAll(/href=\"(\/[a-z0-9-\/]*)\"/g)) {
    const u = m[1].replace(/\/$/,'') || '/';
    if (u.startsWith('/og') || u.startsWith('/_') || u.startsWith('/api')) continue;
    if (known.has(u.replace(/^\/en/,'') || '/')) continue;
    const cand = [path.join(root,u,'index.html'), path.join(root,u)+'.html', path.join(root, u==='/' ? 'index.html' : '')].filter(Boolean);
    if (!cand.some(c => { try { return fs.statSync(c).isFile(); } catch { return false; } })) missing.add(u);
  }
}
console.log(missing.size ? ['MISSING:',...missing].join('\n') : 'no broken internal links');
"
```

Expected: `no broken internal links` (CSR-only routes like `/dashboard`, `/login` are excluded via `known`; add legitimate CSR routes there if flagged, investigate anything else).

- [ ] **Step 3: Orphan check**

Confirm previously orphaned pages now have inbound links:

```bash
grep -c 'href="/brand"' .output/public/index.html
grep -c 'href="/blogs"' .output/public/index.html
grep -rl 'href="/events"' .output/public --include=index.html | wc -l
```

Expected: first two ≥ 1; third ≥ 20 (nav dropdown + footer on every public page).

- [ ] **Step 4: Schema spot-checks**

```bash
grep -c 'BreadcrumbList' .output/public/baptisms/index.html   # expected: 1
grep -c 'BreadcrumbList' .output/public/legal/tos/index.html  # expected: 1 (no duplicates)
grep -c 'ItemList' .output/public/events/index.html           # expected: >= 1
```

- [ ] **Step 5: Manual smoke check (browser)**

Run `pnpm dev` and verify by hand:
- Dropdown "Per chi": opens on click, closes on Esc / outside click / navigation; keyboard focus reaches all items.
- Mobile (viewport < 1024px): hamburger shows the "Per chi" group with 6 flat links.
- Breadcrumb visible on `/weddings` (Home › Eventi › Matrimoni), links work; NOT shown on `/`.
- `/events` renders: hero, 4 cards, planner band, related links, CTA.
- Homepage nav links navigate to the real pages in both IT and EN (`/en`).

- [ ] **Step 6: Commit any audit fixes**

```bash
git add -A && git commit -m "fix(site): link audit fixes"   # only if fixes were needed
```

---

## Deviations requiring spec awareness

- **Footer `/confronta` link**: spec conditions it on comparison pages being live — they are not. The ai-seo plan adds it when shipping `/confronta`.
- **Footer Blog link**: added (not in the spec's footer table) — the blog turned out to be orphaned from the shared nav/footer, and the spec's orphan rule ("every page ≥1 inbound link") takes precedence.
- **Blog post related links**: statically rsvp-guide + events hub (spec says "1 pertinent event page") — current 2 posts are generic; revisit per-post when event-specific posts exist.
