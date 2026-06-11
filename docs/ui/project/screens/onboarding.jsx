// Onboarding step — choose event type, then a template.
function OnboardingScreen() {
  const [eventType, setEventType] = React.useState('matrimonio');
  const [template, setTemplate] = React.useState('toscana');

  const types = [
    { k: 'matrimonio', label: 'Matrimonio', icon: I.Ring, desc: 'Cerimonia + ricevimento, menu, alloggio' },
    { k: 'laurea',     label: 'Laurea',     icon: I.Cap,  desc: 'Cerimonia in ateneo + rinfresco' },
    { k: 'battesimo',  label: 'Battesimo',  icon: I.Cross,desc: 'Chiesa, padrini, rinfresco' },
    { k: 'compleanno', label: 'Compleanno', icon: I.Cake, desc: 'Festa, dress code, regali' },
  ];

  // Templates contextual to event type (showing matrimonio ones)
  const templates = {
    matrimonio: [
      { k: 'toscana',   name: 'Toscana',   tone: 'romantico · floreale', accent: 'oklch(0.55 0.07 25)' },
      { k: 'minimale',  name: 'Minimale',  tone: 'editoriale · serif',   accent: 'oklch(0.20 0.01 80)' },
      { k: 'giardino',  name: 'Giardino',  tone: 'botanico · acquerello', accent: 'oklch(0.55 0.06 145)' },
      { k: 'classico',  name: 'Classico',  tone: 'elegante · oro',       accent: 'oklch(0.65 0.08 80)' },
    ],
    laurea:     [],
    battesimo:  [],
    compleanno: [],
  };
  const list = templates[eventType] || templates.matrimonio;

  return (
    <AppShell nav="events" crumbs={['Eventi', 'Nuovo evento']}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Stepper */}
        <div className="row" style={{ gap: 12, marginBottom: 32 }}>
          {['Tipo evento', 'Template', 'Dettagli', 'Ospiti', 'Invio'].map((s, i) => (
            <React.Fragment key={s}>
              {i > 0 && <div style={{ flex: 1, height: 1, background: 'var(--bone-200)' }} />}
              <div className="row" style={{ gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: '1px solid ' + (i <= 1 ? 'var(--ink)' : 'var(--bone-300)'),
                  background: i === 0 ? 'var(--ink)' : 'transparent',
                  color: i === 0 ? 'var(--bone-50)' : 'var(--ink-500)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                }}>{i === 0 ? <I.Check s={12} /> : i + 1}</div>
                <span className="mono" style={{
                  fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase',
                  color: i <= 1 ? 'var(--ink)' : 'var(--ink-400)',
                }}>{s}</span>
              </div>
            </React.Fragment>
          ))}
        </div>

        <h1>Che tipo di evento stai organizzando?</h1>
        <p className="h-sub" style={{ maxWidth: 560 }}>
          La scelta determina la struttura dell'invito, i campi del form RSVP
          e i template disponibili. Potrai cambiare idea più tardi.
        </p>

        {/* Type cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 24 }}>
          {types.map((t) => {
            const active = eventType === t.k;
            const Ti = t.icon;
            return (
              <div key={t.k}
                onClick={() => setEventType(t.k)}
                style={{
                  padding: 20,
                  border: '1px solid ' + (active ? 'var(--ink)' : 'var(--bone-200)'),
                  background: active ? 'var(--ink)' : 'var(--bone-50)',
                  color: active ? 'var(--bone-50)' : 'var(--ink)',
                  borderRadius: 14, cursor: 'pointer',
                  transition: 'transform 150ms',
                }}>
                <Ti s={26} />
                <div className="serif" style={{ fontSize: 22, marginTop: 14, letterSpacing: '-0.01em' }}>{t.label}</div>
                <div style={{
                  fontSize: 12, marginTop: 4,
                  color: active ? 'var(--bone-200)' : 'var(--ink-500)',
                }}>{t.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Templates */}
        <div className="row" style={{ marginTop: 36, justifyContent: 'space-between' }}>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Step 2</div>
            <div className="serif" style={{ fontSize: 28, marginTop: 4 }}>Scegli un template</div>
          </div>
          <div className="small muted">4 template per matrimonio · stile e tono fissi al lancio</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginTop: 18 }}>
          {list.map((t) => (
            <TemplateCard key={t.k} t={t} active={template === t.k} onSelect={() => setTemplate(t.k)} />
          ))}
        </div>

        {/* Footer */}
        <div className="row" style={{ marginTop: 36, justifyContent: 'space-between' }}>
          <button className="cer-btn ghost"><I.ChevR s={14} style={{ transform: 'rotate(180deg)' }} /> Indietro</button>
          <button className="cer-btn">Continua con "Toscana" <I.ChevR s={14} /></button>
        </div>
      </div>
    </AppShell>
  );
}

function TemplateCard({ t, active, onSelect }) {
  return (
    <div onClick={onSelect} style={{
      border: '1px solid ' + (active ? 'var(--ink)' : 'var(--bone-200)'),
      borderRadius: 14, overflow: 'hidden',
      background: 'var(--bone-50)', cursor: 'pointer',
      boxShadow: active ? '0 0 0 3px var(--bone-200)' : 'none',
    }}>
      {/* preview */}
      <div style={{
        aspectRatio: '3 / 4',
        background: `linear-gradient(160deg, color-mix(in oklch, ${t.accent} 10%, var(--bone-50)), var(--bone-50))`,
        padding: 22, display: 'flex', flexDirection: 'column',
        borderBottom: '1px solid var(--bone-200)',
      }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: t.accent, textAlign: 'center' }}>
          C E R I M O N I A   ·   12.09.2026
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div>
            <div className="serif" style={{ fontSize: 14, color: 'var(--ink-500)', fontStyle: 'italic' }}>Con gioia</div>
            <div className="serif" style={{
              fontSize: 32, lineHeight: 1.05, marginTop: 8,
              color: t.accent, letterSpacing: '-0.01em',
            }}>
              <em>Giulia</em><br/>
              <span style={{ fontSize: 14, color: 'var(--ink-500)', fontStyle: 'italic' }}>e</span><br/>
              <em>Tommaso</em>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: 'var(--ink-500)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
          Villa Erba · Cernobbio
        </div>
      </div>
      <div style={{ padding: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{t.name}</div>
          {active && <span className="pill confirm"><span className="cer-dot"/>Scelto</span>}
        </div>
        <div className="small muted" style={{ marginTop: 2 }}>{t.tone}</div>
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingScreen });
