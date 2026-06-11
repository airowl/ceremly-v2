# PHASE 5 — i18n, SEO & Legal

> **Obiettivo della fase.** Rendere il boilerplate pronto per i mercati **italiano e internazionale** (bilingue IT/EN), trovabile (SEO), e conforme per andare live in UE (pagine legali + cookie banner GDPR). Sono i pezzi "non glamour" che però servono in ogni SaaS reale, specie per chi opera tra Italia e mercati internazionali.
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`.** Le fasi precedenti devono aver passato i checkpoint.

---

## Scope

### ✅ In questa fase
- **i18n con `@nuxtjs/i18n`**: due lingue, **inglese e italiano**. Strategia di routing, rilevamento lingua, switcher, file di traduzione organizzati.
- Traduzione di tutta la UI prodotta finora (auth, billing, dashboard di base) in IT/EN.
- Aggancio i18n alle **email** (Fase 4): le email vanno nella lingua dell'utente/organization.
- **SEO**: meta tag, Open Graph, sitemap, robots, canonical. Uso di `@nuxtjs/seo` (o i moduli equivalenti aggiornati — verifica via web). SEO consapevole del multilingua (hreflang).
- **Pagine legali**: Privacy Policy, Terms of Service, (eventuale) Data Processing Agreement — come pagine con contenuto placeholder strutturato, bilingui, da riempire per ogni prodotto.
- **Cookie banner GDPR**: consenso, gestione preferenze, blocco degli script non essenziali finché non c'è consenso. Coerente con l'essere in UE.

### ❌ NON in questa fase
- Admin dashboard → Fase 6
- Analytics vero e proprio → Fase 6 (ma il cookie banner di QUESTA fase deve essere pronto a gating gli script di analytics che arriveranno)
- Testing → Fase 7

---

## Task dettagliati

### 5.1 — Setup i18n
- Installa e configura `@nuxtjs/i18n` (verifica via web la versione/compatibilità con Nuxt 4).
- Lingue: `en` (default international) e `it`. Decidi e documenta la strategia di routing (prefix, prefix_except_default, ecc.) — per un SaaS IT+internazionale, valuta `prefix_except_default` con `en` default, o la strategia che meglio serve la SEO multilingua.
- Rilevamento lingua dal browser + override manuale persistito.
- Struttura file di traduzione in `i18n/locales/` (per area: auth, billing, common, ecc.), non un unico file gigante.

### 5.2 — Traduci la UI esistente
- Estrai tutte le stringhe hardcoded delle fasi precedenti in chiavi di traduzione.
- Fornisci IT ed EN per ognuna.
- Aggiungi uno **switcher di lingua** nell'UI.

### 5.3 — Email multilingua
- Aggancia i template email (Fase 4) alla lingua dell'utente/organization: l'email parte nella lingua giusta.
- Predisponi le stringhe email in IT/EN.

### 5.4 — SEO
- Configura `@nuxtjs/seo` (o moduli equivalenti aggiornati: sitemap, robots, og-image, schema).
- Meta tag di default + override per pagina; Open Graph; canonical.
- **hreflang** per il multilingua (segnala a Google le versioni IT/EN).
- Sitemap che includa le varianti di lingua.

### 5.5 — Pagine legali
- Crea pagine `privacy`, `terms`, (opz.) `dpa`, bilingui, con struttura/sezioni standard e contenuto **placeholder chiaramente segnato** ("[DA COMPLETARE PER IL PRODOTTO]").
- Linkale nel footer.

### 5.6 — Cookie banner GDPR
- Implementa un cookie banner con: accetta/rifiuta, gestione granulare delle categorie (essenziali vs analytics/marketing), persistenza della scelta.
- **Gli script non essenziali (es. analytics di Fase 6) NON partono senza consenso.** Predisponi il meccanismo di gating ora, così la Fase 6 ci si aggancia.

---

## Checkpoint di verifica

- [ ] L'app è navigabile in EN e IT; lo switcher funziona e la scelta persiste
- [ ] Tutta la UI delle fasi precedenti è tradotta (nessuna stringa hardcoded rimasta)
- [ ] Le email partono nella lingua dell'utente/organization
- [ ] I meta tag, Open Graph e canonical sono presenti; la sitemap si genera
- [ ] hreflang segnala correttamente le versioni IT/EN
- [ ] Esistono le pagine legali bilingui (con placeholder segnati) linkate nel footer
- [ ] Il cookie banner funziona: rifiutando, gli script non essenziali non partono
- [ ] Il meccanismo di gating del consenso è pronto per gli analytics di Fase 6
- [ ] `npm run typecheck` e `npm run lint` passano
- [ ] Commit: `feat: phase 5 — i18n, SEO, legal`
