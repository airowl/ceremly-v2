# Schema Markup Audit & Fix — Design

*Date: 2026-07-11 · Status: approved · Owner: airowl*

Brainstormed via `superpowers:brainstorming`, guided by the `marketing-skills:schema`
skill (structured data / JSON-LD / schema.org). This is an **audit + fix** of the
existing schema markup on the Ceremly public site, plus the net-new schema types
that unlock rich results not yet used.

## Goal

Bring Ceremly's structured data to full, accurate coverage: fix the defects in the
existing schema, and add the missing types (BreadcrumbList on marketing pages,
FAQPage, HowTo) that make pages eligible for richer Google results — without
marking up any content that does not exist on the page.

Business value: more SERP real estate (FAQ rich snippets, breadcrumb trails, HowTo)
and better machine-readability for AI search, at zero new dependencies and no
DB/backend change.

## Constraints & Principles

- **Accuracy first.** Only mark up content that is actually rendered and visible on
  the page. No invented ratings, no boilerplate FAQ, no forced HowTo.
- **Follow the existing pattern.** The codebase uses `nuxt-schema-org` (via
  `@nuxtjs/seo`): `useSchemaOrg([define*()])` per page, identity in `nuxt.config.ts`.
  No hand-written JSON-LD. All new schema follows this convention.
- **No fake social proof.** No `aggregateRating` / `Review` — there is no real review
  data, and fake proof was already purged from the site (do not reintroduce it).
- **Locale-aware.** Breadcrumb/FAQ use `localePath` and the correct `inLanguage`
  (it-IT / en-US), mirroring `blogs/[slug].vue`.
- **YAGNI.** No Event, LocalBusiness, or Review schema (see Out of Scope).

## Current State (audit result)

Stack: `@nuxtjs/seo` → `nuxt-schema-org`. Identity (`Organization`) declared globally
in `nuxt.config.ts` under `schemaOrg.identity`; `WebSite` in `app/app.vue`.

Already implemented:

| Type | Location | State |
|------|----------|-------|
| Organization + WebSite | `nuxt.config.ts` identity + `app.vue` | OK, but `logo: /icon.png` is a relative path |
| SoftwareApplication + AggregateOffer | `app/pages/index.vue` | OK, improvable |
| Product + 3 Offer | `app/pages/pricing.vue` | Good (prices from `shared/constants/pricing.ts`) |
| BlogPosting + Breadcrumb | `app/pages/blogs/[slug].vue` | OK — reference pattern |
| Breadcrumb | 5 legal pages (`app/pages/legal/*.vue`) | OK |

Defects found:

1. `schemaOrg.identity.logo` is a relative path (`/icon.png`); schema.org expects a
   fully-qualified URL.
2. `BreadcrumbList` is **missing** on ~11 marketing pages (only legal pages + blog
   have it).
3. `FAQPage` is **never used**, despite real, rendered Q&A content on `pricing.vue`.
4. `HowTo` is **never used**, despite 4 real sequential steps on `how-it-works.vue`.
5. `SoftwareApplication` on the home page carries only a generic `AggregateOffer`,
   not the 3 real offers.

## Approach

Considered three approaches:

- **A. Centralized components/composables** for every schema type — DRY, but abstracts
  a pattern the rest of the codebase deliberately keeps inline per page.
- **B. Inline per page, following the existing pattern (CHOSEN).** Consistent with how
  blog/legal pages already declare schema; each page owns its schema; no new
  abstraction to maintain. The one exception is a minimal breadcrumb helper, because
  the Home › Page shape would otherwise repeat ~11 times identically.
- **C. Config-only (global).** Cannot cover breadcrumb/FAQ, which are per-page.
  Insufficient.

**Decision: B.** It respects the codebase convention (the skill says "follow existing
patterns") and avoids over-engineering.

## Interventions

| # | Type | File(s) | New/Fix |
|---|------|---------|---------|
| 1 | Organization | `nuxt.config.ts` | fix logo → absolute URL |
| 2 | BreadcrumbList | 11 pages + new helper | new |
| 3 | FAQPage | `pricing.vue` | new |
| 4 | HowTo | `how-it-works.vue` | new |
| 5 | SoftwareApplication | `index.vue` | enriched |

### Fix 1 — Organization logo (absolute URL)

`nuxt.config.ts`, `schemaOrg.identity.logo`: `/icon.png` →
`` `${NUXT_PUBLIC_BASE_URL}/icon.png` `` (built from the same env var already used for
`url`). Verify `app/composables/useOrganization.ts` does not duplicate or conflict
with the identity block.

### Fix 2 — BreadcrumbList on marketing pages

New composable `app/composables/useCeremlyBreadcrumb.ts`: encapsulates `baseUrl`,
locale, and the Home crumb; each page passes only its own trailing crumb(s). It wraps
`useSchemaOrg([defineBreadcrumb({ itemListElement })])` following the blog pattern
exactly (name + `item` absolute URL via `localePath`; the last crumb has no `item`).

Two-level trails (Home › Page) — these pages are all top-level in the nav:
`features`, `weddings`, `baptisms`, `birthdays`, `graduations`, `wedding-planner`,
`examples`, `templates`, `how-it-works`, `rsvp-guide`, `about`, `pricing`.

(Legal pages already have breadcrumb — untouched. Blog already has it — untouched.)

### Fix 3 — FAQPage

Real, rendered Q&A content only — **`pricing.vue` alone**:

- `pricing.vue` → `defineQuestion` array built from the `ceremly.site.prezzi.faq`
  i18n array (already `{q,a}`, rendered in a visible accordion with both question and
  answer). Added to the existing `useSchemaOrg([...])` call alongside `defineProduct`.

**Excluded — `help-center.vue`:** its FAQ section renders `ceremly.site.centroAiuto.popular`,
an array of **questions only** (no visible answer text — just a chevron). There is no
`centroAiuto.faq` `{q,a}` array in the locale. Google FAQPage requires both question
*and* answer visible on the page, so marking this up would violate the guidelines and
accuracy-first. Left as-is.

**Excluded — home boilerplate:** the `faq` block at `it-IT.json:233`
(`home.faq.questions.*`) is boilerplate, non-Ceremly ("invite your team", "Nuxt and
TypeScript") and is **not rendered** on the Ceremly home. Would violate accuracy-first.

### Fix 4 — HowTo on how-it-works

`how-it-works.vue` renders 4 real sequential steps from
`ceremly.site.comeFunziona.steps` (title `t`, description `d`, bullets). Add
`defineHowTo` with those 4 steps (`name` = `t`, `text` = `d`).

**Excluded:** `rsvp-guide.vue` renders a `timeline` keyed by `phase` (time-based
phases, not sequential user actions) — a HowTo there would be forced. Left as-is.

### Fix 5 — SoftwareApplication (home) enriched

`index.vue`: replace the generic `AggregateOffer` with the 3 real `Offer`s (consistent
with `pricing.vue`, prices from `shared/constants/pricing.ts`), and add `featureList`.
**No `aggregateRating`** — no real review data exists.

## Out of Scope (YAGNI)

- **Event** schema — Ceremly events are private, not public/indexable.
- **LocalBusiness** — Ceremly is not a local business.
- **Review / AggregateRating** — no real review data; fake proof already purged, do
  not reintroduce.
- Any DB migration, API endpoint, or new dependency — none required.

## Risks

1. **CSP.** JSON-LD renders as inline `<script type="application/ld+json">`. The CSP in
   `nuxt.config.ts` already includes `'unsafe-inline'` in `script-src` → not blocked.
   Confirmed non-issue.
2. **i18n `@` gotcha.** The `@` char breaks a vue-i18n locale file. Here we only *read*
   already-translated values via `t()`/`tm()` — no new keys with `@` are written →
   risk nil. (Still: if any existing FAQ answer contains a literal `@`, confirm the
   value resolves at build, not raw.)
3. **Locale correctness.** Breadcrumb/FAQ must use `localePath` and the right
   `inLanguage` (it-IT / en-US), as the blog does. Covered by the helper.
4. **Prerender vs runtime.** All target pages are landing pages (SSR + prerender), so
   the JSON-LD lands in the static HTML. Dashboard/auth pages (`ssr: false`) are not
   touched and need no schema.

## Testing & Validation

- `pnpm typecheck` — `nuxt-schema-org` `define*` helpers are typed; verify signatures.
- `pnpm build` — then **grep** `.output/public/**/index.html` (and the affected pages'
  prerendered HTML) for `application/ld+json` to confirm the schema is in the *served*
  markup, not just runtime. This is the hard gate.
- Manual, post-merge (owner): Google Rich Results Test on the live URLs (pricing →
  Product + FAQ, how-it-works → HowTo + breadcrumb, one plain landing → breadcrumb).
  Not automatable in CI.

## Success Criteria

- Every schema type validates in the Rich Results Test with no errors.
- Schema is present in the prerendered HTML (grep passes) for every target page.
- `pnpm typecheck` + `pnpm build` green.
- Zero marked-up content that is not actually rendered on the page (accuracy).

## Deliverables

- Spec: this file.
- New: `app/composables/useCeremlyBreadcrumb.ts`.
- Modified: `nuxt.config.ts`, `index.vue`, `pricing.vue`, `how-it-works.vue`,
  + the breadcrumb pages (11 marketing pages listed in Fix 2; `pricing` and
  `how-it-works` also receive breadcrumb, so they overlap the list above).
- No migration, no endpoint, no new dependency.
