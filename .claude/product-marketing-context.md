# Product Marketing Context

*Last updated: 2026-06-21 — verificato contro sito pubblico live + codice (i18n `it-IT.json`, `shared/constants/pricing.ts`, pagine `app/pages/`). Allineato al posizionamento Ceremly attuale.*

## Product Overview
**One-liner:** Inviti digitali e RSVP intelligenti per gli eventi che contano.

**What it does:** Ceremly permette a chi organizza un evento privato di creare un invito digitale contestualizzato per tipo di evento, distribuirlo con un link personalizzato per ogni ospite, raccogliere risposte RSVP con domande condizionali (allergie, menu, plus-one) e gestire tutto da un'unica dashboard in tempo reale. Niente più gruppi WhatsApp, Google Forms generici e fogli Excel aggiornati a mano.

**Product category:** Inviti digitali + gestione RSVP / guest management per eventi privati (lo "scaffale" su cui ci cercano: "inviti digitali", "RSVP online", "gestione invitati matrimonio/laurea").

**Product type:** SaaS B2C-first (organizzatore privato), con un tier B2B per event/wedding planner.

**Business model:** Freemium con **pagamento una tantum per evento** (no percentuali sugli ospiti, no costo per RSVP) + un abbonamento mensile per chi organizza per lavoro.
- **Free · €0** — fino a 30 ospiti, 1 evento attivo, 3 modelli, RSVP via link, dashboard base. Nessuna carta richiesta.
- **Celebrazione · €39 una tantum/evento** *(più scelto)* — 1 evento per acquisto, fino a 250 ospiti, tutti i modelli + brand colors, WhatsApp & email personalizzati, menu/allergie/plus-one, promemoria automatici, export per catering.
- **Atelier · €24/mese (per planner)** — eventi e ospiti illimitati, workspace col proprio logo, domini personalizzati, API & integrazioni catering, account team, supporto prioritario.

**Dettagli commerciali (verificati su /pricing):** evento consultabile 12 mesi dopo la data (lista + risposte + export inclusi); rimborso completo entro 30 giorni se gli inviti non sono ancora stati inviati; fattura elettronica per ogni acquisto (addebito SDI ricorrente per Atelier); l'upgrade Free→Celebrazione conserva tutto il lavoro già fatto (invito, lista, risposte).

## Target Audience
**Target companies:** Prevalentemente consumatori privati (B2C). Il segmento B2B è il singolo professionista: wedding/event planner che gestisce eventi per clienti.

**Decision-makers:** L'organizzatore è anche l'acquirente e l'utente — decisione individuale, ciclo di acquisto breve, no comitato.

**Primary use case:** Mandare inviti a un evento privato e sapere con certezza chi viene, con quante persone e con quali esigenze (menu, allergie, alloggio) — senza gestione manuale.

**Jobs to be done:**
- "Aiutami a sapere chi viene davvero senza rincorrere le persone su WhatsApp."
- "Raccogli per me allergie, preferenze menu e plus-one in modo ordinato, pronto da passare al catering."
- "Fammi fare bella figura con un invito curato, senza saper usare strumenti di grafica."

**Use cases:** Matrimoni, lauree, battesimi, compleanni significativi (al lancio: queste 4 categorie). Roadmap: comunioni, cresime, anniversari.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| **Giulia, 31** — sposa, Marketing Manager, Milano (primary) | Sentirsi organizzata e in controllo, godersi il processo, estetica curata | 120 invitati, save-the-date su WhatsApp senza tracking, Excel aggiornato a mano, gruppi diversi (cerimonia vs solo ricevimento) | Un solo strumento: crea, manda, raccoglie, vede tutto in dashboard. Se in 5 minuti non lo capisce, lo abbandona → semplicità radicale. |
| **Marco, 55** — padre, Commercialista, Napoli (secondary) | Fare onore al figlio, semplicità estrema, niente sorprese al ristorante | Poco tecnologico, 50-60 invitati via WhatsApp individuali, deve dare i numeri al ristorante con 2 settimane d'anticipo | "Mando un link, le persone rispondono, io vedo chi viene." Zero curva di apprendimento. |
| **Wedding/event planner** (B2B, tier Atelier) | Gestire più eventi, brand proprio davanti al cliente | Strumenti consumer non scalano su più eventi e non sono white-label | Eventi illimitati, workspace col proprio logo, domini custom. Landing `/planner`: "Dodici eventi in parallelo. Un solo pannello." |

## Problems & Pain Points
**Core problem:** Organizzare un evento privato in Italia significa oggi gestire inviti e conferme con un mix caotico: WhatsApp individuali (nessun tracking), Google Forms generici (nessuna logica condizionale), Excel manuale, e rincorse telefoniche. Oltre i 30-40 ospiti diventa insostenibile.

**Why alternatives fall short:**
- Piattaforme USA (Joy, Zola, The Knot): solo matrimoni, traduzione italiana superficiale senza comprensione culturale, sovradimensionate.
- Inviti generici (Paperless Post, Evite, Canva): belli ma RSVP basico o assente, niente tracking, niente reminder, niente logica condizionale.
- Combo DIY (WhatsApp + Google Forms + Excel): gratis ma zero automazione, gestione tutta manuale.

**What it costs them:** Tempo, stress e serenità sottratti a un momento di gioia. Errori nei conteggi, allergie dimenticate, numeri al catering sbagliati.

**Emotional tension:** Ansia di "non sapere chi viene davvero" fino a pochi giorni prima; paura di fare brutta figura o sbagliare i numeri con catering/ristorante.

## Competitive Landscape
**Direct:** Joy / Zola / The Knot — solo matrimoni, USA-centrici, nessuna localizzazione culturale italiana. Falliscono per chi organizza lauree, battesimi, compleanni o vuole qualcosa di calibrato sull'Italia.

**Secondary:** Paperless Post / Evite / Canva — inviti senza un vero motore RSVP (no domande condizionali, no tracking, no reminder). Risolvono la grafica, non la gestione ospiti.

**Indirect:** WhatsApp + Google Forms + Excel (lo status quo) — gratis e familiare, ma frammentato, manuale e senza automazione. È il vero concorrente da battere.

## Differentiation
**Key differentiators:**
- Multi-evento con **profondità culturale italiana** (cerimonia/rinfresco, bomboniere, tono per tipo di evento) — non "un altro Joy per matrimoni".
- **Focalizzazione radicale su invito + RSVP**: link personalizzato per ospite, form condizionali, reminder automatici, dashboard real-time. Non un ecosistema all-in-one.
- **Modello trasparente**: nessun markup nascosto, nessuna percentuale sugli ospiti, nessuna pubblicità nell'esperienza ospite. Si paga una volta per evento.
- **Esperienza ospite frictionless**: nessun account, nessuna app, RSVP in meno di 60 secondi.

**Why customers choose us:** Fa una cosa sola e la fa benissimo, parla italiano (lingua e cultura), e non punisce chi ha tanti ospiti facendoli pagare a testa.

## Objections
| Objection | Response |
|-----------|----------|
| "WhatsApp lo so già usare, perché pagare?" | Ceremly genera i messaggi WhatsApp personalizzati per te (copia con un click) e ti dice chi ha aperto e chi non ha risposto — il tracking e i reminder che WhatsApp non dà. |
| "I miei invitati (nonni, parenti anziani) non sanno usare app." | Nessun account, nessuna app, nessun login: aprono il link e rispondono. Pensato anche per chi non è tech. |
| "Non conosco il sito, è sicuro mettere i dati degli ospiti?" | Server in UE, GDPR, dati minimi (nome + risposte). Il link arriva da una persona di fiducia, non da uno sconosciuto. |
| "€39 per un invito?" | Una tantum per l'intero evento fino a 250 ospiti — non per ospite, non per RSVP. Meno di un blocco di inviti cartacei. |

**Anti-persona:** Eventi micro (<10 persone) dove una chat basta; aziende che cercano una piattaforma per eventi corporate/ticketing su larga scala; chi vuole un registry/lista nozze o un sito-matrimonio all-in-one (fuori scope deliberato).

## Switching Dynamics
**Push:** Caos di WhatsApp/Excel, conteggi che non tornano, allergie dimenticate, rincorse telefoniche.

**Pull:** Un link, una dashboard che dice chi viene davvero, lista pronta per il catering con allergie incluse.

**Habit:** "Ho sempre fatto così con i gruppi WhatsApp"; inviti cartacei come tradizione.

**Anxiety:** "I miei ospiti sapranno usarlo?"; "vale la pena imparare un nuovo strumento a poche settimane dall'evento?"; "i miei dati sono al sicuro?".

## Customer Language
**How they describe the problem:**
- "Non so chi ha letto il save-the-date."
- "Devo aggiornare l'Excel a mano ogni volta che qualcuno cambia idea."
- "Il ristorante mi chiede i numeri e io non li ho."

**How they describe us / value (copy verificata dal sito):**
- "Gli inviti che contano davvero." (headline hero homepage)
- "Smetti di rincorrere conferme su WhatsApp."
- "Una dashboard che ti dice chi viene davvero."

**Words to use:** inviti che contano, chi viene davvero, link personalizzato, senza account, una volta per evento, allergie/menu/plus-one, promemoria automatici, server in UE, GDPR, trasparente.

**Words to avoid:** "piattaforma all-in-one", "wedding planning suite", percentuali/markup, gergo tecnico (token, serverless), "ticketing", "CRM eventi".

**Glossary:**
| Term | Meaning |
|------|---------|
| RSVP | Conferma di partecipazione dell'ospite (sì/no/forse) + risposte alle domande |
| Link personalizzato | URL univoco per ospite, pre-compila il nome e traccia l'apertura |
| Plus-one / accompagnatore | Persona aggiuntiva che l'ospite porta con sé |
| Domanda condizionale | Domanda RSVP che appare solo in base a una risposta precedente |
| Celebrazione / Atelier | Nomi dei piani a pagamento (per evento / per planner) |

## Brand Voice
**Tone:** Caldo, rassicurante, concreto. Empatico verso lo stress dell'organizzatore, mai pomposo.

**Style:** Diretto e conversazionale. Frasi brevi. Parte sempre dal problema reale ("Smetti di rincorrere conferme"), non dalla feature.

**Personality:** Premuroso · Pragmatico · Italiano (culturalmente, non solo linguisticamente) · Curato · Onesto.

## Proof Points
**Trust signals reali oggi sul sito (usabili in copy):**
- Hero homepage: "Nessuna carta richiesta · 30 ospiti gratis · Ospiti senza account".
- Pricing: "Fatturazione elettronica · Server in UE · GDPR · Cancella quando vuoi".
- Footer: "Server in UE · GDPR compliant · pagamenti sicuri via Creem".
- Esperienza ospite (claim reale, time-based): "RSVP in meno di 60 secondi, senza account, nessuna app".

**Metrics (target da PRD — nessun dato reale citabile ancora):**
- Target attivazione: 60% degli iscritti crea un invito e invia almeno 1 link entro 30 giorni.
- Target engagement: >70% link aperti / inviati; >60% RSVP completati / link aperti.
- ⚠️ NON usare numeri inventati come social proof. I vecchi badge fittizi ("142 eventi gestiti", testimonial "Verona · 168 ospiti") sono GIÀ STATI RIMOSSI dal sito (bonifica honesty 2026-06-17) — non reintrodurli.
- ⚠️ Il mockup dashboard nell'hero mostra "+12 oggi · 89% inviti aperti": è UI decorativa di esempio, NON una metrica reale → non citarla come dato.

**Customers:** Beta privata (amici e conoscenti che organizzano eventi). Nessun logo pubblico ancora.

**Testimonials:** Nessun testimonial reale ancora. La vecchia citazione fittizia è stata rimossa dal sito. Quando arriveranno feedback reali dei beta tester, inserirli qui.

**Value themes:**
| Theme | Proof |
|-------|-------|
| Sai chi viene davvero | Tracking apertura link + dashboard real-time + reminder automatici |
| Niente gestione manuale | Form condizionale, export per catering, conteggi automatici con plus-one |
| Zero friction per l'ospite | Nessun account/app, RSVP < 60s, nome pre-compilato |
| Trasparenza | Pagamento una tantum per evento, no percentuali sugli ospiti, server UE/GDPR |

## Goals
**Business goal:** Diventare il riferimento in Italia per gli inviti digitali multi-evento. Target 12 mesi: ~€3.000 MRR-equivalente (acquisti one-time annualizzati); conversione free→paid 8% entro 6 mesi.

**Conversion action:** Registrazione → creazione del primo invito → invio del primo link (attivazione). CTA primaria pubblica: "Crea il tuo primo invito — gratis". CTA secondaria: "Invito d'esempio". Badge stato attuale nel hero: "v0.1 · aperto agli organizzatori italiani".

**Current metrics:** Fase beta (MVP Phase 1). North Star: numero di RSVP completati con successo al mese.

## Stato pagine pubbliche (2026-06-21)
Live: home (`/`), `/about` (Chi siamo — i18n `ceremly.site.chiSiamo`), `/come-funziona`, `/funzionalita`, `/esempi`, `/modelli`, `/matrimonio`, `/battesimi`, `/compleanni`, `/planner` (B2B), `/prezzi`, `/rsvp-guide`, blog. Footer link a `/about` corretto (pagina esistente).

---

*Le altre skill di marketing useranno automaticamente questo contesto. Esegui `/product-marketing-context` per aggiornarlo.*
