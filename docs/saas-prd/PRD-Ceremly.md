# PRODUCT REQUIREMENTS DOCUMENT
# Ceremly
### Inviti digitali e RSVP intelligenti per gli eventi che contano.

| Campo | Valore |
|-------|--------|
| **STATUS** | Active |
| **VERSION** | 0.1 |
| **LAST UPDATED** | 2026-04-16 |
| **OWNER** | Airowl |
| **DOCUMENT TYPE** | Confidential draft |

---

## 1. Overview & Vision

### Product Summary

Ceremly è una piattaforma SaaS per inviti digitali e RSVP intelligenti dedicata a tutti gli eventi privati che contano — matrimoni, lauree, battesimi, compleanni, comunioni, cresime e anniversari. Permette all'organizzatore di creare un invito digitale contestualizzato per tipo di evento, distribuirlo via link personalizzato per ogni ospite, raccogliere risposte RSVP con domande condizionali, e gestire l'intero flusso di comunicazione con gli ospiti da un'unica dashboard in tempo reale.

### Problem Statement

Chi organizza un evento privato in Italia oggi gestisce inviti e conferme attraverso un mix caotico e frammentato di strumenti: messaggi WhatsApp individuali (nessun tracking, impossibile sapere chi ha letto), Google Forms generici (nessuna logica condizionale, nessun legame con l'invito), fogli Excel per tenere traccia delle risposte (aggiornamento manuale, errori frequenti), e rincorse telefoniche per chi non risponde. Il risultato è un processo stressante, dispersivo e soggetto a errori che sottrae tempo e serenità a un momento che dovrebbe essere di gioia. Questo problema si amplifica con il numero di invitati: oltre i 30-40 ospiti, la gestione manuale diventa insostenibile.

Le piattaforme esistenti non risolvono questo problema per il mercato italiano. Joy, Zola e The Knot sono piattaforme all-in-one per il wedding planning costruite per il mercato USA — coprono solo matrimoni, offrono una traduzione superficiale dell'interfaccia in italiano senza comprensione culturale, e sono sovradimensionate per chi vuole semplicemente mandare inviti e raccogliere risposte. Dall'altro lato, Paperless Post, Evite e Canva offrono inviti generici senza un vero sistema RSVP intelligente, senza tracking, senza reminder automatici.

### Vision Statement

Entro 3-5 anni, Ceremly diventa il riferimento in Italia (e poi nei mercati europei) per la gestione digitale degli inviti a eventi privati. Ogni volta che una persona deve organizzare un evento che coinvolge ospiti — dal battesimo del figlio alla laurea, dal matrimonio al compleanno dei 50 anni — il primo pensiero è "lo faccio con Ceremly". La piattaforma evolve da tool per inviti a ecosistema leggero per la gestione dell'evento, con comunicazione post-invito, pagina evento live, e gallery collaborativa, mantenendo sempre la semplicità come principio fondante.

### Why Now

Il timing è favorevole per tre ragioni convergenti. La prima è culturale: la pandemia ha normalizzato la comunicazione digitale anche per le fasce di età più alte — oggi anche i nonni usano WhatsApp e aprono link, eliminando la barriera principale all'adozione di inviti digitali. La seconda è di mercato: non esiste un player dominante in Italia per gli inviti digitali multi-evento; le piattaforme USA coprono solo il matrimonio e non capiscono le specificità culturali italiane (bomboniere, struttura cerimonia + rinfresco, tradizioni regionali). La terza è tecnologica: lo stack moderno (Nuxt 4, Neon, Cloudflare) permette a un solo sviluppatore di costruire e mantenere un prodotto di qualità a costi marginali molto bassi, rendendo il modello sostenibile anche con volumi iniziali ridotti.

---

## 2. Objectives & Success Metrics

| Objective | Metric | Target | Timeframe |
|-----------|--------|--------|-----------|
| Activation organizzatore | % utenti registrati che creano un invito e inviano almeno 1 link | 60% | Entro 30 giorni dalla registrazione |
| Engagement ospite | % link personalizzati aperti / link inviati | >70% | Ongoing |
| Conversione RSVP | % RSVP compilati / link aperti | >60% | Ongoing |
| Conversion free→paid | % utenti free che acquistano Celebrazione o Atelier per almeno 1 evento | 8% | Entro 6 mesi dal lancio |
| Revenue | MRR equivalente (one-time purchases annualizzati) | €3.000 | 12 mesi |
| Soddisfazione ospite | Rating medio post-RSVP ("Quanto è stato facile rispondere?") | >4.2/5 | 6 mesi |
| Stabilità | Uptime | 99.5% | Mensile |
| Passaparola | % nuovi utenti da referral (ospite → organizzatore) | 20% | 12 mesi |

**North Star Metric:** Numero di RSVP completati con successo per mese. Questa metrica cattura sia l'acquisizione di organizzatori (che creano eventi), sia la qualità dell'esperienza ospite (che completano il form), sia la distribuzione virale (ogni ospite è un potenziale futuro organizzatore).

---

## 3. Target Audience & User Personas

### Primary Persona: Giulia, l'organizzatrice del suo matrimonio

| Campo | Valore |
|-------|--------|
| **Name** | Giulia Ferretti |
| **Age** | 31 |
| **Location** | Milano, Italia |
| **Occupation** | Marketing Manager in una PMI |
| **Industry** | Servizi / Marketing |

**Bio:** Giulia sta organizzando il suo matrimonio previsto per settembre. Lavora full-time e gestisce il planning del matrimonio nelle sere e nei weekend. È tech-savvy ma non vuole passare ore a imparare un nuovo strumento — vuole qualcosa che funzioni subito. Ha circa 120 invitati tra famiglia, amici e colleghi.

**Day Routine:**
1. Mattina: lavoro in ufficio, check rapido delle email personali durante la pausa caffè.
2. Pausa pranzo: messaggi WhatsApp con il fidanzato e la wedding planner su dettagli logistici.
3. Sera: 1-2 ore dedicate al planning del matrimonio — inviti, lista ospiti, fornitori.
4. Weekend: visite a location, prove menu, shopping.

**Pain Points:**
1. Ha mandato i save-the-date via WhatsApp e non sa chi li ha effettivamente letti. Alcune persone non hanno risposto e deve rincorrerle una per una.
2. Ha provato Google Forms per gli RSVP ma il form è brutto, generico, e non le permette di chiedere le allergie solo a chi conferma la presenza.
3. Deve mantenere un foglio Excel aggiornato manualmente con le risposte di 120 persone, inclusi i +1 e le preferenze menu per il catering. Ogni volta che qualcuno cambia idea deve aggiornare tutto a mano.
4. Ha invitati divisi in gruppi diversi (cerimonia + ricevimento vs solo ricevimento) e non vuole mandare lo stesso invito a tutti.

**Goals:**
- **Why:** Vuole godersi il processo di organizzazione senza lo stress della gestione manuale delle risposte. Vuole sentirsi organizzata e in controllo.
- **How:** Un unico strumento dove crea l'invito, lo manda, raccoglie le risposte, e ha una dashboard chiara. Non vuole un ecosistema complesso con mille funzionalità — vuole fare bene questa cosa specifica.
- **When:** Usa lo strumento intensamente nei 3-4 mesi prima del matrimonio, poi sporadicamente per aggiornamenti e comunicazioni post-RSVP.

**User Traits:**
- Tech-Savvy: 75%
- Budget-Conscious: 70%
- Delegation Efficiency: 80%

**Personality Tags:** Organizzata | Pragmatica | Attenta ai dettagli | Multitasking | Orientata al risultato

**Habits:**
- Scopre nuovi tool tramite Instagram, passaparola di amiche che si sono sposate di recente, e gruppi Facebook/Telegram di spose.
- Preferisce comunicare via WhatsApp e Instagram DM.
- Decide velocemente se uno strumento fa per lei — se in 5 minuti non ha capito come funziona, lo abbandona.

---

### Secondary Persona: Marco, il padre che organizza la laurea del figlio

| Campo | Valore |
|-------|--------|
| **Name** | Marco Bianchi |
| **Age** | 55 |
| **Location** | Napoli, Italia |
| **Occupation** | Commercialista |
| **Industry** | Servizi professionali |

**Bio:** Marco sta organizzando la festa di laurea di suo figlio Andrea. Ha circa 50-60 invitati (famiglia allargata, amici di famiglia, colleghi). Non è molto tecnologico ma usa WhatsApp quotidianamente. Vuole qualcosa di semplice che gli faccia fare bella figura con la famiglia.

**Pain Points:**
1. Non ha mai organizzato un evento digitale. Le piattaforme di wedding planning gli sembrano fuori contesto per una laurea.
2. Sta mandando messaggi WhatsApp individuali a 60 persone e perde il conto di chi ha risposto.
3. Ha bisogno di sapere quante persone vengono al rinfresco per prenotare il ristorante, e il ristorante gli chiede i numeri con 2 settimane di anticipo.

**Goals:**
- **Why:** Vuole organizzare una festa che faccia onore al figlio senza impazzire con la logistica.
- **How:** Qualcosa di semplice come "mando un link, le persone rispondono, io vedo chi viene".
- **When:** Usa lo strumento per 2-3 settimane, intensamente, poi basta.

**User Traits:**
- Tech-Savvy: 35%
- Budget-Conscious: 50%
- Delegation Efficiency: 40%

**Personality Tags:** Tradizionalista | Pratico | Familiare | Orgoglioso

---

## 4. Market & Competitive Analysis

### Market Size & Opportunity

Il mercato di riferimento sono gli eventi privati in Italia che richiedono inviti e gestione ospiti.

- **TAM (Total Addressable Market):** Circa 4-5 milioni di eventi privati all'anno in Italia che coinvolgono 20+ ospiti — matrimoni (~180.000), lauree (~350.000), compleanni significativi (~2M+), battesimi (~350.000), comunioni/cresime (~500.000), anniversari e altri eventi. A un prezzo medio di €15/evento, il TAM è circa €60-75M.
- **SAM (Serviceable Addressable Market):** Eventi dove l'organizzatore ha la propensione digitale per usare un tool online — stimato al 30% del TAM, circa €18-22M.
- **SOM (Serviceable Obtainable Market anno 1):** Obiettivo realistico primo anno, catturando lo 0.1-0.2% del SAM tramite marketing organico e passaparola: €20-40K di revenue.

### Competitors

| Competitor | Strengths | Weaknesses | Pricing |
|------------|-----------|------------|---------|
| Joy (WithJoy) | Piattaforma all-in-one matura (dal 2016), 600+ template, app mobile, registry con 20.000+ prodotti, gratuita nel core | Solo matrimoni, traduzione italiana superficiale senza comprensione culturale, segnalazioni di prezzi gonfiati nel registry, RSVP persi da utenti, nessun tool di planning integrato | Free + registry markup + premium add-ons (~$20/anno dominio) |
| Zola | Registry forte, 100+ template, ecosistema completo | Solo matrimoni, USA-centrico, no localizzazione italiana, Android app dismessa nel 2023 | Free + registry revenue |
| The Knot | Vendor directory enorme, community forte | Solo matrimoni, USA-centrico, no localizzazione italiana, UX datata | Free + vendor advertising |
| Paperless Post | Inviti eleganti per vari tipi di evento, brand premium | RSVP molto basico (sì/no senza domande condizionali), nessun tracking link, nessun reminder automatico, pricing per invito (costoso per eventi grandi) | Free (con watermark) + $1-3 per invito premium |
| Evite | Multi-evento, molto conosciuto negli USA | UI datata, pieno di pubblicità, nessuna localizzazione italiana, RSVP semplice senza logica condizionale | Free (con ads) + premium $13-20/evento |
| Canva | Template grafici bellissimi, editor potente | Solo grafica — zero funzionalità RSVP, tracking, o gestione ospiti. L'utente crea un'immagine, poi deve gestire tutto manualmente | Free + Canva Pro €12/mese |
| WhatsApp + Google Forms (combo DIY) | Gratuito, tutti lo sanno usare | Zero tracking, zero logica condizionale, zero automazione reminder, gestione manuale su Excel, esperienza ospite frammentata | Free |

### Our Competitive Advantage

Il primo vantaggio è il **posizionamento multi-evento con profondità culturale italiana**. Ceremly non è "un altro Joy per i matrimoni" — è la piattaforma per tutti gli eventi privati italiani, con template, toni e strutture dati che riflettono la cultura degli eventi in Italia (la distinzione cerimonia/rinfresco, le bomboniere, il tono formale per cerimonie religiose vs informale per compleanni).

Il secondo vantaggio è la **focalizzazione radicale sull'esperienza invito + RSVP**. Invece di costruire un ecosistema all-in-one (sito web, registry, hotel booking, vendor directory), Ceremly fa una cosa sola — inviti e RSVP — e la fa in modo eccezionale, con link personalizzati per ospite, form condizionali, reminder automatici, e dashboard in tempo reale.

Il terzo vantaggio è la **trasparenza del modello di business**. Niente markup nascosti su prodotti, niente pubblicità nell'esperienza ospite, nessuna percentuale o costo per ospite/RSVP. Pricing chiaro e ibrido: tier gratuito generoso (Free) + pagamento una tantum per evento (Celebrazione) per gli organizzatori privati + abbonamento mensile (Atelier) per chi organizza eventi per lavoro.

---

## 5. Core Features & Functional Requirements

> **Prioritizzazione:** M = Must-have · S = Should-have · C = Could-have · W = Won't-have (questo rilascio)

---

### Layer 1 — Creazione dell'invito

#### FEATURE 5.1: SELEZIONE TIPO DI EVENTO E TEMPLATE CONTESTUALI [M]

**User Story:**
> As an organizzatore, I want to choose my event type and see templates specifically designed for that type, so that I get a pre-configured invitation structure with the right fields, tone, and sections without starting from scratch.

**Functional Requirements:**
- Il sistema supporta le seguenti categorie di evento al lancio: matrimonio, laurea, compleanno, battesimo. Ogni categoria determina il set di template disponibili, la struttura dati dell'invito (campi e sezioni), e i preset RSVP suggeriti (vedi Feature 5.5).
- Ogni template include tre componenti inscindibili: design grafico (layout, palette colori, tipografia, elementi decorativi), struttura contenuto pre-compilata con placeholder appropriati per il tipo di evento, e tono di comunicazione calibrato (formale per cerimonie religiose, giocoso per compleanni di bambini, elegante per matrimoni).
- I template portano con sé una struttura dati diversa per tipo di evento. Un invito di matrimonio ha campi per cerimonia e ricevimento separati, nomi degli sposi, dress code, e informazioni alloggio. Un invito di laurea ha campi per ateneo, corso di laurea, cerimonia e rinfresco. Un invito di compleanno ha data/ora inizio e fine, tema festa, e indicazioni regalo. Un invito di battesimo ha campi per la chiesa, padrino/madrina, e rinfresco.
- Al lancio sono disponibili almeno 3 template per tipo di evento (12 template totali minimo).

**Acceptance Criteria:**
- [ ] L'utente seleziona un tipo di evento e vede solo template pertinenti a quel tipo.
- [ ] Selezionando un template, i campi dell'invito sono pre-configurati con la struttura corretta per il tipo di evento (es. matrimonio mostra cerimonia + ricevimento, laurea mostra ateneo + corso).
- [ ] Il tono del testo placeholder è appropriato al tipo di evento (verificare manualmente su almeno 2 template per tipo).
- [ ] L'utente può cambiare template dopo la selezione iniziale senza perdere il contenuto già inserito (i campi comuni vengono preservati).

**Dependencies:** Nessuna — questa è la feature fondante.

---

#### FEATURE 5.2: EDITOR A BLOCCHI WYSIWYG [M]

**User Story:**
> As an organizzatore, I want to customize my invitation by adding, removing, and reordering content blocks, so that I can create a personalized invitation without graphic design skills.

**Functional Requirements:**
- L'editor funziona a blocchi: l'utente aggiunge, rimuove o riordina blocchi di contenuto tramite drag-and-drop (o frecce su/giù per mobile). Il layout si adatta automaticamente mantenendo la coerenza con il template scelto.
- Blocchi disponibili al lancio: intestazione evento (titolo, data, ora), location con mappa integrata (embed Google Maps o link deep link), messaggio personalizzato (testo libero con formattazione base — grassetto, corsivo), programma della giornata (timeline con orari), dress code (testo + icona suggerita), informazioni logistiche (parcheggio, trasporti, alloggio — testo libero), countdown al giorno dell'evento (calcolato automaticamente dalla data), galleria foto (upload fino a 5 immagini), blocco RSVP (bottone/link al form di risposta, non rimovibile).
- Ogni blocco ha un titolo editabile e un contenuto editabile. Il blocco RSVP è sempre presente e non può essere rimosso.
- L'editor è responsive: l'utente edita su desktop ma l'invito renderizza correttamente su mobile.

**Acceptance Criteria:**
- [ ] L'utente può aggiungere qualsiasi blocco disponibile all'invito.
- [ ] L'utente può rimuovere qualsiasi blocco tranne il blocco RSVP.
- [ ] L'utente può riordinare i blocchi tramite drag-and-drop (desktop) o frecce (mobile).
- [ ] Il layout dell'invito rimane coerente e visivamente gradevole dopo qualsiasi combinazione di blocchi (nessun overflow, nessun testo troncato).
- [ ] Le immagini caricate nel blocco galleria vengono ridimensionate e ottimizzate automaticamente (max 2MB per immagine dopo ottimizzazione).

**Dependencies:** Feature 5.1 (i blocchi disponibili dipendono dal tipo di evento).

---

#### FEATURE 5.3: PERSONALIZZAZIONE VISIVA E PREVIEW MULTI-DEVICE [S]

**User Story:**
> As an organizzatore, I want to customize colors and fonts of my chosen template and preview how the invitation looks on mobile, so that I can match my event's aesthetic and ensure guests have a good experience on any device.

**Functional Requirements:**
- L'utente può modificare la palette colori del template (colore primario, colore secondario, colore sfondo). Il sistema mantiene automaticamente un rapporto di contrasto leggibile (WCAG AA) tra testo e sfondo.
- L'utente può scegliere tra 3-5 font pairing pre-selezionati per il template (non font liberi — i pairing sono curati per garantire leggibilità e coerenza).
- L'utente può caricare un'immagine personalizzata per l'header dell'invito.
- Preview toggle desktop/mobile per visualizzare l'invito come lo vedranno gli ospiti su entrambi i device.

**Acceptance Criteria:**
- [ ] La modifica dei colori si riflette in tempo reale nella preview.
- [ ] Il sistema impedisce combinazioni di colori con contrasto insufficiente (mostra un warning e suggerisce una correzione).
- [ ] La preview mobile mostra un rendering accurato dell'invito (verificare su viewport 375px).
- [ ] L'immagine header caricata viene croppata/ridimensionata automaticamente per adattarsi al layout del template.

**Dependencies:** Feature 5.1, Feature 5.2.

---

### Layer 2 — Distribuzione intelligente

#### FEATURE 5.4: LINK PERSONALIZZATO PER INVITATO E GUEST LIST MANAGEMENT [M]

**User Story:**
> As an organizzatore, I want each guest to receive a unique personalized link that pre-fills their name in the RSVP form and tracks whether they opened the invitation, so that I know exactly who has seen the invite and who hasn't responded.

**Functional Requirements:**
- L'organizzatore gestisce una guest list con i seguenti campi per ospite: nome (obbligatorio), cognome (obbligatorio), email (opzionale), telefono (opzionale), gruppo/i (opzionale — per Feature 5.8), note interne (opzionale, visibili solo all'organizzatore).
- Per ogni ospite, il sistema genera un link univoco nel formato `ceremly.app/e/{event-slug}/{guest-token}`. Il guest-token è un identificativo unico opaco (es. nanoid 10 caratteri) che mappa al record ospite nel database.
- Quando l'ospite apre il link personalizzato, il suo nome appare pre-compilato nel form RSVP. L'ospite non deve inserire i propri dati.
- Il sistema tracka il primo accesso al link (`first_opened_at`) e il numero totale di accessi. Questi dati sono visibili all'organizzatore nella dashboard (vedi Feature 5.9).
- L'organizzatore può importare ospiti da file CSV o Excel (colonne: nome, cognome, email, telefono, gruppo). Il sistema valida il file e segnala errori (righe duplicate, campi mancanti).
- L'organizzatore può aggiungere ospiti manualmente uno per uno.
- Contatore in tempo reale nella guest list: totale ospiti, inviti inviati, inviti non ancora inviati.

**Acceptance Criteria:**
- [ ] Ogni ospite ha un link univoco che, se aperto, mostra l'invito con il nome dell'ospite pre-compilato nel form RSVP.
- [ ] L'apertura del link aggiorna il campo `first_opened_at` del record ospite (solo al primo accesso).
- [ ] L'import CSV/Excel gestisce correttamente file con e senza header, e segnala righe con nome/cognome mancante.
- [ ] L'organizzatore può modificare i dati di un ospite dopo l'inserimento senza rigenerare il link (il token resta stabile).
- [ ] L'organizzatore può eliminare un ospite dalla lista; il link associato diventa inattivo e mostra un messaggio generico ("Invito non disponibile").

**Dependencies:** Feature 5.1 (l'evento deve esistere prima di aggiungere ospiti).

---

#### FEATURE 5.5: DISTRIBUZIONE VIA EMAIL E MESSAGGIO PRECOMPILATO WHATSAPP [M]

**User Story:**
> As an organizzatore, I want to send invitations via email directly from the platform and generate pre-written WhatsApp messages with each guest's personalized link, so that I can distribute invitations through the channels my guests prefer without manually composing each message.

**Functional Requirements:**
- L'organizzatore può inviare l'invito via email direttamente dalla piattaforma (tramite Resend). L'email contiene un'anteprima visiva dell'invito (immagine o HTML inline), il link personalizzato dell'ospite, e un testo personalizzabile dall'organizzatore (con default sensato per tipo di evento).
- Per gli ospiti con email, l'organizzatore può inviare singolarmente o in batch (selezionando più ospiti dalla lista).
- Il sistema tracka l'apertura dell'email (open tracking pixel) e il click sul link. Questi dati appaiono nella timeline dell'ospite nella dashboard.
- Per la distribuzione WhatsApp, il sistema genera un messaggio pre-compilato per ogni ospite contenente il nome dell'ospite, il testo dell'invito (breve), e il link personalizzato. L'organizzatore lo copia con un click e lo incolla nella chat WhatsApp dell'ospite.
- Bottone "Copia messaggio" per ogni ospite nella lista, e bottone "Copia tutti i messaggi" che genera un elenco di messaggi separati per ospite.

**Acceptance Criteria:**
- [ ] L'email inviata arriva nella inbox dell'ospite (non spam) con l'anteprima visiva e il link funzionante (verificare con almeno 3 provider: Gmail, Outlook, Yahoo).
- [ ] Il tracking di apertura email funziona e il dato appare nella dashboard dell'organizzatore.
- [ ] Il messaggio pre-compilato per WhatsApp contiene il nome corretto dell'ospite e il link personalizzato.
- [ ] Il bottone "Copia messaggio" copia il testo nella clipboard del dispositivo (verificare su desktop e mobile).
- [ ] L'invio email in batch funziona per almeno 100 ospiti senza timeout o errori.

**Dependencies:** Feature 5.4 (i link personalizzati devono esistere). Resend account configurato.

---

#### FEATURE 5.6: QR CODE PER INVITI FISICI [S]

**User Story:**
> As an organizzatore, I want to generate a QR code for each guest's personalized link, so that I can include it in printed invitations while still collecting digital RSVPs.

**Functional Requirements:**
- Per ogni ospite, il sistema genera un QR code che punta al link personalizzato dell'ospite.
- L'organizzatore può scaricare il QR code singolarmente (PNG ad alta risoluzione) o in batch (PDF con un QR per pagina, con nome e cognome dell'ospite sotto il QR).
- Il QR code, una volta scansionato, apre direttamente l'invito digitale con il form RSVP pre-compilato.

**Acceptance Criteria:**
- [ ] Il QR code scansionato con la fotocamera dello smartphone apre il link corretto dell'ospite.
- [ ] Il PDF batch contiene un QR per pagina, con nome e cognome leggibili sotto ogni QR.
- [ ] Il QR code PNG ha risoluzione sufficiente per la stampa (minimo 300 DPI a 4cm x 4cm).

**Dependencies:** Feature 5.4.

---

#### FEATURE 5.7: CONTENUTO CONDIZIONALE PER GRUPPI DI OSPITI [C]

**User Story:**
> As an organizzatore di matrimonio, I want different guests to see different sections of my invitation based on which group they belong to (ceremony only, reception only, close family), so that I don't need to create separate invitations for different guest segments.

**Functional Requirements:**
- L'organizzatore può assegnare ogni ospite a uno o più gruppi (definiti liberamente, es. "Cerimonia + Ricevimento", "Solo Ricevimento", "Famiglia stretta", "Colleghi").
- Ogni blocco dell'editor (Feature 5.2) ha un campo opzionale `visible_to_groups`. Se vuoto, il blocco è visibile a tutti. Se popolato, il blocco è visibile solo agli ospiti che appartengono ad almeno uno dei gruppi specificati.
- L'organizzatore può prevedere come ogni ospite vedrà l'invito scegliendo un ospite dalla lista e visualizzando la preview dal suo punto di vista.

**Acceptance Criteria:**
- [ ] Un ospite del gruppo "Solo Ricevimento" non vede i blocchi riservati al gruppo "Cerimonia".
- [ ] Un ospite senza gruppo vede tutti i blocchi senza restrizioni.
- [ ] La preview "dal punto di vista di [ospite]" mostra esattamente i blocchi che quell'ospite vedrebbe.
- [ ] La modifica del gruppo di un ospite aggiorna immediatamente la visibilità dei blocchi nel suo invito (senza bisogno di re-inviare il link).

**Dependencies:** Feature 5.2, Feature 5.4.

---

### Layer 3 — RSVP intelligente con domande condizionali

#### FEATURE 5.8: FORM RSVP CON LOGICA CONDIZIONALE E PRESET PER TIPO DI EVENTO [M]

**User Story:**
> As an organizzatore, I want to configure RSVP questions that adapt based on guest responses (e.g., show allergy questions only if they confirm attendance) and start from a preset tailored to my event type, so that I collect exactly the information I need without overwhelming guests with irrelevant questions.

**Functional Requirements:**
- Ogni RSVP inizia con la domanda di partecipazione base: "Partecipi?" con opzioni Sì / No / Non ancora sicuro. La risposta "No" mostra solo un campo opzionale per un messaggio all'organizzatore. La risposta "Sì" o "Non ancora sicuro" apre le domande successive.
- L'organizzatore configura le domande RSVP usando un form builder visuale. Ogni domanda è un oggetto con: tipo di input (testo libero, selezione singola, selezione multipla, numero, toggle sì/no), opzioni (per selezione singola/multipla), condizione di visibilità (mostra solo se la domanda X ha risposta Y), flag "obbligatoria" (sì/no), flag "per persona" (se attivo, la domanda si replica per ogni accompagnatore dichiarato — es. allergie per ogni persona), e ordine di presentazione.
- Il sistema propone preset di domande RSVP in base al tipo di evento scelto in Feature 5.1. L'organizzatore può accettare il preset, modificarlo, aggiungere domande, o rimuoverne.
- **Preset matrimonio:** partecipazione cerimonia e/o ricevimento (selezione, condizionale su partecipazione = sì), numero accompagnatori (numero), nome di ogni accompagnatore (testo, flag "per persona"), allergie e intolleranze (testo, flag "per persona"), preferenza menu — carne/pesce/vegetariano/vegano (selezione, flag "per persona"), necessità alloggio (toggle), richiesta musicale (testo, opzionale), messaggio per gli sposi (testo, opzionale).
- **Preset laurea:** partecipazione cerimonia e/o rinfresco (selezione), numero accompagnatori (numero), allergie alimentari (testo, flag "per persona"), messaggio di auguri (testo, opzionale).
- **Preset compleanno:** numero accompagnatori (numero), allergie alimentari (testo), nome del bambino partecipante (testo — per compleanni di bambini), contatto genitore per emergenze (testo — per compleanni di bambini).
- **Preset battesimo:** partecipazione cerimonia e/o rinfresco (selezione), numero accompagnatori (numero), allergie alimentari (testo, flag "per persona"), messaggio per la famiglia (testo, opzionale).

**Acceptance Criteria:**
- [ ] Il form RSVP mostra/nasconde le domande in base alla logica condizionale configurata (es. allergie appaiono solo se partecipazione = Sì).
- [ ] Il flag "per persona" replica correttamente la domanda per ogni accompagnatore dichiarato (es. se l'ospite dichiara 2 accompagnatori, il campo allergie appare 3 volte — ospite + 2 accompagnatori).
- [ ] Il preset viene caricato correttamente per ogni tipo di evento e l'organizzatore può modificarlo senza restrizioni.
- [ ] L'organizzatore può aggiungere una domanda personalizzata con qualsiasi tipo di input e condizione di visibilità.
- [ ] Le risposte vengono salvate correttamente nel database e sono recuperabili dalla dashboard (Feature 5.9).

**Dependencies:** Feature 5.1, Feature 5.4.

---

#### FEATURE 5.9: ESPERIENZA OSPITE FRICTIONLESS [M]

**User Story:**
> As an ospite, I want to open the invitation link, see a beautiful invitation, and complete the RSVP in under 60 seconds without creating an account or downloading an app, so that responding is effortless.

**Functional Requirements:**
- L'ospite apre il link personalizzato e vede l'invito completo con il form RSVP in fondo (o raggiungibile tramite un bottone "Rispondi").
- Il nome dell'ospite è pre-compilato nel form. L'ospite non deve inserire alcun dato personale.
- Il form è mobile-first: layout a singola colonna, un campo per sezione visibile, bottoni grandi e facilmente tappabili.
- Nessun account richiesto, nessuna app da scaricare, nessun login.
- Al completamento del form, l'ospite vede una conferma visiva con un riepilogo delle sue risposte.
- L'ospite può tornare allo stesso link e modificare le proprie risposte fino alla deadline impostata dall'organizzatore.
- Dopo la deadline, il form mostra un messaggio personalizzabile ("Le risposte a questo invito sono chiuse. Per qualsiasi variazione contatta [organizzatore].").

**Acceptance Criteria:**
- [ ] L'intero flusso (apertura link → lettura invito → completamento RSVP) è completabile in meno di 60 secondi su mobile (verificare con test utente su 3 persone).
- [ ] L'ospite non vede mai una schermata di login o registrazione.
- [ ] La conferma post-RSVP mostra correttamente tutte le risposte date dall'ospite.
- [ ] L'ospite può modificare le risposte riaprendo lo stesso link, e le modifiche sovrascrivono le risposte precedenti nel database.
- [ ] Dopo la deadline, il form è disabilitato e mostra il messaggio di chiusura.

**Dependencies:** Feature 5.4, Feature 5.8.

---

### Layer 4 — Dashboard organizzatore in tempo reale

#### FEATURE 5.10: DASHBOARD CON KPI E LISTA OSPITI FILTRATA [M]

**User Story:**
> As an organizzatore, I want a real-time dashboard showing how many guests have opened the invitation, responded, confirmed, and declined, with the ability to filter and search the guest list, so that I always know the status of my event at a glance.

**Functional Requirements:**
- Nella parte alta della dashboard, card con i KPI principali: totale invitati, inviti inviati, inviti aperti (link cliccato almeno una volta), risposte ricevute, conferme "sì", conferme "no", conferme "forse", in attesa di risposta. Ogni card è cliccabile e filtra la lista ospiti sottostante per quello stato.
- Sotto i KPI, tabella degli ospiti con colonne: nome completo, stato RSVP (confermato / declinato / forse / non risposto / invito non aperto), data risposta, numero persone totali (ospite + accompagnatori), gruppo (se configurato).
- Filtri per stato RSVP, per gruppo, per canale di invio (email / WhatsApp / non inviato). Ricerca testuale per nome. Ordinamento per qualsiasi colonna.
- Cliccando su un ospite si apre il dettaglio con tutte le risposte al form RSVP, incluse quelle degli accompagnatori, e la timeline delle interazioni (invio, apertura, compilazione, modifiche).
- I dati si aggiornano in tempo reale (o con polling ogni 30 secondi).

**Acceptance Criteria:**
- [ ] I KPI riflettono correttamente lo stato attuale degli inviti e delle risposte (verificare con 10 ospiti di test in stati diversi).
- [ ] Cliccando su una card KPI, la lista ospiti si filtra correttamente per quello stato.
- [ ] La ricerca per nome trova ospiti con corrispondenza parziale (es. "Mar" trova "Marco Bianchi" e "Maria Rossi").
- [ ] Il dettaglio ospite mostra tutte le risposte RSVP, incluse quelle replicate "per persona" per gli accompagnatori.
- [ ] Una nuova risposta RSVP appare nella dashboard entro 30 secondi senza refresh manuale della pagina.

**Dependencies:** Feature 5.4, Feature 5.8, Feature 5.9.

---

#### FEATURE 5.11: SISTEMA DI REMINDER AUTOMATICI [M]

**User Story:**
> As an organizzatore, I want the system to automatically send reminders to guests who haven't responded by a certain date, so that I don't have to chase each person individually.

**Functional Requirements:**
- L'organizzatore imposta una deadline per le risposte RSVP (data).
- L'organizzatore configura fino a 3 reminder automatici, specificando per ciascuno: quanti giorni prima della deadline inviarlo (es. 7 giorni, 3 giorni, 1 giorno), e il messaggio (con default sensato).
- I reminder vengono inviati via email (Resend) agli ospiti che hanno un'email e non hanno ancora risposto.
- Per gli ospiti senza email, il sistema genera un messaggio pre-compilato nella dashboard (come Feature 5.5) che l'organizzatore può copiare e mandare via WhatsApp.
- I reminder non vengono inviati agli ospiti che hanno già risposto (qualsiasi risposta: sì, no, forse).
- L'organizzatore può disabilitare i reminder per singoli ospiti.

**Acceptance Criteria:**
- [ ] Il reminder viene inviato automaticamente alla data configurata, solo agli ospiti che non hanno ancora risposto e hanno un'email.
- [ ] L'ospite che risponde dopo il primo reminder non riceve i reminder successivi.
- [ ] Il reminder contiene il nome corretto dell'ospite e il link personalizzato funzionante.
- [ ] L'organizzatore può disabilitare i reminder per un ospite specifico e quel disabilitamento persiste.
- [ ] La dashboard mostra chiaramente quali ospiti senza email necessitano di un reminder manuale via WhatsApp.

**Dependencies:** Feature 5.4, Feature 5.8, Feature 5.10. Resend account configurato, cron job o scheduled task.

---

#### FEATURE 5.12: VISTE AGGREGATE E EXPORT DATI [S]

**User Story:**
> As an organizzatore di matrimonio, I want aggregated views of dietary preferences, allergy lists, and headcounts broken down by sub-event, and the ability to export this data as CSV or PDF, so that I can share precise numbers with my caterer and wedding planner.

**Functional Requirements:**
- Per gli eventi di tipo matrimonio, la dashboard mostra viste aggregate: conteggio totale persone (ospiti confermati + accompagnatori confermati), breakdown per preferenza menu, lista allergie raggruppate e deduplicate, breakdown per sotto-evento, lista necessità alloggio.
- Per tutti i tipi di evento, viste aggregate base: totale confermati, totale persone (inclusi +1), lista allergie.
- Export CSV: contiene tutti i dati grezzi (un ospite per riga, con tutte le risposte RSVP come colonne). Colonne dinamiche in base alle domande configurate.
- Export PDF: report formattato e leggibile con sezioni per riepilogo numeri, lista completa ospiti con stato, dettaglio allergie e preferenze, lista accompagnatori per ospite. Branding Ceremly discreto nel footer.

**Acceptance Criteria:**
- [ ] Il breakdown preferenze menu somma correttamente ospiti e accompagnatori.
- [ ] Il CSV è importabile senza errori in Excel e Google Sheets (encoding UTF-8, separatore virgola, campi con virgole wrappati in doppi apici).
- [ ] Il PDF è leggibile e ben formattato su una stampante A4 (verificare margini e font size).
- [ ] Le viste aggregate si aggiornano in tempo reale quando un ospite modifica le proprie risposte.

**Dependencies:** Feature 5.8, Feature 5.10.

---

### Layer 5 — Comunicazione post-invito e giorno dell'evento

#### FEATURE 5.13: AGGIORNAMENTI BROADCAST [S]

**User Story:**
> As an organizzatore, I want to send updates to all confirmed guests (or a filtered subset) after the RSVPs are collected, so that I can communicate schedule changes, logistics reminders, or last-minute information without sending individual messages.

**Functional Requirements:**
- L'organizzatore scrive un messaggio e lo invia a tutti gli ospiti confermati, o a un sottoinsieme filtrato per gruppo o stato RSVP.
- Il messaggio viene inviato via email (Resend) e appare anche come banner/notifica quando l'ospite riapre il link dell'invito.
- L'organizzatore può vedere nella dashboard quanti ospiti hanno aperto l'aggiornamento (tracking apertura email).
- Massimo 5 aggiornamenti broadcast per evento (per evitare spam).

**Acceptance Criteria:**
- [ ] Il broadcast viene inviato solo agli ospiti selezionati (per stato o gruppo), non a tutta la lista.
- [ ] L'ospite che riapre il link dell'invito vede l'aggiornamento più recente come banner in cima alla pagina.
- [ ] Il tracking di apertura dell'email di aggiornamento funziona e il dato appare nella dashboard.
- [ ] L'organizzatore riceve un errore chiaro se tenta di inviare più di 5 aggiornamenti per lo stesso evento.

**Dependencies:** Feature 5.4, Feature 5.5, Feature 5.10.

---

#### FEATURE 5.14: PAGINA EVENTO LIVE [C]

**User Story:**
> As an ospite confermato, I want to access a live event page on the day of the event with updated schedule, interactive map, and real-time information from the organizer, so that I have everything I need in one place without searching through old messages.

**Functional Requirements:**
- L'invito si trasforma in una pagina evento live accessibile dallo stesso link personalizzato.
- Elementi della pagina live: countdown (o "In corso" il giorno dell'evento), programma della giornata aggiornabile dall'organizzatore in tempo reale, mappa interattiva della location con deep link a Google Maps / Apple Maps per navigazione, informazioni pratiche aggiornabili.
- L'organizzatore può aggiornare il programma e le note dal proprio smartphone senza accedere alla dashboard completa.

**Acceptance Criteria:**
- [ ] L'ospite che apre il link il giorno dell'evento vede la pagina live con il programma aggiornato (non l'invito statico originale).
- [ ] Il deep link alla mappa apre Google Maps su Android e Apple Maps su iOS.
- [ ] L'organizzatore può modificare il programma dal proprio smartphone e il cambiamento è visibile all'ospite entro 60 secondi.
- [ ] La pagina live funziona offline dopo il primo caricamento (Service Worker per cache statica).

**Dependencies:** Feature 5.2, Feature 5.4.

---

#### FEATURE 5.15: GALLERY COLLABORATIVA POST-EVENTO [C]

**User Story:**
> As an ospite, I want to upload my photos from the event to a shared gallery accessible from the same invitation link, so that everyone can see and save each other's memories without creating shared albums on multiple platforms.

**Functional Requirements:**
- Dopo l'evento (data configurabile dall'organizzatore), la pagina dell'invito mostra una sezione gallery dove gli ospiti possono caricare foto e video.
- L'organizzatore può moderare i contenuti (approvare/rimuovere prima che siano visibili a tutti, oppure pubblicazione immediata con possibilità di rimozione post-hoc — configurabile).
- Storage su Cloudflare R2 con ottimizzazione immagini automatica (resize, compressione WebP).
- Limiti configurabili: max foto per ospite (default 10), max dimensione video (default 50MB), deadline per upload.
- La gallery è visibile a tutti gli ospiti che hanno il link personalizzato.

**Acceptance Criteria:**
- [ ] L'ospite può caricare foto dal proprio smartphone tramite il browser (nessuna app necessaria).
- [ ] Le immagini caricate vengono ottimizzate automaticamente (WebP, max 1920px lato lungo) senza perdita di qualità percepibile.
- [ ] L'organizzatore con moderazione attiva vede i contenuti in una coda di approvazione prima che siano visibili agli altri ospiti.
- [ ] Il sistema rifiuta upload che superano i limiti configurati con un messaggio chiaro.
- [ ] La gallery carica le immagini in modo progressivo (lazy loading) per non rallentare il caricamento iniziale della pagina.

**Dependencies:** Feature 5.4. Cloudflare R2 configurato.

---

#### FEATURE 5.16: MESSAGGIO DI RINGRAZIAMENTO POST-EVENTO [W]

**User Story:**
> As an organizzatore, I want to send a thank-you message to all guests who attended, optionally including a link to the photo gallery and a selected "official" event photo.

**Deferred to Phase 3.** No functional requirements defined at this stage.

---

## 6. Scope

### Included in MVP (Phase 1)

- Selezione tipo di evento con 4 categorie (matrimonio, laurea, compleanno, battesimo) e almeno 12 template (Feature 5.1).
- Editor a blocchi WYSIWYG con tutti i blocchi base (Feature 5.2).
- Link personalizzato per ogni ospite con tracking apertura (Feature 5.4).
- Distribuzione via email (Resend) e messaggio pre-compilato WhatsApp (Feature 5.5).
- Guest list management con import CSV (Feature 5.4).
- Form RSVP con logica condizionale e preset per tipo di evento (Feature 5.8).
- Esperienza ospite frictionless senza account o app (Feature 5.9).
- Dashboard organizzatore con KPI, lista ospiti, dettaglio risposte (Feature 5.10).
- Sistema di reminder automatici via email (Feature 5.11).

### Explicitly Excluded (Future Roadmap)

- Personalizzazione visiva avanzata e preview multi-device (Feature 5.3) — deferred to Phase 2, i template al lancio hanno stile fisso.
- QR code per inviti fisici (Feature 5.6) — deferred to Phase 2.
- Contenuto condizionale per gruppi di ospiti (Feature 5.7) — deferred to Phase 2.
- Viste aggregate e export CSV/PDF (Feature 5.12) — deferred to Phase 2.
- Aggiornamenti broadcast (Feature 5.13) — deferred to Phase 2.
- Pagina evento live (Feature 5.14) — deferred to Phase 3.
- Gallery collaborativa post-evento (Feature 5.15) — deferred to Phase 3.
- Messaggio di ringraziamento post-evento (Feature 5.16) — deferred to Phase 3, non ancora specked.
- Fondo regalo integrato — deferred to Phase 3, richiede payment gateway.
- App nativa iOS/Android — non pianificata. Il prodotto è web-based (PWA in futuro se necessario).
- Marketplace fornitori (catering, fotografi, location) — non pianificata.
- Invio diretto via WhatsApp API — non praticabile senza WhatsApp Business API (approvazione + costi elevati).
- Multi-lingua interfaccia organizzatore (inglese, tedesco) — deferred a post-lancio internazionale.

---

## 7. Technical Specifications

### Stack

| Layer | Technology |
|-------|------------|
| Frontend | Nuxt 4 + Vue 3 + TypeScript |
| Backend | Nuxt Server Routes (API layer) |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| Auth | Better Auth |
| Payments | Creem |
| Email transazionale | Resend |
| Storage media | Cloudflare R2 |
| Hosting | Cloudflare Pages / Vercel |

### Architecture Notes

- Architettura monolitica (Nuxt full-stack) — adeguata per la scala iniziale, ottimizzata per velocità di sviluppo da single developer.
- Database multi-tenant con Row Level Security (RLS) via Neon — ogni organizzatore vede solo i propri eventi e ospiti.
- Le pagine invito ospite sono renderizzate server-side (SSR) per performance e SEO del link condiviso (meta tags Open Graph per preview ricca su WhatsApp/Telegram).
- Il form RSVP è un componente Vue dinamico che renderizza le domande in base alla configurazione JSON salvata nel database.
- I link personalizzati usano nanoid (10 caratteri, URL-safe) come token guest, con lookup diretto su indice database.

### Required Integrations

- **Resend API** per email transazionali (inviti, reminder, broadcast).
- **Google Maps Embed API** per mappa location negli inviti (o link deep link senza embed per ridurre costi).
- **Cloudflare R2** S3-compatible API per storage immagini (gallery, header invito).
- **Creem API** per pagamenti: one-time per evento (Celebrazione) e abbonamento ricorrente (Atelier).

### Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Pagina invito ospite: First Contentful Paint < 1.5s su 3G. Dashboard organizzatore: < 2s load su broadband. |
| Security | HTTPS everywhere. Token guest non predicibili (nanoid). RLS su database. No dati sensibili nell'URL (il token è opaco). GDPR compliant: export e cancellazione dati su richiesta. |
| Scalability | Supporto fino a 1.000 eventi attivi e 100.000 ospiti totali nella fase iniziale. Neon serverless scala automaticamente. |
| Compliance | GDPR (privacy policy, consenso, diritto all'oblio). Cookie banner per tracking (open pixel email). |
| Accessibility | Invito e form RSVP: WCAG 2.1 AA. Dashboard organizzatore: WCAG AA su flussi principali. |

---

## 8. UX & Design Guidelines

### Design Principles

- **Semplicità radicale:** l'organizzatore deve capire cosa fare in ogni schermata senza istruzioni. Se una feature richiede un tutorial, è troppo complessa.
- **Mobile-first:** l'esperienza ospite è progettata per smartphone. L'esperienza organizzatore funziona su mobile ma è ottimizzata per desktop.
- **Emozione nel dettaglio:** gli inviti devono trasmettere cura e bellezza. Animazioni sottili, tipografia curata, transizioni fluide. L'invito digitale deve competere emotivamente con un invito cartaceo di qualità.
- **Zero friction per l'ospite:** nessun account, nessun login, nessuna app, nessun CAPTCHA. L'ospite apre il link e risponde — fine.

### Design Assets

- Wireframes: da creare (Figma).
- Design system: Tailwind CSS + componenti custom Vue, palette e tipografia definite per template.
- User flow diagrams: da creare per i 3 flussi principali (creazione invito, distribuzione, risposta RSVP).

---

## 9. Roadmap & Timeline

### Phased Rollout

| Phase | Deliverable | Target Date | Owner | Status |
|-------|-------------|-------------|-------|--------|
| 1 — MVP | Core features: template engine, editor blocchi, link personalizzati, distribuzione email/WhatsApp, form RSVP condizionale, dashboard, reminder | 2026-Q3 | Airowl | In progress |
| 2 — Growth | Personalizzazione visiva, QR code, gruppi ospiti, export dati, broadcast, espansione template, pricing tiers attivi | 2026-Q4 | Airowl | Backlog |
| 3 — Expansion | Pagina evento live, gallery collaborativa, fondo regalo, ringraziamento post-evento, nuove categorie evento | 2027-Q1 | Airowl | Backlog |
| 4 — Scale | Localizzazione multi-lingua, espansione mercati EU, partnership fornitori locali, PWA | 2027-H2 | Airowl | Backlog |

### Key Milestones

- **Design freeze (Phase 1):** 2026-06-15
- **Beta chiusa (10-20 utenti reali):** 2026-08-01
- **Lancio pubblico MVP:** 2026-09-01
- **Prima vendita Celebrazione/Atelier:** 2026-09-30

---

## 10. User Onboarding Plan

**Goal:** portare l'organizzatore dalla registrazione al primo invito inviato in meno di 10 minuti.

1. Registrazione con email o Google OAuth (Better Auth) — 30 secondi.
2. Selezione tipo di evento (schermata con 4 card visive: matrimonio, laurea, compleanno, battesimo) — 10 secondi.
3. Scelta template (galleria visiva con preview, max 3-4 opzioni per tipo) — 30 secondi.
4. Compilazione rapida dei campi dell'invito (wizard step-by-step: chi, quando, dove, messaggio) — 3 minuti.
5. Aggiunta del primo ospite (manuale o import CSV) — 1 minuto.
6. Anteprima dell'invito + invio del primo link (email o copia per WhatsApp) — 1 minuto.
7. **"Aha moment":** l'organizzatore vede nella dashboard che il primo ospite ha aperto il link e compilato l'RSVP.

**Support channels:**
- Tooltip contestuali inline nell'editor e nella dashboard (nessun tour forzato — guide on-demand).
- FAQ page con le 10 domande più frequenti.
- Email di supporto (supporto@ceremly.app).
- Nessun chatbot o live chat nella fase iniziale (overhead eccessivo per un solo developer).

**Activation metric:** 60% degli utenti registrati completano i passi 1-6 entro 7 giorni dalla registrazione.

---

## 11. Testing & QA Strategy

### Test Types

- **Unit tests:** logica condizionale del form builder, calcolo aggregati dashboard, generazione link personalizzati. Target coverage: 80% sulle utility functions core.
- **Integration tests:** flusso completo creazione evento → aggiunta ospite → generazione link → compilazione RSVP → aggiornamento dashboard. Testato con Vitest + Nuxt test utils.
- **End-to-end tests:** i 3 flussi critici (organizzatore crea e invia, ospite risponde, organizzatore vede il risultato) testati con Playwright su Chrome e Safari Mobile.
- **Load test:** simulazione di 100 ospiti che aprono il link e compilano RSVP simultaneamente — verificare che la dashboard si aggiorna senza degrado.
- **Security:** verifica che un token guest non permetta di accedere ai dati di altri ospiti o di altri eventi. Verifica RLS su tutte le query.

### Release Criteria

| Category | Criterion |
|----------|-----------|
| Functionality | Tutte le feature M-priority passano i rispettivi Acceptance Criteria |
| Usability | 3 utenti di test completano il flusso completo (creazione → invio → RSVP → dashboard) senza assistenza |
| Reliability | Zero bug P0 (data loss, security breach), massimo 3 bug P1 (flusso bloccato con workaround) |
| Performance | Pagina invito ospite FCP < 1.5s su 3G simulato. Dashboard < 2s su broadband |
| Supportability | FAQ page completa per i 3 flussi principali |

### Feedback Loop

- Beta chiusa con 10-20 utenti reali (amici, conoscenti che organizzano eventi nei mesi successivi). Feedback raccolto via form strutturato + intervista breve.
- Bug tracking: GitHub Issues con label di priorità (P0/P1/P2).
- CI/CD: GitHub Actions con test automatici su ogni push.

---

## 12. Edge Cases & Open Questions

### Edge Cases

- Un ospite apre il link ma non completa l'RSVP — lo stato è "invito aperto" (non "non risposto" generico). La dashboard deve distinguere "non ha mai visto l'invito" da "lo ha visto ma non ha risposto".
- Un ospite modifica le risposte RSVP più volte — il sistema salva sempre l'ultima versione e mostra nella timeline tutte le modifiche con timestamp.
- L'organizzatore elimina un ospite che ha già risposto — il link diventa inattivo, la risposta resta nel database per coerenza dei conteggi (ma è marcata come "ospite rimosso").
- L'organizzatore cambia il tipo di evento dopo aver già configurato le domande RSVP — il sistema avvisa che il preset verrà resettato e chiede conferma.
- Due ospiti con lo stesso nome e cognome — il sistema li tratta come record separati (ognuno con il proprio token). L'import CSV segnala possibili duplicati.
- L'ospite condivide il proprio link personalizzato con qualcun altro — il "qualcun altro" vede l'invito con il nome dell'ospite originale e non può compilare un RSVP a proprio nome. Questo è intenzionale (1 link = 1 ospite).

### Open Questions

- [ ] Come gestire l'ospite che vuole aggiungere un +1 non previsto dall'organizzatore? Opzione A: l'ospite può aggiungere liberamente. Opzione B: l'ospite deve contattare l'organizzatore. **Decision:** da validare con i beta tester.
- [ ] Servono notifiche push (web push notification) all'organizzatore quando un ospite risponde, o basta l'aggiornamento in dashboard + email digest giornaliero? **Decision:** partire con email digest, aggiungere push se richiesto.
- [ ] Il tier Free dovrebbe avere un watermark "Creato con Ceremly" nell'invito? Pro: brand awareness e viralità. Contro: può infastidire organizzatori attenti all'estetica. **Decision:** sì, con possibilità di rimuoverlo nei tier a pagamento (Celebrazione/Atelier).
- [ ] Come gestire gli inviti per eventi ricorrenti (es. compleanno ogni anno)? Opzione: duplicazione evento con ospiti pre-caricati. **Decision:** defer to Phase 3.
- [x] Prezzi dei tier — **DEFINITI:** Free €0 · Celebrazione €39 una tantum/evento · Atelier €24/mese (per planner). Da validare con analisi di willingness-to-pay durante la beta.

---

## 13. Stakeholders & Responsibilities

| Role | Name | Responsibility |
|------|------|----------------|
| Product Manager | Airowl | PRD owner, prioritizzazione, design, sign-off su tutte le decisioni |
| Engineering Lead | Airowl | Architettura, implementazione full-stack, DevOps |
| Design Lead | Airowl (+ AI tools) | UI/UX, template design, branding |
| QA | Airowl + beta testers | Test manuali, test automatici, feedback raccolta |
| Marketing | Airowl | Landing page, contenuti social, SEO, launch strategy |

> **Nota:** Ceremly è un progetto solopreneur. Tutte le responsabilità convergono sull'owner. La prioritizzazione aggressiva del scope (MVP lean) e l'uso di AI tools per design e copywriting sono essenziali per la fattibilità.

---

## 14. Risks & Assumptions

### Assumptions

- Si assume che gli italiani siano pronti a usare inviti digitali per eventi oltre il matrimonio (lauree, battesimi, compleanni). Validazione: i beta tester coprono almeno 2 tipi di evento diversi.
- Si assume che la distribuzione via "copia link per WhatsApp" sia sufficientemente fluida, anche senza invio diretto via WhatsApp API.
- Si assume che il modello di pricing ibrido — una tantum per evento (Celebrazione) per gli organizzatori privati + abbonamento mensile (Atelier) per i planner professionali — generi revenue sufficiente a coprire i costi operativi (Neon, Resend, R2, dominio).
- Si assume che gli ospiti aprano il link personalizzato e compilino l'RSVP senza frizioni. La barriera psicologica "non conosco questo sito, è sicuro?" potrebbe essere un ostacolo — mitigato dal fatto che il link arriva da una persona conosciuta.
- Si assume che Resend rimanga affidabile e a costi ragionevoli per l'invio di email transazionali nella scala prevista (< 10.000 email/mese nel primo anno).

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Adozione più lenta del previsto — gli utenti italiani preferiscono WhatsApp "manuale" | Medium | High | Rendere l'esperienza WhatsApp il più fluida possibile (copia messaggio one-click). Raccogliere feedback su barriere e iterare. |
| Un competitor (Joy, Zola) lancia una versione multi-evento localizzata in italiano | Low | High | Vantaggio first-mover sulla comprensione culturale italiana. Iterare velocemente. Il moat culturale è difendibile. |
| Email di invito finiscono in spam (specialmente per provider italiani come Libero, Tiscali) | Medium | Medium | Configurazione SPF/DKIM/DMARC corretta su Resend. Test deliverability su provider italiani prima del lancio. Fallback WhatsApp come canale primario. |
| Costi infrastrutturali superano il revenue nel primo anno | Medium | Medium | Stack scelto appositamente per costi marginali bassi (Neon free tier, R2 free tier, Resend free tier fino a 3.000 email/mese). Monitoraggio mensile costi vs revenue. |
| Burnout del solo developer — scope troppo ampio per una persona | High | High | MVP aggressivamente ridotto (solo feature M-priority). No feature creep. Fase 2 e 3 partono solo dopo validazione Phase 1. |
| Problemi di privacy/GDPR nella gestione dei dati degli ospiti (che non hanno dato consenso diretto alla piattaforma) | Low | High | L'organizzatore è il data controller; Ceremly è il data processor. Privacy policy chiara, DPA disponibile, dati cancellabili su richiesta. L'ospite non crea un account — i dati raccolti sono minimali (nome + risposte RSVP). |

### Dependencies

- **Resend:** servizio email transazionale. Se Resend ha downtime, gli inviti email e i reminder non partono. Mitigation: WhatsApp come canale alternativo sempre disponibile.
- **Neon:** database PostgreSQL serverless. Se Neon ha downtime, l'intero servizio è offline. Mitigation: backup automatici, monitoring uptime.
- **Creem:** payment gateway. Se Creem ha problemi, gli utenti non possono acquistare tier Celebrazione/Atelier. Mitigation: i pagamenti non bloccano l'uso del tier Free.
- **Cloudflare R2:** storage immagini. Se R2 è offline, le immagini negli inviti e nella gallery non si caricano. Mitigation: CDN caching minimizza l'impatto.

---

## Sign-off

| Stakeholder | Role | Date | Approved |
|-------------|------|------|----------|
| Airowl | Product Manager / Owner | 2026-04-16 | ☐ |

---

*Ceremly · PRD · v0.1 · Confidential Draft*
