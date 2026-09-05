# Task 4 Report: Enrich homepage SoftwareApplication

## Status: DONE

## Files changed
- `app/pages/index.vue`
- `i18n/locales/it-IT.json`
- `i18n/locales/en-US.json`

## Import added (app/pages/index.vue, after component imports, line 12)

```ts
import { CELEBRATION_PRICE_CENTS, ATELIER_PRICE_CENTS } from '~~/shared/constants/pricing'
```

Verified this matches the exact import path/style used in `app/pages/pricing.vue` line 10.

## Replaced useSchemaOrg block (app/pages/index.vue)

Before (bare AggregateOffer, no featureList):
```ts
useSchemaOrg([
    {
        '@type': 'SoftwareApplication',
        'name': (runtimeConfig.public.appName as string) || 'Ceremly',
        'applicationCategory': 'BusinessApplication',
        'operatingSystem': 'Web',
        'description': seoDescription,
        'url': baseUrl,
        'offers': {
            '@type': 'AggregateOffer',
            'priceCurrency': 'EUR',
            'lowPrice': '0',
            'offerCount': '3',
        },
    },
])
```

After:
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

This preserves the SoftwareApplication object-literal shape (per plan) while making `offers` an array of 3 `defineOffer(...)` calls (auto-imported by nuxt-schema-org, no new import needed) and adding `featureList`. No `aggregateRating` was added anywhere.

## i18n keys added

Verified the `ceremly.home.seo` object location (line 139) in both locale files before editing — confirmed only `title`/`description`/`ogTitle`/`ogDescription`/`keywords` existed prior; no `feature1/2/3` present yet; no structural surprises vs. the brief's assumptions.

`i18n/locales/it-IT.json` (under `ceremly.home.seo`, after `keywords`):
```json
"feature1": "Inviti digitali personalizzati per ogni ospite",
"feature2": "Raccolta RSVP con domande su menu, allergie e plus-one",
"feature3": "Dashboard in tempo reale con promemoria automatici"
```

`i18n/locales/en-US.json` (under `ceremly.home.seo`, after `keywords`):
```json
"feature1": "Personalized digital invitations for every guest",
"feature2": "RSVP collection with menu, allergy and plus-one questions",
"feature3": "Real-time dashboard with automatic reminders"
```

No `@` character present in any of these strings (checked — the known vue-i18n gotcha that breaks the whole locale file was avoided). Confirmed `ceremly.site.prezzi.colFree` = "Free · €0", `colCeleb` = "Celebrazione · €39", `colAtelier` = "Atelier · €24/mese" already exist in it-IT.json and are reused as-is for the 3 offer names.

JSON validity of both locale files confirmed via `node -e "JSON.parse(...)"` on both files — OK, no syntax errors introduced.

## Typecheck result

`pnpm typecheck` — PASS. Only pre-existing, unrelated warnings printed (nuxt-site-config localhost warning, @nuxt/robots disallow warnings for `/_nuxt/**` and `/api/**`); no TypeScript errors.

## Build result

`pnpm build` — succeeded. Pre-existing `sharp` binary inclusion message present (not a failure); final line: `[nitro] ✔ You can preview this build using node .output/server/index.mjs`.

## Grep verification against `.output/public/index.html`

```
SoftwareApplication:
"@type":"SoftwareApplication"

Offer count:
3

featureList:
"featureList"

aggregateRating count:
0 matches for 'aggregateRating'
```

(The `aggregateRating` check used `grep -c`, which exits with code 1 when the count is 0 — that is the expected/correct outcome here, not a failure.)

All expectations from the brief's Step 5 met:
- `"@type":"SoftwareApplication"` present — YES
- Offer count >= 3 — YES (exactly 3)
- `"featureList"` present — YES
- `aggregateRating` count = 0 — YES (no fake rating leaked)

## Commit

`60f79c3` — `feat(schema): enrich homepage SoftwareApplication (3 offers + featureList)`
3 files changed, 19 insertions(+), 8 deletions(-)
Staged explicitly (`git add app/pages/index.vue i18n/locales/it-IT.json i18n/locales/en-US.json`), not `git add -A`. Not pushed — push is manual per project convention.

## Concerns

None. Scope stayed within `app/pages/index.vue` + the 2 locale files as instructed. No `@` characters introduced in locale values. The mixed object-literal (SoftwareApplication) + `defineOffer` helper (offers array) form was applied exactly as prescribed by the brief, matching the existing pattern already used on `/pricing`.
