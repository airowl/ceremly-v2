# Schema Markup Audit & Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Ceremly's structured data (JSON-LD via `nuxt-schema-org`) to full, accurate coverage — fix the logo defect, add BreadcrumbList to marketing pages, add FAQPage on pricing, add HowTo on how-it-works, and enrich the homepage SoftwareApplication.

**Architecture:** Follow the existing per-page pattern (`useSchemaOrg([define*()])`) exactly as the legal pages and blog already do. No new abstraction, no hand-written JSON-LD, no new dependency. Breadcrumb is declared inline per page (mirroring `app/pages/legal/privacy.vue`), using relative `item: '/'` paths that `nuxt-schema-org` resolves against `site.url`.

**Tech Stack:** Nuxt 4, `@nuxtjs/seo` → `nuxt-schema-org` (auto-imports `useSchemaOrg`, `defineBreadcrumb`, `defineProduct`, `defineOffer`, `defineQuestion`, `defineHowTo`), vitest (node env), i18n (`prefix_except_default`, IT default).

## Global Constraints

- **Accuracy first.** Only mark up content actually rendered and visible on the page. No invented data.
- **No hand-written JSON-LD.** Always use `nuxt-schema-org` `define*` helpers inside `useSchemaOrg([...])`.
- **No fake social proof.** No `aggregateRating` / `Review` — no real review data exists.
- **Breadcrumb pattern (verbatim from `legal/privacy.vue`):** `{ name: t('blog.article.breadcrumbHome'), item: '/' }` as the first crumb; the last crumb is `{ name: <page title> }` with **no** `item`. Relative paths; `nuxt-schema-org` resolves them against `site.url`.
- **Route slugs = file names (English):** `/pricing`, `/how-it-works`, `/weddings`, etc. There are NO custom i18n paths. The Italian strings `prezzi`/`come-funziona` are i18n *key* paths, NOT URLs.
- **`baseUrl` in a page:** `((useRuntimeConfig().public.baseURL as string) || '').replace(/\/$/, '')` — already present in every target page.
- **Verification is build-time, not unit test.** The vitest suite is `environment: "node"` and covers only `server/**`, `shared/**`, `test/**` — it does NOT run `.vue`/composable tests, and `nuxt-schema-org` injects JSON-LD only at render/prerender. So each schema task is verified by `pnpm typecheck` + `pnpm build` + grepping the prerendered HTML under `.output/public/<route>/index.html` for `application/ld+json` and the expected `@type`.

---

## File Structure

- **Modify** `nuxt.config.ts` — fix `schemaOrg.identity.logo` to an absolute URL.
- **Modify** `app/pages/index.vue` — enrich `SoftwareApplication` (3 real offers + `featureList`).
- **Modify** `app/pages/pricing.vue` — add `FAQPage` (6 real Q&A) to the existing `useSchemaOrg` call; add breadcrumb.
- **Modify** `app/pages/how-it-works.vue` — add `HowTo` (4 real steps); add breadcrumb.
- **Modify** 10 marketing pages — add breadcrumb only: `features.vue`, `templates.vue`, `examples.vue`, `weddings.vue`, `graduations.vue`, `baptisms.vue`, `birthdays.vue`, `wedding-planner.vue`, `rsvp-guide.vue`, `about.vue`.

No new files. (The spec floated a `useCeremlyBreadcrumb` helper; dropped — the inline pattern is 4 lines and is exactly what the legal pages already do. A helper would violate YAGNI and the "follow existing pattern" rule.)

**Note on `about.vue`:** it may already declare other schema. Check before editing; add the breadcrumb to the existing `useSchemaOrg([...])` array if present, else add a new call.

---

## Task 1: Fix Organization logo to absolute URL

**Files:**
- Modify: `nuxt.config.ts` (the `schemaOrg.identity` block, ~line 281-288)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks (independent).

- [ ] **Step 1: Read the current identity block**

Run: `grep -n "schemaOrg" nuxt.config.ts`
Expected: shows `schemaOrg: { identity: { ... logo: "/icon.png" } }` around line 281.

- [ ] **Step 2: Make the logo absolute**

In `nuxt.config.ts`, change the `logo` line inside `schemaOrg.identity` from:

```ts
            logo: "/icon.png",
```

to:

```ts
            logo: `${process.env.NUXT_PUBLIC_BASE_URL || ""}/icon.png`,
```

(`url` in the same block already uses `process.env.NUXT_PUBLIC_BASE_URL`, so this is consistent. `nuxt.config.ts` runs at build time where `process.env` is the correct source — the "no `process.env`" rule applies to server routes, not nuxt.config.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

- [ ] **Step 4: Build and verify the absolute logo in prerendered HTML**

Run: `pnpm build`
Then: `grep -o '"logo":"[^"]*"' .output/public/index.html`
Expected: prints `"logo":"https://.../icon.png"` (a fully-qualified URL, not `/icon.png`).

- [ ] **Step 5: Commit**

```bash
git add nuxt.config.ts
git commit -m "fix(schema): Organization logo as absolute URL"
```

---

## Task 2: Add FAQPage to pricing

**Files:**
- Modify: `app/pages/pricing.vue` (the existing `useSchemaOrg([...])` call, ~line 36-61)

**Interfaces:**
- Consumes: existing `tm`/`rt` from `useI18n()` (already destructured at line 14: `const { t, tm, rt, locale } = useI18n()`).
- Produces: nothing consumed by later tasks.

Background: the FAQ lives at i18n key `ceremly.site.prezzi.faq` — an array of 6 objects `{ q, a }`, rendered in a visible accordion by `CerFaqGrid`. `defineQuestion` takes `{ name, acceptedAnswer }`.

- [ ] **Step 1: Add a typed FAQ accessor in the `<script setup>`**

In `app/pages/pricing.vue`, after the `useSchemaOrg([...])` block (or near the other computed defs), add:

```ts
// FAQ items for FAQPage structured data (same source the visible accordion uses).
interface FaqItem { q: string, a: string }
const faqItems = (tm('ceremly.site.prezzi.faq') as FaqItem[]).map(x => ({
    q: rt(x.q),
    a: rt(x.a),
}))
```

- [ ] **Step 2: Add the FAQPage to the existing `useSchemaOrg` array**

Change the `useSchemaOrg([...])` call so it includes the FAQ. It becomes:

```ts
useSchemaOrg([
    defineProduct({
        name: 'Ceremly',
        description: seoDescription,
        offers: [
            defineOffer({
                name: t('ceremly.site.prezzi.colFree'),
                price: 0,
                priceCurrency: 'EUR',
                availability: 'https://schema.org/InStock',
            }),
            defineOffer({
                name: t('ceremly.site.prezzi.colCeleb'),
                price: CELEBRATION_PRICE_CENTS / 100,
                priceCurrency: 'EUR',
                availability: 'https://schema.org/InStock',
            }),
            defineOffer({
                name: t('ceremly.site.prezzi.colAtelier'),
                price: ATELIER_PRICE_CENTS / 100,
                priceCurrency: 'EUR',
                availability: 'https://schema.org/InStock',
            }),
        ],
    }),
    ...faqItems.map(item => defineQuestion({
        name: item.q,
        acceptedAnswer: item.a,
    })),
    defineBreadcrumb({
        itemListElement: [
            { name: t('blog.article.breadcrumbHome'), item: '/' },
            { name: seoTitle },
        ],
    }),
])
```

(The `faqItems` const from Step 1 must be declared BEFORE this call — move Step 1's block above `useSchemaOrg` if needed. This task also adds the pricing breadcrumb, satisfying Task 5's list for `/pricing`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Build and verify FAQPage + BreadcrumbList in prerendered HTML**

Run: `pnpm build`
Then:
```bash
grep -o '"@type":"FAQPage"' .output/public/pricing/index.html
grep -o '"@type":"BreadcrumbList"' .output/public/pricing/index.html
grep -o '"@type":"Question"' .output/public/pricing/index.html | wc -l
```
Expected: `"@type":"FAQPage"` present, `"@type":"BreadcrumbList"` present, and the Question count is `6`.

- [ ] **Step 5: Commit**

```bash
git add app/pages/pricing.vue
git commit -m "feat(schema): FAQPage + breadcrumb on pricing"
```

---

## Task 3: Add HowTo to how-it-works

**Files:**
- Modify: `app/pages/how-it-works.vue` (add a `useSchemaOrg([...])` call in `<script setup>`, ~after line 27 `useAltHreflang()`)

**Interfaces:**
- Consumes: existing `steps` computed (line 38-43) and `seoTitle` (line 16). `steps.value` is `{ s1, s2, s3, s4 }`, each `{ k, t, d, bullets }` with `t` = step title, `d` = step description (already `rt()`-resolved).
- Produces: nothing consumed by later tasks.

Background: 4 real sequential steps at `ceremly.site.comeFunziona.steps`. `defineHowTo` takes `{ name, step: [{ name, text }] }`. Use `t` as step `name` and `d` as step `text`.

- [ ] **Step 1: Add the HowTo + breadcrumb after `useAltHreflang()`**

In `app/pages/how-it-works.vue`, immediately after `useAltHreflang()` (line 27), add:

```ts
// Structured data: HowTo (4 real steps from the page) + breadcrumb.
useSchemaOrg([
    defineHowTo({
        name: seoTitle,
        step: [
            { name: steps.value.s1.t, text: steps.value.s1.d },
            { name: steps.value.s2.t, text: steps.value.s2.d },
            { name: steps.value.s3.t, text: steps.value.s3.d },
            { name: steps.value.s4.t, text: steps.value.s4.d },
        ],
    }),
    defineBreadcrumb({
        itemListElement: [
            { name: t('blog.article.breadcrumbHome'), item: '/' },
            { name: seoTitle },
        ],
    }),
])
```

(`steps` is a `computed`; `.value` is safe here because prerender resolves it at render time and the 4 steps always exist — the page's own `EMPTY_STEP` fallback guarantees no undefined. This also adds the how-it-works breadcrumb, satisfying Task 5's list for `/how-it-works`.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Build and verify HowTo + BreadcrumbList in prerendered HTML**

Run: `pnpm build`
Then:
```bash
grep -o '"@type":"HowTo"' .output/public/how-it-works/index.html
grep -o '"@type":"HowToStep"' .output/public/how-it-works/index.html | wc -l
grep -o '"@type":"BreadcrumbList"' .output/public/how-it-works/index.html
```
Expected: `"@type":"HowTo"` present, HowToStep count is `4`, `"@type":"BreadcrumbList"` present.

- [ ] **Step 4: Commit**

```bash
git add app/pages/how-it-works.vue
git commit -m "feat(schema): HowTo + breadcrumb on how-it-works"
```

---

## Task 4: Enrich homepage SoftwareApplication

**Files:**
- Modify: `app/pages/index.vue` (the `useSchemaOrg([...])` call, ~line 39-54)

**Interfaces:**
- Consumes: existing `seoDescription` (line 27), `baseUrl` (line 23), `runtimeConfig` (line 22). `CELEBRATION_PRICE_CENTS` / `ATELIER_PRICE_CENTS` must be imported (see Step 1).
- Produces: nothing consumed by later tasks.

Background: today the home has a bare `AggregateOffer`. Replace it with the 3 real offers (consistent with `pricing.vue`) and add a `featureList`. NO `aggregateRating`.

- [ ] **Step 1: Import the price constants**

In `app/pages/index.vue`, add to the imports at the top of `<script setup>` (after the existing component imports, ~line 11):

```ts
import { CELEBRATION_PRICE_CENTS, ATELIER_PRICE_CENTS } from '~~/shared/constants/pricing'
```

- [ ] **Step 2: Replace the SoftwareApplication schema**

Change the `useSchemaOrg([...])` call (line 39-54) to:

```ts
useSchemaOrg([
    {
        '@type': 'SoftwareApplication',
        'name': (runtimeConfig.public.appName as string) || 'Ceremly',
        'applicationCategory': 'BusinessApplication',
        'operatingSystem': 'Web',
        'description': seoDescription,
        'url': baseUrl,
        'featureList': [
            t('ceremly.home.seo.feature1'),
            t('ceremly.home.seo.feature2'),
            t('ceremly.home.seo.feature3'),
        ],
        'offers': [
            defineOffer({ name: t('ceremly.site.prezzi.colFree'), price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }),
            defineOffer({ name: t('ceremly.site.prezzi.colCeleb'), price: CELEBRATION_PRICE_CENTS / 100, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }),
            defineOffer({ name: t('ceremly.site.prezzi.colAtelier'), price: ATELIER_PRICE_CENTS / 100, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }),
        ],
    },
])
```

- [ ] **Step 3: Add the three `featureList` i18n keys**

The keys `ceremly.home.seo.feature1|2|3` referenced above must exist. Add them to BOTH locale files.

In `i18n/locales/it-IT.json`, under `ceremly.home.seo` (alongside `title`/`description`), add:

```json
"feature1": "Inviti digitali personalizzati per ogni ospite",
"feature2": "Raccolta RSVP con domande su menu, allergie e plus-one",
"feature3": "Dashboard in tempo reale con promemoria automatici"
```

In `i18n/locales/en-US.json`, under the matching `ceremly.home.seo` object, add:

```json
"feature1": "Personalized digital invitations for every guest",
"feature2": "RSVP collection with menu, allergy and plus-one questions",
"feature3": "Real-time dashboard with automatic reminders"
```

(Do NOT use the `@` character in these values — it breaks the vue-i18n locale file. These strings contain none; keep it that way.)

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Build and verify enriched SoftwareApplication in prerendered HTML**

Run: `pnpm build`
Then:
```bash
grep -o '"@type":"SoftwareApplication"' .output/public/index.html
grep -o '"@type":"Offer"' .output/public/index.html | wc -l
grep -o '"featureList"' .output/public/index.html
```
Expected: `"@type":"SoftwareApplication"` present, Offer count `>= 3`, `"featureList"` present. Also confirm NO rating leaked: `grep -c "aggregateRating" .output/public/index.html` should print `0`.

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.vue i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "feat(schema): enrich homepage SoftwareApplication (3 offers + featureList)"
```

---

## Task 5: Add BreadcrumbList to remaining marketing pages

**Files:**
- Modify (breadcrumb only): `app/pages/features.vue`, `app/pages/templates.vue`, `app/pages/examples.vue`, `app/pages/weddings.vue`, `app/pages/graduations.vue`, `app/pages/baptisms.vue`, `app/pages/birthdays.vue`, `app/pages/wedding-planner.vue`, `app/pages/rsvp-guide.vue`, `app/pages/about.vue`

**Interfaces:**
- Consumes: each page already has `const { t } = useI18n()` (or `t` within a larger destructure) and a `seoTitle` const. Verify both exist per page before editing; if a page lacks `seoTitle`, use its existing title source (the `t('...seoTitle')` expression it passes to `useSeoMeta`).
- Produces: nothing.

Pattern applied to EACH page — add this block at the end of `<script setup>` (after `useAltHreflang()` where present):

```ts
// Breadcrumb structured data (Home › this page). Relative item paths are
// resolved against site.url by nuxt-schema-org.
useSchemaOrg([
    defineBreadcrumb({
        itemListElement: [
            { name: t('blog.article.breadcrumbHome'), item: '/' },
            { name: seoTitle },
        ],
    }),
])
```

If a page already has a `useSchemaOrg([...])` call (check `about.vue` especially), do NOT add a second call — add `defineBreadcrumb({...})` into the existing array instead.

The `seoTitle` reference must resolve to that page's own title const. For example `weddings.vue` already has `const seoTitle = t('ceremly.site.usecases.matrimoni.seoTitle')` — use it as-is. For any page where the title is inlined into `useSeoMeta` without a named const, first extract it to `const seoTitle = t('<that page's seoTitle key>')` and use that const in both `useSeoMeta` and the breadcrumb.

- [ ] **Step 1: `features.vue`**

Read `app/pages/features.vue`. Confirm `t` and a title const exist (extract `seoTitle` if inlined). Add the breadcrumb block above.

- [ ] **Step 2: `templates.vue`** — same procedure.

- [ ] **Step 3: `examples.vue`** — same procedure.

- [ ] **Step 4: `weddings.vue`** — `seoTitle` already exists (`ceremly.site.usecases.matrimoni.seoTitle`). Add the block after `useAltHreflang()` (line 23).

- [ ] **Step 5: `graduations.vue`** — same thin-page shape as weddings; add the block.

- [ ] **Step 6: `baptisms.vue`** — same; add the block.

- [ ] **Step 7: `birthdays.vue`** — same; add the block.

- [ ] **Step 8: `wedding-planner.vue`** — same; add the block.

- [ ] **Step 9: `rsvp-guide.vue`** — add the block (confirm `t` + `seoTitle` first).

- [ ] **Step 10: `about.vue`** — check for an existing `useSchemaOrg` call FIRST. If present, add `defineBreadcrumb({...})` into that array; else add a new `useSchemaOrg([...])` call.

- [ ] **Step 11: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 12: Build and verify BreadcrumbList on every page**

Run: `pnpm build`
Then run this loop:
```bash
for p in features templates examples weddings graduations baptisms birthdays wedding-planner rsvp-guide about; do
  echo -n "$p: "; grep -c '"@type":"BreadcrumbList"' ".output/public/$p/index.html"
done
```
Expected: every line prints `1` (or more). Any `0` = that page's breadcrumb is missing → fix before committing.

- [ ] **Step 13: Commit**

```bash
git add app/pages/features.vue app/pages/templates.vue app/pages/examples.vue app/pages/weddings.vue app/pages/graduations.vue app/pages/baptisms.vue app/pages/birthdays.vue app/pages/wedding-planner.vue app/pages/rsvp-guide.vue app/pages/about.vue
git commit -m "feat(schema): BreadcrumbList on marketing pages"
```

---

## Task 6: Final full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint + full build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all green (the pre-existing `sharp-wasm32` warning during build is known and not a failure — see CLAUDE.md Known Issues).

- [ ] **Step 2: Run the existing test suite (regression guard)**

Run: `pnpm test`
Expected: PASS — no server/shared test is touched by this work, so the suite must stay green.

- [ ] **Step 3: Aggregate schema presence check**

Run:
```bash
for p in index pricing how-it-works features templates examples weddings graduations baptisms birthdays wedding-planner rsvp-guide about; do
  echo -n "$p: "; grep -c 'application/ld+json' ".output/public/$p/index.html"
done
```
Expected: every page prints `>= 1`.

- [ ] **Step 4: Manual validation note (owner action, post-merge — NOT a code step)**

Record in the PR/commit description that the owner must run Google Rich Results Test on the live URLs after deploy:
- `/pricing` → expect Product + FAQ
- `/how-it-works` → expect HowTo + Breadcrumb
- one plain landing (e.g. `/weddings`) → expect Breadcrumb

This is not automatable in CI.

---

## Notes for the implementer

- **Auto-imports:** `useSchemaOrg`, `defineBreadcrumb`, `defineProduct`, `defineOffer`, `defineQuestion`, `defineHowTo` are all provided by `nuxt-schema-org` and need NO import statement. Only `CELEBRATION_PRICE_CENTS`/`ATELIER_PRICE_CENTS` need importing (Task 4).
- **If a grep returns 0 unexpectedly:** the route may prerender to a different path. Confirm with `find .output/public -name index.html | grep <route>`; all target routes are in `nuxt.config.ts` `routeRules` with `prerender: true`, so the file exists.
- **Do not** touch legal pages or the blog — their schema is already correct.
