// Distribution screen — email composer + WhatsApp copy-paste with link grid
function DistributionScreen() {
  const [channel, setChannel] = React.useState('email');

  return (
    <AppShell nav="invio" eventCtx="Matrimonio · Giulia & Tommaso"
      crumbs={['Eventi', 'Matrimonio', 'Distribuzione']}>

      <h1>Distribuisci gli inviti</h1>
      <div className="h-sub">23 ospiti non hanno ancora ricevuto il link · 49 in attesa di risposta</div>

      {/* Channel switch */}
      <div className="row" style={{ gap: 8, marginTop: 22, padding: 4, background: 'var(--bone-100)', borderRadius: 999, alignSelf: 'flex-start', width: 'fit-content' }}>
        <button onClick={() => setChannel('email')}
          className={'cer-btn ' + (channel === 'email' ? '' : 'ghost')}
          style={{ borderRadius: 999, borderColor: 'transparent' }}>
          <I.Mail s={14} /> Email · 98 ospiti
        </button>
        <button onClick={() => setChannel('whatsapp')}
          className={'cer-btn ' + (channel === 'whatsapp' ? '' : 'ghost')}
          style={{ borderRadius: 999, borderColor: 'transparent' }}>
          <I.Whatsapp s={14} /> WhatsApp · 44 ospiti
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20, marginTop: 22 }}>
        {channel === 'email' ? <EmailComposer /> : <WhatsAppCopier />}
        <RecipientSummary channel={channel} />
      </div>
    </AppShell>
  );
}

function EmailComposer() {
  return (
    <div className="cer-card" style={{ padding: 22 }}>
      <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Email d'invito</div>
      <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>Scrivi il messaggio</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginTop: 18 }}>
        <div className="col" style={{ gap: 4 }}>
          <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Mittente</label>
          <input className="cer-input" defaultValue="Giulia & Tommaso <inviti@ceremly.app>" />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Oggetto</label>
          <input className="cer-input" defaultValue="Il 12 settembre ci sposiamo — ci sarai?" />
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label className="mono row" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)', justifyContent: 'space-between' }}>
            <span>Messaggio</span>
            <span>variabili: <span className="cer-tag" style={{ fontSize: 9 }}>{`{nome}`}</span> <span className="cer-tag" style={{ fontSize: 9 }}>{`{link}`}</span></span>
          </label>
          <textarea className="cer-input" rows={8} defaultValue={`Caro/a {nome},\n\ndopo anni a parlarne, ci sposiamo davvero! Vorremmo tantissimo averti con noi il 12 settembre a Cernobbio.\n\nDentro l'invito trovi tutti i dettagli — basta un attimo per confermare la tua presenza.\n\nCi vediamo presto,\nGiulia & Tommaso`} />
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '20px 0' }} />

      {/* Email preview */}
      <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Anteprima inbox</div>
      <div style={{
        marginTop: 12, padding: 18,
        background: 'var(--bone-100)',
        borderRadius: 12,
        border: '1px solid var(--bone-200)',
      }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="av ink">G</div>
          <div className="col" style={{ lineHeight: 1.25, flex: 1 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Giulia & Tommaso</span>
              <span className="small muted">oggi · 10:24</span>
            </div>
            <span style={{ fontSize: 13 }}>Il 12 settembre ci sposiamo — ci sarai?</span>
            <span className="small muted">Caro/a Anna, dopo anni a parlarne…</span>
          </div>
        </div>

        <div style={{
          marginTop: 16,
          padding: 22, background: 'var(--bone-50)',
          borderRadius: 10, border: '1px solid var(--bone-200)',
          textAlign: 'center', fontFamily: 'var(--font-display)',
        }}>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--wine)' }}>
            S A V E   T H E   D A T E
          </div>
          <div style={{ fontSize: 32, marginTop: 8, color: 'var(--wine-deep)' }}>
            <em>Giulia</em> & <em>Tommaso</em>
          </div>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-500)', marginTop: 6 }}>
            12.09.2026 · Villa Erba, Cernobbio
          </div>
          <button style={{
            marginTop: 16, padding: '10px 22px',
            background: 'var(--wine)', color: 'var(--ink)',
            border: 'none', borderRadius: 999,
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
          }}>Apri l'invito di Anna</button>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <button className="cer-btn ghost"><I.Eye s={14} /> Invia un test a me</button>
        <button className="cer-btn wine"><I.Send s={14} /> Invia a 98 ospiti</button>
      </div>
    </div>
  );
}

function WhatsAppCopier() {
  const lines = [
    { n: 'Marco Bianchi', s: 'Ciao Marco! Il 12 settembre Giulia e Tommaso si sposano…', link: 'ceremly.app/e/giulia-tommaso/r7k2x9p4nt' },
    { n: 'Paolo Ferri',   s: 'Ciao Paolo! Il 12 settembre Giulia e Tommaso si sposano…', link: 'ceremly.app/e/giulia-tommaso/m3b8j1v6qz' },
    { n: 'Sofia Greco',   s: 'Ciao Sofia! Il 12 settembre Giulia e Tommaso si sposano…', link: 'ceremly.app/e/giulia-tommaso/p9w4d2c7tb' },
    { n: 'Luca Rossi',    s: 'Ciao Luca! Il 12 settembre Giulia e Tommaso si sposano…',  link: 'ceremly.app/e/giulia-tommaso/h2k5n8x1ja' },
  ];

  return (
    <div className="cer-card" style={{ padding: 22 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>WhatsApp</div>
          <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>Copia &amp; incolla per 44 ospiti</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            Generiamo un messaggio personalizzato per ogni ospite — basta cliccare "Copia" e incollarlo nella chat.
          </div>
        </div>
        <button className="cer-btn small ghost"><I.Copy s={12} /> Copia tutti i 44</button>
      </div>

      {/* Editable template */}
      <div className="col" style={{ gap: 4, marginTop: 18 }}>
        <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Modello messaggio</label>
        <textarea className="cer-input" rows={3}
          defaultValue={`Ciao {nome}! Il 12 settembre Giulia e Tommaso si sposano e ci tengono a esserci con te. Trovi tutti i dettagli e le info per confermare qui: {link}`}
        />
      </div>

      <div className="col" style={{ gap: 10, marginTop: 18 }}>
        {lines.map((l) => (
          <div key={l.n} className="row" style={{
            padding: 14, gap: 14,
            background: 'var(--bone)', border: '1px solid var(--bone-200)',
            borderRadius: 10, alignItems: 'flex-start',
          }}>
            <div className="av sage">{l.n.split(' ').map((x) => x[0]).join('')}</div>
            <div className="col" style={{ flex: 1, gap: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{l.n}</span>
              <span className="small muted" style={{ lineHeight: 1.4 }}>{l.s}</span>
              <span className="mono small" style={{ color: 'var(--wine-deep)' }}>{l.link}</span>
            </div>
            <div className="col" style={{ gap: 6 }}>
              <button className="cer-btn small"><I.Copy s={12} /> Copia</button>
              <button className="cer-btn small ghost"><I.QR s={12} /> QR</button>
            </div>
          </div>
        ))}
        <button className="cer-btn ghost small" style={{ alignSelf: 'center' }}>
          Mostra tutti gli altri 40 <I.ChevD s={12} />
        </button>
      </div>
    </div>
  );
}

function RecipientSummary({ channel }) {
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="cer-card" style={{ padding: 20 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Destinatari · questo invio</div>
        <div className="serif" style={{ fontSize: 36, marginTop: 6 }}>{channel === 'email' ? '98' : '44'}</div>
        <div className="small muted">ospiti riceveranno l'invito {channel === 'email' ? 'via email' : 'via WhatsApp'}</div>

        <div className="col" style={{ gap: 10, marginTop: 16 }}>
          {[
            { l: 'Famiglia',  n: channel === 'email' ? 36 : 12, c: 'var(--wine)' },
            { l: 'Amici',     n: channel === 'email' ? 38 : 18, c: 'var(--sage)' },
            { l: 'Colleghi',  n: channel === 'email' ? 24 : 14, c: 'var(--ink-500)' },
          ].map((g) => (
            <div key={g.l} className="row" style={{ gap: 12, fontSize: 13 }}>
              <span className="cer-dot" style={{ background: g.c }} />
              <span style={{ flex: 1 }}>{g.l}</span>
              <span className="mono small muted">{g.n} ospiti</span>
            </div>
          ))}
        </div>
      </div>

      <div className="cer-card" style={{ padding: 20, background: 'var(--ink)', color: 'var(--bone-50)' }}>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div style={{ paddingTop: 2 }}><I.Sparkle s={16} /></div>
          <div className="col" style={{ gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Pronto/a per il primo invio?</div>
            <div className="small" style={{ color: 'var(--bone-200)', lineHeight: 1.5 }}>
              Quando un ospite apre il link, lo vedrai aggiornarsi in tempo reale nella tua dashboard. Possiamo configurare anche reminder automatici.
            </div>
          </div>
        </div>
      </div>

      <div className="cer-card" style={{ padding: 20 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Cronologia invii</div>
        <div className="col" style={{ gap: 8, marginTop: 12 }}>
          {[
            { d: '28 apr',  t: '94 inviti via email',  s: 'consegnati 92 · aperti 78' },
            { d: '24 apr',  t: '12 link via WhatsApp', s: '12 link copiati' },
            { d: '18 apr',  t: 'Save the date',         s: '140 destinatari' },
          ].map((e) => (
            <div key={e.d} className="row" style={{ gap: 10, fontSize: 13, alignItems: 'flex-start' }}>
              <span className="mono small muted" style={{ width: 50, paddingTop: 2 }}>{e.d}</span>
              <div className="col" style={{ lineHeight: 1.3 }}>
                <span>{e.t}</span>
                <span className="small muted">{e.s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DistributionScreen });
