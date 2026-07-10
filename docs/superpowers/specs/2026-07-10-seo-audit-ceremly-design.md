# SEO Audit Ceremly — Design / Spec

*Date: 2026-07-10 · Author: brainstorming session · Status: approved-pending-review*

## Goal

Produce a prioritized SEO audit of the Ceremly public site (`ceremly.com`), covering **technical + on-page** SEO, then **implement every fixable finding**. Deliverables: an audit report in `docs/seo/` and applied code fixes with `typecheck` + `build` green.

Data sources (user choice): **code + live** — static audit of the codebase/config plus verification against the live pre-rendered HTML.

## Context (verified during brainstorming)

- Public surface: **~26 pre-rendered pages** IT + EN (`nuxt.config.ts` `routeRules`, all `prerender: true`), blog SSR (`content/blogs/` = 2 posts today).
- SEO tooling: **`@nuxtjs/seo` v3.4** active. Sitemap (`@nuxtjs/sitemap` v7.6) + robots (`nuxt-robots`) enabled. `ogImage` runtime module **disabled** (`ogImage: { enabled: false }`), but static OG images exist via `pnpm og:generate` (Playwright + sharp, 38 images).
- 35 files use SEO composables (`useSeoMeta` / `useHead` / `useSchemaOrg` / `defineOgImage`).
- i18n: Italian default, English alternate (`prefix_except_default`). EN under `/en/*`.
- **Known bug to confirm/fix**: memory `ceremly-i18n-seo-boilerplate` — `landing.seo.*` and `blog.seo.description` in i18n locales are still boilerplate (non-Ceremly) text, used by `app.vue` as global default meta.
- Live checks already done: `robots.txt` returns 200 for Googlebot UA (blocks only `sqlmap`, bare-curl via bot-filter, `/dashboard/`, `/api/`, `/login|signup`, `/invite/`, `/maintenance`, `/_nuxt/`, bot-trap paths). `sitemap_index.xml` OK, references `en-US.xml` + `it-IT.xml`. Both `ceremly.com` and `www.ceremly.com` return 200 (→ canonical/redirect consistency must be checked).

## Scope

**In scope** — technical + on-page:

1. **Crawlability & Indexation**: `noindex`/`x-robots-tag` audit, canonical URLs, trailing-slash + www-vs-non-www consistency, sitemap contains only canonical indexable URLs, orphan detection.
2. **Canonical & hreflang (i18n)**: self-referencing canonicals, reciprocal `hreflang` IT↔EN + `x-default`, no cross-locale canonical leaks.
3. **On-page per-page**: unique titles (50–60c), unique meta descriptions (150–160c), single H1 with keyword, heading hierarchy; confirm + fix the i18n boilerplate bug; title/H1/URL/keyword alignment vs the keyword map in `.claude/product-marketing-context.md` ("inviti digitali", "RSVP online", "gestione invitati matrimonio/laurea/battesimo").
4. **Structured data & social**: presence of Schema.org (Organization, WebSite, BreadcrumbList, FAQPage on rsvp-guide/pricing, Article on blog); OG/Twitter tags valid in live `<head>` for each page (title/description/image).
5. **Images & internal linking**: alt text, formats (WebP), lazy-load, filenames; orphan pages, anchor text, click depth ≤ 3.

**Out of scope (YAGNI)**:
- Core Web Vitals / PageSpeed / Lighthouse (real-device measurement; flagged in report as "measure separately").
- Search Console historical data (no access).
- External keyword research, backlink/authority analysis (new site, no link profile — Fase 5 of the audit framework "Authority & Links" skipped).

## Method

1. **Static pass** — read/grep:
   - `nuxt.config.ts` (site.url, sitemap, robots, routeRules, ogImage, security header exemptions).
   - `app/app.vue` + layouts (global meta defaults).
   - `i18n/locales/it-IT.json` + `en-US.json` (`landing.seo.*`, `blog.seo.*`, page-level SEO keys).
   - The ~26 public `app/pages/*.vue` and the 35 SEO-composable files (per-page title/description/H1/canonical/schema/og).
2. **Live pass** — `curl` with a real browser UA against a **sample of pages** (approved): home `/`, `/pricing`, `/weddings`, `/rsvp-guide`, one blog post, plus `/en/` variants. Because pages are pre-rendered, curl sees final HTML — inspect `<head>` for title, meta description, `<link rel=canonical>`, `hreflang`, `og:*`, `twitter:*`, JSON-LD. Fetches parallelized.
3. **Cross-check** live `<head>` against static source to catch build-time vs source drift.

## Output

- **Report**: `docs/seo/SEO-AUDIT-2026-07-10.md` — Executive Summary (health + top 3–5 priorities + quick wins), then findings grouped Technical / On-page / Structured-data / Content, each as **Issue / Impact (High·Med·Low) / Evidence / Fix / Priority**, then a Prioritized Action Plan.
- **Fixes**: implement every fixable finding (expected: i18n SEO boilerplate, any missing canonical/hreflang, missing schema, weak/duplicate titles-descriptions). End state: `pnpm typecheck` + `pnpm build` green. Content is Italian-first per repo convention; code/comments English.

## Success criteria

- Report exists, findings are evidence-backed and prioritized.
- Every fix classified fixable is applied and verified (typecheck + build).
- No brand-honesty regressions (no fake social proof / invented metrics reintroduced — see memory `ceremly-fake-social-proof`).
- Changes committed (push stays manual per project rule).

## Risks / notes

- Live HTML is pre-render output frozen at last deploy — a finding present live but fixed in source since last deploy would be a false positive; the cross-check step (method 3) mitigates this.
- `www` and apex both 200: must confirm one canonically redirects or both carry consistent self-canonical, else duplicate-host risk.
