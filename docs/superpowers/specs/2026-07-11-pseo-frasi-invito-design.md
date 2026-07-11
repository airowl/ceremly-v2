# Programmatic SEO "Frasi di invito" — Design

**Data:** 2026-07-11
**Stato:** approvato (brainstorming con skill marketing programmatic-seo)
**Riferimenti:** `docs/superpowers/specs/2026-07-11-site-architecture-design.md`, `docs/superpowers/specs/2026-07-11-ai-seo-design.md`, `.claude/product-marketing-context.md`

## Obiettivo

Famiglia di pagine programmatic SEO sul pattern **"frasi di invito per [occasione]"** (playbook Examples): long tail italiana ad alto intent ("frasi invito battesimo", "testo invito 18 anni") — chi cerca frasi sta per mandare inviti, cioè è il momento esatto in cui serve Ceremly. Conversione: CTA "trasforma la frase in un invito digitale con RSVP" → signup.

## Decisioni vincolanti (prese in brainstorming)

1. **Playbook**: frasi/testi di invito (Examples). Non template gallery, non espansione landing evento.
2. **Matrice a 1 dimensione**: una pagina per occasione, toni come sezioni interne. Niente pagine occasione×tono (thin content / cannibalizzazione su dominio giovane).
3. **Scope al lancio**: tutte le ~15 occasioni.
4. **Lingue**: IT + EN (decisione utente). Frasi EN **riscritte** per cultura anglofona, non tradotte.
5. Contenuto originale scritto ad hoc — no scraping, no swap di variabili in copy identica.

## Architettura & URL

### Hub

- IT: `/frasi-invito` — EN: `/en/invitation-wording`
- File: `app/pages/frasi-invito/index.vue`, layout `public-site`, prerender.
- Contenuto: answer block 40-60 parole, card per le 15 occasioni con anchor descrittivi, cross-link a `/events`, `/templates`, `/rsvp-guide`, CTA signup.
- Le card sono generate dalla collection `frasi` (query per locale, campo `title`/`description`); la copy statica dell'hub (intro, CTA) sta in `i18n/locales/`.
- Schema: `ItemList` (le occasioni) via `useSchemaOrg`.

### Spoke (15 occasioni)

| Slug IT | Slug EN | Keyword primaria IT |
|---|---|---|
| `matrimonio` | `wedding` | frasi invito matrimonio |
| `battesimo` | `christening` | frasi invito battesimo |
| `prima-comunione` | `first-communion` | frasi invito prima comunione |
| `cresima` | `confirmation` | frasi invito cresima |
| `laurea` | `graduation` | frasi invito laurea |
| `compleanno` | `birthday` | frasi invito compleanno |
| `18-anni` | `18th-birthday` | frasi invito 18 anni |
| `40-anni` | `40th-birthday` | frasi invito 40 anni |
| `50-anni` | `50th-birthday` | frasi invito 50 anni |
| `60-anni` | `60th-birthday` | frasi invito 60 anni |
| `anniversario-matrimonio` | `wedding-anniversary` | frasi invito anniversario matrimonio |
| `baby-shower` | `baby-shower` | frasi invito baby shower |
| `pensionamento` | `retirement` | frasi invito pensionamento |
| `inaugurazione-casa` | `housewarming` | frasi invito inaugurazione casa |
| `fidanzamento` | `engagement` | frasi invito fidanzamento |

- File: `app/pages/frasi-invito/[slug].vue` (template unico data-driven).
- Routing EN: `i18n.pages` customRoutes **solo per questa famiglia** — `frasi-invito/index` → `/invitation-wording`, `frasi-invito/[slug]` → `/invitation-wording/[slug]`. Il resto del sito resta invariato (decisione site-architecture: nessuna migrazione URL esistenti).
- Slug EN diversi dagli IT: mapping IT↔EN via `translationSlug` nel content (pattern blog esistente).

### Gerarchia logica e linking

- Breadcrumb: `Home > Frasi di invito > [Occasione]` via `CerBreadcrumb`.
- **Dipendenza**: `CerBreadcrumb` e `CerRelatedLinks` arrivano dal piano site-architecture (`docs/superpowers/plans/2026-07-11-site-architecture.md`) — quel piano va implementato **prima o insieme**.
- Link in ingresso (zero orfani):
  - Footer, colonna Risorse: voce "Frasi di invito" → hub.
  - Pagine evento (weddings, baptisms, birthdays, graduations): link alla pagina frasi corrispondente via `CerRelatedLinks`.
  - `/rsvp-guide` e blog post pertinenti → hub o spoke pertinente.
  - Hub `/events` ↔ hub frasi: cross-link reciproco.
- Link in uscita da ogni spoke: pagina evento affine, `/templates`, `/rsvp-guide`, 2 pagine frasi vicine.

## Template pagina spoke (unico, data-driven)

Struttura per ogni occasione:

1. **H1** keyword-target (es. "Frasi di invito per il battesimo: esempi pronti da copiare") + **answer block** 40-60 parole (pattern §1.4 piano ai-seo).
2. **Indice anchor** alle sezioni.
3. **Sezioni per tono**: formali · semplici/brevi · spiritose/originali · religiose (solo dove pertinente: battesimo, comunione, cresima, matrimonio) · pronte per WhatsApp. Totale **30-50 frasi/pagina**.
4. Ogni frase = card con bottone **"Copia"** (clipboard, micro-utility che differenzia da content farm).
5. **Box consigli** "Come scrivere l'invito per [occasione]": 4-5 consigli specifici (galateo italiano: chi firma, come gestire plus-one, dress code, tempistiche).
6. **FAQ** 3-4 domande specifiche → schema `FAQPage`.
7. **CTA conversione**: "Hai la frase? Trasformala in un invito digitale con RSVP" → `/signup` + link pagina evento corrispondente.
8. **CerRelatedLinks** (vedi linking sopra).

## Contenuto & dati

- Nuova collection @nuxt/content **`frasi`** (type `data`, YAML): `content/frasi/*.yml`.
- Schema Zod (in `content.config.ts`): `slug`, `locale` (`it`/`en`), `translationSlug`, `title`, `description` (meta), `answer`, `sezioni[{ tono, intro, frasi[] }]`, `consigli[]`, `faq[{ q, a }]`, `related` (slug evento/frasi affini), `published`.
- Frasi **originali scritte ad hoc**, culturalmente italiane; versione EN riscritta (usanze anglofone: RSVP by date, registry etiquette, ecc.).
- Volume: 15 file IT + 15 file EN + 2 hub = **32 pagine**.

## Tecnica

- Pagine: `app/pages/frasi-invito/index.vue` + `[slug].vue`, layout `public-site`, **prerender** (route rules coerenti con blog/landing).
- Alternative scartate: dati TS in `shared/` (contenuto nel bundle client, non editoriale); 15 pagine `.vue` statiche (duplicazione template).
- Sitemap: entries dinamiche dal content + prerender (come blog); nessun cambio robots.
- SEO per-pagina: title/description unici dalla collection, canonical self-referencing, **hreflang IT↔EN reciproci** (mapping via translationSlug).
- i18n UI (bottone "Copia", label CTA, titoli sezione ricorrenti) in `i18n/locales/` — **gotcha `@`** nei messaggi vue-i18n: verifica con build, non solo dev.
- Schema markup: `FAQPage` (spoke), `ItemList` (hub), `BreadcrumbList` via `useBreadcrumbItems` (unica fonte, come da site-architecture).

## Qualità (anti-thin-content)

- Ogni pagina: frasi 100% specifiche dell'occasione + consigli e FAQ unici, min ~800 parole.
- Nessuna frase duplicata tra occasioni; nessun blocco di testo condiviso oltre a UI/CTA.
- Title e meta description unici per pagina (no formula con variabile swappata sola).
- Nessuna social proof inventata (memoria honesty 2026-06-17).

## Fuori scope (esplicito)

- Tool interattivi (generatore frasi AI, personalizzatore).
- Pagine occasione×tono separate (rivalutare post-indicizzazione se query tono con volume proprio).
- Altre famiglie pSEO (locations, directory, profiles).
- Nuove landing evento (comunioni, cresime come pagine commerciali — solo slot logici in `/events`).
- Modifiche a dashboard, auth, API backend.

## Verifica

- `pnpm typecheck` + `pnpm build` verdi (build obbligatoria per gotcha i18n `@`).
- Prerender output: 32 pagine presenti; canonical self; hreflang IT↔EN reciproci con slug corretti.
- Schema valido (Rich Results Test): FAQPage su spoke, ItemList su hub, BreadcrumbList non duplicato.
- Bottone "Copia" funzionante (clipboard) su mobile e desktop.
- Link audit: hub e 15 spoke raggiungibili da ≥1 link interno oltre nav/footer; zero 404.
- Sitemap contiene tutte le pagine IT + EN.

## Rischi

| Rischio | Mitigazione |
|---|---|
| Thin content percepito (15 pagine simili) | Frasi/consigli/FAQ interamente specifici per occasione; min ~800 parole |
| Cannibalizzazione 40/50/60 anni | Contenuto ancorato al traguardo specifico; se dopo il lancio non indicizzano separatamente, merge in una pagina unica (decisione post-launch, non ora) |
| EN debole (traduzione letterale) | Riscrittura culturale obbligatoria, stessa ricchezza dell'IT |
| Dipendenza componenti site-architecture | Sequenza: piano site-architecture prima o insieme; in assenza, fallback = link inline senza CerRelatedLinks (da evitare) |
| Copy i18n rompe il build (`@` gotcha) | Build di verifica obbligatoria |
| customRoutes i18n regressione su altre route | Config `i18n.pages` limitata alla sola famiglia frasi-invito; verifica hreflang/canonical su pagine esistenti nel build |
