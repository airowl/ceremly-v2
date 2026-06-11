// Events home — list of events the organizer manages.
function EventsHome() {
  const events = [
    {
      type: 'Matrimonio', icon: I.Ring, title: 'Giulia & Tommaso',
      date: '12 settembre 2026', loc: 'Villa Erba, Cernobbio (CO)',
      total: 142, confirmed: 87, opened: 119, declined: 6,
      status: 'In invio', tint: 'wine',
    },
    {
      type: 'Compleanno', icon: I.Cake, title: 'I 40 di Sara',
      date: '8 giugno 2026', loc: 'Cascina Bellaria, Milano',
      total: 62, confirmed: 51, opened: 60, declined: 3,
      status: 'RSVP attivi', tint: 'sage',
    },
    {
      type: 'Battesimo', icon: I.Cross, title: 'Leo · Battesimo',
      date: '24 maggio 2026', loc: 'Parrocchia S. Maria, Pavia',
      total: 38, confirmed: 38, opened: 38, declined: 0,
      status: 'Tutti confermati', tint: 'sage',
    },
  ];

  const drafts = [
    { type: 'Laurea', icon: I.Cap, title: 'Laurea di Andrea', date: 'Da definire · ottobre' },
  ];

  return (
    <AppShell nav="events" crumbs={['Dashboard']}
      action={<button className="cer-btn"><I.Plus s={14} /> Nuovo evento</button>}>

      <h1>I tuoi eventi</h1>
      <div className="h-sub">3 eventi attivi · 1 bozza</div>

      {/* Quick stats */}
      <div className="kpi-row" style={{ marginTop: 24 }}>
        <div className="kpi accent">
          <div className="k-label">Totale ospiti gestiti</div>
          <div className="k-num">242</div>
          <div className="k-sub">tra 3 eventi attivi</div>
        </div>
        <div className="kpi">
          <div className="k-label">In attesa di risposta</div>
          <div className="k-num">39</div>
          <div className="k-sub">28 con email · 11 da WhatsApp</div>
        </div>
        <div className="kpi">
          <div className="k-label">RSVP questa settimana</div>
          <div className="k-num">+27</div>
          <div className="k-sub">+12 rispetto alla scorsa</div>
        </div>
        <div className="kpi">
          <div className="k-label">Tasso apertura inviti</div>
          <div className="k-num">89%</div>
          <div className="k-sub">obiettivo &gt;70%</div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ marginTop: 32 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Attivi</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-400)' }}>Ordina per: data evento ↓</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 12 }}>
          {events.map((e) => <EventCard key={e.title} e={e} />)}
        </div>

        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)', marginTop: 28 }}>Bozze</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 12 }}>
          {drafts.map((d) => (
            <div key={d.title} className="cer-card" style={{ padding: 20, opacity: 0.85, borderStyle: 'dashed' }}>
              <div className="row" style={{ gap: 10, color: 'var(--ink-500)' }}>
                <d.icon s={18} />
                <span className="mono" style={{ fontSize: 11, textTransform: 'uppercase' }}>{d.type}</span>
              </div>
              <div className="serif" style={{ fontSize: 22, marginTop: 8 }}>{d.title}</div>
              <div className="small muted" style={{ marginTop: 4 }}>{d.date}</div>
              <button className="cer-btn ghost small" style={{ marginTop: 14 }}>
                Continua la configurazione <I.ChevR s={12} />
              </button>
            </div>
          ))}

          {/* New event placeholder */}
          <div className="cer-card" style={{
            padding: 20, borderStyle: 'dashed', borderColor: 'var(--bone-300)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', textAlign: 'center', cursor: 'pointer',
            color: 'var(--ink-500)', minHeight: 160,
          }}>
            <I.Plus s={20} />
            <div style={{ marginTop: 6, fontSize: 13 }}>Crea un nuovo evento</div>
            <div className="small muted" style={{ marginTop: 2 }}>Matrimonio, laurea, compleanno…</div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function EventCard({ e }) {
  const pct = Math.round((e.confirmed / e.total) * 100);
  const Tag = e.icon;
  return (
    <div className="cer-card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
      {/* Header strip */}
      <div style={{
        height: 92,
        background: e.tint === 'wine'
          ? 'linear-gradient(135deg, var(--purple-bright), var(--purple))'
          : 'linear-gradient(135deg, var(--blue), var(--sage))',
        color: 'var(--ink)',
        padding: 16, position: 'relative',
      }}>
        <div className="row" style={{ gap: 8, opacity: 0.85 }}>
          <Tag s={14} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{e.type}</span>
        </div>
        <div className="serif" style={{ fontSize: 26, lineHeight: 1.15, marginTop: 6, letterSpacing: '-0.01em' }}>
          {e.title}
        </div>
        <div style={{
          position: 'absolute', top: 14, right: 14,
          background: 'rgba(63,54,34,0.14)', backdropFilter: 'blur(8px)',
          padding: '3px 8px', borderRadius: 999, fontSize: 11,
        }}>
          {e.status}
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div className="row small muted" style={{ gap: 6 }}>
          <I.Calendar s={13} /> {e.date}
        </div>
        <div className="row small muted" style={{ gap: 6, marginTop: 4 }}>
          <I.Pin s={13} /> {e.loc}
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>RSVP</span>
            <span className="mono small">{e.confirmed}/{e.total}</span>
          </div>
          <div style={{ height: 4, background: 'var(--bone-100)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--ink)' }} />
          </div>
          <div className="row" style={{ marginTop: 10, gap: 12, fontSize: 12, color: 'var(--ink-700)' }}>
            <span className="row" style={{ gap: 4 }}><span className="cer-dot" style={{ background: 'var(--confirm)' }}/>{e.confirmed} sì</span>
            <span className="row" style={{ gap: 4 }}><span className="cer-dot" style={{ background: 'var(--decline)' }}/>{e.declined} no</span>
            <span className="row" style={{ gap: 4 }}><span className="cer-dot" style={{ background: 'var(--pending)' }}/>{e.total - e.confirmed - e.declined} in attesa</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { EventsHome });
