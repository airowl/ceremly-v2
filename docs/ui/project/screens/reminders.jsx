// Reminders configuration
function RemindersScreen() {
  return (
    <AppShell nav="reminder" eventCtx="Matrimonio · Giulia & Tommaso"
      crumbs={['Eventi', 'Matrimonio', 'Reminder automatici']}>

      <h1>Reminder automatici</h1>
      <div className="h-sub">
        Inviamo email di promemoria solo agli ospiti che non hanno ancora risposto. Chi ha già detto sì o no resta tranquillo.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, marginTop: 24 }}>
        <div className="col" style={{ gap: 16 }}>
          {/* Deadline */}
          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Deadline RSVP</div>
            <div className="row" style={{ marginTop: 12, gap: 12, alignItems: 'center' }}>
              <input className="cer-input" defaultValue="15 luglio 2026" style={{ maxWidth: 240, fontSize: 16 }} />
              <span className="small muted">Mancano <strong style={{ color: 'var(--ink)' }}>56 giorni</strong> · dopo la deadline il form si chiude automaticamente</span>
            </div>
          </div>

          {/* Reminder cards */}
          {[
            { n: 1, when: '14 giorni prima', date: '1 luglio',  status: 'pianificato', enabled: true,
              msg: 'Ciao {nome}, ti ricordiamo che la conferma per il matrimonio di Giulia e Tommaso scade tra due settimane. Bastano 30 secondi: {link}' },
            { n: 2, when: '7 giorni prima',  date: '8 luglio',  status: 'pianificato', enabled: true,
              msg: 'Ciao {nome}, manca una settimana alla deadline. Se ci sarai (o purtroppo no), facci sapere qui: {link}' },
            { n: 3, when: '2 giorni prima',  date: '13 luglio', status: 'pianificato', enabled: false,
              msg: 'Ultima chiamata, {nome}! Abbiamo bisogno della tua conferma entro 48 ore per il catering. Grazie 🤍 {link}' },
          ].map((r) => <ReminderCard key={r.n} r={r} />)}

          <button className="cer-btn ghost small" style={{ alignSelf: 'flex-start' }}>
            <I.Plus s={12} /> Aggiungi un quarto reminder
          </button>
        </div>

        {/* Side panel */}
        <div className="col" style={{ gap: 16 }}>
          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Sarà inviato a</div>
            <div className="serif" style={{ fontSize: 36, marginTop: 6 }}>49</div>
            <div className="small muted">ospiti che non hanno ancora risposto</div>

            <div className="col" style={{ gap: 10, marginTop: 14 }}>
              <div className="row" style={{ gap: 10, padding: '10px 12px', background: 'var(--bone)', border: '1px solid var(--bone-200)', borderRadius: 8 }}>
                <I.Mail s={14} className="muted" />
                <span style={{ fontSize: 13, flex: 1 }}>Hanno email</span>
                <span className="mono small">28</span>
              </div>
              <div className="row" style={{ gap: 10, padding: '10px 12px', background: 'var(--wine-soft)', borderRadius: 8 }}>
                <I.Whatsapp s={14} style={{ color: 'var(--wine-deep)' }} />
                <div className="col" style={{ flex: 1, lineHeight: 1.25 }}>
                  <span style={{ fontSize: 13, color: 'var(--wine-deep)', fontWeight: 500 }}>21 ospiti senza email</span>
                  <span className="small" style={{ color: 'var(--wine-deep)', opacity: 0.8 }}>messaggio pronto da copiare</span>
                </div>
                <button className="cer-btn small wine" style={{ padding: '4px 10px', fontSize: 11 }}>Apri lista</button>
              </div>
            </div>
          </div>

          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Esclusioni</div>
            <div className="small muted" style={{ marginTop: 8 }}>
              Disattiva i reminder per singoli ospiti — ad esempio quelli che sai già che verranno.
            </div>
            <div className="col" style={{ gap: 6, marginTop: 12 }}>
              {[
                { n: 'Lucia Conti',   r: 'nonna, lasciamo perdere' },
                { n: 'Davide Greco',  r: 'lo vediamo settimana prox' },
              ].map((g) => (
                <div key={g.n} className="row" style={{ gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bone)' }}>
                  <div className="av" style={{ width: 24, height: 24, fontSize: 10 }}>{g.n.split(' ').map((x) => x[0]).join('')}</div>
                  <div className="col" style={{ flex: 1, lineHeight: 1.25 }}>
                    <span style={{ fontSize: 13 }}>{g.n}</span>
                    <span className="small muted">{g.r}</span>
                  </div>
                  <button className="cer-btn ghost small" style={{ padding: 4 }}><I.X s={12} /></button>
                </div>
              ))}
              <button className="cer-btn ghost small">
                <I.Plus s={12} /> Escludi un ospite
              </button>
            </div>
          </div>

          <div className="cer-card" style={{ padding: 20, background: 'var(--ink)', color: 'var(--bone-50)' }}>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <I.Bell s={16} />
              <div className="col" style={{ gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Niente spam</div>
                <div className="small" style={{ color: 'var(--bone-200)', lineHeight: 1.5 }}>
                  Appena un ospite risponde, viene rimosso dalla coda dei reminder successivi. Non riceverà più nulla.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ReminderCard({ r }) {
  return (
    <div className="cer-card" style={{
      padding: 20,
      opacity: r.enabled ? 1 : 0.6,
      borderColor: r.enabled ? 'var(--bone-200)' : 'var(--bone-200)',
    }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row" style={{ gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: r.enabled ? 'var(--wine-soft)' : 'var(--bone-100)',
            color: r.enabled ? 'var(--wine-deep)' : 'var(--ink-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500,
          }}>R{r.n}</div>
          <div className="col" style={{ lineHeight: 1.3 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{r.when}</span>
            <span className="small muted">invio il {r.date} · {r.status}</span>
          </div>
        </div>
        <Toggle on={r.enabled} label={r.enabled ? 'Attivo' : 'Disattivo'} />
      </div>

      <div style={{ marginTop: 14, padding: 14, background: 'var(--bone)', borderRadius: 8, border: '1px solid var(--bone-200)' }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
          Oggetto email
        </div>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          {r.n === 1 ? 'Manca poco — confermi la tua presenza?' :
           r.n === 2 ? 'Una settimana alla deadline RSVP' :
           'Ultima chiamata per il 12 settembre'}
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)', marginTop: 10 }}>
          Messaggio
        </div>
        <div style={{ fontSize: 13, marginTop: 4, color: 'var(--ink-700)', lineHeight: 1.5 }}>
          {r.msg}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RemindersScreen });
