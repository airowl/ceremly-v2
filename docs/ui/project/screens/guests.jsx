// Guest list management
function GuestsScreen() {
  const [selected, setSelected] = React.useState(new Set([2, 5]));
  const [filter, setFilter] = React.useState('all');

  const guests = [
    { id:1, n:'Anna Conti',       e:'anna.conti@email.it',     g:'Famiglia', status:'confirm', date:'2 mag', n_people:2, opened:true },
    { id:2, n:'Marco Bianchi',    e:'m.bianchi@studio.it',     g:'Colleghi', status:'pending', date:null,    n_people:null, opened:true },
    { id:3, n:'Sara De Luca',     e:'sara.deluca@mail.com',    g:'Amici',    status:'confirm', date:'1 mag', n_people:1, opened:true },
    { id:4, n:'Luca Rossi',       e:'',                         g:'Amici',    status:'pending', date:null,    n_people:null, opened:false, phone:'+39 333 1234567' },
    { id:5, n:'Elena Marchetti',  e:'elena.m@gmail.com',       g:'Famiglia', status:'decline', date:'30 apr',n_people:null, opened:true },
    { id:6, n:'Davide Greco',     e:'d.greco@outlook.it',      g:'Colleghi', status:'confirm', date:'28 apr',n_people:2, opened:true },
    { id:7, n:'Chiara Bruno',     e:'chiara@bruno.it',         g:'Amici',    status:'pending', date:null,    n_people:null, opened:false },
    { id:8, n:'Paolo Ferri',      e:'',                         g:'Famiglia', status:'pending', date:null,    n_people:null, opened:false, phone:'+39 348 9876543' },
    { id:9, n:'Martina Riva',     e:'martina.riva@mail.it',    g:'Amici',    status:'confirm', date:'26 apr',n_people:1, opened:true },
    { id:10,n:'Federico Conte',   e:'fede.conte@email.com',    g:'Colleghi', status:'confirm', date:'24 apr',n_people:1, opened:true },
  ];

  const filtered = filter === 'all' ? guests : guests.filter((g) => g.status === filter);
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <AppShell nav="ospiti" eventCtx="Matrimonio · Giulia & Tommaso"
      crumbs={['Eventi', 'Matrimonio', 'Ospiti']}
      action={
        <div className="row" style={{ gap: 8 }}>
          <button className="cer-btn ghost small"><I.Upload s={14} /> Importa CSV</button>
          <button className="cer-btn small"><I.Plus s={14} /> Aggiungi ospite</button>
        </div>
      }>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1>Lista ospiti</h1>
          <div className="h-sub">142 ospiti totali · 119 link inviati · 23 da inviare</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {[
            { k: 'all',     l: 'Tutti',       n: 142 },
            { k: 'confirm', l: 'Confermati',  n: 87,  dot: 'var(--confirm)' },
            { k: 'pending', l: 'In attesa',   n: 49,  dot: 'var(--pending)' },
            { k: 'decline', l: 'Declinati',   n: 6,   dot: 'var(--decline)' },
          ].map((t) => (
            <button key={t.k}
              onClick={() => setFilter(t.k)}
              className="cer-btn ghost small"
              style={{
                background: filter === t.k ? 'var(--bone-100)' : 'transparent',
                borderColor: filter === t.k ? 'var(--bone-300)' : 'var(--bone-200)',
                padding: '6px 12px',
              }}>
              {t.dot && <span className="cer-dot" style={{ background: t.dot }}/>}
              {t.l} <span className="mono muted" style={{ marginLeft: 4, fontSize: 11 }}>{t.n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="row" style={{
          marginTop: 18, padding: '10px 16px',
          background: 'var(--ink)', color: 'var(--bone-50)',
          borderRadius: 10, gap: 12,
        }}>
          <span style={{ fontSize: 13 }}>{selected.size} selezionati</span>
          <div style={{ height: 16, width: 1, background: 'rgba(255,255,255,0.2)' }} />
          <button className="cer-btn small ghost" style={{ background: 'transparent', color: 'var(--bone-50)', borderColor: 'rgba(255,255,255,0.2)' }}>
            <I.Send s={12} /> Invia invito
          </button>
          <button className="cer-btn small ghost" style={{ background: 'transparent', color: 'var(--bone-50)', borderColor: 'rgba(255,255,255,0.2)' }}>
            <I.Bell s={12} /> Reminder
          </button>
          <button className="cer-btn small ghost" style={{ background: 'transparent', color: 'var(--bone-50)', borderColor: 'rgba(255,255,255,0.2)' }}>
            <I.Edit s={12} /> Cambia gruppo
          </button>
          <div className="spacer" />
          <button onClick={() => setSelected(new Set())} className="cer-btn small ghost"
            style={{ background: 'transparent', color: 'var(--bone-50)', borderColor: 'rgba(255,255,255,0.2)' }}>
            <I.X s={12} /> Deseleziona
          </button>
        </div>
      )}

      <div className="cer-card scroll" style={{ marginTop: 18, padding: 0 }}>
        <table className="cer-table">
          <thead>
            <tr>
              <th style={{ width: 32, paddingLeft: 16 }}>
                <CB on={selected.size === filtered.length && filtered.length > 0} />
              </th>
              <th>Ospite</th>
              <th>Stato RSVP</th>
              <th>Gruppo</th>
              <th>Canale</th>
              <th>Persone</th>
              <th>Risposta</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g.id}>
                <td style={{ paddingLeft: 16 }}>
                  <CB on={selected.has(g.id)} onClick={() => toggle(g.id)} />
                </td>
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <div className="av">{g.n.split(' ').map((x) => x[0]).join('').slice(0,2)}</div>
                    <div className="col" style={{ lineHeight: 1.25 }}>
                      <span style={{ fontWeight: 500 }}>{g.n}</span>
                      <span className="small muted">{g.e || g.phone || '—'}</span>
                    </div>
                  </div>
                </td>
                <td><StatusPill s={g.status} /></td>
                <td><span className="cer-tag">{g.g}</span></td>
                <td>
                  {g.e ? (
                    <span className="row small" style={{ gap: 5 }}><I.Mail s={12} className="muted" /> Email</span>
                  ) : (
                    <span className="row small" style={{ gap: 5 }}><I.Whatsapp s={12} className="muted" /> WhatsApp</span>
                  )}
                </td>
                <td className="mono small">{g.n_people != null ? g.n_people : '—'}</td>
                <td className="small muted">{g.date || (g.opened ? 'aperto, non risposto' : 'non aperto')}</td>
                <td><I.ChevR s={14} className="muted" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
        <span className="small muted">Mostro 10 di {filtered.length} ospiti</span>
        <div className="row" style={{ gap: 4 }}>
          <button className="cer-btn ghost small" style={{ padding: 6 }}>‹</button>
          <button className="cer-btn small" style={{ padding: '6px 10px' }}>1</button>
          <button className="cer-btn ghost small" style={{ padding: '6px 10px' }}>2</button>
          <button className="cer-btn ghost small" style={{ padding: 6 }}>›</button>
        </div>
      </div>
    </AppShell>
  );
}

function CB({ on, onClick }) {
  return (
    <div onClick={onClick} style={{
      width: 16, height: 16, borderRadius: 4,
      border: '1px solid ' + (on ? 'var(--ink)' : 'var(--bone-300)'),
      background: on ? 'var(--ink)' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      color: 'var(--bone-50)',
    }}>
      {on && <I.Check s={10} sw={2.5} />}
    </div>
  );
}

function StatusPill({ s }) {
  const map = {
    confirm: { l: 'Confermato', c: 'confirm' },
    decline: { l: 'Declinato',  c: 'decline' },
    pending: { l: 'In attesa',  c: 'pending' },
  };
  const m = map[s];
  return <span className={'pill ' + m.c}><span className="cer-dot" />{m.l}</span>;
}

Object.assign(window, { GuestsScreen });
