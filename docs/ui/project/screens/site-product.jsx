// Sito pubblico — colonna "Prodotto" del footer
// Come funziona · Funzionalità · Modelli di invito · Prezzi · Esempi reali

/* ───────────────────────────── COME FUNZIONA */
function CFStep({ k, t, d, bullets, visual, flip }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', padding: '52px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ order: flip ? 2 : 1 }}>
        <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--orange)' }}>{k}</div>
        <h3 className="serif" style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '12px 0 0' }}>{t}</h3>
        <p style={{ fontSize: 15, color: 'var(--ink-700)', lineHeight: 1.6, margin: '14px 0 0', maxWidth: 480 }}>{d}</p>
        <div className="col" style={{ gap: 9, marginTop: 18 }}>
          {bullets.map((b) => (
            <span key={b} className="row" style={{ gap: 9, fontSize: 14, color: 'var(--ink-700)' }}>
              <span style={{ color: 'var(--purple)' }}><I.Check s={15} /></span> {b}
            </span>
          ))}
        </div>
      </div>
      <div style={{ order: flip ? 1 : 2, background: 'var(--bone-100)', border: '1px solid var(--line)', borderRadius: 18, padding: 32, minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {visual}
      </div>
    </div>
  );
}

function CFGuestRows() {
  const rows = [
    { ini: 'MR', n: 'Marta Rinaldi', g: 'Famiglia Rinaldi', cls: '' },
    { ini: 'LB', n: 'Luca Bianchi', g: 'Lato sposo', cls: 'sage' },
    { ini: 'EP', n: 'Elena Paoli', g: 'Amici università', cls: '' },
    { ini: 'GV', n: 'Giorgio Valli', g: 'Famiglia Valli', cls: 'sage' },
  ];
  return (
    <div className="cer-card" style={{ width: 380, padding: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Lista ospiti</span>
        <span className="pill neutral">142 importati</span>
      </div>
      <div className="col" style={{ gap: 10 }}>
        {rows.map((r) => (
          <div key={r.n} className="row" style={{ gap: 10, justifyContent: 'space-between' }}>
            <div className="row" style={{ gap: 10 }}>
              <span className={'av ' + r.cls}>{r.ini}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{r.n}</span>
            </div>
            <span className="cer-tag" style={{ fontSize: 10, padding: '2px 7px' }}>{r.g}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CFDistribute() {
  return (
    <div className="col" style={{ gap: 14, width: 380 }}>
      <div className="cer-card" style={{ padding: 16 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-500)', marginBottom: 10 }}>Link unico</div>
        <div className="row" style={{ gap: 8 }}>
          <div className="mono" style={{ flex: 1, fontSize: 12, padding: '10px 12px', background: 'var(--bone-100)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink-700)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            ceremly.it/giulia-tommaso
          </div>
          <button className="cer-btn small ghost"><I.Copy s={13} /> Copia</button>
        </div>
      </div>
      <div className="row" style={{ gap: 10 }}>
        {[{ i: I.Whatsapp, t: 'WhatsApp' }, { i: I.Mail, t: 'Email' }, { i: I.QR, t: 'QR' }].map((c) => (
          <div key={c.t} className="cer-card row" style={{ flex: 1, gap: 8, padding: '12px 14px', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>
            <c.i s={16} /> {c.t}
          </div>
        ))}
      </div>
    </div>
  );
}

function CFDashboard() {
  return (
    <div className="cer-card" style={{ width: 380, padding: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Andamento RSVP</span>
        <span className="pill confirm"><span className="cer-dot" />+12 oggi</span>
      </div>
      <div className="serif" style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, marginTop: 12, letterSpacing: '-0.03em' }}>
        87<span style={{ color: 'var(--ink-300)', fontSize: 26 }}>/142</span>
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>conferme · 89% inviti aperti</div>
      <div style={{ marginTop: 14, height: 8, background: 'var(--bone-100)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--line)' }}>
        <div style={{ height: '100%', width: '61%', background: 'var(--purple)' }} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <span className="pill confirm">87 sì</span>
        <span className="pill decline">9 no</span>
        <span className="pill pending">46 in attesa</span>
      </div>
    </div>
  );
}

function ComeFunzionaPage() {
  return (
    <SitePage label="Come funziona">
      <SiteHero
        tag="Come funziona"
        title={<span>Dalla bozza alla lista finale,<br />senza rincorrere <Mark>nessuno</Mark>.</span>}
        sub="Quattro passaggi. Il primo richiede cinque minuti, gli altri tre lavorano da soli mentre tu pensi all'evento."
      />
      <div style={{ padding: '8px 72px 72px' }}>
        <CFStep k="01 · Crea" t="Scegli un modello, rendilo tuo."
          d="Matrimonio, laurea, battesimo o compleanno: parti da un modello curato e cambia colori, foto e testi. Nessuna competenza grafica richiesta."
          bullets={['Anteprima mobile in tempo reale', 'Foto e palette personali', 'Data, luogo e dress code inclusi']}
          visual={<MiniInvite w={280} h={320} rotate={-2} date="12 · settembre · 2026" names={<span>Giulia &amp;<br />Tommaso</span>} italic="si sposano" sub="Villa Erba, Cernobbio" />}
        />
        <CFStep flip k="02 · Importa" t="La lista, una volta sola."
          d="Incolla da Excel o dalla rubrica. Ceremly riconosce i duplicati e ti lascia raggruppare per famiglia, lato o tavolo."
          bullets={['Import da Excel e CSV', 'Gruppi famiglia e plus-one', 'Duplicati segnalati subito']}
          visual={<CFGuestRows />}
        />
        <CFStep k="03 · Distribuisci" t="Un link. O cento inviti personali."
          d="Condividi un link unico nel gruppo, oppure invia a ogni ospite il suo invito con nome via WhatsApp ed email. QR per chi resta alla carta."
          bullets={['Link unico o inviti nominali', 'WhatsApp, email e QR', 'Gli ospiti non creano account']}
          visual={<CFDistribute />}
        />
        <CFStep flip k="04 · Raccogli" t="Le risposte arrivano da sole."
          d="Conferme, menu, allergie e accompagnatori entrano in dashboard man mano. I ritardatari ricevono promemoria gentili, automatici."
          bullets={['Promemoria automatici', 'Menu e intolleranze nel form', 'Esporta tutto per il catering']}
          visual={<CFDashboard />}
        />
      </div>
      <SiteCTA sub="Crea il tuo primo invito in cinque minuti. Trenta ospiti gratis, per sempre." secondary="Guarda un esempio" />
    </SitePage>
  );
}

/* ───────────────────────────── FUNZIONALITÀ */
function FunzionalitaPage() {
  const groups = [
    {
      tag: "L'invito", title: 'Bello da aprire', desc: 'La prima impressione conta: l\'invito è la copertina del tuo evento.',
      feats: [
        { i: I.Sparkle, t: 'Modelli per ogni occasione', d: 'Matrimoni, lauree, battesimi e compleanni — curati, pronti in cinque minuti.' },
        { i: I.Edit, t: 'Colori, foto e testi tuoi', d: 'Personalizza palette e immagini. Con Celebrazione, anche i colori del tuo evento.' },
        { i: I.QR, t: 'QR per la carta', d: 'Ami l\'invito stampato? Il QR porta lo stesso al form di conferma digitale.' },
      ],
    },
    {
      tag: 'Le risposte', title: 'RSVP senza attrito', desc: 'Più è facile rispondere, prima si chiude la lista.',
      feats: [
        { i: I.Guests, t: 'Zero account per gli ospiti', d: 'Si apre il link, si risponde. Nessuna registrazione, nessuna app da scaricare.' },
        { i: I.Heart, t: 'Menu, allergie, plus-one', d: 'Il form raccoglie tutto quello che serve a te e al catering, in un passaggio.' },
        { i: I.Bell, t: 'Promemoria automatici', d: 'Solleciti gentili a chi non ha risposto, con la cadenza che decidi tu.' },
      ],
    },
    {
      tag: 'La regia', title: 'Tutto sotto controllo', desc: 'La dashboard risponde all\'unica domanda che conta: chi viene?',
      feats: [
        { i: I.Home, t: 'Famiglie e gruppi', d: 'Un invito per nucleo, risposte individuali. Adulti e bambini contati a parte.' },
        { i: I.Chart, t: 'Andamento in tempo reale', d: 'Aperture, conferme, tendenze. Sai sempre a che punto sei.' },
        { i: I.Upload, t: 'Esporta per il catering', d: 'Lista finale con menu e intolleranze, in CSV o PDF, pronta da inoltrare.' },
      ],
    },
  ];
  return (
    <SitePage label="Funzionalità">
      <SiteHero
        tag="Funzionalità"
        title={<span>Un solo problema.<br /><Mark c="var(--purple)">Risolto bene</Mark>.</span>}
        sub="Ceremly non fa siti di matrimonio, liste nozze o album. Fa una cosa: ti dice chi viene davvero al tuo evento."
      />
      <div style={{ padding: '64px 72px 24px' }}>
        {groups.map((g, gi) => (
          <div key={g.tag} style={{ display: 'grid', gridTemplateColumns: '0.62fr 1.38fr', gap: 56, padding: '44px 0', borderBottom: gi < groups.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'start' }}>
            <div>
              <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent' }}>{g.tag}</span>
              <h2 className="serif" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '14px 0 0' }}>{g.title}</h2>
              <p style={{ fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6, margin: '12px 0 0', maxWidth: 300 }}>{g.desc}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {g.feats.map((f) => (
                <div key={f.t} className="cer-card" style={{ padding: 22 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bone-200)', border: '1.5px solid var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <f.i s={19} />
                  </div>
                  <div className="serif" style={{ fontSize: 19, fontWeight: 700, marginTop: 16, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{f.t}</div>
                  <div style={{ fontSize: 13, marginTop: 8, color: 'var(--ink-700)', lineHeight: 1.55 }}>{f.d}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <SiteCTA title={<span>Provale tutte, <Mark c="var(--orange)">gratis</Mark>.</span>} sub="Trenta ospiti e un evento attivo nel piano Free. Per sempre." secondary="Vedi i prezzi" />
    </SitePage>
  );
}

/* ───────────────────────────── MODELLI DI INVITO */
function ModelliPage() {
  const chips = ['Tutti', 'Matrimonio', 'Laurea', 'Battesimo', 'Compleanno'];
  const tpls = [
    { n: 'Botanico', occ: 'Matrimonio', bg: 'var(--bone-300)', color: 'var(--ink)', date: '12 · settembre · 2026', names: <span>Giulia &amp;<br />Tommaso</span>, italic: 'si sposano', sub: 'Villa Erba, Cernobbio' },
    { n: 'Sera d\'estate', occ: 'Matrimonio', bg: 'var(--ink)', color: 'var(--bone-50)', date: '20 · giugno · 2026', names: <span>Anna &amp;<br />Filippo</span>, italic: 'si sposano', sub: 'Masseria Lamacoppa, Ostuni' },
    { n: 'Toga', occ: 'Laurea', bg: 'var(--purple)', color: 'var(--ink)', date: '17 · luglio · 2026', names: <span>Sara<br />si laurea</span>, sub: 'Aula magna + brindisi in cortile' },
    { n: 'Acquerello', occ: 'Battesimo', bg: 'var(--bone-200)', color: 'var(--ink)', date: '8 · marzo · 2026', names: <span>Il battesimo<br />di Leo</span>, sub: 'San Martino + pranzo in famiglia' },
    { n: 'Coriandoli', occ: 'Compleanno', bg: 'var(--orange-soft)', color: 'var(--ink)', date: '21 · novembre · 2026', names: <span>I 40<br />di Marco</span>, sub: 'Cascina Boscaccio, ore 20' },
    { n: 'Classico', occ: 'Matrimonio', bg: 'var(--bone-50)', color: 'var(--ink)', date: '3 · ottobre · 2026', names: <span>Chiara &amp;<br />Matteo</span>, italic: 'si sposano', sub: 'Abbazia di San Galgano' },
  ];
  return (
    <SitePage label="Modelli di invito">
      <SiteHero
        tag="Modelli di invito"
        title={<span>Parti già <Mark>bello</Mark>.</span>}
        sub="Sei famiglie di modelli, ognuna pensata per un'occasione. Tutto è personalizzabile: colori, foto, testi e form di risposta."
      >
        <div className="row" style={{ gap: 8, marginTop: 28 }}>
          {chips.map((c, i) => (
            <span key={c} className="cer-tag" style={i === 0 ? { background: 'var(--ink)', color: 'var(--bone-50)', borderColor: 'var(--ink)' } : { cursor: 'pointer' }}>{c}</span>
          ))}
        </div>
      </SiteHero>
      <div style={{ padding: '56px 72px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28 }}>
        {tpls.map((t) => (
          <div key={t.n} className="col" style={{ gap: 0 }}>
            <div style={{ background: 'var(--bone-100)', border: '1px solid var(--line)', borderRadius: 18, padding: '30px 30px 34px', display: 'flex', justifyContent: 'center' }}>
              <MiniInvite w={250} h={330} bg={t.bg} color={t.color} date={t.date} names={t.names} italic={t.italic} sub={t.sub} shadow="var(--ink)" />
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, padding: '0 4px' }}>
              <span className="serif" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.n}</span>
              <span className="cer-tag" style={{ fontSize: 10, padding: '3px 8px' }}>{t.occ}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ margin: '8px 72px 72px', padding: '22px 28px', background: 'var(--bone-100)', border: '1px solid var(--line)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <div className="row" style={{ gap: 12 }}>
          <span style={{ color: 'var(--purple-bright)' }}><I.Sparkle s={20} /></span>
          <span style={{ fontSize: 14, color: 'var(--ink-700)' }}>Tre modelli inclusi nel piano Free. Tutti i modelli e i colori su misura dal piano <strong>Celebrazione</strong>.</span>
        </div>
        <button className="cer-btn small ghost">Vedi i prezzi <I.ChevR s={12} /></button>
      </div>
      <SiteCTA title={<span>Il tuo evento merita la sua <Mark c="var(--orange)">copertina</Mark>.</span>} secondary="Guarda un esempio" />
    </SitePage>
  );
}

/* ───────────────────────────── PREZZI */
function PrezziPage() {
  const rows = [
    ['Ospiti per evento', '30', '250', 'Illimitati'],
    ['Eventi attivi', '1', '1 per acquisto', 'Illimitati'],
    ['Modelli di invito', '3', 'Tutti + colori su misura', 'Tutti + brand workspace'],
    ['WhatsApp & email personalizzati', false, true, true],
    ['Promemoria automatici', false, true, true],
    ['Menu, allergie, plus-one', true, true, true],
    ['Esporta per il catering', false, true, true],
    ['Domini personalizzati & API', false, false, true],
    ['Account team', false, false, true],
  ];
  const cell = (v) => v === true
    ? <span style={{ color: 'var(--confirm)' }}><I.Check s={16} /></span>
    : v === false
      ? <span style={{ color: 'var(--ink-300)' }}>—</span>
      : <span style={{ fontWeight: 600 }}>{v}</span>;
  const faq = [
    { q: 'Posso iniziare gratis e passare a Celebrazione dopo?', a: 'Sì. Tutto quello che hai creato — invito, lista, risposte — resta. Sblocchi semplicemente i limiti quando ti serve.' },
    { q: 'Cosa succede dopo l\'evento?', a: 'L\'evento resta consultabile per 12 mesi: lista, risposte ed export inclusi. Poi puoi archiviarlo o scaricare tutto.' },
    { q: 'Celebrazione è un abbonamento?', a: 'No: è un pagamento unico per evento. Niente rinnovi, niente sorprese. Solo Atelier, pensato per chi organizza di mestiere, è mensile.' },
    { q: 'Emettete fattura?', a: 'Sì, fattura elettronica per ogni acquisto. Per Atelier supportiamo anche l\'addebito SDI ricorrente.' },
    { q: 'E se l\'evento viene annullato?', a: 'Rimborso completo entro 30 giorni dall\'acquisto se non hai ancora inviato gli inviti. Scrivici e basta.' },
    { q: 'Serve la carta per il piano Free?', a: 'No. Registrazione con email, nessun dato di pagamento richiesto finché non scegli un piano a pagamento.' },
  ];
  return (
    <SitePage label="Prezzi">
      <LandingPricing />
      <div style={{ padding: '24px 72px 72px' }}>
        <SiteH2 tag="Nel dettaglio" title="Confronta i piani" />
        <div className="cer-card" style={{ overflow: 'hidden' }}>
          <table className="cer-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Funzionalità</th>
                <th>Free · €0</th>
                <th>Celebrazione · €39</th>
                <th>Atelier · €24/mese</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  <td style={{ fontWeight: 500 }}>{r[0]}</td>
                  <td>{cell(r[1])}</td><td>{cell(r[2])}</td><td>{cell(r[3])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ padding: '0 72px 80px' }}>
        <SiteH2 tag="FAQ" title="Domande frequenti" />
        <FaqGrid items={faq} />
      </div>
      <SiteCTA title={<span>Trenta ospiti gratis.<br /><Mark c="var(--orange)">Per sempre</Mark>.</span>} secondary="Parla con noi" />
    </SitePage>
  );
}

/* ───────────────────────────── ESEMPI REALI */
function EsempiPage() {
  const cases = [
    {
      occ: 'Matrimonio', t: 'Giulia & Tommaso', meta: 'Verona · settembre 2026',
      bg: 'var(--bone-300)',
      stats: [['168', 'invitati'], ['91%', 'risposte in 14 giorni'], ['0', 'gruppi WhatsApp']],
      quote: '“La lista è arrivata al catering tre giorni prima — completa, con le allergie.”', who: 'Francesca, sorella della sposa',
    },
    {
      occ: 'Laurea', t: 'La laurea di Sara', meta: 'Bologna · luglio 2026',
      bg: 'var(--purple)',
      stats: [['52', 'invitati'], ['47', 'conferme in 48 ore'], ['1', 'link su WhatsApp']],
      quote: '“Ho mandato il link alle 9 di mattina. A pranzo sapevo già in quanti eravamo.”', who: 'Sara, laureanda',
    },
    {
      occ: 'Battesimo', t: 'Il battesimo di Leo', meta: 'Lecce · marzo 2026',
      bg: 'var(--bone-200)',
      stats: [['84', 'ospiti'], ['12', 'bambini contati a parte'], ['5gg', 'd\'anticipo al ristorante']],
      quote: '“Il ristorante voleva i numeri esatti. Li ho esportati in un click.”', who: 'Davide, papà di Leo',
    },
  ];
  return (
    <SitePage label="Esempi reali">
      <SiteHero
        tag="Esempi reali"
        title={<span>142 eventi nella beta.<br />Tre <Mark>storie vere</Mark>.</span>}
        sub="Nomi e dettagli condivisi con il permesso degli organizzatori. I numeri sono quelli delle loro dashboard."
      />
      <div style={{ padding: '56px 72px 72px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
        {cases.map((c) => (
          <div key={c.t} className="cer-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: c.bg, borderBottom: '2px solid var(--ink)', padding: '26px 24px' }}>
              <span className="cer-tag" style={{ background: 'rgba(255,255,255,0.55)', borderColor: 'var(--line-strong)' }}>{c.occ}</span>
              <div className="serif" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 14 }}>{c.t}</div>
              <div className="mono" style={{ fontSize: 11, marginTop: 8, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-700)' }}>{c.meta}</div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
              <div className="row" style={{ gap: 0, justifyContent: 'space-between' }}>
                {c.stats.map(([n, l]) => (
                  <div key={l} className="col" style={{ gap: 2, maxWidth: 110 }}>
                    <span className="serif" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{n}</span>
                    <span className="small muted" style={{ lineHeight: 1.3 }}>{l}</span>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: 'var(--line)' }} />
              <div style={{ flex: 1 }}>
                <p className="serif" style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em', margin: 0 }}>{c.quote}</p>
                <div className="small muted" style={{ marginTop: 10 }}>{c.who}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <SiteCTA title={<span>La prossima storia può essere <Mark c="var(--orange)">la tua</Mark>.</span>} secondary="Guarda un invito d'esempio" />
    </SitePage>
  );
}

Object.assign(window, { ComeFunzionaPage, FunzionalitaPage, ModelliPage, PrezziPage, EsempiPage });
