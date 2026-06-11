// Stati di caricamento — opzioni a confronto, ognuna con replay
// Tutte le demo usano i token "Soft Meadow" già in styles.css

const Spin = ({ s = 16 }) => (
  <span className="cer-spinner" style={{ width: s, height: s }}></span>
);

function LoadHeader({ tag, title, desc, when }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <span className="cer-tag" style={{ background: 'var(--purple)', color: 'var(--ink)', borderColor: 'var(--ink)' }}>{tag}</span>
        {when.map((w) => <span key={w} className="cer-tag">{w}</span>)}
      </div>
      <div className="serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{title}</div>
      <p className="muted" style={{ fontSize: 14, margin: '8px 0 0', maxWidth: 640, lineHeight: 1.5 }}>{desc}</p>
    </div>
  );
}

function ReplayBtn({ onClick, disabled, label = 'Riproduci demo' }) {
  return (
    <button className="cer-btn ghost small" onClick={onClick} disabled={disabled}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}>
      ▶ {label}
    </button>
  );
}

/* ── Opzione A · Bottoni con stato ─────────────────────────── */
function LoadingButtonsDemo() {
  const [st, setSt] = React.useState('idle'); // idle | loading | success
  const timers = React.useRef([]);
  const run = () => {
    timers.current.forEach(clearTimeout);
    setSt('loading');
    timers.current = [
      setTimeout(() => setSt('success'), 1800),
      setTimeout(() => setSt('idle'), 3600),
    ];
  };
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <div className="cer" style={{ boxSizing: 'border-box', height: '100%', padding: 36, display: 'flex', flexDirection: 'column' }}>
      <LoadHeader tag="Opzione A" title="Bottone con stato"
        desc="L'azione vive dentro il bottone: al click si disabilita, mostra spinner e cambia etichetta, poi conferma con un check prima di tornare a riposo. L'utente sa esattamente cosa sta succedendo e cosa non può ri-cliccare."
        when={['azioni 0,3–2s', 'submit form', 'salvataggi']} />

      <div className="cer-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <button className="cer-btn" onClick={run} disabled={st !== 'idle'}
            style={{
              minWidth: 190, justifyContent: 'center',
              background: st === 'success' ? 'var(--confirm)' : 'var(--purple)',
              color: st === 'success' ? '#fff' : 'var(--ink)',
              cursor: st === 'idle' ? 'pointer' : 'default',
              transform: st !== 'idle' ? 'none' : undefined,
              boxShadow: st !== 'idle' ? '0 0 0 var(--ink)' : undefined,
            }}>
            {st === 'idle' && <React.Fragment><I.Send s={14} /> Invia 23 inviti</React.Fragment>}
            {st === 'loading' && <React.Fragment><Spin s={14} /> Invio in corso…</React.Fragment>}
            {st === 'success' && <React.Fragment><I.Check s={14} /> Inviati</React.Fragment>}
          </button>
          <span className="mono muted small">← clicca per provare</span>
        </div>

        <div className="divider" style={{ margin: 0 }}></div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { l: '1 · Riposo', el: <button className="cer-btn" style={{ pointerEvents: 'none' }}><I.Send s={14} /> Invia 23 inviti</button>, n: 'Etichetta = verbo + oggetto' },
            { l: '2 · In corso', el: <button className="cer-btn" style={{ pointerEvents: 'none', boxShadow: '0 0 0 var(--ink)' }}><Spin s={14} /> Invio in corso…</button>, n: 'Disabilitato, niente hover, larghezza stabile' },
            { l: '3 · Esito', el: <button className="cer-btn" style={{ pointerEvents: 'none', background: 'var(--confirm)', color: '#fff', boxShadow: '0 0 0 var(--ink)' }}><I.Check s={14} /> Inviati</button>, n: 'Check 1,5s, poi torna a riposo' },
          ].map((s) => (
            <div key={s.l} className="col" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span className="mono small muted" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.l}</span>
              {s.el}
              <span className="small muted" style={{ lineHeight: 1.4 }}>{s.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="spacer"></div>
      <p className="small muted" style={{ margin: '16px 0 0', lineHeight: 1.5 }}>
        <strong>Regola:</strong> sotto i 300ms non mostrare nulla (flicker). Lo spinner appare solo se la risposta tarda.
      </p>
    </div>
  );
}

/* ── Opzione B · Skeleton screen ─────────────────────────── */
function SkeletonDemo() {
  const [loading, setLoading] = React.useState(false);
  const t = React.useRef(null);
  const run = () => {
    clearTimeout(t.current);
    setLoading(true);
    t.current = setTimeout(() => setLoading(false), 2200);
  };
  React.useEffect(() => () => clearTimeout(t.current), []);

  const rows = [
    { n: 'Anna Conti', e: 'anna.conti@email.it', s: 'confirm', sl: 'Confermato' },
    { n: 'Marco Bianchi', e: 'm.bianchi@studio.it', s: 'pending', sl: 'In attesa' },
    { n: 'Sara De Luca', e: 'sara.deluca@mail.com', s: 'confirm', sl: 'Confermato' },
    { n: 'Elena Marchetti', e: 'elena.m@gmail.com', s: 'decline', sl: 'Declinato' },
  ];

  return (
    <div className="cer" style={{ boxSizing: 'border-box', height: '100%', padding: 36, display: 'flex', flexDirection: 'column' }}>
      <LoadHeader tag="Opzione B" title="Skeleton screen"
        desc="Al posto di uno spinner centrale, la pagina mostra subito la propria struttura con segnaposto a righe tratteggiate. Comunica «sta arrivando» e dove arriverà, e azzera il layout shift quando i dati compaiono."
        when={['caricamento pagine', 'liste e tabelle', '1–3s']} />

      <div className="row" style={{ marginBottom: 14 }}>
        <ReplayBtn onClick={run} disabled={loading} label="Ricarica dati" />
        {loading && <span className="mono small muted" style={{ marginLeft: 10 }}>caricamento…</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
        {[{ l: 'Confermati', v: 87 }, { l: 'In attesa', v: 49 }, { l: 'Declinati', v: 6 }].map((k) => (
          <div key={k.l} className="kpi" style={{ cursor: 'default' }}>
            <div className="k-label">{k.l}</div>
            {loading
              ? <div className="skel" style={{ width: 64, height: 38, margin: '8px 0 4px' }}></div>
              : <div className="k-num">{k.v}</div>}
          </div>
        ))}
      </div>

      <div className="cer-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="cer-table">
          <thead>
            <tr><th style={{ paddingLeft: 18 }}>Ospite</th><th>Stato RSVP</th><th>Risposta</th></tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i}>
                <td style={{ paddingLeft: 18 }}>
                  {loading ? (
                    <div className="row" style={{ gap: 10 }}>
                      <div className="skel" style={{ width: 30, height: 30, borderRadius: '50%' }}></div>
                      <div className="col" style={{ gap: 6 }}>
                        <div className="skel" style={{ width: 120, height: 12 }}></div>
                        <div className="skel" style={{ width: 160, height: 10 }}></div>
                      </div>
                    </div>
                  ) : (
                    <div className="row" style={{ gap: 10 }}>
                      <div className="av">{g.n.split(' ').map((x) => x[0]).join('')}</div>
                      <div className="col" style={{ lineHeight: 1.25 }}>
                        <span style={{ fontWeight: 500 }}>{g.n}</span>
                        <span className="small muted">{g.e}</span>
                      </div>
                    </div>
                  )}
                </td>
                <td>{loading
                  ? <div className="skel" style={{ width: 88, height: 20, borderRadius: 999 }}></div>
                  : <span className={'pill ' + g.s}><span className="cer-dot"></span>{g.sl}</span>}
                </td>
                <td>{loading
                  ? <div className="skel" style={{ width: 48, height: 12 }}></div>
                  : <span className="small muted">2 mag</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="spacer"></div>
      <p className="small muted" style={{ margin: '16px 0 0', lineHeight: 1.5 }}>
        <strong>Regola:</strong> lo skeleton replica la geometria reale (avatar, due righe, pill) — mai blocchi generici. Le interazioni di pagina restano attive.
      </p>
    </div>
  );
}

/* ── Opzione C · Overlay con avanzamento ─────────────────────────── */
function OverlayProgressDemo() {
  const [phase, setPhase] = React.useState('idle'); // idle | sending | done
  const [n, setN] = React.useState(0);
  const total = 120;
  const iv = React.useRef(null);
  const td = React.useRef([]);

  const run = () => {
    clearInterval(iv.current); td.current.forEach(clearTimeout);
    setPhase('sending'); setN(0);
    iv.current = setInterval(() => {
      setN((x) => {
        if (x >= total) { clearInterval(iv.current); return total; }
        return Math.min(total, x + 4);
      });
    }, 90);
    td.current = [
      setTimeout(() => setPhase('done'), 90 * (total / 4) + 350),
      setTimeout(() => setPhase('idle'), 90 * (total / 4) + 2800),
    ];
  };
  React.useEffect(() => () => { clearInterval(iv.current); td.current.forEach(clearTimeout); }, []);

  return (
    <div className="cer" style={{ boxSizing: 'border-box', height: '100%', padding: 36, display: 'flex', flexDirection: 'column' }}>
      <LoadHeader tag="Opzione C" title="Overlay con avanzamento"
        desc="Per operazioni lunghe e non interrompibili (invio massivo, import CSV) la pagina si oscura e una scheda mostra avanzamento numerico reale. Blocca esplicitamente l'interazione: niente dubbi su «posso cliccare?»."
        when={['operazioni > 3s', 'invii massivi', 'import']} />

      <div className="row" style={{ marginBottom: 14 }}>
        <ReplayBtn onClick={run} disabled={phase !== 'idle'} />
      </div>

      <div className="cer-card" style={{ position: 'relative', flex: 1, overflow: 'hidden', background: 'var(--bone)' }}>
        {/* Sfondo: mini distribuzione */}
        <div style={{ padding: 24, filter: phase !== 'idle' ? 'blur(1px)' : 'none', transition: 'filter 200ms' }}>
          <div className="serif" style={{ fontSize: 22 }}>Distribuzione inviti</div>
          <div className="h-sub" style={{ marginBottom: 16 }}>120 ospiti selezionati · canale email + WhatsApp</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="cer-btn small" style={{ pointerEvents: 'none' }}><I.Send s={13} /> Invia a 120 ospiti</button>
            <button className="cer-btn ghost small" style={{ pointerEvents: 'none' }}>Programma invio</button>
          </div>
          <div className="cer-card" style={{ marginTop: 16, padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="av">AC</div><div className="av sage">MB</div><div className="av">SD</div>
            <span className="small muted">+117 altri destinatari</span>
          </div>
        </div>

        {/* Overlay */}
        {phase !== 'idle' && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(63,54,34,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div className="cer-card" style={{ width: 420, padding: 28, boxShadow: 'var(--hard)', border: '2px solid var(--ink)' }}>
              {phase === 'sending' ? (
                <div className="col" style={{ gap: 14 }}>
                  <div className="row" style={{ gap: 10 }}>
                    <Spin s={18} />
                    <span className="serif" style={{ fontSize: 19 }}>Invio inviti in corso</span>
                  </div>
                  <div className="cer-progress"><i style={{ width: (n / total) * 100 + '%' }}></i></div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="mono small muted">{n} / {total} inviati</span>
                    <span className="mono small muted">~{Math.max(1, Math.ceil((total - n) / 45))}s rimanenti</span>
                  </div>
                  <p className="small muted" style={{ margin: 0, lineHeight: 1.45 }}>Non chiudere la pagina. Potrai vedere il dettaglio per ospite al termine.</p>
                </div>
              ) : (
                <div className="col" style={{ gap: 10, alignItems: 'flex-start' }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', background: 'var(--confirm)', color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}><I.Check s={15} /></span>
                    <span className="serif" style={{ fontSize: 19 }}>120 inviti inviati</span>
                  </div>
                  <p className="small muted" style={{ margin: 0 }}>118 consegnati · 2 in coda WhatsApp</p>
                  <button className="cer-btn small" style={{ pointerEvents: 'none' }}>Vedi dettaglio</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="small muted" style={{ margin: '16px 0 0', lineHeight: 1.5 }}>
        <strong>Regola:</strong> sempre numeri reali (n/totale) e stima del tempo — mai spinner muto su overlay. Esito con riepilogo, non solo «fatto».
      </p>
    </div>
  );
}

/* ── Opzione D · Toast non bloccante ─────────────────────────── */
function ToastDemo() {
  const [phase, setPhase] = React.useState('off'); // off | saving | saved
  const td = React.useRef([]);
  const run = () => {
    td.current.forEach(clearTimeout);
    setPhase('saving');
    td.current = [
      setTimeout(() => setPhase('saved'), 1400),
      setTimeout(() => setPhase('off'), 3400),
    ];
  };
  React.useEffect(() => () => td.current.forEach(clearTimeout), []);

  return (
    <div className="cer" style={{ boxSizing: 'border-box', height: '100%', padding: 36, display: 'flex', flexDirection: 'column' }}>
      <LoadHeader tag="Opzione D" title="Toast ottimistico"
        desc="La UI applica subito la modifica (optimistic update) e un toast in basso conferma lo stato del salvataggio in background. L'utente continua a lavorare senza mai aspettare; solo l'errore richiede attenzione."
        when={['autosave editor', 'modifiche piccole', 'mai bloccante']} />

      <div className="row" style={{ marginBottom: 14 }}>
        <ReplayBtn onClick={run} disabled={phase !== 'off'} label="Simula salvataggio" />
      </div>

      <div className="cer-card" style={{ position: 'relative', flex: 1, padding: 24, overflow: 'hidden' }}>
        <div className="serif" style={{ fontSize: 22 }}>Editor invito</div>
        <div className="h-sub" style={{ marginBottom: 16 }}>Matrimonio · Giulia & Tommaso</div>
        <div className="col" style={{ gap: 10, maxWidth: 380 }}>
          <input className="cer-input" defaultValue="Vi aspettiamo il 14 settembre" readOnly />
          <input className="cer-input" defaultValue="Villa Antinori, Fiesole" readOnly />
        </div>

        {/* Toast live */}
        <div style={{
          position: 'absolute', right: 20, bottom: 20,
          transform: phase === 'off' ? 'translateY(12px)' : 'translateY(0)',
          opacity: phase === 'off' ? 0 : 1,
          transition: 'opacity 220ms ease, transform 220ms ease',
        }}>
          <div className="cer-toast">
            {phase === 'saved'
              ? <span style={{ color: 'var(--bone-200)', display: 'inline-flex' }}><I.Check s={15} /></span>
              : <Spin s={14} />}
            {phase === 'saved' ? 'Modifiche salvate' : 'Salvataggio…'}
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, gap: 14, alignItems: 'flex-start' }}>
        <div className="cer-toast" style={{ background: 'var(--decline)' }}>
          <I.X s={15} />
          Salvataggio non riuscito
          <button className="cer-btn small" style={{
            background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.45)',
            boxShadow: 'none', marginLeft: 4, pointerEvents: 'none',
          }}>Riprova</button>
        </div>
        <span className="small muted" style={{ lineHeight: 1.5, maxWidth: 360 }}>
          Variante errore: persistente (non si auto-chiude), con azione di recupero e rollback della modifica.
        </span>
      </div>
    </div>
  );
}

/* ── Opzione E · Barra di avanzamento globale ─────────────────────────── */
function TopbarProgressDemo() {
  const [running, setRunning] = React.useState(false);
  const t = React.useRef(null);
  const run = () => {
    clearTimeout(t.current);
    setRunning(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setRunning(true)));
    t.current = setTimeout(() => setRunning(false), 2600);
  };
  React.useEffect(() => () => clearTimeout(t.current), []);

  return (
    <div className="cer" style={{ boxSizing: 'border-box', height: '100%', padding: 36, display: 'flex', flexDirection: 'column' }}>
      <LoadHeader tag="Opzione E" title="Barra globale + indicatore contestuale"
        desc="Una barra sottile sotto la topbar segnala ogni richiesta di rete in corso (navigazioni, refetch). Discreta, sempre nello stesso punto: l'utente impara dove guardare. Abbinabile a un tag «aggiornamento» sui dati interessati."
        when={['cambio pagina', 'refetch dati', 'feedback ambientale']} />

      <div className="row" style={{ marginBottom: 14 }}>
        <ReplayBtn onClick={run} disabled={running} label="Simula navigazione" />
      </div>

      <div className="cer-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <div className="cer-topbar" style={{ background: 'var(--bone-50)' }}>
            <div className="crumbs">Eventi <I.ChevR s={13} /> Matrimonio <I.ChevR s={13} /> <strong>Andamento</strong></div>
            <div className="row" style={{ gap: 10 }}>
              {running && (
                <span className="cer-tag" style={{ color: 'var(--purple-ink)', borderColor: 'var(--purple)', background: 'var(--wine-soft)' }}>
                  <span className="cer-dots" style={{ color: 'var(--purple-bright)' }}><span></span><span></span><span></span></span>
                  aggiornamento
                </span>
              )}
              <div className="av">GT</div>
            </div>
          </div>
          <div className={'cer-topload' + (running ? ' running' : '')}></div>
        </div>
        <div style={{ padding: 24, opacity: running ? 0.55 : 1, transition: 'opacity 250ms' }}>
          <div className="serif" style={{ fontSize: 22, marginBottom: 4 }}>Andamento RSVP</div>
          <span className="small muted">87 confermati su 142 · aggiornato {running ? 'ora…' : '2 min fa'}</span>
        </div>
      </div>

      <div className="spacer"></div>
      <p className="small muted" style={{ margin: '16px 0 0', lineHeight: 1.5 }}>
        <strong>Regola:</strong> la barra non blocca nulla; i contenuti già visibili restano interagibili (al massimo attenuati). Mai usarla come unico feedback per un submit.
      </p>
    </div>
  );
}

/* ── Guida · quando usare cosa ─────────────────────────── */
function LoadingGuide() {
  const rows = [
    { d: '< 300 ms', p: 'Nessun indicatore', b: 'No', e: 'Toggle, filtri locali, cambio tab' },
    { d: '0,3 – 2 s', p: 'A · Bottone con stato', b: 'Solo il bottone', e: 'Login, salva RSVP, aggiungi ospite' },
    { d: '1 – 3 s', p: 'B · Skeleton screen', b: 'No', e: 'Apertura lista ospiti, dashboard' },
    { d: '> 3 s, critico', p: 'C · Overlay con avanzamento', b: 'Sì, esplicito', e: 'Invio 120 inviti, import CSV' },
    { d: 'In background', p: 'D · Toast ottimistico', b: 'Mai', e: 'Autosave editor, rinomina, riordino' },
    { d: 'Navigazione', p: 'E · Barra globale', b: 'No', e: 'Cambio pagina, refetch periodico' },
  ];
  return (
    <div className="cer" style={{ boxSizing: 'border-box', height: '100%', padding: 36, display: 'flex', flexDirection: 'column' }}>
      <LoadHeader tag="Guida" title="Quale pattern, quando"
        desc="I pattern non sono alternativi ma complementari: si scelgono in base a durata dell'attesa e a quanto l'operazione deve bloccare. La colonna «blocca?» è la risposta alla domanda dell'utente: posso continuare a interagire?"
        when={['regia complessiva']} />

      <div className="cer-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="cer-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 18 }}>Durata attesa</th>
              <th>Pattern</th>
              <th>Blocca l'interazione?</th>
              <th>Esempi in Ceremly</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p}>
                <td className="mono small" style={{ paddingLeft: 18, whiteSpace: 'nowrap' }}>{r.d}</td>
                <td style={{ fontWeight: 600 }}>{r.p}</td>
                <td>{r.b === 'No' || r.b === 'Mai'
                  ? <span className="pill confirm"><span className="cer-dot"></span>{r.b}</span>
                  : r.b === 'Sì, esplicito'
                    ? <span className="pill decline"><span className="cer-dot"></span>{r.b}</span>
                    : <span className="pill pending"><span className="cer-dot"></span>{r.b}</span>}
                </td>
                <td className="small muted">{r.e}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="spacer"></div>
      <p className="small muted" style={{ margin: '16px 0 0', lineHeight: 1.5 }}>
        <strong>Principio unico:</strong> ogni richiesta al backend deve rispondere a due domande in &lt;300ms — «ho ricevuto il tuo click?» e «puoi continuare a usare il resto?».
      </p>
    </div>
  );
}

Object.assign(window, {
  LoadingButtonsDemo, SkeletonDemo, OverlayProgressDemo, ToastDemo, TopbarProgressDemo, LoadingGuide,
});
