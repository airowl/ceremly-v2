# AI SEO (GEO/AEO) — Design

**Data:** 2026-07-11
**Stato:** approvato (brainstorming con audit visibilità live)
**Riferimenti:** `docs/seo/SEO-AUDIT-2026-07-10.md` (SEO tradizionale), `.claude/product-marketing-context.md` (posizionamento)

## Obiettivo

Rendere Ceremly recuperabile, estraibile e citabile dai motori AI (Google AI Overviews, ChatGPT, Perplexity, Gemini, Copilot) per le query di categoria in italiano, e leggibile dagli agenti AI che confrontano prodotti per conto degli utenti.

## Baseline — Audit visibilità AI (2026-07-11, live)

Test eseguiti su ChatGPT (con ricerca web), Perplexity e Google (hl=it, gl=it):

| Query | Piattaforma | Ceremly citato? | Citati |
|---|---|---|---|
| migliori siti inviti digitali matrimonio con RSVP | Perplexity | No | Paperless Post, Greenvelope, Joy, Evite, Whocan, InvitiApp (fonti: listicle fotify, renderforest) |
| come raccogliere conferme RSVP online senza Excel/WhatsApp | Perplexity | No | Jotform, WithJoy, guestlistonline, togevent |
| cos'è Ceremly e come funziona | Perplexity | **Sì** (15 fonti, descrizione accurata) | ceremly.com |
| migliori siti inviti digitali matrimonio con rsvp | Google AI Overview | No | Joy, Wix; SERP: rsvp-online.it, Matrimonio.com, Whocan, Reddit r/weddingplanning, Il Nostro Sì |
| migliori servizi italiani inviti digitali con RSVP | ChatGPT | No | JoinMe, nonmancare.it, Wedday, RSVP Online, WeddingZen (podio: JoinMe, nonmancare, Wedday) |
| cos'è Ceremly? | ChatGPT | **Sì** (pricing e feature esatti) | ceremly.com |

**Conclusioni:**
1. **Brand query: già ottime.** Il sito è estraibile — entrambi i motori descrivono Ceremly con precisione (pricing incluso). Le fondamenta SSR/prerender funzionano.
2. **Query di categoria: zero visibilità.** Ceremly non appare mai nei "best of". È il gap da colmare.
3. **Competitive set AI reale (italiano):** JoinMe, nonmancare.it, Wedday, WeddingZen, Whocan, rsvp-online.it, Il Nostro Sì, InvitiApp — diverso da quello nel marketing context (Joy/Zola/Paperless Post).
4. **Chi vince viene citato via:** (a) listicle di terzi, (b) pagine-keyword proprie (`withjoy.com/online-rsvp`), (c) Reddit/forum.

## Criteri di successo

- Entro 3 mesi dalla pubblicazione: le pagine comparison vengono citate per almeno una query "vs"/"alternative" nel check mensile.
- `/pricing.md` e `/llms.txt` live, raggiungibili, sincronizzati col pricing reale.
- Check mensile di visibilità operativo con baseline compilata (questo documento).
- Nessuna regressione SEO tradizionale (le modifiche sono additive).

## Decisioni prese in brainstorming

- **Approccio fasato** (fondamenta → contenuti → presence), non content-first né programmatic (programmatic scartato: sito beta, authority bassa, rischio scaled-content-abuse segnalato da Google).
- **Comparison con competitor nominati**: sì, confronti onesti feature-per-feature.
- **Off-site**: solo azioni one-shot (directory); niente presenza community continuativa per ora.
- **robots.txt invariato**: nessun bot AI bloccato oggi (audit SEO §1.1); non bloccare neanche CCBot in fase beta — massima visibilità > protezione training.

---

## Fase 1 — Fondamenta on-site (machine-readable + estraibilità)

### 1.1 `/pricing.md` — route Nitro generata dai dati reali

- `server/routes/pricing.md.get.ts`: genera markdown da `shared/constants/pricing.ts` (piani, limiti, prezzi) + copy statica descrittiva dei piani (Free / Celebrazione €39 una tantum per evento / Atelier €24/mese).
- `Content-Type: text/markdown`. Prerender via routeRules.
- Contenuto: per ogni piano — prezzo, limiti espliciti (ospiti, eventi), feature incluse, note commerciali verificate (12 mesi consultazione, rimborso 30 giorni, fattura elettronica).
- Linkato da `/prezzi` (link discreto nel footer della pagina) e da `llms.txt`.
- Motivazione: gli agenti AI che confrontano prodotti filtrano fuori chi ha pricing opaco; il file generato non può desincronizzarsi dal pricing vero.

### 1.2 `/llms.txt` — route Nitro, formato llmstxt.org

- `server/routes/llms.txt.get.ts`. App name e base URL da `useRuntimeConfig` (convenzione branding env-driven).
- Struttura: H1 nome prodotto, blockquote one-liner ("Inviti digitali e RSVP intelligenti per gli eventi che contano"), paragrafo descrittivo (cosa fa, per chi, mercato italiano), sezioni di link: pagine chiave (come-funziona, prezzi, pricing.md, rsvp-guide, pagine evento, confronti), blog. Versione IT con link alle pagine EN.

### 1.3 Schema aggiuntivo via `useSchemaOrg` (modulo `@nuxtjs/seo` già presente)

- `FAQPage` su `/prezzi`, `/rsvp-guide`, pagine evento — **le FAQ devono essere visibili in pagina**, mai schema-only.
- `SoftwareApplication` + `Offer` su `/prezzi`.
- Copre anche l'item §4.3 dell'audit SEO (BreadcrumbList/FAQPage/Product assenti) — nessun doppio lavoro con il piano SEO tradizionale.

### 1.4 Answer blocks (estraibilità)

- Paragrafo di risposta diretta 40-60 parole in cima alle pagine chiave, autonomo (comprensibile senza contesto): es. `/rsvp-guide` apre con "Cos'è un RSVP online?" risposto in ~50 parole.
- H2/H3 in forma di domanda dove naturale (matcha il fraseggio delle query).
- Copy IT + EN in `i18n/locales/`. Nessun cambio di layout — solo struttura testuale.
- Regola guida (Google): scrivere per le persone, organizzare per chiarezza. Niente contenuto separato "per AI", niente frammentazione artificiale.

### 1.5 Freshness

- "Ultimo aggiornamento: [data]" visibile su guide e comparison + `dateModified` nello schema.

## Fase 2 — Contenuti citabili

### 2.1 Pagine comparison (data-driven)

- `app/pages/confronta/[slug].vue` + dati in modulo TS (es. `app/data/comparisons.ts`): nome competitor, tabella feature-per-feature, punti dove vince il competitor, FAQ dedicate, prezzi, data verifica.
- Prerender, sitemap (config esplicita per le route dinamiche), hreflang IT/EN (`/confronta/joinme` ↔ `/en/compare/joinme`).
- Schema: `Article` + `FAQPage`; `ItemList` sulla pagina alternative.
- Set iniziale (4 pagine, dai dati audit):
  | Pagina | Query target | Razionale |
  |---|---|---|
  | vs JoinMe | "Ceremly vs JoinMe" | n.1 nel podio ChatGPT |
  | vs Wedday | "Ceremly vs Wedday" | competitor più simile (link, no-account, mobile-first) |
  | vs Whocan | "Ceremly vs Whocan" | il gratuito citato su Google/Perplexity |
  | Alternative italiane a Paperless Post | "alternative a Paperless Post" | formato lista, 5-6 servizi incluso Ceremly |
- **Vincolo di onestà** (precedente bonifica social proof 2026-06-17): ogni claim sui competitor verificato sul loro sito prima di pubblicare; data di verifica visibile ("Confronto aggiornato a luglio 2026"); riconoscere i punti di forza altrui. Nota dallo studio citato nella skill ai-seo: per brand emergenti le listicle auto-promozionali mal fatte finiscono citate in risposte che raccomandano i competitor — l'onestà è anche strategia.

### 2.2 `/rsvp-guide` potenziata come pagina-keyword

- Modello: `withjoy.com/online-rsvp` (la pagina più citata oggi per queste query).
- Coprire le fan-out query emerse dall'audit: cos'è RSVP, come chiederlo via WhatsApp (template messaggio), tempistiche (4-6 settimane prima dell'evento), QR code su partecipazioni cartacee, raccolta allergie/menu/plus-one, reminder a chi non risponde.
- Answer block iniziale + FAQ + FAQPage schema (da §1.3-1.4).

### 2.3 Blog how-to (2-3 articoli)

- Query target dall'audit: "come raccogliere conferme senza Excel e WhatsApp", "inviti matrimonio via WhatsApp: guida completa".
- Infrastruttura `@nuxt/content` già pronta (`content/blogs/`), traduzioni via `translationSlug`.
- Applicare pattern Princeton GEO: statistiche con fonte e data (+37%), citazioni di fonti autorevoli (+40%), chiarezza; niente keyword stuffing (-10%).

## Fase 3 — Presence + monitoring

### 3.1 Directory submission (one-shot, azioni manuali utente)

- Deliverable: checklist in `docs/seo/` con link, testi profilo pronti (da product-marketing-context) e stato.
- Target: Product Hunt, Capterra/GetApp, AlternativeTo (listing come alternativa a Paperless Post/Evite), SaaSHub, directory SaaS italiane.
- Fuori scope: Wikipedia (non notable in beta), presenza community continuativa (Reddit/forum) — rinviata a dopo il lancio pubblico.

### 3.2 Monitoring mensile DIY

- `docs/seo/ai-visibility-log.md`: query set fisso (le 6 dell'audit + 4 aggiuntive: "inviti digitali battesimo", "app gestione invitati matrimonio", "RSVP online gratis", "inviti laurea digitali"), griglia piattaforma × query × citato/chi.
- Baseline 2026-07-11 = tabella audit di questo documento.
- Cadenza mensile; eseguibile manualmente o ri-eseguibile da Claude via browser su richiesta.

### 3.3 Aggiornamento `product-marketing-context.md`

- Aggiungere il competitive set italiano reale (JoinMe, nonmancare.it, Wedday, WeddingZen, Whocan, rsvp-online.it, Il Nostro Sì, InvitiApp) accanto agli internazionali, con nota "scoperti via audit visibilità AI 2026-07-11".

---

## Fuori scope (esplicito)

- Programmatic SEO a scala (rischio spam policy in beta).
- OKF (`/okf/`): nessun segnale di ranking confermato oggi; rivalutare a spec matura.
- Tool di monitoring a pagamento (Otterly, Peec): DIY finché il volume non lo giustifica.
- Contenuto separato "per AI" o chunking artificiale (contro linee guida Google).
- Blocco bot AI in robots.txt.

## Test e verifica

- `pnpm typecheck` + `pnpm build` verdi (gotcha noto: '@' nei messaggi i18n rompe il file locale — verificare con build, non solo dev).
- `/pricing.md` e `/llms.txt`: test unit sulla generazione (contenuto riflette `pricing.ts`) + verifica manuale su preview.
- Pagine comparison: prerender presente nell'output di build, sitemap le include, hreflang reciproco.
- Schema: validazione con Rich Results Test / validator schema.org sulle pagine toccate.
- Verifica end-to-end post-deploy: rieseguire le 2 brand query + 1 query categoria sui 3 motori (aspettativa realistica: brand invariato subito, categoria nei mesi).

## Rischi

| Rischio | Mitigazione |
|---|---|
| Claim inaccurati sui competitor | Verifica su fonte primaria + data verifica visibile + review pre-pubblicazione |
| Contenuto comparison percepito come spam | Onestà feature-per-feature, punti di forza altrui riconosciuti, una pagina per competitor reale (no varianti a scala) |
| Copy i18n rompe il build ('@' gotcha) | Build di verifica obbligatoria |
| Pricing.md desincronizzato | Generazione da `pricing.ts`, non file statico |
