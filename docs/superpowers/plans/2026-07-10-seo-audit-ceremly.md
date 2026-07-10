# SEO Audit Ceremly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an evidence-backed, prioritized SEO audit of `ceremly.com` (technical + on-page) and apply every fixable finding, ending with `typecheck` + `build` green.

**Architecture:** Two-part plan. Part A (Tasks 1–6) is an **audit**: each task gathers evidence for one area and appends findings to a shared report; the deliverable is `docs/seo/SEO-AUDIT-2026-07-10.md`. Part B (Tasks 7+) applies **fixes** derived from the report; fixes to code are verified by build/typecheck and by re-inspecting rendered output. Audit tasks are investigation, not TDD — their "test" is that each claimed finding cites concrete evidence (file:line or a live `<head>` snippet).

**Tech Stack:** Nuxt 4, `@nuxtjs/seo` v3.4 (sitemap v7.6, nuxt-robots, schemaOrg, seo-utils), Vue 3, i18n (`prefix_except_default`, IT default / EN `/en/*`), curl for live inspection.

## Global Constraints

- Site under audit: `https://ceremly.com` — apex and `www` both return 200 (must check canonical/redirect consistency).
- ~26 public pre-rendered pages IT+EN (`nuxt.config.ts` routeRules, all `prerender: true`); blog SSR; `content/blogs/` = 2 posts.
- `ogImage` runtime module **disabled**; static OG images shipped via `pnpm og:generate` (`/ogImage-it.png`, `/ogImage-en.png`, per-page variants).
- Live inspection MUST use a real browser User-Agent — the site's bot-filter returns "Forbidden" to bare curl (this is intended; Googlebot UA gets 200).
- Content is **Italian-first** (product/UI/meta copy in Italian); code, comments, commit messages in **English** (repo convention `ceremly-lang-convention`).
- **No brand-honesty regressions**: never introduce fake social proof, invented metrics, or testimonials (memory `ceremly-fake-social-proof`). Meta copy must reflect real product claims from `.claude/product-marketing-context.md`.
- Report finding format: **Issue / Impact (High·Med·Low) / Evidence / Fix / Priority (1–5)**.
- Out of scope: Core Web Vitals / PageSpeed / Lighthouse, Search Console historical data, external keyword research, backlinks/authority.
- Push stays manual (commits OK).

## Known facts already verified (do not re-discover — cite these)

- `robots.txt` (live): `User-agent: *` `Allow: /`, `/en/`; disallows `/api/ /dashboard/ /login /signup /invite/ /maintenance /_nuxt/ /.env /wp-admin/ /wordpress/`; explicit block groups for `sqlmap/nikto/masscan/nmap`. Googlebot UA → 200. Source: `nuxt.config.ts:249-270`.
- `sitemap_index.xml` (live) → references `/__sitemap__/en-US.xml` + `/__sitemap__/it-IT.xml`. `autoI18n: true`, `defaults.changefreq: weekly, priority: 0.8`, excludes `/dashboard/** /login /signup /invite/** /maintenance /en/maintenance /legal/**`. Source: `nuxt.config.ts:229-247`.
- `nuxt.config.ts:222-227` — `site.url` = env `NUXT_PUBLIC_BASE_URL`, `site.name` = env `NUXT_PUBLIC_APP_NAME`, **`site.description: ""`** (empty), `defaultLocale: "it"`.
- `nuxt.config.ts:278-285` — `schemaOrg.identity`: Organization, name from env, url from env, `logo: "/icon.png"`.
- `app/app.vue` — global default meta via `useSeoMeta`, pulling `landing.seo.title/description/ogTitle/ogDescription`; `useSchemaOrg([defineWebSite({ description: t('landing.seo.description'), inLanguage: ['it-IT','en-US'] })])`; per-locale OG image `/ogImage-it.png` | `/ogImage-en.png`; `htmlAttrs.lang` locale-aware.
- **BUG (confirmed)**: `i18n/locales/it-IT.json:139-145` `landing.seo.*` = "Boilerplate SaaS multi-tenant…"; `en-US.json:139-145` = "Multi-tenant SaaS boilerplate…"; `it-IT.json:1398-1401` `blog.seo` = "…prodotto SaaS". These feed app.vue's global default + WebSite schema description. Correct Ceremly copy already exists at `it-IT.json:2718-2721` (`ceremly.site.seo`).
- All 19 non-legal public pages define their own SEO (`useSeoMeta`/`useHead`) — so `landing.seo.*` boilerplate leaks only where nothing overrides it: the **global default fallback**, the **WebSite schema description**, and any page NOT setting its own meta (legal pages, blog index/posts — to be checked in Task 3).

---

## PART A — AUDIT

### Task 1: Scaffold the audit report + Crawlability & Indexation findings

**Files:**
- Create: `docs/seo/SEO-AUDIT-2026-07-10.md`

**Interfaces:**
- Produces: the report file with a fixed skeleton later tasks append to. Section order: `## Executive Summary` (filled last, in Task 6), then `## 1. Crawlability & Indexation`, `## 2. Canonical & hreflang`, `## 3. On-page`, `## 4. Structured data & social`, `## 5. Images & internal linking`, `## Prioritized Action Plan`.

- [ ] **Step 1: Create the report skeleton**

Write `docs/seo/SEO-AUDIT-2026-07-10.md` starting with:

```markdown
# SEO Audit — Ceremly (ceremly.com)

*Date: 2026-07-10 · Scope: technical + on-page · Source: code + live pre-rendered HTML*

> Finding format: **Issue / Impact / Evidence / Fix / Priority**. Impact = High·Med·Low. Priority = 1 (do first) … 5 (later).

## Executive Summary

_(filled after all sections — see Task 6)_

## 1. Crawlability & Indexation
## 2. Canonical & hreflang (i18n)
## 3. On-page (title / meta / headings)
## 4. Structured data & social
## 5. Images & internal linking
## Prioritized Action Plan
```

- [ ] **Step 2: Gather live indexation signals**

Run (real UA), for each of `/`, `/pricing`, `/weddings`, `/en/`, `/en/pricing`:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/weddings" "/en/" "/en/pricing"; do
  echo "=== $p ==="
  curl -sI -A "$UA" "https://ceremly.com$p" | grep -iE "^HTTP|x-robots-tag|content-type|location"
  curl -s -A "$UA" "https://ceremly.com$p" | grep -ioE '<meta[^>]+name="robots"[^>]*>'
done
```
Expected: HTTP 200, no `x-robots-tag: noindex`, no `<meta name=robots content=noindex>` on public pages.

- [ ] **Step 3: Check host canonicalization (apex vs www)**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
echo "apex:"; curl -sI -A "$UA" "https://ceremly.com/" | grep -iE "^HTTP|location"
echo "www:";  curl -sI -A "$UA" "https://www.ceremly.com/" | grep -iE "^HTTP|location"
curl -s -A "$UA" "https://www.ceremly.com/" | grep -ioE '<link[^>]+rel="canonical"[^>]*>'
```
Determine: does one 301→the other, or do both serve 200 with a self-canonical pointing at one host? Record which.

- [ ] **Step 4: Verify sitemap contents are canonical + indexable**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -s -A "$UA" "https://ceremly.com/__sitemap__/it-IT.xml" | grep -oE '<loc>[^<]+</loc>' | head -40
curl -s -A "$UA" "https://ceremly.com/__sitemap__/en-US.xml" | grep -oE '<loc>[^<]+</loc>' | head -40
```
Cross-check against the `sitemap.exclude` list (`nuxt.config.ts:232-240`): confirm `/dashboard`, `/login`, `/signup`, `/invite`, `/maintenance`, `/legal/**` are absent. Flag if any disallowed-but-listed or indexable-but-missing URL appears. Note: `/legal/**` is excluded from sitemap — decide in the report whether legal pages SHOULD be indexable (privacy/tos usually yes).

- [ ] **Step 5: Write Section 1 findings**

Append each finding under `## 1. Crawlability & Indexation` in the Issue/Impact/Evidence/Fix/Priority format. If an area is clean, state it explicitly (e.g. "robots.txt: no accidental blocks — Googlebot 200, evidence nuxt.config.ts:249-270"). At minimum resolve: host canonicalization verdict, legal-pages-excluded-from-sitemap verdict, any noindex leak.

- [ ] **Step 6: Commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): audit report scaffold + crawlability/indexation findings"
```

---

### Task 2: Canonical & hreflang (i18n) findings

**Files:**
- Modify: `docs/seo/SEO-AUDIT-2026-07-10.md` (append Section 2)

**Interfaces:**
- Consumes: report skeleton from Task 1.
- Produces: Section 2 findings.

- [ ] **Step 1: Inspect canonical + hreflang on live pages**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/weddings" "/rsvp-guide" "/en/" "/en/pricing" "/en/weddings"; do
  echo "=== $p ==="
  curl -s -A "$UA" "https://ceremly.com$p" \
    | grep -ioE '<link[^>]+rel="(canonical|alternate)"[^>]*>'
done
```
Check per page: exactly one self-referencing `canonical`; reciprocal `hreflang="it-IT"` ↔ `hreflang="en-US"`; presence of `hreflang="x-default"`; no EN page canonicalizing to its IT counterpart.

- [ ] **Step 2: Confirm the i18n/sitemap wiring that generates them**

Read `nuxt.config.ts` i18n block + `sitemap.autoI18n: true`. Confirm hreflang generation is automatic (seo-utils/sitemap) vs hand-rolled. Record the mechanism as evidence.

- [ ] **Step 3: Write Section 2 findings**

Append findings. Likely outcomes: either "hreflang reciprocal + x-default present (auto via @nuxtjs/seo) — OK" or specific gaps (missing x-default, non-reciprocal, wrong host in canonical). State impact: hreflang errors on a bilingual site are High impact (wrong-language SERP results).

- [ ] **Step 4: Commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): canonical + hreflang findings"
```

---

### Task 3: On-page (title / meta / headings) findings

**Files:**
- Modify: `docs/seo/SEO-AUDIT-2026-07-10.md` (append Section 3)

**Interfaces:**
- Consumes: report skeleton.
- Produces: Section 3 findings + a per-page title/description table.

- [ ] **Step 1: Extract live title + meta description for the sample**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/weddings" "/rsvp-guide" "/about" "/blogs" "/legal/privacy" "/en/" "/en/pricing"; do
  echo "=== $p ==="
  html=$(curl -s -A "$UA" "https://ceremly.com$p")
  echo "$html" | grep -ioE '<title>[^<]*</title>'
  echo "$html" | grep -ioE '<meta[^>]+name="description"[^>]*>'
  echo "$html" | grep -ocE '<h1' | sed 's/^/H1 count: /'
done
```
Record for each: title text + length, description text + length, H1 count. Flag: titles >60c or <30c, descriptions >160c or missing, H1 count ≠ 1, **any boilerplate "SaaS/Boilerplate" string** (that's the leak).

- [ ] **Step 2: Confirm which pages inherit the boilerplate default**

The global default (app.vue) uses `landing.seo.*` = boilerplate. Pages NOT setting own meta inherit it. Verified: 19 non-legal pages set own SEO. Check the gap set — legal pages + blog:

```bash
for f in legal/privacy legal/tos legal/cookie legal/dpa legal/subprocessors blogs/index "blogs/[slug]"; do
  if grep -qE "useSeoMeta|useHead" "app/pages/$f.vue" 2>/dev/null; then echo "✓ $f sets own SEO"; else echo "✗ $f INHERITS boilerplate default"; fi
done
```
Cross-reference Step 1's live legal/blog output: does `/legal/privacy` show "Boilerplate SaaS…"? Record verdict.

- [ ] **Step 3: Keyword alignment spot-check**

For the 4 event-category pages (`/weddings /graduations /baptisms /birthdays`) and `/rsvp-guide`, compare the live title/H1 against the target keyword map in `.claude/product-marketing-context.md` ("inviti digitali", "RSVP online", "gestione invitati matrimonio/laurea/battesimo/compleanno"). Flag pages whose title/H1 omit the head term a user would search. Note any two pages targeting the same term (cannibalization).

- [ ] **Step 4: Write Section 3 findings + table**

Append a markdown table `| Page | Title (len) | Desc (len) | H1 | Issue |` plus prose findings. The boilerplate leak is expected to be the top on-page finding.

- [ ] **Step 5: Commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): on-page title/meta/heading findings"
```

---

### Task 4: Structured data & social findings

**Files:**
- Modify: `docs/seo/SEO-AUDIT-2026-07-10.md` (append Section 4)

**Interfaces:**
- Consumes: report skeleton.
- Produces: Section 4 findings.

- [ ] **Step 1: Extract JSON-LD from live pages**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/rsvp-guide" "/blogs" "/weddings"; do
  echo "=== $p ==="
  curl -s -A "$UA" "https://ceremly.com$p" \
    | grep -ioE '"@type"[[:space:]]*:[[:space:]]*"[^"]+"' | sort -u
done
```
Record which schema types render per page. Expected baseline from config: `Organization` + `WebSite`. Flag absence of high-value types: `BreadcrumbList` (all deep pages), `FAQPage` (rsvp-guide, pricing), `Article` (blog posts), `Product`/`Offer` (pricing). Note: `schemaOrg.identity` name/url come from **env** — on a mis-set env they render empty; confirm live values are populated (real "Ceremly" + real url), not blank.

- [ ] **Step 2: Extract OG + Twitter tags from live pages**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/weddings" "/en/"; do
  echo "=== $p ==="
  curl -s -A "$UA" "https://ceremly.com$p" \
    | grep -ioE '<meta[^>]+(property="og:[^"]+"|name="twitter:[^"]+")[^>]*>'
done
```
Check: `og:title`, `og:description`, `og:image` (absolute URL, resolves 200), `og:type`, `og:locale` (it_IT / en_US), `twitter:card=summary_large_image`. Verify og:image actually loads:

```bash
curl -sI -A "$UA" "https://ceremly.com/ogImage-it.png" | grep -iE "^HTTP|content-type"
```
Flag: og:description carrying the boilerplate string (it feeds from `landing.seo` too), any page with a broken/missing og:image.

- [ ] **Step 3: Write Section 4 findings**

Append findings for structured data (present/missing types, empty-env risk) and social (OG completeness, boilerplate leak into og:description, image resolvability).

- [ ] **Step 4: Commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): structured-data + social findings"
```

---

### Task 5: Images & internal linking findings

**Files:**
- Modify: `docs/seo/SEO-AUDIT-2026-07-10.md` (append Section 5)

**Interfaces:**
- Consumes: report skeleton.
- Produces: Section 5 findings.

- [ ] **Step 1: Audit images on key pages (alt, format, lazy)**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/weddings" "/pricing"; do
  echo "=== $p ==="
  html=$(curl -s -A "$UA" "https://ceremly.com$p")
  echo "img total:   $(echo "$html" | grep -ocE '<img')"
  echo "img no-alt:  $(echo "$html" | grep -oE '<img[^>]*>' | grep -vcE 'alt=')"
  echo "loading=lazy:$(echo "$html" | grep -ocE 'loading="lazy"')"
  echo "formats:     $(echo "$html" | grep -oiE '\.(png|jpg|jpeg|webp|avif|svg)' | sort | uniq -c)"
done
```
Flag: `<img>` without `alt`, raster images not WebP/AVIF, above-the-fold hero images with `loading=lazy` (hurts LCP — note but CWV out of scope, keep it a low-priority note).

- [ ] **Step 2: Internal linking + click depth**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -s -A "$UA" "https://ceremly.com/" | grep -oE 'href="/[^"]*"' | sort -u | head -60
```
From the homepage links, determine which public pages are reachable in 1 click. Cross-check against the full page list (Section 1) to find **orphans** (in sitemap but not linked from home/nav/footer). Check event-category pages and rsvp-guide are linked (they are money/SEO pages). Note anchor-text quality (descriptive vs "clicca qui").

- [ ] **Step 3: Write Section 5 findings**

Append findings: missing alt text (Med impact — accessibility + image SEO), orphan pages (Med), non-WebP images (Low), anchor text (Low).

- [ ] **Step 4: Commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): images + internal-linking findings"
```

---

### Task 6: Executive Summary + Prioritized Action Plan

**Files:**
- Modify: `docs/seo/SEO-AUDIT-2026-07-10.md` (fill Executive Summary + Action Plan)

**Interfaces:**
- Consumes: Sections 1–5.
- Produces: complete report; a labeled list of findings partitioned into **fixable-now** vs **needs-decision/out-of-band**, which drives Part B.

- [ ] **Step 1: Fill Executive Summary**

Write overall health assessment (1 paragraph), Top 3–5 priority issues (ranked), and Quick Wins. Base it strictly on the recorded findings — no new claims.

- [ ] **Step 2: Build the Prioritized Action Plan**

Four buckets: (1) Critical (blocks indexation/ranking), (2) High-impact improvements, (3) Quick wins, (4) Long-term. Each item references its finding. Tag every code-fixable item `[FIX]` and every judgment-call/ops item `[DECIDE]` (e.g. host redirect at DNS/Vercel, legal-page indexation policy).

- [ ] **Step 3: Commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): executive summary + prioritized action plan"
```

- [ ] **Step 4: Checkpoint — present findings to user**

Before Part B, surface the `[FIX]` list and confirm scope. (Under subagent-driven execution this is the natural review gate between Part A and Part B.)

---

## PART B — FIXES

> Part B tasks are written against the **expected** top findings (boilerplate i18n SEO, empty `site.description`, possibly missing schema/x-default). If Task 6 surfaces a materially different finding set, adjust Part B tasks to match the report before executing — the report is the source of truth.

### Task 7: Fix the boilerplate i18n SEO default (`landing.seo.*` + `blog.seo`)

**Files:**
- Modify: `i18n/locales/it-IT.json:139-145` (`landing.seo.*`), `i18n/locales/it-IT.json:1398-1401` (`blog.seo`)
- Modify: `i18n/locales/en-US.json:139-145` (`landing.seo.*`), and the EN `blog.seo` block (same key path)
- Reference (do not duplicate): `i18n/locales/it-IT.json:2718-2721` (`ceremly.site.seo`) holds the correct Ceremly IT copy to mirror.

**Interfaces:**
- Consumes: nothing (leaf change). app.vue reads these keys unchanged.
- Produces: Ceremly-accurate global default meta + WebSite schema description.

- [ ] **Step 1: Capture the baseline (proof the bug is live)**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -s -A "$UA" "https://ceremly.com/legal/privacy" | grep -ioE '<title>[^<]*</title>|<meta[^>]+name="description"[^>]*>'
```
Expected today: boilerplate "Boilerplate SaaS…" (this is the failing state the fix must clear). Record the exact string.

- [ ] **Step 2: Rewrite `landing.seo.*` (IT) with real Ceremly copy**

In `i18n/locales/it-IT.json`, replace the `landing.seo` block (139-145) with copy consistent with `ceremly.site.seo` and product-marketing-context (Words to use; no fake proof). Example values (tune to length limits — title ≤60c, description ≤160c):

```json
    "seo": {
      "title": "Ceremly — Inviti digitali e RSVP intelligenti",
      "description": "Crea inviti digitali, invia un link personalizzato per ogni ospite e raccogli le conferme RSVP in un'unica dashboard. Per matrimoni, lauree, battesimi e compleanni.",
      "ogTitle": "Ceremly — Inviti digitali e RSVP per eventi che contano",
      "ogDescription": "Un link, un invito curato e una dashboard che ti dice chi viene davvero. Senza account per gli ospiti, senza gestione manuale.",
      "keywords": "inviti digitali, RSVP online, gestione invitati, invito matrimonio, invito laurea, invito battesimo, invito compleanno"
    }
```

- [ ] **Step 3: Rewrite `landing.seo.*` (EN) to match**

In `i18n/locales/en-US.json` replace block 139-145 with the English equivalent (mirror meaning, not a literal translation of the SaaS copy):

```json
    "seo": {
      "title": "Ceremly — Digital invitations & smart RSVP",
      "description": "Create digital invitations, send each guest a personal link, and collect RSVPs in one dashboard. For weddings, graduations, christenings and birthdays.",
      "ogTitle": "Ceremly — Digital invitations & RSVP for events that matter",
      "ogDescription": "One link, a polished invitation, and a dashboard that tells you who's really coming. No guest accounts, no manual tracking.",
      "keywords": "digital invitations, online RSVP, guest management, wedding invitation, graduation invitation, birthday invitation"
    }
```

- [ ] **Step 4: Fix `blog.seo` boilerplate (IT + EN)**

Replace the blog SEO description (`it-IT.json:1398-1401` and EN counterpart) so it stops saying "prodotto SaaS". Example IT:

```json
      "seo": {
        "title": "Blog Ceremly — Guide per inviti ed eventi",
        "description": "Guide pratiche e consigli per organizzare inviti, RSVP e liste ospiti: matrimoni, lauree, battesimi e compleanni senza stress."
      }
```
EN equivalent in `en-US.json`.

- [ ] **Step 5: Validate JSON + typecheck**

```bash
node -e "JSON.parse(require('fs').readFileSync('i18n/locales/it-IT.json','utf8')); JSON.parse(require('fs').readFileSync('i18n/locales/en-US.json','utf8')); console.log('JSON OK')"
pnpm typecheck
```
Expected: `JSON OK`, typecheck passes. Also grep to prove no boilerplate remains in the SEO keys:

```bash
grep -niE '"(title|description|ogTitle|ogDescription)":' i18n/locales/it-IT.json i18n/locales/en-US.json | grep -iE 'boilerplate|multi-tenant|prodotto saas|ship'
```
Expected: **no matches**.

- [ ] **Step 6: Build to confirm prerender picks up new meta**

```bash
pnpm build 2>&1 | tail -20
```
Expected: build completes (pre-existing `sharp-wasm32` warning is OK per CLAUDE.md). Optionally inspect a prerendered legal page in `.output/public/legal/privacy/index.html` for the new `<title>`.

- [ ] **Step 7: Commit**

```bash
git add i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "fix(seo): replace boilerplate SaaS meta defaults with Ceremly copy"
```

---

### Task 8: Fill empty `site.description` + verify schema identity

**Files:**
- Modify: `nuxt.config.ts:225` (`site.description`)

**Interfaces:**
- Consumes: nothing.
- Produces: non-empty site-level description used by seo-utils fallbacks.

- [ ] **Step 1: Set `site.description`**

Replace `nuxt.config.ts:225` `description: "",` with:

```ts
        description: "Inviti digitali e RSVP intelligenti per matrimoni, lauree, battesimi e compleanni.",
```

- [ ] **Step 2: Confirm schemaOrg identity resolves from env (not empty)**

This is a config-vs-env check, not a code change. Verify the live Organization schema (from Task 4) shows a real name/url. If Task 4 found it **empty in production**, that's an env misconfiguration → record as `[DECIDE]`/ops in the report (set `NUXT_PUBLIC_APP_NAME` / `NUXT_PUBLIC_BASE_URL` on Vercel), NOT a code fix here. Do not hardcode brand strings into `nuxt.config.ts` (violates the env-driven-branding rule in CLAUDE.md).

- [ ] **Step 3: Typecheck + build**

```bash
pnpm typecheck && pnpm build 2>&1 | tail -10
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts
git commit -m "fix(seo): set non-empty site.description for meta fallbacks"
```

---

### Task 9: Apply remaining fixable findings from the report

**Files:**
- Modify: as dictated by Task 6's `[FIX]` list (candidates: page `.vue` files missing own SEO — e.g. legal pages; a `useSchemaOrg` addition for `BreadcrumbList`/`FAQPage`/`Article`; missing alt text; missing `x-default` if not auto-emitted).

**Interfaces:**
- Consumes: the `[FIX]` list from Task 6.
- Produces: each fix applied + individually committed.

> This task is deliberately report-driven. For EACH `[FIX]` item, do the mini-cycle below. Do NOT invent fixes beyond the report.

- [ ] **Step 1: Re-read the `[FIX]` list**

Open `docs/seo/SEO-AUDIT-2026-07-10.md` → Prioritized Action Plan → collect all `[FIX]`-tagged items not already handled by Tasks 7–8.

- [ ] **Step 2: For each `[FIX]` item — capture baseline**

Use the relevant live curl from Tasks 1–5 to record the current broken state (title/schema/alt/etc.) for that specific page.

- [ ] **Step 3: For each `[FIX]` item — apply the minimal change**

Examples, applied only if the report lists them:
- Legal page missing meta → add `useSeoMeta({ title, description })` in that page's `<script setup>`, copy from i18n (add keys if needed), Italian-first.
- Missing `FAQPage` on `/rsvp-guide` → add `useSchemaOrg([defineWebPage(...), ...])` with real Q/A from the page (no invented content).
- `<img>` missing `alt` → add descriptive Italian alt in the owning component.

Follow existing patterns in neighboring pages (e.g. how `weddings.vue` sets its SEO).

- [ ] **Step 4: For each `[FIX]` item — verify + commit**

```bash
pnpm typecheck
pnpm build 2>&1 | tail -8      # only for changes affecting build/prerender
git add <changed files>
git commit -m "fix(seo): <specific finding>"
```
Re-run the page's live/prerender check to confirm the broken state is cleared.

---

### Task 10: Final verification pass

**Files:**
- Modify: `docs/seo/SEO-AUDIT-2026-07-10.md` (append `## Fixes Applied` log)

**Interfaces:**
- Consumes: all prior fixes.
- Produces: green typecheck + build, and a fixes-applied log closing the audit.

- [ ] **Step 1: Full typecheck + build**

```bash
pnpm typecheck && pnpm build 2>&1 | tail -15
```
Expected: both green (sharp-wasm32 warning excepted).

- [ ] **Step 2: Prove the headline bug is gone in prerendered output**

```bash
grep -rniE 'boilerplate|multi-tenant saas|prodotto saas' .output/public/**/index.html i18n/locales/*.json | grep -iE 'title|description|<title' || echo "CLEAN — no boilerplate SEO strings"
```
Expected: `CLEAN`.

- [ ] **Step 3: Append `## Fixes Applied` to the report**

List each fix with its commit hash and the before→after for title/description on a representative page (e.g. `/legal/privacy`).

- [ ] **Step 4: Final commit**

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): log applied fixes + close audit"
```

- [ ] **Step 5: Report to user**

Summarize: report location, top findings, what was fixed vs what needs an ops/DNS decision (`[DECIDE]` items), and remind that push is manual.

---

## Self-Review (author checklist — completed)

- **Spec coverage:** Fase 1 Crawlability→Task 1; Fase 2 Canonical/hreflang→Task 2; Fase 3 On-page + i18n bug→Task 3 (audit) + Task 7 (fix); Fase 4 schema/social→Task 4 + Task 8/9; Fase 5 images/linking→Task 5 + Task 9; report→Tasks 1–6; fix-all→Tasks 7–10; success criteria (typecheck+build, no honesty regression)→Task 10 + Global Constraints. ✓
- **Out-of-scope respected:** CWV noted as Low/notes only, no Lighthouse task; no Search Console task; no backlink task. ✓
- **Placeholders:** none — every code step shows concrete JSON/TS; every audit step shows the exact curl. Task 9 is intentionally report-driven with concrete example patterns, not a vague "handle the rest". ✓
- **Type/key consistency:** i18n key paths (`landing.seo.title/description/ogTitle/ogDescription/keywords`, `blog.seo.title/description`) match app.vue's `t()` calls and the file:line facts. `ceremly.site.seo` referenced as source-of-truth, not overwritten. ✓
