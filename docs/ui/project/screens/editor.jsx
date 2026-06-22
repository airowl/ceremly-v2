// Invitation editor — left blocks library, center live preview, right inspector.
// Curated invitation color palettes — light papers, harmonious warm/cool accents.
const INV_PALETTES = [
  { k: 'toscana',    label: 'Toscana',     paper: '#FFFDF6', accent: '#d4a373', deep: '#5E4426', soft: '#faedcd', onAccent: '#3F3622' },
  { k: 'bordeaux',   label: 'Bordeaux',    paper: '#FBF6F4', accent: '#8C3B4A', deep: '#4A2230', soft: '#F0DDDD', onAccent: '#FBF6F4' },
  { k: 'salvia',     label: 'Salvia',      paper: '#F7F8F1', accent: '#7E8C5A', deep: '#3F4A2C', soft: '#E3E8D2', onAccent: '#F7F8F1' },
  { k: 'polvere',    label: 'Blu polvere', paper: '#F5F7F9', accent: '#6E8AA6', deep: '#324558', soft: '#DCE5ED', onAccent: '#F5F7F9' },
  { k: 'terracotta', label: 'Terracotta',  paper: '#FBF4F0', accent: '#C2683F', deep: '#6E3318', soft: '#F2DDD0', onAccent: '#FBF4F0' },
  { k: 'notte',      label: 'Notte',       paper: '#F3F2F0', accent: '#3F3622', deep: '#1E1A12', soft: '#E5E1D8', onAccent: '#F3F2F0' },
];

// Curated invitation font choices — the display face used across the invite paper.
const INV_FONTS = [
  { k: 'bricolage', label: 'Bricolage',  family: "'Bricolage Grotesque', system-ui, sans-serif", note: 'Grottesco moderno' },
  { k: 'playfair',  label: 'Playfair',   family: "'Playfair Display', Georgia, serif",          note: 'Serif elegante' },
  { k: 'cormorant', label: 'Cormorant',  family: "'Cormorant Garamond', Georgia, serif",        note: 'Serif raffinato' },
  { k: 'garamond',  label: 'EB Garamond', family: "'EB Garamond', Georgia, serif",              note: 'Serif classico' },
  { k: 'baskerville', label: 'Baskerville', family: "'Libre Baskerville', Georgia, serif",       note: 'Serif tradizionale' },
];

function EditorScreen() {
  const [activeBlock, setActiveBlock] = React.useState('header');
  const [device, setDevice] = React.useState('desktop'); // desktop | mobile
  const [theme, setTheme] = React.useState(INV_PALETTES[0]);
  const [font, setFont] = React.useState(INV_FONTS[0]);

  const blockLib = [
    { k: 'header',    label: 'Intestazione',     icon: I.Ring },
    { k: 'msg',       label: 'Messaggio',        icon: I.Edit },
    { k: 'program',   label: 'Programma',        icon: I.Clock },
    { k: 'location',  label: 'Location + mappa', icon: I.Pin },
    { k: 'dress',     label: 'Dress code',       icon: I.Sparkle },
    { k: 'logistics', label: 'Logistica',        icon: I.Calendar },
    { k: 'count',     label: 'Countdown',        icon: I.Clock },
    { k: 'gallery',   label: 'Galleria',         icon: I.Eye },
    { k: 'rsvp',      label: 'Blocco RSVP',      icon: I.Check, locked: true },
  ];

  const blocksOnPage = ['header', 'msg', 'program', 'location', 'dress', 'rsvp'];

  return (
    <AppShell nav="invito" eventCtx="Matrimonio · Giulia & Tommaso"
      crumbs={['Eventi', 'Matrimonio', 'Invito']}
      action={
        <div className="row" style={{ gap: 8 }}>
          <button className="cer-btn ghost small"><I.Eye s={14} /> Anteprima</button>
          <button className="cer-btn small">Salva e continua <I.ChevR s={12} /></button>
        </div>
      }>

      <div style={{
        display: 'grid', gridTemplateColumns: '220px 1fr 280px',
        gap: 16, height: '100%',
      }}>
        {/* Blocks library */}
        <div className="col" style={{ gap: 14 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
            Blocchi
          </div>
          <div className="col" style={{ gap: 4 }}>
            {blockLib.map((b) => {
              const onPage = blocksOnPage.includes(b.k);
              return (
                <div key={b.k}
                  onClick={() => setActiveBlock(b.k)}
                  className="row"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8, gap: 10,
                    cursor: 'pointer',
                    background: activeBlock === b.k ? 'var(--bone-100)' : 'transparent',
                    border: '1px solid ' + (activeBlock === b.k ? 'var(--bone-200)' : 'transparent'),
                  }}>
                  <I.Drag s={12} className="muted" />
                  <b.icon s={14} />
                  <span style={{ fontSize: 13, flex: 1 }}>{b.label}</span>
                  {b.locked && <I.Check s={11} className="muted" />}
                  {onPage && !b.locked && <span className="cer-dot" style={{ background: 'var(--sage)' }} />}
                </div>
              );
            })}
          </div>
          <button className="cer-btn ghost small" style={{ justifyContent: 'center' }}>
            <I.Plus s={12} /> Blocco personalizzato
          </button>

          <div className="divider" />
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
            Aspetto
          </div>
          <div
            onClick={() => setActiveBlock('theme')}
            className="row"
            style={{
              padding: '10px 12px', borderRadius: 8, gap: 10, cursor: 'pointer',
              background: activeBlock === 'theme' ? 'var(--bone-100)' : 'transparent',
              border: '1px solid ' + (activeBlock === 'theme' ? 'var(--bone-200)' : 'transparent'),
            }}>
            <I.Sparkle s={14} />
            <span style={{ fontSize: 13, flex: 1 }}>Tema &amp; colori</span>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: theme.accent, border: '1.5px solid var(--ink)' }} />
          </div>
        </div>

        {/* Preview */}
        <div className="col" style={{ background: 'var(--bone-100)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--bone-200)' }}>
          {/* Preview toolbar */}
          <div className="row" style={{ padding: '10px 16px', justifyContent: 'space-between', borderBottom: '1px solid var(--bone-200)', background: 'var(--bone-50)' }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
                Anteprima · tema {theme.label}
              </span>
            </div>
            <div className="row" style={{ gap: 4, background: 'var(--bone-100)', borderRadius: 999, padding: 3 }}>
              <button
                onClick={() => setDevice('desktop')}
                className="cer-btn small ghost"
                style={{ background: device === 'desktop' ? 'var(--bone-50)' : 'transparent', borderColor: 'transparent', borderRadius: 999 }}>
                Desktop
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className="cer-btn small ghost"
                style={{ background: device === 'mobile' ? 'var(--bone-50)' : 'transparent', borderColor: 'transparent', borderRadius: 999 }}>
                Mobile
              </button>
            </div>
          </div>

          <div className="scroll" style={{
            padding: 24, display: 'flex', justifyContent: 'center',
            flex: 1, overflowY: 'auto',
          }}>
            <div style={{
              width: device === 'mobile' ? 360 : 540,
              transition: 'width 200ms',
            }}>
              <InvitePreview activeBlock={activeBlock} setActiveBlock={setActiveBlock} theme={theme} font={font} />
            </div>
          </div>
        </div>

        {/* Inspector */}
        <Inspector activeBlock={activeBlock} theme={theme} setTheme={setTheme} font={font} setFont={setFont} />
      </div>
    </AppShell>
  );
}

function InvitePreview({ activeBlock, setActiveBlock, theme, font }) {
  const wrap = (k, label, children) => (
    <div onClick={() => setActiveBlock(k)} style={{
      position: 'relative',
      outline: activeBlock === k ? '2px solid var(--wine)' : '2px solid transparent',
      outlineOffset: 4,
      borderRadius: 6,
      cursor: 'pointer',
      padding: '8px 0',
    }}>
      {activeBlock === k && (
        <div style={{
          position: 'absolute', top: -22, left: 0,
          background: 'var(--wine)', color: 'var(--ink)',
          padding: '2px 8px', fontSize: 10, fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em', textTransform: 'uppercase',
          borderRadius: 3,
        }}>{label}</div>
      )}
      {children}
    </div>
  );

  return (
    <div style={{
      background: 'var(--bone-50)',
      borderRadius: 16,
      padding: '48px 36px',
      boxShadow: '0 1px 0 var(--bone-200), 0 24px 60px -30px rgba(26,22,18,0.25)',
      fontFamily: font.family,
      transition: 'background 200ms',
      // Theme override — redefines tokens locally so every block recolors live.
      '--font-display': font.family,
      '--bone-50': theme.paper,
      '--bone-100': theme.soft,
      '--wine': theme.accent,
      '--wine-deep': theme.deep,
    }}>
      {wrap('header', 'Intestazione', (
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--wine)', fontFamily: 'var(--font-mono)' }}>
            S A V E   T H E   D A T E
          </div>
          <div style={{ marginTop: 18 }}>
            <span style={{ fontStyle: 'italic', color: 'var(--ink-500)', fontSize: 16 }}>con gioia annunciamo il matrimonio di</span>
          </div>
          <div style={{
            fontSize: 56, lineHeight: 1.05, marginTop: 12,
            color: 'var(--wine-deep)', letterSpacing: '-0.01em',
          }}>
            <em>Giulia</em><br />
            <span style={{ fontStyle: 'italic', fontSize: 18, color: 'var(--ink-500)' }}>e</span><br />
            <em>Tommaso</em>
          </div>
          <div className="mono" style={{ marginTop: 20, fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em', color: 'var(--ink-700)' }}>
            12 · 09 · 2026  ·  ORE 16
          </div>
        </div>
      ))}

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '24px 0' }} />

      {wrap('msg', 'Messaggio', (
        <p style={{
          textAlign: 'center', fontSize: 17, lineHeight: 1.55,
          fontStyle: 'italic', color: 'var(--ink-700)', margin: 0,
        }}>
          Dopo anni a coltivare la stessa felicità, vogliamo celebrarla con
          le persone che l'hanno resa possibile. Ci siete tutti.
        </p>
      ))}

      {wrap('program', 'Programma', (
        <div style={{ marginTop: 20 }}>
          <div className="mono" style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
            textAlign: 'center', color: 'var(--wine)',
          }}>I L   G I O R N O</div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { t: '16:00', l: 'Cerimonia',    s: 'Chiesa di S. Maria, Cernobbio' },
              { t: '17:30', l: 'Aperitivo',    s: 'Terrazza panoramica' },
              { t: '19:30', l: 'Cena',         s: 'Sala degli Affreschi' },
              { t: '22:00', l: 'Festa',        s: 'fino a tarda notte' },
            ].map((it) => (
              <div key={it.t} className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                <div className="mono" style={{
                  fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--wine-deep)',
                  width: 50, paddingTop: 2,
                }}>{it.t}</div>
                <div>
                  <div style={{ fontSize: 18, color: 'var(--ink)' }}>{it.l}</div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-500)' }}>{it.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {wrap('location', 'Location', (
        <div style={{ marginTop: 20, padding: 18, background: 'var(--bone-100)', borderRadius: 10 }}>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--wine)' }}>D O V E</div>
          <div style={{ fontSize: 22, marginTop: 8 }}>Villa Erba</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-500)' }}>
            Largo Luchino Visconti 4, Cernobbio (CO)
          </div>
          <div style={{
            marginTop: 12, height: 80,
            background: `repeating-linear-gradient(135deg, var(--bone-200), var(--bone-200) 2px, var(--bone-50) 2px, var(--bone-50) 6px)`,
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--ink-500)', fontFamily: 'var(--font-mono)', fontSize: 11,
          }}>mappa Google Maps</div>
        </div>
      ))}

      {wrap('dress', 'Dress code', (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--wine)' }}>D R E S S   C O D E</div>
          <div style={{ fontSize: 22, marginTop: 6 }}>Elegante in toni pastello</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
            niente bianco · scarpe comode consigliate
          </div>
        </div>
      ))}

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '24px 0' }} />

      {wrap('rsvp', 'Blocco RSVP', (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, color: 'var(--ink)' }}>Ci sarai?</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
            Conferma entro il 15 luglio 2026
          </div>
          <button style={{
            marginTop: 14,
            padding: '12px 28px',
            background: 'var(--wine)', color: theme.onAccent,
            border: 'none', borderRadius: 999,
            fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
            cursor: 'pointer',
            letterSpacing: '0.02em',
          }}>
            Rispondi all'invito
          </button>
        </div>
      ))}
    </div>
  );
}

function Inspector({ activeBlock, theme, setTheme, font, setFont }) {
  // Appearance panel — pick the palette that recolors the whole invitation.
  if (activeBlock === 'theme') {
    return (
      <div className="col cer-card" style={{ padding: 16, gap: 16 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Aspetto</div>
          <div className="serif" style={{ fontSize: 22, marginTop: 2 }}>Tema &amp; colori</div>
        </div>

        <div className="col" style={{ gap: 8 }}>
          <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
            Palette
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {INV_PALETTES.map((p) => {
              const sel = p.k === theme.k;
              return (
                <div key={p.k}
                  onClick={() => setTheme(p)}
                  className="col"
                  style={{
                    gap: 8, padding: 10, borderRadius: 10, cursor: 'pointer',
                    background: sel ? 'var(--bone-100)' : 'var(--bone-50)',
                    border: '1.5px solid ' + (sel ? 'var(--ink)' : 'var(--line)'),
                  }}>
                  <div className="row" style={{ gap: 4 }}>
                    <span style={{ flex: 1, height: 22, borderRadius: 5, background: p.paper, border: '1px solid var(--line)' }} />
                    <span style={{ flex: 1, height: 22, borderRadius: 5, background: p.accent }} />
                    <span style={{ flex: 1, height: 22, borderRadius: 5, background: p.deep }} />
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400 }}>{p.label}</span>
                    {sel && <I.Check s={13} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="divider" />

        <div className="col" style={{ gap: 8 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
            Colore accento
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {INV_PALETTES.map((p) => (
              <span key={p.k}
                onClick={() => setTheme(p)}
                title={p.label}
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                  background: p.accent,
                  border: '2px solid ' + (p.k === theme.k ? 'var(--ink)' : 'transparent'),
                  boxShadow: '0 0 0 1px var(--line)',
                }} />
            ))}
          </div>
          <div className="small muted">
            La palette ricolora intestazione, programma, RSVP e dettagli dell'invito.
          </div>
        </div>

        <div className="divider" />

        <div className="col" style={{ gap: 8 }}>
          <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
            Carattere
          </label>
          <div className="col" style={{ gap: 6 }}>
            {INV_FONTS.map((ft) => {
              const sel = ft.k === font.k;
              return (
                <div key={ft.k}
                  onClick={() => setFont(ft)}
                  className="row"
                  style={{
                    gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    alignItems: 'center', justifyContent: 'space-between',
                    background: sel ? 'var(--bone-100)' : 'var(--bone-50)',
                    border: '1.5px solid ' + (sel ? 'var(--ink)' : 'var(--line)'),
                  }}>
                  <div className="col" style={{ gap: 1 }}>
                    <span style={{ fontFamily: ft.family, fontSize: 18, lineHeight: 1.1 }}>Giulia &amp; Tommaso</span>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>{ft.label} · {ft.note}</span>
                  </div>
                  {sel && <I.Check s={13} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const fields = {
    header: [
      { l: 'Sopra-titolo',    v: 'Save the date' },
      { l: 'Nome 1',          v: 'Giulia' },
      { l: 'Nome 2',          v: 'Tommaso' },
      { l: 'Data',            v: '12 settembre 2026', type: 'date' },
      { l: 'Ora',             v: '16:00' },
    ],
    msg: [
      { l: 'Testo libero', v: 'Dopo anni a coltivare la stessa felicità…', type: 'textarea' },
    ],
    program: [
      { l: 'Titolo blocco', v: 'Il giorno' },
      { l: 'Voci',          v: '4 voci configurate', type: 'count' },
    ],
    location: [
      { l: 'Nome location', v: 'Villa Erba' },
      { l: 'Indirizzo',     v: 'Largo L. Visconti 4, Cernobbio (CO)' },
      { l: 'Mostra mappa',  v: true, type: 'toggle' },
    ],
    dress: [
      { l: 'Titolo',        v: 'Dress code' },
      { l: 'Descrizione',   v: 'Elegante in toni pastello' },
      { l: 'Sotto-testo',   v: 'niente bianco · scarpe comode' },
    ],
    rsvp: [
      { l: 'Etichetta bottone', v: "Rispondi all'invito" },
      { l: 'Deadline RSVP',     v: '15 luglio 2026', type: 'date' },
    ],
  };
  const f = fields[activeBlock] || [];
  const titleMap = {
    header: 'Intestazione', msg: 'Messaggio', program: 'Programma',
    location: 'Location', dress: 'Dress code', rsvp: 'Blocco RSVP',
  };

  return (
    <div className="col cer-card" style={{ padding: 16, gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Blocco selezionato</div>
          <div className="serif" style={{ fontSize: 22, marginTop: 2 }}>{titleMap[activeBlock] || 'Blocco'}</div>
        </div>
        {activeBlock !== 'rsvp' && (
          <button className="cer-btn ghost small" style={{ padding: 6 }}>
            <I.Trash s={14} />
          </button>
        )}
      </div>

      <div className="col" style={{ gap: 10 }}>
        {f.map((field, i) => (
          <div key={i} className="col" style={{ gap: 4 }}>
            <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
              {field.l}
            </label>
            {field.type === 'textarea' ? (
              <textarea className="cer-input" rows={3} defaultValue={field.v} />
            ) : field.type === 'toggle' ? (
              <div className="row" style={{ gap: 8 }}>
                <div style={{
                  width: 34, height: 18, borderRadius: 999,
                  background: field.v ? 'var(--ink)' : 'var(--bone-200)',
                  position: 'relative', cursor: 'pointer',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: '#fff', position: 'absolute',
                    top: 2, left: field.v ? 18 : 2, transition: 'left 150ms',
                  }} />
                </div>
                <span className="small">{field.v ? 'Attivo' : 'Disattivo'}</span>
              </div>
            ) : field.type === 'count' ? (
              <div className="row" style={{ justifyContent: 'space-between', padding: '8px 0' }}>
                <span className="small">{field.v}</span>
                <button className="cer-btn ghost small"><I.Plus s={12} /> Aggiungi</button>
              </div>
            ) : (
              <input className="cer-input" defaultValue={field.v} />
            )}
          </div>
        ))}
      </div>

      <div className="divider" />

      <div className="col" style={{ gap: 8 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
          Visibile a
        </div>
        <select className="cer-input">
          <option>Tutti gli ospiti</option>
          <option>Solo "Cerimonia + Ricevimento"</option>
          <option>Solo "Famiglia stretta"</option>
        </select>
        <div className="small muted">
          I gruppi ti permettono di mostrare blocchi diversi a sottoinsiemi di ospiti.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EditorScreen });
