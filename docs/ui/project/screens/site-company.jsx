// Sito pubblico — colonna "Ceremly" del footer
// Chi siamo · Contatti · Termini · Privacy & GDPR · Cookie

/* ───────────────────────────── CHI SIAMO */
function ChiSiamoPage() {
  const values = [
    { i: I.Check, t: 'Un solo problema', d: 'Niente liste nozze, niente album, niente siti vetrina. Ceremly risponde a una domanda — chi viene? — e basta. Quello che non facciamo è una scelta, non una mancanza.' },
    { i: I.Settings, t: 'I dati sono degli sposi', d: 'Le liste ospiti non si vendono, non si profilano, non alimentano pubblicità. Server in UE, export completo in ogni momento, cancellazione vera quando la chiedi.' },
    { i: I.Heart, t: 'Fatto in Italia', d: 'Eventi italiani, galateo italiano, fattura elettronica italiana. Costruiamo per come si festeggia qui: famiglie larghe, conferme tardive e pranzi lunghi.' },
  ];
  const team = [
    { ini: 'AC', n: 'Andrea C.', r: 'Prodotto', d: 'Ha contato a mano i 187 invitati del suo matrimonio. Mai più.' },
    { ini: 'LF', n: 'Lucia F.', r: 'Design', d: 'Crede che un invito brutto rovini la festa prima che inizi.' },
    { ini: 'PV', n: 'Pietro V.', r: 'Ingegneria', d: 'Vuole che il form RSVP si apra anche sul telefono della nonna.' },
  ];
  const nums = [['2026', 'fondazione, Milano'], ['142', 'eventi nella beta'], ['11.804', 'RSVP raccolti'], ['3', 'persone, per ora']];
  return (
    <SitePage label="Chi siamo">
      <SiteHero
        tag="Chi siamo"
        title={<span>Ci piacciono le feste.<br />Non i <Mark>fogli di calcolo</Mark>.</span>}
        sub="Ceremly nasce nel 2026 da tre persone e un matrimonio organizzato a colpi di Excel, messaggi vocali e telefonate alla suocera."
      />
      <div style={{ padding: '64px 72px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56 }}>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--ink-700)', margin: 0 }}>
          L'idea è arrivata la sera in cui Andrea, a tre giorni dal suo matrimonio, ha chiamato
          il catering con tre numeri diversi su tre fogli diversi. Gli inviti erano stati bellissimi.
          La lista, un incubo. Ci siamo chiesti perché nel 2026 si potesse prenotare un volo in due minuti,
          ma non sapere quanti zii vengono a pranzo.
        </p>
        <p style={{ fontSize: 17, lineHeight: 1.7, color: 'var(--ink-700)', margin: 0 }}>
          Così abbiamo costruito Ceremly: inviti digitali che non sfigurano accanto a quelli di carta,
          e un form di risposta che chiunque sa usare — senza app, senza account, senza spiegazioni
          al telefono. Oggi siamo in beta, piccoli per scelta, e cresciamo un evento alla volta.
        </p>
      </div>
      <div style={{ margin: '56px 72px 0', padding: '28px 36px', background: 'var(--bone-100)', border: '1px solid var(--line)', borderRadius: 18, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
        {nums.map(([n, l]) => (
          <div key={l} className="col" style={{ gap: 2 }}>
            <span className="serif" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em' }}>{n}</span>
            <span className="small muted">{l}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '64px 72px 0' }}>
        <SiteH2 tag="Principi" title="Tre cose in cui crediamo" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {values.map((v) => (
            <div key={v.t} className="cer-card" style={{ padding: 26 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bone-200)', border: '1.5px solid var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <v.i s={19} />
              </div>
              <div className="serif" style={{ fontSize: 22, fontWeight: 700, marginTop: 16, letterSpacing: '-0.02em' }}>{v.t}</div>
              <div style={{ fontSize: 14, marginTop: 10, color: 'var(--ink-700)', lineHeight: 1.6 }}>{v.d}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '64px 72px 80px' }}>
        <SiteH2 tag="Il team" title="Chi c'è dietro" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {team.map((m) => (
            <div key={m.n} className="cer-card row" style={{ padding: 22, gap: 16, alignItems: 'flex-start' }}>
              <span className="av lg" style={{ width: 48, height: 48, fontSize: 14 }}>{m.ini}</span>
              <div className="col" style={{ gap: 3 }}>
                <span className="serif" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{m.n}</span>
                <span className="mono" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--purple-bright)' }}>{m.r}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5, marginTop: 4 }}>{m.d}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <SiteCTA title={<span>Festeggia con noi. <Mark c="var(--orange)">Letteralmente</Mark>.</span>} sub="Il modo migliore per conoscerci è usare Ceremly per il tuo prossimo evento." secondary="Scrivici" />
    </SitePage>
  );
}

/* ───────────────────────────── CONTATTI */
function ContattiPage() {
  const channels = [
    { i: I.Mail, t: 'Supporto', e: 'supporto@ceremly.it', d: 'Per chi sta organizzando: rispondiamo entro un giorno lavorativo.' },
    { i: I.Guests, t: 'Partner & planner', e: 'partner@ceremly.it', d: 'Atelier, API, integrazioni catering: parliamone in una demo di 30 minuti.' },
    { i: I.Send, t: 'Stampa & altro', e: 'ciao@ceremly.it', d: 'Interviste, collaborazioni, idee. Leggiamo tutto, davvero.' },
  ];
  const Field = ({ label, children }) => (
    <div className="col" style={{ gap: 7 }}>
      <label className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>{label}</label>
      {children}
    </div>
  );
  return (
    <SitePage label="Contatti">
      <SiteHero
        tag="Contatti"
        title={<span>Scrivici.<br />Rispondiamo <Mark>davvero</Mark>.</span>}
        sub="Niente chatbot, niente ticket numerati: siamo in tre e leggiamo ogni messaggio."
      />
      <div style={{ padding: '64px 72px 80px', display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          {channels.map((c) => (
            <div key={c.t} className="cer-card row" style={{ padding: 22, gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bone-200)', border: '1.5px solid var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <c.i s={19} />
              </div>
              <div className="col" style={{ gap: 3 }}>
                <span className="serif" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{c.t}</span>
                <span className="mono" style={{ fontSize: 13, color: 'var(--purple-bright)', fontWeight: 700 }}>{c.e}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.5, marginTop: 4 }}>{c.d}</span>
              </div>
            </div>
          ))}
          <div className="row" style={{ gap: 10, padding: '6px 4px', fontSize: 13, color: 'var(--ink-500)' }}>
            <I.Pin s={15} /> Ceremly Srl · Via dei Mille 23, 20129 Milano · P.IVA 12345670156
          </div>
        </div>
        <div className="cer-card" style={{ padding: 32 }}>
          <div className="serif" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 24 }}>Mandaci un messaggio</div>
          <div className="col" style={{ gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nome"><input className="cer-input" placeholder="Il tuo nome" readOnly /></Field>
              <Field label="Email"><input className="cer-input" placeholder="nome@email.it" readOnly /></Field>
            </div>
            <Field label="Motivo">
              <div className="cer-input row" style={{ justifyContent: 'space-between', cursor: 'pointer', color: 'var(--ink-700)' }}>
                Sto organizzando un evento <I.ChevD s={15} />
              </div>
            </Field>
            <Field label="Messaggio">
              <textarea className="cer-input" rows={5} placeholder="Raccontaci: che evento, quanti ospiti, cosa non torna…" style={{ resize: 'none', fontFamily: 'inherit' }} readOnly></textarea>
            </Field>
            <div className="row" style={{ gap: 10, fontSize: 12, color: 'var(--ink-500)', alignItems: 'flex-start' }}>
              <span style={{ width: 16, height: 16, border: '1.5px solid var(--line-strong)', borderRadius: 4, flexShrink: 0, marginTop: 1 }} />
              Ho letto l'informativa privacy e acconsento al trattamento dei dati per ricevere risposta.
            </div>
            <button className="cer-btn" style={{ justifyContent: 'center', padding: '14px 16px' }}><I.Send s={14} /> Invia il messaggio</button>
          </div>
        </div>
      </div>
    </SitePage>
  );
}

/* ───────────────────────────── LEGALE — template condiviso */
function LegalPage({ label, title, updated, sections, intro }) {
  return (
    <SitePage label={label}>
      <div style={{ padding: '72px 72px 48px', borderBottom: '1px solid var(--line)' }}>
        <span className="cer-tag">Legale</span>
        <h1 className="serif" style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em', margin: '18px 0 0' }}>{title}</h1>
        <div className="mono" style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 16 }}>Ultimo aggiornamento · {updated} · Ceremly Srl, Milano</div>
        {intro && <p style={{ fontSize: 15, color: 'var(--ink-700)', lineHeight: 1.65, maxWidth: 660, margin: '18px 0 0' }}>{intro}</p>}
      </div>
      <div style={{ padding: '56px 72px 80px', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 56, alignItems: 'start' }}>
        <div className="cer-card" style={{ padding: 22, position: 'sticky', top: 24 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 14 }}>Indice</div>
          <div className="col" style={{ gap: 11 }}>
            {sections.map((s, i) => (
              <span key={s.t} className="row" style={{ gap: 10, fontSize: 13, color: 'var(--ink-700)', cursor: 'pointer', alignItems: 'flex-start' }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 700, marginTop: 2 }}>{String(i + 1).padStart(2, '0')}</span> {s.t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ maxWidth: 720 }}>
          {sections.map((s, i) => (
            <div key={s.t} style={{ paddingBottom: 36, marginBottom: 36, borderBottom: i < sections.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <h2 className="serif" style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 14px', display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 13, color: 'var(--orange)', fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>{s.t}
              </h2>
              {s.ps.map((p, pi) => (
                <p key={pi} style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--ink-700)', margin: '0 0 12px' }}>{p}</p>
              ))}
              {s.extra}
            </div>
          ))}
        </div>
      </div>
    </SitePage>
  );
}

function TerminiPage() {
  return <LegalPage label="Termini" title="Termini di servizio" updated="3 maggio 2026"
    intro="In breve: paghi solo i piani che scegli, i contenuti dei tuoi inviti restano tuoi, e puoi andartene quando vuoi portandoti via i dati. Qui sotto, la versione completa."
    sections={[
      { t: 'Oggetto del servizio', ps: [
        'Ceremly è una piattaforma per creare inviti digitali, gestire liste ospiti e raccogliere conferme di partecipazione (RSVP) per eventi privati. Il servizio è fornito da Ceremly Srl, con sede in Via dei Mille 23, Milano.',
        'Questi termini regolano l\'uso del servizio da parte degli organizzatori registrati. Gli ospiti che rispondono a un invito non creano un account e non sono parte di questo contratto: i loro dati sono trattati per conto dell\'organizzatore, come descritto nella Privacy.',
      ]},
      { t: 'Account e responsabilità', ps: [
        'Per organizzare un evento serve un account, con email valida e dati veritieri. Sei responsabile della riservatezza delle credenziali e di quanto avviene tramite il tuo account.',
        'Ti impegni a caricare solo contatti di persone che hai titolo a invitare, e a non usare Ceremly per comunicazioni commerciali, spam o eventi diversi da quelli dichiarati.',
      ]},
      { t: 'Piani e pagamenti', ps: [
        'Il piano Free è gratuito senza limiti di tempo, con i limiti quantitativi indicati nella pagina Prezzi. Celebrazione è un acquisto una tantum riferito a un singolo evento; Atelier è un abbonamento mensile, disdicibile in ogni momento con effetto dal ciclo successivo.',
        'I pagamenti sono gestiti da Stripe; Ceremly non conserva i dati delle carte. Per ogni acquisto emettiamo fattura elettronica.',
        'Se l\'evento viene annullato e non hai ancora inviato gli inviti, hai diritto al rimborso completo di Celebrazione entro 30 giorni dall\'acquisto.',
      ]},
      { t: 'Contenuti e proprietà', ps: [
        'Testi, foto e personalizzazioni dei tuoi inviti restano tuoi. Ci concedi solo la licenza tecnica necessaria a mostrarli agli ospiti che invii tu.',
        'I modelli grafici, il software e il marchio Ceremly restano di Ceremly Srl e non possono essere rivenduti o riutilizzati fuori dalla piattaforma.',
      ]},
      { t: 'Limitazioni di responsabilità', ps: [
        'Ci impegniamo a un servizio affidabile (lo stato è pubblico, alla pagina Stato servizio), ma Ceremly è fornito "così com\'è": non rispondiamo di danni indiretti come mancate conferme, errori degli ospiti nelle risposte o decisioni prese sulla base dei conteggi.',
        'Resta ferma la responsabilità nei limiti inderogabili di legge. Per i consumatori valgono in ogni caso le tutele del Codice del Consumo.',
      ]},
      { t: 'Recesso e chiusura', ps: [
        'Puoi chiudere l\'account in ogni momento dalle impostazioni: prima della chiusura puoi esportare liste e risposte. I dati sono cancellati secondo i tempi indicati nella Privacy.',
        'Possiamo sospendere account che violano questi termini, avvisandoti via email salvo abusi gravi. Per ogni controversia è competente il foro di Milano, fatte salve le tutele del consumatore.',
      ]},
    ]} />;
}

function PrivacyPage() {
  return <LegalPage label="Privacy & GDPR" title="Privacy & GDPR" updated="3 maggio 2026"
    intro="In breve: raccogliamo solo i dati che servono a far funzionare gli inviti, li teniamo su server in UE, non li vendiamo a nessuno e li cancelliamo quando lo chiedi. La versione completa, ai sensi del Reg. UE 2016/679."
    sections={[
      { t: 'Titolare e ruoli', ps: [
        'Titolare del trattamento per i dati degli organizzatori è Ceremly Srl, Via dei Mille 23, Milano — privacy@ceremly.it.',
        'Per i dati degli ospiti (nomi, contatti, risposte) il titolare è l\'organizzatore dell\'evento: Ceremly agisce come responsabile del trattamento ai sensi dell\'art. 28 GDPR, sulla base dell\'accordo incluso in questi termini.',
      ]},
      { t: 'Quali dati raccogliamo', ps: [
        'Organizzatori: email, nome, dati di fatturazione e log tecnici di accesso.',
        'Ospiti: i dati caricati dall\'organizzatore (nome, telefono o email, gruppo) e quelli forniti nella risposta — partecipazione, accompagnatori, preferenze alimentari e note. Le preferenze alimentari possono rivelare dati particolari (es. esigenze religiose o di salute): sono raccolte solo se l\'organizzatore attiva quel campo e usate al solo fine del catering.',
      ]},
      { t: 'Finalità e basi giuridiche', ps: [
        'Erogare il servizio (contratto), inviare comunicazioni tecniche e di servizio (contratto), fatturazione (obbligo di legge), statistiche aggregate e anonime sull\'uso (legittimo interesse).',
        'Nessuna profilazione, nessuna pubblicità, nessuna cessione a terzi per marketing. Mai.',
      ]},
      { t: 'Dove e per quanto tempo', ps: [
        'Tutti i dati risiedono su server nell\'Unione Europea. I dati di un evento restano disponibili per 12 mesi dalla data dell\'evento, poi vengono cancellati o anonimizzati; l\'organizzatore può cancellarli prima, in ogni momento.',
        'I dati di fatturazione sono conservati 10 anni per obbligo di legge. I log tecnici, 12 mesi.',
      ]},
      { t: 'I tuoi diritti', ps: [
        'Accesso, rettifica, cancellazione, portabilità, limitazione e opposizione: scrivi a privacy@ceremly.it e rispondiamo entro 30 giorni. Gli ospiti possono rivolgersi all\'organizzatore o direttamente a noi, e li assisteremo comunque.',
        'Hai inoltre diritto di reclamo al Garante per la Protezione dei Dati Personali (gpdp.it).',
      ]},
      { t: 'Sub-responsabili', ps: [
        'Usiamo pochi fornitori selezionati, tutti con garanzie GDPR: hosting in UE, Stripe per i pagamenti, un provider email e uno per l\'invio WhatsApp. L\'elenco aggiornato è disponibile su richiesta e ogni modifica è comunicata con 30 giorni di anticipo.',
      ]},
    ]} />;
}

function CookiePage() {
  const rows = [
    ['ceremly_session', 'Essenziale', 'Mantiene l\'accesso dell\'organizzatore', 'Sessione'],
    ['ceremly_rsvp', 'Essenziale', 'Ricorda la risposta dell\'ospite sul suo dispositivo', '30 giorni'],
    ['ceremly_prefs', 'Preferenza', 'Lingua e impostazioni di visualizzazione', '12 mesi'],
    ['ceremly_stats', 'Statistica', 'Conteggi anonimi e aggregati (senza terze parti)', '6 mesi'],
  ];
  return <LegalPage label="Cookie" title="Cookie policy" updated="3 maggio 2026"
    intro="In breve: usiamo quattro cookie, tutti nostri. Niente tracciamento pubblicitario, niente terze parti, quindi niente banner infiniti."
    sections={[
      { t: 'Cosa sono e come li usiamo', ps: [
        'I cookie sono piccoli file salvati dal browser. Ceremly li usa solo per funzioni essenziali (tenerti collegato, ricordare la risposta di un ospite) e per statistiche anonime calcolate sui nostri server — non usiamo strumenti di analisi di terze parti né pixel pubblicitari.',
      ]},
      { t: 'I cookie che usiamo', ps: [], extra: (
        <div className="cer-card" style={{ overflow: 'hidden', marginTop: 6 }}>
          <table className="cer-table">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Scopo</th><th>Durata</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{r[0]}</td>
                  <td><span className="pill neutral">{r[1]}</span></td>
                  <td style={{ color: 'var(--ink-700)' }}>{r[2]}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )},
      { t: 'Come gestirli', ps: [
        'I cookie essenziali non richiedono consenso e senza di essi il servizio non funziona. Quelli di preferenza e statistica si possono rifiutare dal banner al primo accesso o disattivare in qualsiasi momento dalle impostazioni del browser.',
        'Bloccando tutti i cookie dal browser, le pagine invito restano consultabili ma la risposta non viene ricordata sul dispositivo.',
      ]},
      { t: 'Aggiornamenti e contatti', ps: [
        'Se introdurremo nuovi cookie aggiorneremo questa pagina e, dove richiesto, il banner di consenso. Per domande: privacy@ceremly.it.',
      ]},
    ]} />;
}

Object.assign(window, { ChiSiamoPage, ContattiPage, TerminiPage, PrivacyPage, CookiePage });
