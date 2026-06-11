// Event dashboard — KPI cards + guest table with response detail drawer
function EventDashboardScreen() {
  return (
    <AppShell nav="dashboard" eventCtx="Matrimonio · Giulia & Tommaso"
      crumbs={['Eventi', 'Matrimonio', 'Andamento']}
      action={
        <div className="row" style={{ gap: 8 }}>
          <button className="cer-btn ghost small"><I.Upload s={14} /> Export</button>
          <button className="cer-btn small"><I.Send s={14} /> Comunicazione</button>
        </div>
      }>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Come sta andando</h1>
          <div className="h-sub row" style={{ gap: 12 }}>
            <span>12 settembre 2026 · tra 115 giorni</span>
            <span>·</span>
            <span className="row" style={{ gap: 6 }}>
              <span className="cer-dot" style={{ background: 'var(--confirm)', boxShadow: '0 0 0 3px color-mix(in oklch, var(--confirm) 25%, transparent)' }} />
              Aggiornamento live
            </span>
          </div>
        </div>
        <div className="row mono" style={{ gap: 6, fontSize: 11, color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <I.Clock s={12} /> Ultimo aggiornamento: 12 sec fa
        </div>
      </div>

      {/* KPI grid */}
      <div className="kpi-row" style={{ marginTop: 22 }}>
        <div className="kpi accent">
          <div className="k-label">Totale invitati</div>
          <div className="k-num">142</div>
          <div className="k-sub">61 nuclei familiari</div>
        </div>
        <div className="kpi">
          <div className="k-label">Inviti aperti</div>
          <div className="k-num">119</div>
          <div className="k-sub">83.8% · obiettivo &gt;70%</div>
        </div>
        <div className="kpi">
          <div className="k-label">Risposte ricevute</div>
          <div className="k-num">93</div>
          <div className="k-sub">78.2% degli aperti</div>
        </div>
        <div className="kpi">
          <div className="k-label">Confermati totali persone</div>
          <div className="k-num">128</div>
          <div className="k-sub">87 ospiti + 41 accompagnatori</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginTop: 22 }}>
        {/* Left: timeline / breakdown */}
        <div className="cer-card" style={{ padding: 22 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Andamento RSVP</div>
              <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>Ultime 4 settimane</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="cer-tag" style={{ background: 'var(--ink)', color: 'var(--bone-50)' }}>4 sett</span>
              <span className="cer-tag">3 mesi</span>
              <span className="cer-tag">Tutto</span>
            </div>
          </div>

          <RsvpChart />

          {/* Legend */}
          <div className="row" style={{ gap: 18, marginTop: 16, fontSize: 12 }}>
            <span className="row" style={{ gap: 6 }}><span className="cer-dot" style={{ background: 'var(--confirm)' }}/>Sì <strong style={{ marginLeft: 4 }}>87</strong></span>
            <span className="row" style={{ gap: 6 }}><span className="cer-dot" style={{ background: 'var(--decline)' }}/>No <strong style={{ marginLeft: 4 }}>6</strong></span>
            <span className="row" style={{ gap: 6 }}><span className="cer-dot" style={{ background: 'var(--pending)' }}/>Forse <strong style={{ marginLeft: 4 }}>4</strong></span>
            <span className="row" style={{ gap: 6 }}><span className="cer-dot" style={{ background: 'var(--bone-300)' }}/>In attesa <strong style={{ marginLeft: 4 }}>45</strong></span>
          </div>
        </div>

        {/* Right: breakdown */}
        <div className="col" style={{ gap: 16 }}>
          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Preferenze menu</div>
            <div style={{ marginTop: 12 }}>
              {[
                { l: 'Carne',       n: 56, c: 'var(--purple)' },
                { l: 'Pesce',       n: 42, c: 'var(--blue)' },
                { l: 'Vegetariano', n: 22, c: 'var(--confirm)' },
                { l: 'Vegano',      n: 8,  c: 'var(--orange)' },
              ].map((r) => (
                <div key={r.l} className="col" style={{ gap: 4, marginBottom: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{r.l}</span>
                    <span className="mono">{r.n}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bone-100)', borderRadius: 999 }}>
                    <div style={{ width: `${(r.n / 128) * 100}%`, height: '100%', background: r.c, borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cer-card" style={{ padding: 20 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Allergie segnalate</div>
              <span className="cer-tag">9 ospiti</span>
            </div>
            <div className="col" style={{ gap: 6, marginTop: 12 }}>
              {[
                { a: 'Glutine',         n: 4 },
                { a: 'Lattosio',        n: 3 },
                { a: 'Frutta a guscio', n: 2 },
                { a: 'Crostacei',       n: 1 },
              ].map((it) => (
                <div key={it.a} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '6px 0' }}>
                  <span>{it.a}</span>
                  <span className="mono muted">×{it.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom grid: needs attention */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 22 }}>
        <div className="cer-card" style={{ padding: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="serif" style={{ fontSize: 20 }}>Da contattare</div>
            <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--wine-deep)' }}>5 ospiti</span>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            Hanno aperto l'invito da oltre 7 giorni senza rispondere
          </div>
          <div className="col" style={{ gap: 8, marginTop: 14 }}>
            {[
              { n: 'Marco Bianchi', t: 'aperto 9 gg fa', e: 'm.bianchi@studio.it' },
              { n: 'Paolo Ferri',   t: 'aperto 8 gg fa', e: '+39 348 9876543' },
              { n: 'Chiara Bruno',  t: 'aperto 12 gg fa', e: 'chiara@bruno.it' },
            ].map((g) => (
              <div key={g.n} className="row" style={{
                padding: '10px 12px', borderRadius: 8, gap: 10,
                background: 'var(--bone)', border: '1px solid var(--bone-200)',
              }}>
                <div className="av">{g.n.split(' ').map((x) => x[0]).join('')}</div>
                <div className="col" style={{ flex: 1, lineHeight: 1.25 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{g.n}</span>
                  <span className="small muted">{g.e} · {g.t}</span>
                </div>
                <button className="cer-btn small ghost"><I.Bell s={12} /> Reminder</button>
              </div>
            ))}
          </div>
        </div>

        <GuestDetailDrawer />
      </div>
    </AppShell>
  );
}

function RsvpChart() {
  // Stacked area sketch (svg).
  const days = 28;
  const conf = [0,0,2,4,7,10,12,14,16,18,22,28,34,40,45,52,58,62,66,70,73,76,79,81,83,84,85,87];
  const dec  = [0,0,0,0,1,1,1,2,2,2,2,3,3,3,4,4,4,5,5,5,5,5,6,6,6,6,6,6];
  const pend = [0,0,0,1,2,2,3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4];

  const W = 720, H = 200, pad = { l: 30, r: 8, t: 10, b: 24 };
  const innerW = W - pad.l - pad.r, innerH = H - pad.t - pad.b;
  const max = 100;
  const x = (i) => pad.l + (i / (days - 1)) * innerW;
  const y = (v) => pad.t + innerH - (v / max) * innerH;

  const area = (arr, base = null) => {
    const pts = arr.map((v, i) => `${x(i)},${y(v + (base ? base[i] : 0))}`).join(' ');
    if (base) {
      const reverse = base.slice().reverse().map((v, i) => `${x(days - 1 - i)},${y(v)}`).join(' ');
      return `M${pts.split(' ').join(' L')} L${reverse.split(' ').join(' L')} Z`;
    }
    return `M${pad.l},${y(0)} L${pts.split(' ').join(' L')} L${x(days-1)},${y(0)} Z`;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ marginTop: 18 }}>
      {/* grid */}
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--bone-200)" strokeWidth="1" />
          <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize="9" fill="var(--ink-400)" fontFamily="var(--font-mono)">{g}</text>
        </g>
      ))}
      {/* confirmed area */}
      <path d={area(conf)} fill="oklch(0.55 0.10 150)" fillOpacity="0.18" />
      <polyline fill="none" stroke="var(--confirm)" strokeWidth="2"
        points={conf.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      {/* declined line */}
      <polyline fill="none" stroke="var(--decline)" strokeWidth="1.5" strokeDasharray="3 3"
        points={dec.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      {/* pending line */}
      <polyline fill="none" stroke="var(--pending)" strokeWidth="1.5" strokeDasharray="3 3"
        points={pend.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />

      {/* x labels */}
      {[0, 7, 14, 21, 27].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--ink-500)" fontFamily="var(--font-mono)">
          {['1 apr','8 apr','15 apr','22 apr','30 apr'][[0,7,14,21,27].indexOf(i)]}
        </text>
      ))}

      {/* hover marker */}
      <line x1={x(20)} x2={x(20)} y1={pad.t} y2={H - pad.b} stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
      <circle cx={x(20)} cy={y(73)} r="4" fill="var(--confirm)" stroke="#fff" strokeWidth="2" />
      <g transform={`translate(${x(20) + 8}, ${y(73) - 26})`}>
        <rect width="86" height="34" rx="6" fill="var(--ink)" />
        <text x="8" y="13" fontSize="9" fill="var(--bone-300)" fontFamily="var(--font-mono)">21 APR</text>
        <text x="8" y="27" fontSize="11" fill="#fff" fontWeight="500">73 confermati</text>
      </g>
    </svg>
  );
}

function GuestDetailDrawer() {
  return (
    <div className="cer-card" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="av lg">AC</div>
          <div className="col" style={{ lineHeight: 1.2 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>Anna Conti</span>
            <span className="small muted">anna.conti@email.it · Gruppo "Famiglia"</span>
          </div>
        </div>
        <span className="pill confirm"><span className="cer-dot"/>Confermato</span>
      </div>

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '16px 0' }} />

      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
        Risposte RSVP
      </div>
      <div className="col" style={{ gap: 10, marginTop: 10 }}>
        {[
          { q: 'Partecipi?', a: 'Sì, ci sarò' },
          { q: 'A cosa partecipi?', a: 'Cerimonia + Ricevimento' },
          { q: 'Accompagnatori', a: '1 — Luca Conti' },
          { q: 'Menu Anna', a: 'Pesce · senza glutine' },
          { q: 'Menu Luca', a: 'Carne · nessuna allergia' },
          { q: 'Alloggio', a: 'No, abbiamo già prenotato' },
          { q: 'Messaggio', a: 'Non vediamo l\'ora di esserci ❤' },
        ].map((r) => (
          <div key={r.q} className="row" style={{ alignItems: 'flex-start', gap: 12, fontSize: 13 }}>
            <span className="muted small" style={{ width: 130, paddingTop: 1 }}>{r.q}</span>
            <span style={{ flex: 1 }}>{r.a}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '16px 0' }} />

      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
        Timeline
      </div>
      <div className="col" style={{ gap: 6, marginTop: 8 }}>
        {[
          { d: '2 mag · 14:32', t: 'Risposta completata' },
          { d: '2 mag · 14:28', t: 'Link aperto (2ª volta)' },
          { d: '28 apr · 19:02', t: 'Link aperto (1ª volta)' },
          { d: '28 apr · 18:55', t: 'Invito inviato via email' },
        ].map((e) => (
          <div key={e.d} className="row" style={{ gap: 10, fontSize: 12 }}>
            <span className="mono muted" style={{ width: 110 }}>{e.d}</span>
            <span>{e.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { EventDashboardScreen });
