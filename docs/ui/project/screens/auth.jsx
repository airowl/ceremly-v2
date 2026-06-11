// Auth screens — Login e Registrazione.
// Layout split: pannello editoriale a sinistra (wine), form a destra (bone).

function AuthShell({ side, children }) {
  return (
    <div className="cer" style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 1.1fr', background: 'var(--bone)' }}>
      {/* PANNELLO EDITORIALE */}
      <div style={{
        background: 'var(--ink)',
        color: '#fff',
        padding: '48px 56px',
        borderRight: '2px solid var(--ink)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* decoro */}
        <div style={{
          position: 'absolute', right: -110, top: -90, width: 320, height: 320,
          borderRadius: '50%',
          background: 'var(--purple-bright)',
          opacity: 0.7,
        }} />
        <div style={{
          position: 'absolute', right: 90, bottom: -60, width: 150, height: 150,
          borderRadius: '50%', background: 'var(--orange)', opacity: 0.9,
        }} />
        <div className="row" style={{ gap: 7, position: 'relative' }}>
          <span className="serif" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>Ceremly</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
        </div>

        <div style={{ position: 'relative' }}>
          <div className="mono" style={{ fontSize: 12, letterSpacing: '0.1em', color: 'var(--blue-soft)', textTransform: 'uppercase' }}>
            {side.label}
          </div>
          <div className="serif" style={{ fontSize: 58, fontWeight: 800, lineHeight: 0.98, marginTop: 16, letterSpacing: '-0.04em' }}>
            {side.title}
          </div>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, marginTop: 18, maxWidth: 380 }}>
            {side.body}
          </p>

          {side.quote && (
            <div style={{
              marginTop: 40, padding: '20px 22px',
              background: 'rgba(255,255,255,0.10)',
              borderRadius: 14, border: '2px solid var(--ink)',
              maxWidth: 380,
            }}>
              <p className="serif" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.35, margin: 0, letterSpacing: '-0.01em' }}>
                {side.quote.text}
              </p>
              <div className="row" style={{ gap: 10, marginTop: 14 }}>
                <div className="av lg" style={{ background: 'var(--orange)', color: 'var(--ink)', borderColor: 'var(--ink)' }}>{side.quote.av}</div>
                <div className="col">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{side.quote.who}</span>
                  <span className="small" style={{ color: 'rgba(255,255,255,0.7)' }}>{side.quote.where}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mono" style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.06em', position: 'relative' }}>
          v0.1 · {side.foot}
        </div>
      </div>

      {/* FORM */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children, hint }) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>{label}</span>
        {hint && <span className="small" style={{ color: 'var(--wine)', cursor: 'pointer' }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function SocialRow() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <button className="cer-btn ghost" style={{ justifyContent: 'center', padding: '11px 12px', fontSize: 13 }}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 11v3.2h5.3c-.2 1.4-1.6 4-5.3 4-3.2 0-5.8-2.6-5.8-5.9s2.6-5.9 5.8-5.9c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 4 14.5 3 12 3 6.9 3 2.8 7.1 2.8 12.2S6.9 21.4 12 21.4c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.9-.1-1.3H12z"/></svg>
        Continua con Google
      </button>
      <button className="cer-btn ghost" style={{ justifyContent: 'center', padding: '11px 12px', fontSize: 13 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 12.6c0-2.7 2.2-4 2.3-4-1.2-1.8-3.2-2.1-3.9-2.1-1.7-.2-3.3 1-4.1 1-.9 0-2.2-1-3.6-.9-1.9 0-3.6 1.1-4.5 2.7-1.9 3.4-.5 8.4 1.4 11.1.9 1.3 2 2.8 3.5 2.7 1.4-.1 1.9-.9 3.6-.9s2.1.9 3.6.9c1.5 0 2.4-1.3 3.3-2.7 1.1-1.5 1.5-3 1.5-3.1-.1 0-2.9-1.1-3-4.4M14.7 4.6c.8-.9 1.3-2.2 1.1-3.5-1.1.1-2.4.7-3.2 1.6-.7.8-1.4 2.1-1.2 3.4 1.2.1 2.4-.6 3.3-1.5"/></svg>
        Continua con Apple
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div className="row" style={{ gap: 12, margin: '20px 0', alignItems: 'center' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--bone-200)' }} />
      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-400)', letterSpacing: '0.08em' }}>OPPURE</span>
      <div style={{ flex: 1, height: 1, background: 'var(--bone-200)' }} />
    </div>
  );
}

/* ─────────────────────────────────  LOGIN  */
function LoginScreen() {
  return (
    <AuthShell side={{
      label: 'Accedi',
      title: <span>Bentornato.<br />Gli ospiti<br /><span style={{ color: '#fff', textDecoration: 'underline', textDecorationColor: 'var(--orange)', textDecorationThickness: 4, textUnderlineOffset: 6 }}>ti aspettano</span>.</span>,
      body: 'Riprendi da dove avevi lasciato — i tuoi eventi, gli RSVP e i promemoria sono tutti qui.',
      quote: {
        text: '“In due settimane di RSVP ho recuperato dieci ore della mia vita.”',
        av: 'GT', who: 'Giulia T.', where: 'Matrimonio · Cernobbio',
      },
      foot: 'Server in UE · GDPR',
    }}>
      <div className="serif" style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Accedi a Ceremly</div>
      <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 8 }}>
        Nuovo qui? <span style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 600 }}>Crea un account →</span>
      </p>

      <div style={{ marginTop: 32 }}>
        <SocialRow />
        <Divider />

        <div className="col" style={{ gap: 16 }}>
          <FormField label="Email">
            <input className="cer-input" type="email" defaultValue="giulia.tommasi@gmail.com" />
          </FormField>
          <FormField label="Password" hint="Password dimenticata?">
            <input className="cer-input" type="password" defaultValue="••••••••••••" />
          </FormField>

          <label className="row" style={{ gap: 8, fontSize: 13, color: 'var(--ink-700)' }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--purple)' }} />
            Resta connesso su questo dispositivo
          </label>

          <button className="cer-btn" style={{ width: '100%', justifyContent: 'center', padding: '13px 16px', marginTop: 4 }}>
            Accedi
          </button>
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 24, fontSize: 12, color: 'var(--ink-500)' }}>
          <I.Check s={12} /> Protetto da crittografia end-to-end sui dati ospiti
        </div>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────────────  REGISTER  */
function RegisterScreen() {
  return (
    <AuthShell side={{
      label: 'Registrati',
      title: <span>Inizia<br />a invitare.<br /><span style={{ color: '#fff', textDecoration: 'underline', textDecorationColor: 'var(--orange)', textDecorationThickness: 4, textUnderlineOffset: 6 }}>Trenta ospiti</span><br />gratis, sempre.</span>,
      body: 'Crea il tuo primo evento in cinque minuti. Niente carta richiesta — paghi solo se decidi di crescere.',
      quote: {
        text: '“Cinque minuti per creare l\'invito. Cinque giorni per ricevere tutte le risposte.”',
        av: 'AM', who: 'Andrea M.', where: 'Laurea magistrale · Bologna',
      },
      foot: 'Fino a 30 ospiti gratis',
    }}>
      <div className="serif" style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Crea il tuo account</div>
      <p style={{ fontSize: 14, color: 'var(--ink-500)', marginTop: 8 }}>
        Hai già un account? <span style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 600 }}>Accedi →</span>
      </p>

      <div style={{ marginTop: 28 }}>
        <SocialRow />
        <Divider />

        <div className="col" style={{ gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Nome">
              <input className="cer-input" type="text" defaultValue="Giulia" />
            </FormField>
            <FormField label="Cognome">
              <input className="cer-input" type="text" defaultValue="Tommasi" />
            </FormField>
          </div>
          <FormField label="Email">
            <input className="cer-input" type="email" defaultValue="giulia.tommasi@gmail.com" />
          </FormField>
          <FormField label="Password">
            <input className="cer-input" type="password" defaultValue="••••••••••••" />
            <div className="row" style={{ gap: 4, marginTop: 6 }}>
              <span style={{ flex: 1, height: 3, background: 'var(--confirm)', borderRadius: 2 }} />
              <span style={{ flex: 1, height: 3, background: 'var(--confirm)', borderRadius: 2 }} />
              <span style={{ flex: 1, height: 3, background: 'var(--confirm)', borderRadius: 2 }} />
              <span style={{ flex: 1, height: 3, background: 'var(--bone-200)', borderRadius: 2 }} />
            </div>
            <span className="small muted" style={{ marginTop: 4 }}>Robusta — 12 caratteri, 1 numero, 1 simbolo.</span>
          </FormField>

          <FormField label="Tipo di evento principale">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {[
                { k: 'Matrimonio', i: I.Ring, on: true },
                { k: 'Laurea',     i: I.Cap },
                { k: 'Battesimo',  i: I.Cross },
                { k: 'Compleanno', i: I.Cake },
              ].map((c) => (
                <div key={c.k} style={{
                  border: '2px solid var(--ink)',
                  background: c.on ? 'var(--purple)' : 'var(--bone-50)',
                  color: c.on ? 'var(--ink)' : 'var(--ink-700)',
                  borderRadius: 10,
                  padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                  boxShadow: c.on ? '3px 3px 0 var(--ink)' : 'none',
                }}>
                  <c.i s={18} />
                  <div style={{ fontSize: 11, marginTop: 4 }}>{c.k}</div>
                </div>
              ))}
            </div>
          </FormField>

          <label className="row" style={{ gap: 8, fontSize: 12, color: 'var(--ink-700)', alignItems: 'flex-start', marginTop: 6 }}>
            <input type="checkbox" defaultChecked style={{ accentColor: 'var(--purple)', marginTop: 2 }} />
            <span>Accetto i <span style={{ color: 'var(--purple)', fontWeight: 600 }}>Termini</span> e l'<span style={{ color: 'var(--purple)', fontWeight: 600 }}>informativa privacy</span>. Riceverò consigli sull'organizzazione (non più di uno al mese).</span>
          </label>

          <button className="cer-btn wine" style={{ width: '100%', justifyContent: 'center', padding: '13px 16px', marginTop: 8 }}>
            <I.Sparkle s={14} /> Crea account · gratis
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

Object.assign(window, { LoginScreen, RegisterScreen });
