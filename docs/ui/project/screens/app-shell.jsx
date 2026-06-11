// Shared organizer-app shell — sidebar + topbar wrapping the page content.
// Each screen passes a `nav` (current section) and the inner page body.

function AppShell({ nav = 'events', crumbs, action, children, eventCtx }) {
  const items = [
    { k: 'home', label: 'Home', icon: I.Home },
    { k: 'events', label: 'I tuoi eventi', icon: I.Events },
    { k: 'templates', label: 'Template', icon: I.Sparkle },
  ];
  const eventItems = [
    { k: 'invito', label: 'Invito', icon: I.Edit },
    { k: 'ospiti', label: 'Ospiti', icon: I.Guests },
    { k: 'rsvp', label: 'Form RSVP', icon: I.Check },
    { k: 'invio', label: 'Distribuzione', icon: I.Send },
    { k: 'reminder', label: 'Reminder', icon: I.Bell },
    { k: 'dashboard', label: 'Andamento', icon: I.Chart },
  ];

  return (
    <div className="cer cer-app">
      <aside className="cer-side">
        <div className="brand serif">Ceremly<span className="dot" /></div>

        {items.map((it) => (
          <div key={it.k}
            className={'cer-nav-item' + (nav === it.k ? ' active' : '')}>
            <it.icon s={15} />
            <span>{it.label}</span>
          </div>
        ))}

        {eventCtx && (
          <>
            <div className="cer-nav-group">{eventCtx}</div>
            {eventItems.map((it) => (
              <div key={it.k}
                className={'cer-nav-item' + (nav === it.k ? ' active' : '')}>
                <it.icon s={15} />
                <span>{it.label}</span>
              </div>
            ))}
          </>
        )}

        <div style={{ flex: 1 }} />
        <div className="cer-nav-item">
          <I.Settings s={15} />
          <span>Impostazioni</span>
        </div>
        <div style={{
          marginTop: 10, padding: '10px 8px',
          borderTop: '1px solid var(--bone-200)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div className="av sage">GF</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Giulia Ferretti</span>
            <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Piano Free</span>
          </div>
        </div>
      </aside>

      <main className="cer-main">
        <header className="cer-topbar">
          <div className="crumbs">
            {(crumbs || []).map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <I.ChevR s={12} />}
                {i === (crumbs.length - 1) ? <strong>{c}</strong> : <span>{c}</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className="cer-btn ghost small">
              <I.Search s={14} /> Cerca
              <span className="mono" style={{ color: 'var(--ink-400)', marginLeft: 6, fontSize: 11 }}>⌘K</span>
            </button>
            {action}
          </div>
        </header>
        <div className="cer-page scroll">{children}</div>
      </main>
    </div>
  );
}

Object.assign(window, { AppShell });
