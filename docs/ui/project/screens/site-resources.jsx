// Sito pubblico — colonna "Risorse" del footer
// Guida RSVP · Centro aiuto · Stato servizio · Changelog · API per partner

/* ───────────────────────────── GUIDA RSVP */
function GuidaRSVPPage() {
  const toc = ['Cos\'è l\'RSVP (e perché si ignora)', 'Quando inviare e quando chiudere', 'Come scrivere la richiesta', 'Gestire i ritardatari'];
  const timeline = [
    ['T–60', 'Invia gli inviti', 'Due mesi prima per i matrimoni, due settimane per compleanni e lauree.'],
    ['T–30', 'Primo promemoria', 'Un sollecito gentile a chi non ha aperto o non ha risposto.'],
    ['T–14', 'Secondo promemoria', 'Più diretto: la scadenza è vicina e serve a te, non a loro.'],
    ['T–7', 'Chiudi la lista', 'Numeri congelati: parte l\'export per catering e location.'],
  ];
  const H3 = ({ n, children }) => (
    <h2 className="serif" id={'s' + n} style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 14px', display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <span className="mono" style={{ fontSize: 14, color: 'var(--orange)', fontWeight: 700 }}>0{n}</span>{children}
    </h2>
  );
  const P = ({ children }) => <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink-700)', margin: '0 0 14px' }}>{children}</p>;
  return (
    <SitePage label="Guida RSVP">
      <SiteHero
        tag="Guida"
        title={<span>RSVP, <Mark>fatto bene</Mark>.</span>}
        sub="Répondez s'il vous plaît: come chiedere conferma agli ospiti — e ottenerla davvero. Dieci minuti di lettura."
      />
      <div style={{ padding: '64px 72px 80px', display: 'grid', gridTemplateColumns: '290px 1fr', gap: 56, alignItems: 'start' }}>
        <div className="cer-card" style={{ padding: 22, position: 'sticky', top: 24 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', marginBottom: 14 }}>In questa guida</div>
          <div className="col" style={{ gap: 12 }}>
            {toc.map((t, i) => (
              <span key={t} className="row" style={{ gap: 10, fontSize: 14, color: i === 0 ? 'var(--ink)' : 'var(--ink-700)', fontWeight: i === 0 ? 600 : 400, cursor: 'pointer' }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700 }}>0{i + 1}</span> {t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: 720 }}>
          <H3 n={1}>Cos'è l'RSVP (e perché si ignora)</H3>
          <P>RSVP è la richiesta di confermare la propria presenza. Sembra banale, ma in Italia circa un invitato su tre non risponde mai spontaneamente: non per maleducazione, ma perché la richiesta è vaga, senza scadenza, o sepolta in un gruppo da 40 persone.</P>
          <P>La buona notizia: l'RSVP non è un problema di galateo, è un problema di processo. E i processi si sistemano.</P>

          <div style={{ height: 1, background: 'var(--line)', margin: '32px 0' }} />
          <H3 n={2}>Quando inviare e quando chiudere</H3>
          <P>La regola d'oro: lavora a ritroso dalla data in cui il catering vuole i numeri definitivi. Per un matrimonio il calendario tipico è questo:</P>
          <div className="cer-card" style={{ padding: 24, margin: '20px 0 14px' }}>
            <div className="col" style={{ gap: 0 }}>
              {timeline.map(([t, ti, d], i) => (
                <div key={t} className="row" style={{ gap: 18, alignItems: 'flex-start', padding: '12px 0', borderBottom: i < timeline.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--purple-bright)', width: 48, flexShrink: 0 }}>{t}</span>
                  <div className="col" style={{ gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{ti}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-500)', lineHeight: 1.5 }}>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <P>Per lauree e compleanni comprimi tutto: invito due settimane prima, promemoria a una settimana, chiusura a tre giorni.</P>

          <div style={{ height: 1, background: 'var(--line)', margin: '32px 0' }} />
          <H3 n={3}>Come scrivere la richiesta</H3>
          <P>Tre ingredienti, sempre: una <strong>scadenza esplicita</strong> (“entro il 1 luglio”), una <strong>sola azione</strong> (un link, non “fammi sapere”), un <strong>tono personale</strong> (il nome dell'ospite fa metà del lavoro).</P>
          <div style={{ background: 'var(--bone-200)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px 24px', margin: '18px 0' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--blue-deep)', marginBottom: 10 }}>Esempio che funziona</div>
            <p style={{ fontSize: 15, lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
              “Ciao Marta! Ci sposiamo il 12 settembre a Cernobbio 💍 Qui trovi l'invito con tutti i dettagli:
              ceremly.it/giulia-tommaso — confermaci entro il 1 luglio, così diamo i numeri al catering. Un abbraccio!”
            </p>
          </div>
          <P>Nota cosa non c'è: scuse, premesse, “quando puoi”. La gentilezza sta nel tono, non nella vaghezza.</P>

          <div style={{ height: 1, background: 'var(--line)', margin: '32px 0' }} />
          <H3 n={4}>Gestire i ritardatari</H3>
          <P>Ci saranno sempre. Il trucco è non gestirli a mano: imposta i promemoria automatici e lascia che sia “il sistema” a insistere — il sollecito di una piattaforma pesa meno di tre messaggi tuoi.</P>
          <P>Per gli irriducibili, l'ultima settimana vale la telefonata. A quel punto saranno cinque persone, non cinquanta: è esattamente il punto.</P>
        </div>
      </div>
      <SiteCTA title={<span>Mettila in pratica con <Mark c="var(--orange)">Ceremly</Mark>.</span>} sub="Scadenze, promemoria ed export sono già nel prodotto. Tu scrivi solo l'invito." />
    </SitePage>
  );
}

/* ───────────────────────────── CENTRO AIUTO */
function CentroAiutoPage() {
  const cats = [
    { i: I.Sparkle, t: 'Primi passi', n: 8 },
    { i: I.Edit, t: 'Inviti & modelli', n: 12 },
    { i: I.Guests, t: 'Lista ospiti', n: 9 },
    { i: I.Check, t: 'RSVP & form', n: 11 },
    { i: I.Copy, t: 'Pagamenti & fatture', n: 6 },
    { i: I.Settings, t: 'Privacy & dati', n: 5 },
  ];
  const popular = [
    'Come importo gli ospiti da Excel?',
    'Posso cambiare data o luogo dopo aver inviato gli inviti?',
    'Qual è la differenza tra link unico e inviti personali?',
    'Come funziona il QR per gli inviti cartacei?',
    'Un ospite dice di non aver ricevuto l\'email: cosa controllo?',
  ];
  return (
    <SitePage label="Centro aiuto">
      <SiteHero center tag="Centro aiuto" title={<span>Come possiamo <Mark>aiutarti</Mark>?</span>}>
        <div style={{ maxWidth: 560, margin: '32px auto 0', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-400)' }}><I.Search s={18} /></span>
          <input className="cer-input" placeholder="Cerca: “importare ospiti”, “QR”, “fattura”…" style={{ padding: '15px 16px 15px 46px', fontSize: 15 }} readOnly />
        </div>
      </SiteHero>
      <div style={{ padding: '56px 72px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {cats.map((c) => (
            <div key={c.t} className="cer-card row" style={{ padding: '20px 22px', gap: 14, cursor: 'pointer' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bone-200)', border: '1.5px solid var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <c.i s={19} />
              </div>
              <div className="col" style={{ gap: 2 }}>
                <span className="serif" style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{c.t}</span>
                <span className="small muted">{c.n} articoli</span>
              </div>
              <span className="spacer" />
              <span style={{ color: 'var(--ink-300)' }}><I.ChevR s={16} /></span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '56px 72px 72px' }}>
        <SiteH2 tag="Le più lette" title="Domande frequenti" />
        <div className="cer-card" style={{ overflow: 'hidden' }}>
          {popular.map((q, i) => (
            <div key={q} className="row" style={{ padding: '18px 24px', justifyContent: 'space-between', borderBottom: i < popular.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{q}</span>
              <span style={{ color: 'var(--ink-300)' }}><I.ChevR s={16} /></span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 28, padding: '24px 28px', background: 'var(--ink)', color: 'var(--bone-50)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
          <div className="col" style={{ gap: 4 }}>
            <span className="serif" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Non hai trovato la risposta?</span>
            <span style={{ fontSize: 14, color: 'var(--bone-200)' }}>Scrivici: rispondiamo entro un giorno lavorativo, una persona vera.</span>
          </div>
          <button className="cer-btn" style={{ background: 'var(--orange)', flexShrink: 0 }}><I.Mail s={14} /> Scrivici</button>
        </div>
      </div>
    </SitePage>
  );
}

/* ───────────────────────────── STATO SERVIZIO */
function StatoServizioPage() {
  // 60-day uptime strips — deterministic "degraded" days per component
  const comps = [
    { t: 'App organizzatore', deg: [] },
    { t: 'Pagine invito & RSVP', deg: [] },
    { t: 'Invio email', deg: [21] },
    { t: 'Invio WhatsApp', deg: [21, 44] },
    { t: 'API per partner', deg: [] },
  ];
  const incidents = [
    { d: '14 maggio 2026', t: 'Ritardi nell\'invio email', desc: 'Code di invio rallentate dal provider SMTP. Nessuna email persa: tutte consegnate entro 42 minuti.', dur: '42 min' },
    { d: '27 marzo 2026', t: 'Lentezza nella dashboard', desc: 'Tempi di caricamento elevati sulla pagina Andamento per una query non ottimizzata. Risolto con rollback.', dur: '18 min' },
  ];
  return (
    <SitePage label="Stato servizio">
      <div style={{ padding: '72px 72px 56px', borderBottom: '1px solid var(--line)' }}>
        <span className="cer-tag">Stato servizio</span>
        <div className="cer-card row" style={{ marginTop: 24, padding: '28px 32px', gap: 18, borderColor: 'color-mix(in srgb, var(--confirm) 40%, transparent)', borderWidth: 2 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--confirm)', flexShrink: 0, boxShadow: '0 0 0 4px color-mix(in srgb, var(--confirm) 20%, transparent)' }} />
          <div className="col" style={{ gap: 2 }}>
            <span className="serif" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.025em' }}>Tutti i sistemi operativi</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-500)' }}>uptime ultimi 90 giorni · 99,97% · aggiornato 2 min fa</span>
          </div>
        </div>
      </div>
      <div style={{ padding: '56px 72px 0' }}>
        <SiteH2 tag="Componenti" title="Ultimi 60 giorni" />
        <div className="cer-card" style={{ overflow: 'hidden' }}>
          {comps.map((c, ci) => (
            <div key={c.t} style={{ padding: '18px 24px', borderBottom: ci < comps.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{c.t}</span>
                <span className={'pill ' + (c.deg.length ? 'confirm' : 'confirm')}><span className="cer-dot" />Operativo</span>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: 60 }, (_, i) => (
                  <span key={i} title={c.deg.includes(i) ? 'Prestazioni ridotte' : 'Operativo'} style={{
                    flex: 1, height: 26, borderRadius: 2,
                    background: c.deg.includes(i) ? 'var(--pending)' : 'color-mix(in srgb, var(--confirm) 55%, var(--bone-200))',
                  }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 18, marginTop: 12, fontSize: 12, color: 'var(--ink-500)' }}>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'color-mix(in srgb, var(--confirm) 55%, var(--bone-200))', display: 'inline-block' }} /> Operativo</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--pending)', display: 'inline-block' }} /> Prestazioni ridotte</span>
        </div>
      </div>
      <div style={{ padding: '56px 72px 80px' }}>
        <SiteH2 tag="Storico" title="Incidenti passati" />
        <div className="col" style={{ gap: 14 }}>
          {incidents.map((inc) => (
            <div key={inc.d} className="cer-card" style={{ padding: '20px 24px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row" style={{ gap: 14 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-500)' }}>{inc.d}</span>
                  <span className="serif" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{inc.t}</span>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-500)' }}>{inc.dur}</span>
                  <span className="pill neutral"><span className="cer-dot" />Risolto</span>
                </div>
              </div>
              <p style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.55, margin: '10px 0 0', maxWidth: 760 }}>{inc.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </SitePage>
  );
}

/* ───────────────────────────── CHANGELOG */
function ChangelogPage() {
  const Tag = ({ k }) => {
    const m = { Nuovo: ['var(--bone-200)', 'var(--blue-deep)'], Migliorato: ['var(--wine-soft)', 'var(--purple-ink)'], Risolto: ['var(--orange-soft)', 'var(--orange-deep)'] };
    return <span className="cer-tag" style={{ background: m[k][0], color: m[k][1], borderColor: 'transparent', fontSize: 10, padding: '3px 8px' }}>{k}</span>;
  };
  const releases = [
    {
      v: 'v0.4', d: '28 maggio 2026', t: 'Promemoria che lavorano per te',
      items: [
        ['Nuovo', 'Promemoria automatici programmabili: scegli cadenza, tono e orario di invio.'],
        ['Nuovo', 'Anteprima del sollecito prima dell\'invio, con il nome dell\'ospite.'],
        ['Migliorato', 'L\'import da Excel ora riconosce e unisce i duplicati con nomi simili.'],
      ],
    },
    {
      v: 'v0.3', d: '30 aprile 2026', t: 'La carta incontra il digitale',
      items: [
        ['Nuovo', 'QR code per inviti cartacei: ogni famiglia ha il suo, con risposta pre-compilata.'],
        ['Nuovo', 'Due famiglie di modelli per battesimi: Acquerello e Lino.'],
        ['Risolto', 'Il conteggio dei plus-one non includeva i bambini nei gruppi famiglia.'],
      ],
    },
    {
      v: 'v0.2', d: '2 aprile 2026', t: 'Inviti personali su WhatsApp',
      items: [
        ['Nuovo', 'Invio di inviti nominali via WhatsApp ed email, con link unico per ospite.'],
        ['Nuovo', 'Export per il catering in CSV e PDF: menu, allergie e note in colonne separate.'],
        ['Migliorato', 'Le pagine invito si caricano in metà tempo sulle reti mobili.'],
      ],
    },
    {
      v: 'v0.1', d: '5 marzo 2026', t: 'Beta pubblica',
      items: [
        ['Nuovo', 'Ceremly apre agli organizzatori italiani: inviti digitali, lista ospiti e RSVP.'],
        ['Nuovo', 'Piano Free con 30 ospiti e un evento attivo, per sempre.'],
      ],
    },
  ];
  return (
    <SitePage label="Changelog">
      <SiteHero
        tag="Changelog"
        title={<span>Cosa c'è di <Mark>nuovo</Mark></span>}
        sub="Rilasciamo ogni poche settimane. Qui trovi tutto quello che è cambiato, senza giri di parole."
      />
      <div style={{ padding: '64px 72px 56px', maxWidth: 980 }}>
        <div className="col" style={{ gap: 0 }}>
          {releases.map((r, ri) => (
            <div key={r.v} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 40, padding: '36px 0', borderBottom: ri < releases.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div className="col" style={{ gap: 6 }}>
                <span className="serif" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{r.v}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-500)' }}>{r.d}</span>
              </div>
              <div>
                <div className="serif" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>{r.t}</div>
                <div className="col" style={{ gap: 12 }}>
                  {r.items.map(([k, txt]) => (
                    <div key={txt} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                      <Tag k={k} />
                      <span style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.55 }}>{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ margin: '0 72px 72px', padding: '24px 28px', background: 'var(--bone-100)', border: '1px solid var(--line)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <div className="col" style={{ gap: 2 }}>
          <span className="serif" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Ricevi il changelog via email</span>
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>Una email al mese, solo quando c'è qualcosa di nuovo. Niente marketing.</span>
        </div>
        <div className="row" style={{ gap: 10, flexShrink: 0 }}>
          <input className="cer-input" placeholder="la-tua@email.it" style={{ width: 240 }} readOnly />
          <button className="cer-btn">Avvisami</button>
        </div>
      </div>
    </SitePage>
  );
}

/* ───────────────────────────── API PER PARTNER */
function APIPartnerPage() {
  const endpoints = [
    ['GET', '/v1/events', 'Tutti gli eventi del workspace'],
    ['GET', '/v1/events/:id/rsvps', 'Risposte di un evento, con menu e note'],
    ['POST', '/v1/guests', 'Aggiungi o aggiorna ospiti in blocco'],
    ['POST', '/v1/webhooks', 'Ricevi ogni RSVP in tempo reale'],
    ['GET', '/v1/exports/catering', 'Export catering in CSV, già formattato'],
  ];
  const mColor = { GET: ['var(--bone-200)', 'var(--blue-deep)'], POST: ['var(--wine-soft)', 'var(--purple-ink)'] };
  return (
    <SitePage label="API per partner">
      <div style={{ padding: '72px 72px 80px', borderBottom: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        <div>
          <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent' }}>Atelier · API</span>
          <h1 className="serif" style={{ fontSize: 58, fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em', margin: '18px 0 0' }}>
            Gli RSVP, anche<br />nei <Mark c="var(--purple)">tuoi sistemi</Mark>.
          </h1>
          <p style={{ fontSize: 16, color: 'var(--ink-700)', lineHeight: 1.6, maxWidth: 460, margin: '20px 0 0' }}>
            Per planner, catering e location che lavorano con i propri strumenti: un'API REST per leggere conferme, menu e numeri — e webhook per saperlo subito.
          </p>
          <div className="col" style={{ gap: 10, marginTop: 24 }}>
            {['API REST con chiavi per workspace', 'Webhook a ogni nuova risposta', 'Ambiente sandbox con dati di prova', 'Rate limit generosi, documentazione in italiano'].map((b) => (
              <span key={b} className="row" style={{ gap: 9, fontSize: 14, color: 'var(--ink-700)' }}>
                <span style={{ color: 'var(--purple)' }}><I.Check s={15} /></span> {b}
              </span>
            ))}
          </div>
          <div className="row" style={{ gap: 12, marginTop: 28 }}>
            <button className="cer-btn"><I.Mail s={14} /> Richiedi accesso</button>
            <button className="cer-btn ghost">Documentazione</button>
          </div>
        </div>
        <div style={{ background: 'var(--ink)', borderRadius: 16, border: '2px solid var(--ink)', boxShadow: '8px 8px 0 var(--purple)', padding: 26, color: 'var(--bone-200)' }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-400)' }}>REQUEST</span>
            <span className="cer-tag" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--bone-200)', borderColor: 'rgba(255,255,255,0.15)', fontSize: 10 }}>sandbox</span>
          </div>
          <pre className="mono" style={{ fontSize: 13, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
{`GET /v1/events/evt_8h2k/rsvps

{
  "data": [{
    "guest":     "Marta Rinaldi",
    "status":    "confirmed",
    "plus_ones": 1,
    "children":  0,
    "diet":      "vegetariana",
    "note":      "bus ore 16:30"
  }],
  "confirmed": 87,
  "pending":   46,
  "total":     142
}`}
          </pre>
        </div>
      </div>
      <div style={{ padding: '64px 72px 80px' }}>
        <SiteH2 tag="Endpoints" title="Piccola per scelta" sub="Cinque endpoint coprono il 95% dei casi d'uso. Il resto lo aggiungiamo quando un partner lo chiede davvero." />
        <div className="cer-card" style={{ overflow: 'hidden' }}>
          {endpoints.map(([m, p, d], i) => (
            <div key={p} className="row" style={{ padding: '16px 24px', gap: 18, borderBottom: i < endpoints.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: mColor[m][0], color: mColor[m][1], width: 52, textAlign: 'center', flexShrink: 0 }}>{m}</span>
              <span className="mono" style={{ fontSize: 13, fontWeight: 700, width: 280, flexShrink: 0 }}>{p}</span>
              <span style={{ fontSize: 14, color: 'var(--ink-700)' }}>{d}</span>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 10, marginTop: 16, fontSize: 13, color: 'var(--ink-500)' }}>
          <I.Settings s={15} /> Disponibile sul piano <strong>Atelier</strong> · chiavi generate dal workspace, revocabili in ogni momento.
        </div>
      </div>
      <SiteCTA title={<span>Integriamo <Mark c="var(--orange)">insieme</Mark>?</span>} sub="Raccontaci il tuo caso d'uso: ti apriamo l'accesso sandbox in giornata." primary="Richiedi accesso" secondary="Vedi il piano Atelier" />
    </SitePage>
  );
}

Object.assign(window, { GuidaRSVPPage, CentroAiutoPage, StatoServizioPage, ChangelogPage, APIPartnerPage });
