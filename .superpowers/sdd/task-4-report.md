# Task 4 — Structured data & social — work report

## Commands run (Step 1 — JSON-LD @type inventory)

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/rsvp-guide" "/blogs" "/weddings"; do
  echo "=== $p ==="
  curl -s -A "$UA" "https://ceremly.com$p" \
    | grep -ioE '"@type"[[:space:]]*:[[:space:]]*"[^"]+"' | sort -u
done
```

Raw output:
```
=== / ===
"@type":"AggregateOffer"
"@type":"ImageObject"
"@type":"Organization"
"@type":"ReadAction"
"@type":"SoftwareApplication"
"@type":"WebPage"
"@type":"WebSite"

=== /pricing ===
"@type":"ImageObject"
"@type":"Organization"
"@type":"ReadAction"
"@type":"WebPage"
"@type":"WebSite"

=== /rsvp-guide ===
"@type":"ImageObject"
"@type":"Organization"
"@type":"ReadAction"
"@type":"WebPage"
"@type":"WebSite"

=== /blogs ===
"@type":"ImageObject"
"@type":"Organization"
"@type":"ReadAction"
"@type":"WebPage"
"@type":"WebSite"

=== /weddings ===
"@type":"ImageObject"
"@type":"Organization"
"@type":"ReadAction"
"@type":"WebPage"
"@type":"WebSite"
```

Baseline richer than brief's "expected: Organization + WebSite" — actual live output already includes WebPage + duplicate Organization + ImageObject + ReadAction on every page. `/` alone adds SoftwareApplication + nested AggregateOffer.

## Full JSON-LD payload extraction (Python, to inspect actual field values, not just @type strings)

Ran a `re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S)` pass on `/`, `/pricing`, `/rsvp-guide`, `/blogs`, `/weddings`, plus `/legal/privacy` and `/blogs/come-iniziare` (pulled in later while chasing the OG-image bug and to verify Article presence on a real post).

Full `/` payload (homepage, most complete):
```json
{"@context":"https://schema.org","@graph":[{"@id":"https://ceremly.com/#website","@type":"WebSite","description":"Boilerplate SaaS multi-tenant con organizzazioni, team, abbonamenti, autenticazione e billing. Lancia il tuo prodotto più velocemente.","name":"Ceremly","url":"https://ceremly.com/","inLanguage":["it-IT","en-US"],"publisher":{"@id":"https://ceremly.com/#identity"},"workTranslation":[{"@id":"https://ceremly.com/en#website"},{"@id":"https://ceremly.com/#website"}]},{"@id":"https://ceremly.com/#webpage","@type":"WebPage","description":"Smetti di rincorrere conferme su WhatsApp: un link, un invito digitale e una dashboard che ti dice chi viene davvero — per matrimoni, lauree, battesimi e compleanni.","name":"Ceremly — Inviti digitali e RSVP intelligenti","url":"https://ceremly.com/","about":{"@id":"https://ceremly.com/#identity"},"isPartOf":{"@id":"https://ceremly.com/#website"},"potentialAction":[{"@type":"ReadAction","target":["https://ceremly.com/"]}],"primaryImageOfPage":{"@id":"https://ceremly.com/#logo"}},{"@id":"https://ceremly.com/#identity","@type":"Organization","name":"Ceremly","url":"https://ceremly.com"},{"@id":"https://ceremly.com/#/schema/software-application/1","@type":"SoftwareApplication","applicationCategory":"BusinessApplication","description":"...","name":"Ceremly","operatingSystem":"Web","url":"https://ceremly.com","offers":{"@type":"AggregateOffer","priceCurrency":"EUR","lowPrice":"0","offerCount":"3"}},{"@id":"https://ceremly.com/#logo","@type":"ImageObject","caption":"Ceremly","contentUrl":"https://ceremly.com/icon.png","inLanguage":"it","url":"https://ceremly.com/icon.png"},{"@id":"https://ceremly.com/#organization","@type":"Organization","logo":"https://ceremly.com/icon.png","name":"Ceremly","url":"https://ceremly.com"}]}
```

**Critical env check (brief-mandated):** `Organization` nodes (`#identity` and `#organization`) both show `"name":"Ceremly"`, `"url":"https://ceremly.com"` — real, populated, non-blank. Verified identically on all 7 pages checked. `NUXT_PUBLIC_APP_NAME`/`NUXT_PUBLIC_BASE_URL` are correctly set in production (`nuxt.config.ts:281-282` sources them with `|| ""` fallback — the fallback path is NOT active).

`/blogs/come-iniziare` full payload (to check Article presence — brief assumed it was missing on "blog posts"):
```json
{"@context":"https://schema.org","@graph":[...,{"@id":"https://ceremly.com/blogs/come-iniziare#article","datePublished":"2026-01-15","description":"Un tour rapido di ciò che è già pronto in questo boilerplate SaaS multi-tenant...","headline":"Come iniziare con il boilerplate SaaS","inLanguage":"it-IT","@type":["Article","BlogPosting"],"author":{"@id":"https://ceremly.com/#/schema/person/1"},"isPartOf":{"@id":"https://ceremly.com/blogs/come-iniziare#webpage"},"keywords":["boilerplate","guida"],"mainEntityOfPage":{"@id":"https://ceremly.com/blogs/come-iniziare#webpage"},"publisher":{"@id":"https://ceremly.com/#identity"}},{"@id":"https://ceremly.com/#/schema/person/1","@type":"Person","name":"Il Team"},...]}
```
**Correction to brief's assumption:** Article/BlogPosting IS present on the actual published post. The brief's Step-1 command samples `/blogs` (the index, client-rendered listing, no server-rendered article links — consistent with Section 3's method note), not an individual post — that's why the grep on `/blogs` shows no Article. Reported this distinction precisely in the finding rather than repeating the brief's incorrect premise.

Absent everywhere checked (5 sampled + 2 extra pages): `BreadcrumbList`, `FAQPage`, standalone `Product`/`Offer` (only nested `AggregateOffer`, homepage-only, not on `/pricing`).

## Commands run (Step 2 — OG/Twitter tags)

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for p in "/" "/pricing" "/weddings" "/en/"; do
  echo "=== $p ==="
  curl -s -A "$UA" "https://ceremly.com$p" \
    | grep -ioE '<meta[^>]+(property="og:[^"]+"|name="twitter:[^"]+")[^>]*>'
done
```

Raw output:
```
=== / ===
<meta property="og:type" content="website">
<meta property="og:title" content="Ceremly — Inviti digitali e RSVP intelligenti">
<meta property="og:description" content="Smetti di rincorrere conferme su WhatsApp: un link, un invito digitale e una dashboard che ti dice chi viene davvero — per matrimoni, lauree, battesimi e compleanni.">
<meta property="og:image" content="https://ceremly.com/ogImage-it.png">
<meta property="og:locale" content="it_IT">
<meta name="twitter:image" content="https://ceremly.com/ogImage-it.png">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:url" content="https://ceremly.com/">
<meta property="og:site_name" content="Ceremly">

=== /pricing ===
og:image = https://ceremly.com/og/pricing-it.png   twitter:image = same   (match)

=== /weddings ===
og:image = https://ceremly.com/og/weddings-it.png  twitter:image = same   (match)

=== /en/ ===
<meta property="og:image" content="https://ceremly.com/ogImage-it.png">   ← WRONG (IT image on EN page)
<meta name="twitter:image" content="https://ceremly.com/ogImage-en.png">  ← correct
```

**Unexpected finding (not anticipated by the brief):** `/en/` shows `og:image` (IT) ≠ `twitter:image` (EN). Reproduced 3/3 (two re-runs + `/en` no-trailing-slash variant), ruled out caching flake.

Re-verified other EN pages for scope: `/en/pricing` and `/en/weddings` are both correct (og:image = twitter:image = the EN variant) — the bug is NOT universal.

Extended the check to `/legal/cookie` (IT) and `/en/legal/cookie` since its source (`cookie.vue`) uses the same hardcoded-`ogImage-it.png` pattern seen in `index.vue`:
```
/legal/cookie (IT)    → og:image=ogImage-it.png  twitter:image=ogImage-it.png  (match, coincidental — IT is baseline)
/en/legal/cookie (EN) → og:image=ogImage-it.png  twitter:image=ogImage-en.png  (SAME BUG as /en/)
```

## Root-cause tracing (source reads)

`app/app.vue:27-31,38,41` — parent-level, locale-aware `ogImagePath` computed, assigned to both `ogImage` and `twitterImage`. This is correct.

`app/pages/index.vue:29-37`:
```ts
useSeoMeta({
    titleTemplate: '',
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogImage: `${baseUrl}/ogImage-it.png`,   // ← hardcoded IT, no twitterImage override
    ogType: 'website',
})
```

`app/pages/legal/cookie.vue:15-22` — identical pattern, same hardcoded `ogImage-it.png`, no `twitterImage` key.

Grepped every `ogImage:` assignment across all page files (`grep -n "ogImage:" app/pages/**/*.vue`, ~24 files) — confirmed these 2 are the ONLY hardcoded/non-locale-aware instances; every other page (weddings.vue:18-19, pricing.vue:25-26, about.vue, birthdays.vue, baptisms.vue, changelog.vue, contact.vue, examples.vue, features.vue, help-center.vue, graduations.vue, rsvp-guide.vue, how-it-works.vue, wedding-planner.vue, status.vue, templates.vue, api.vue) uses the locale-aware `${locale.value.startsWith('it') ? 'it' : 'en'}` pattern for BOTH ogImage and twitterImage together.

## Second unexpected finding: missing og:image on published blog post

```bash
curl -s -A "$UA" "https://ceremly.com/blogs/come-iniziare" | grep -ioE '<meta[^>]+(property="og:[^"]+"|name="twitter:[^"]+")[^>]*>'
```
Output has `og:image:alt` but NO `og:image`, NO `twitter:image` at all — tags entirely absent, not empty.

Root-caused to `app/pages/blogs/[slug].vue:82-89`:
```ts
const knownOgSlugs = new Set<string>([])   // always empty
const articleOgImage = computed(() => {
    if (knownOgSlugs.has(slug)) {
        return `${baseUrl}/og/${slug}.png`
    }
    return article.value?.cover ? `${baseUrl}${article.value.cover}` : undefined
})
```
`knownOgSlugs` is a hardcoded empty Set. Checked `content/blogs/come-iniziare.md` frontmatter (lines 1-8): no `cover` field. So `articleOgImage` → `undefined` → `useSeoMeta` correctly omits the tag. Two independent fallback tiers, neither populated for this article.

## Step 4 — og:image HTTP resolution check

```bash
curl -sI -A "$UA" "https://ceremly.com/ogImage-it.png" | grep -iE "^HTTP|content-type"
```
Extended to all 6 distinct image URLs discovered:
```
/ogImage-it.png       → HTTP/2 200, image/png, 51283 bytes
/ogImage-en.png       → HTTP/2 200, image/png, 58877 bytes
/og/pricing-it.png    → HTTP/2 200, image/png, 54830 bytes
/og/pricing-en.png    → HTTP/2 200, image/png, 59032 bytes
/og/weddings-it.png   → HTTP/2 200, image/png, 52115 bytes
/og/weddings-en.png   → HTTP/2 200, image/png, 52172 bytes
```
All resolve 200, correct content-type, no broken images anywhere. Confirms the two bugs found (4.4, 4.5) are "wrong URL" / "no URL" problems, never a "URL points at a 404" problem.

## og:description boilerplate check (brief-mandated)

`/legal/privacy` og:description: *"Organizzazioni, team, billing e auth pronti all'uso. Concentrati sul prodotto, non sull'infrastruttura."* — confirmed boilerplate, but a DIFFERENT string from the `landing.seo.description` boilerplate already fully documented in Section 3.1. Source: sibling i18n key `landing.seo.ogDescription` (`app/app.vue:37`). Cited in the finding as reaching social preview text too, cross-referenced to Section 3.1 rather than re-scored as a new independent finding (Section 3.1 Priority 1 already covers fixing the whole `landing.seo.*` block).

## Findings written to Section 4 (7 subsections)

1. **4.1** — JSON-LD baseline, richer than brief expected (WebSite+WebPage+Organization×2+ImageObject+ReadAction everywhere, +SoftwareApplication/AggregateOffer on `/` only). Clean.
2. **4.2** — Organization env check: POPULATED (name="Ceremly", url="https://ceremly.com"), confirmed on all 7 pages. Clean/no fix needed — stated explicitly per brief's format requirement for clean areas.
3. **4.3** — Absent: BreadcrumbList (all deep pages), FAQPage (rsvp-guide, pricing), Product/Offer (pricing specifically). Article IS present (correcting brief's framing) on individual posts, absent only on the `/blogs` index (defensible). Impact Medium, Priority 3.
4. **4.4** — OG image locale-mismatch bug on `/en/` and `/en/legal/cookie` (og:image stays IT, twitter:image correctly flips EN). Root-caused to `index.vue:35` and `legal/cookie.vue:20`, both missing the locale-aware pattern used everywhere else. Impact Medium, Priority 2.
5. **4.5** — Missing og:image/twitter:image entirely on `/blogs/come-iniziare`. Root-caused to empty `knownOgSlugs` Set + no `cover` frontmatter field, two fallback tiers both empty. Impact Medium, Priority 3.
6. **4.6** — OG/Twitter completeness otherwise clean on 4 sampled pages + extras; og:locale correctly flips it_IT/en_US everywhere including the buggy pages (only the image URL is wrong, not the locale tag). og:description boilerplate confirmed on legal pages, cross-referenced to 3.1, not re-scored.
7. **4.7** — All 6 distinct og:image URLs resolve HTTP 200, correct content-type, no broken images. Clean.

## Surprises / deviations from the brief

- Brief assumed Article was missing on blog posts — it's present on the real post, just not on the `/blogs` index the brief's command samples. Corrected this precisely rather than reporting a false negative.
- Two bugs found that the brief did not anticipate at all (OG image locale-mismatch on 2 pages; missing OG image on the one live blog post) — both surfaced naturally while executing the brief's own Step 1/Step 2 commands and extending slightly (checking `/en/pricing`/`/en/weddings` as a sanity check after seeing `/en/` was wrong, then grepping all `ogImage:` call sites to scope it precisely). Both root-caused to exact file:line before writing the finding, per the "never invent a finding" instruction.
- Organization env check came back clean (populated) — the brief flagged this as the top risk to check but it turned out not to be a live problem. Stated explicitly with evidence per the mandatory format, not skipped just because it was clean.

## Commit

```bash
git add docs/seo/SEO-AUDIT-2026-07-10.md
git commit -m "docs(seo): structured-data + social findings"
```
Verified pre-commit: `git diff --stat` showed 150 insertions, 0 deletions — pure append, nothing else in the file touched. `.serena/project.yml`, `docs/portfolio/lessons-learned.md`, and all `.superpowers/**` files deliberately excluded from staging.
