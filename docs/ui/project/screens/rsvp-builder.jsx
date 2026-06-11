// RSVP form builder — left questions list, right preview / settings
function RSVPBuilderScreen() {
  const [active, setActive] = React.useState(2);

  const questions = [
    { i: 0, t: 'Partecipi?', kind: 'Selezione singola',
      opts: ['Sì, ci sarò', 'No, mi dispiace', 'Non ancora sicuro'],
      cond: null, perp: false, req: true, locked: true },
    { i: 1, t: 'A cosa partecipi?', kind: 'Selezione multipla',
      opts: ['Cerimonia', 'Ricevimento'],
      cond: 'Partecipi? = Sì', perp: false, req: true },
    { i: 2, t: 'Quanti accompagnatori?', kind: 'Numero',
      opts: ['0 — 4'],
      cond: 'Partecipi? = Sì', perp: false, req: true },
    { i: 3, t: 'Nome accompagnatore', kind: 'Testo',
      opts: [], cond: 'Accompagnatori > 0', perp: true, req: true },
    { i: 4, t: 'Preferenza menu', kind: 'Selezione singola',
      opts: ['Carne', 'Pesce', 'Vegetariano', 'Vegano'],
      cond: 'Partecipi? = Sì', perp: true, req: true },
    { i: 5, t: 'Allergie o intolleranze', kind: 'Testo libero',
      opts: [], cond: 'Partecipi? = Sì', perp: true, req: false },
    { i: 6, t: 'Hai bisogno di alloggio?', kind: 'Sì / No',
      opts: [], cond: 'Partecipi? = Sì', perp: false, req: false },
    { i: 7, t: 'Una canzone che non può mancare', kind: 'Testo libero',
      opts: [], cond: null, perp: false, req: false },
    { i: 8, t: 'Un messaggio per gli sposi', kind: 'Testo libero',
      opts: [], cond: null, perp: false, req: false },
  ];

  const cur = questions[active];

  return (
    <AppShell nav="rsvp" eventCtx="Matrimonio · Giulia & Tommaso"
      crumbs={['Eventi', 'Matrimonio', 'Form RSVP']}
      action={
        <div className="row" style={{ gap: 8 }}>
          <button className="cer-btn ghost small"><I.Eye s={14} /> Anteprima ospite</button>
          <button className="cer-btn small">Salva</button>
        </div>
      }>

      <h1>Form RSVP</h1>
      <div className="h-sub">
        9 domande · preset matrimonio applicato ·
        <span className="cer-tag" style={{ marginLeft: 8 }}>Deadline 15.07.2026</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 20, marginTop: 24 }}>
        {/* Questions list */}
        <div className="col" style={{ gap: 8 }}>
          {questions.map((q) => (
            <div key={q.i}
              onClick={() => setActive(q.i)}
              className="cer-card"
              style={{
                padding: '12px 14px', cursor: 'pointer',
                border: '1px solid ' + (active === q.i ? 'var(--ink)' : 'var(--bone-200)'),
                background: active === q.i ? 'var(--bone-50)' : 'var(--bone-50)',
                boxShadow: active === q.i ? '0 1px 0 var(--ink)' : 'none',
              }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <I.Drag s={12} className="muted" style={{ marginTop: 6 }} />
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-400)', width: 18, paddingTop: 3 }}>
                  {String(q.i + 1).padStart(2, '0')}
                </div>
                <div className="col" style={{ flex: 1, gap: 4 }}>
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{q.t}</span>
                    {q.req && <span className="cer-dot" style={{ background: 'var(--wine)' }} title="Obbligatoria" />}
                    {q.locked && <span className="cer-tag" style={{ fontSize: 9 }}>BASE</span>}
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span className="cer-tag">{q.kind}</span>
                    {q.cond && <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--wine-deep)' }}>
                      mostra se {q.cond}
                    </span>}
                    {q.perp && <span className="cer-tag" style={{ background: 'var(--sage-soft)', color: 'var(--blue-deep)', borderColor: 'transparent' }}>
                      per persona
                    </span>}
                  </div>
                </div>
                <I.ChevR s={14} className="muted" />
              </div>
            </div>
          ))}
          <button className="cer-btn ghost small" style={{ justifyContent: 'center', marginTop: 8 }}>
            <I.Plus s={12} /> Aggiungi domanda
          </button>
        </div>

        {/* Inspector */}
        <QuestionInspector q={cur} />
      </div>
    </AppShell>
  );
}

function QuestionInspector({ q }) {
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="cer-card" style={{ padding: 20 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
          Domanda {String(q.i + 1).padStart(2, '0')}
        </div>
        <input className="cer-input" defaultValue={q.t} style={{ marginTop: 10, fontSize: 18, fontWeight: 500, padding: '12px 14px' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 16 }}>
          <div className="col" style={{ gap: 4 }}>
            <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Tipo</label>
            <select className="cer-input" defaultValue={q.kind}>
              <option>Testo libero</option>
              <option>Selezione singola</option>
              <option>Selezione multipla</option>
              <option>Numero</option>
              <option>Sì / No</option>
            </select>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Stato</label>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <Toggle on={q.req} label="Obbligatoria" />
              <Toggle on={q.perp} label="Per persona" />
            </div>
          </div>
        </div>

        {q.opts && q.opts.length > 0 && (
          <div className="col" style={{ marginTop: 16, gap: 6 }}>
            <label className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Opzioni</label>
            {q.opts.map((o, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <I.Drag s={12} className="muted" />
                <input className="cer-input" defaultValue={o} />
                <button className="cer-btn ghost small" style={{ padding: 6 }}><I.Trash s={12} /></button>
              </div>
            ))}
            <button className="cer-btn ghost small" style={{ alignSelf: 'flex-start' }}>
              <I.Plus s={12} /> Opzione
            </button>
          </div>
        )}
      </div>

      {/* Conditional logic */}
      <div className="cer-card" style={{ padding: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Logica condizionale</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Mostra questa domanda solo se…</div>
          </div>
          <Toggle on={!!q.cond} label="Attiva" />
        </div>

        {q.cond && (
          <div className="row" style={{ marginTop: 14, gap: 8 }}>
            <select className="cer-input" defaultValue="Partecipi?">
              <option>Partecipi?</option>
              <option>Accompagnatori</option>
            </select>
            <select className="cer-input" style={{ width: 90 }}>
              <option>è</option>
              <option>non è</option>
              <option>&gt;</option>
            </select>
            <select className="cer-input">
              <option>Sì</option>
              <option>No</option>
              <option>0</option>
            </select>
          </div>
        )}
      </div>

      {/* Preview snippet */}
      <div className="cer-card" style={{ padding: 20, background: 'var(--bone-100)' }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
          Anteprima ospite
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="serif" style={{ fontSize: 22 }}>{q.t}</div>
          {q.kind === 'Numero' ? (
            <div className="row" style={{ marginTop: 12, gap: 4 }}>
              {[0,1,2,3,4].map((n) => (
                <button key={n} className="cer-btn ghost"
                  style={{ width: 44, height: 44, justifyContent: 'center', borderRadius: 10, padding: 0,
                    background: n === 2 ? 'var(--ink)' : 'var(--bone-50)', color: n === 2 ? 'var(--bone-50)' : 'var(--ink)' }}>
                  {n}
                </button>
              ))}
            </div>
          ) : q.kind === 'Sì / No' ? (
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <button className="cer-btn ghost" style={{ borderRadius: 999 }}>Sì</button>
              <button className="cer-btn ghost" style={{ borderRadius: 999 }}>No</button>
            </div>
          ) : q.opts && q.opts.length ? (
            <div className="col" style={{ marginTop: 12, gap: 6 }}>
              {q.opts.map((o, i) => (
                <div key={i} className="row" style={{
                  padding: '10px 14px',
                  background: 'var(--bone-50)',
                  border: '1px solid var(--bone-200)',
                  borderRadius: 10, gap: 10,
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '1.5px solid var(--ink-400)', display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 14 }}>{o}</span>
                </div>
              ))}
            </div>
          ) : (
            <textarea className="cer-input" rows={3} placeholder="Scrivi qui…" style={{ marginTop: 12, background: 'var(--bone-50)' }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, label }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <div style={{
        width: 32, height: 18, borderRadius: 999,
        background: on ? 'var(--ink)' : 'var(--bone-300)',
        position: 'relative',
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#fff', position: 'absolute',
          top: 2, left: on ? 16 : 2,
        }} />
      </div>
      <span className="small">{label}</span>
    </div>
  );
}

Object.assign(window, { RSVPBuilderScreen });
