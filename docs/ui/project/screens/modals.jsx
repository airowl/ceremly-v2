// Standard modals — dialog system for Ceremly ("Soft Meadow")
// Each artboard renders a dimmed backdrop with the dialog centred,
// as it would appear over the app shell.

// ── Shell ────────────────────────────────────────────────────────
function ModalBackdrop({ children, pad = 48 }) {
  return (
    <div className="cer" style={{
      position: 'absolute', inset: 0,
      background: 'rgba(63,54,34,0.42)',
      backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: pad,
    }}>
      {children}
    </div>
  );
}

function ModalCard({ width = 480, children }) {
  return (
    <div style={{
      width, maxWidth: '100%',
      background: 'var(--bone-50)',
      border: '2px solid var(--ink)',
      borderRadius: 'var(--r-lg)',
      boxShadow: '8px 8px 0 var(--ink)',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function CloseBtn() {
  return (
    <button style={{
      width: 34, height: 34, flexShrink: 0,
      border: '1px solid var(--line)', borderRadius: 8,
      background: 'var(--bone-50)', color: 'var(--ink-500)',
      display: 'grid', placeItems: 'center', cursor: 'pointer',
    }}><I.X s={16} /></button>
  );
}

function ModalHeader({ tag, title, onClose = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '22px 24px 0' }}>
      <div>
        {tag && (
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)', marginBottom: 6 }}>{tag}</div>
        )}
        <div className="serif" style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.025em' }}>{title}</div>
      </div>
      {onClose && <CloseBtn />}
    </div>
  );
}

function ModalFooter({ children }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', gap: 10,
      padding: '16px 24px',
      borderTop: '1px solid var(--line)',
      background: 'var(--bone)',
    }}>{children}</div>
  );
}

// Round icon badge
function IconBadge({ icon: Ico, bg, fg, ring }) {
  return (
    <div style={{
      width: 48, height: 48, borderRadius: 12, flexShrink: 0,
      background: bg, color: fg,
      border: `1.5px solid ${ring || 'transparent'}`,
      display: 'grid', placeItems: 'center',
    }}><Ico s={24} /></div>
  );
}

// Destructive button variant
const dangerBtn = {
  fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13,
  padding: '12px 22px', borderRadius: 'var(--r-sm)',
  border: '2px solid var(--ink)', background: 'var(--decline)', color: '#fff',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
  boxShadow: 'var(--hard-sm)',
};

// ── M1 · Destructive confirm ─────────────────────────────────────
function ModalDestructive() {
  return (
    <ModalBackdrop>
      <ModalCard width={464}>
        <ModalHeader tag="Azione irreversibile" title="Eliminare l'evento?" />
        <div style={{ padding: '16px 24px 24px' }}>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <IconBadge icon={I.Trash}
              bg="color-mix(in srgb, var(--decline) 12%, white)"
              fg="var(--decline)"
              ring="color-mix(in srgb, var(--decline) 26%, transparent)" />
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>
              Stai per eliminare <strong style={{ color: 'var(--ink)' }}>«Matrimonio · Giulia &amp; Tommaso»</strong>.
              Verranno rimossi <strong style={{ color: 'var(--ink)' }}>142 ospiti</strong>, tutte le risposte RSVP
              e i link già condivisi smetteranno di funzionare.
            </p>
          </div>
          <div style={{
            marginTop: 16, padding: '11px 14px',
            background: 'color-mix(in srgb, var(--decline) 8%, white)',
            border: '1px solid color-mix(in srgb, var(--decline) 22%, transparent)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13, color: '#6E1E0C', lineHeight: 1.5,
          }}>
            Scrivi <strong className="mono">ELIMINA</strong> per confermare.
          </div>
          <input className="cer-input" placeholder="ELIMINA" style={{ marginTop: 10 }} />
        </div>
        <ModalFooter>
          <button className="cer-btn ghost">Annulla</button>
          <button style={dangerBtn}><I.Trash s={14} /> Elimina evento</button>
        </ModalFooter>
      </ModalCard>
    </ModalBackdrop>
  );
}

// ── M2 · Form dialog (add guest) ─────────────────────────────────
function ModalForm() {
  const groups = ['Famiglia', 'Amici', 'Colleghi', 'Altro'];
  return (
    <ModalBackdrop>
      <ModalCard width={500}>
        <ModalHeader tag="Lista ospiti" title="Aggiungi ospite" />
        <div style={{ padding: '18px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="mono" style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Nome e cognome</label>
            <input className="cer-input" defaultValue="Giulia Ferrari" style={{ marginTop: 7 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="mono" style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Email o telefono</label>
              <input className="cer-input" placeholder="giulia@email.it" style={{ marginTop: 7 }} />
            </div>
            <div>
              <label className="mono" style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Accompagnatori</label>
              <input className="cer-input" defaultValue="1" style={{ marginTop: 7 }} />
            </div>
          </div>
          <div>
            <label className="mono" style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Gruppo</label>
            <div className="row" style={{ gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
              {groups.map((g, i) => (
                <button key={g} className="cer-btn ghost small" style={{
                  background: i === 0 ? 'var(--purple)' : 'transparent',
                  borderColor: 'var(--ink)',
                  fontFamily: 'var(--font-sans)', fontWeight: 500,
                }}>{g}</button>
              ))}
            </div>
          </div>
          <label className="row" style={{ gap: 9, fontSize: 13.5, color: 'var(--ink-700)', cursor: 'pointer', marginTop: 2 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, border: '1.5px solid var(--ink)', background: 'var(--purple)', display: 'grid', placeItems: 'center', color: 'var(--ink)' }}><I.Check s={13} /></span>
            Invia subito il link d'invito
          </label>
        </div>
        <ModalFooter>
          <button className="cer-btn ghost">Annulla</button>
          <button className="cer-btn"><I.Plus s={14} /> Aggiungi ospite</button>
        </ModalFooter>
      </ModalCard>
    </ModalBackdrop>
  );
}

// ── M3 · Success ─────────────────────────────────────────────────
function ModalSuccess() {
  return (
    <ModalBackdrop>
      <ModalCard width={420}>
        <div style={{ padding: '36px 32px 28px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto',
            background: 'color-mix(in srgb, var(--confirm) 16%, white)',
            border: '2px solid var(--confirm)', color: 'var(--confirm)',
            display: 'grid', placeItems: 'center',
          }}><I.Check s={32} sw={2.2} /></div>
          <div className="serif" style={{ fontSize: 28, fontWeight: 800, marginTop: 20, letterSpacing: '-0.025em' }}>120 inviti inviati</div>
          <p style={{ margin: '10px auto 0', maxWidth: 300, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>
            I link sono partiti via WhatsApp ed email. Riceverai una notifica a ogni nuova risposta RSVP.
          </p>
        </div>
        <ModalFooter>
          <button className="cer-btn ghost">Torna alla lista</button>
          <button className="cer-btn"><I.Chart s={14} /> Vedi andamento</button>
        </ModalFooter>
      </ModalCard>
    </ModalBackdrop>
  );
}

// ── M4 · Share ───────────────────────────────────────────────────
function ModalShare() {
  const channels = [
    { l: 'WhatsApp', i: I.Whatsapp },
    { l: 'Email',    i: I.Mail },
    { l: 'Copia',    i: I.Copy },
  ];
  return (
    <ModalBackdrop>
      <ModalCard width={476}>
        <ModalHeader tag="Distribuzione" title="Condividi l'invito" />
        <div style={{ padding: '18px 24px 24px' }}>
          <label className="mono" style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Link pubblico</label>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input className="cer-input" readOnly defaultValue="ceremly.it/giulia-tommaso" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }} />
            <button className="cer-btn small" style={{ flexShrink: 0, padding: '10px 14px' }}><I.Copy s={14} /></button>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 16 }}>
            {channels.map((c) => (
              <button key={c.l} className="cer-btn ghost" style={{
                flex: 1, flexDirection: 'column', gap: 7, padding: '14px 0',
                fontFamily: 'var(--font-sans)', fontWeight: 500, fontSize: 13,
              }}><c.i s={20} />{c.l}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 18, padding: 16, background: 'var(--bone-100)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
            <div style={{ width: 76, height: 76, flexShrink: 0, background: 'var(--bone-50)', border: '1.5px solid var(--ink)', borderRadius: 8, color: 'var(--ink)', display: 'grid', placeItems: 'center' }}><I.QR s={48} /></div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Codice QR</div>
              <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-500)' }}>Da stampare su partecipazioni o save-the-date.</p>
              <button className="cer-btn ghost small" style={{ marginTop: 8 }}><I.Upload s={13} /> Scarica PNG</button>
            </div>
          </div>
        </div>
      </ModalCard>
    </ModalBackdrop>
  );
}

// ── M5 · Upgrade / limit ─────────────────────────────────────────
function ModalUpgrade() {
  return (
    <ModalBackdrop>
      <ModalCard width={460}>
        <ModalHeader tag="Piano Free" title="Hai raggiunto 100 ospiti" />
        <div style={{ padding: '16px 24px 24px' }}>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <IconBadge icon={I.Sparkle} bg="var(--wine-soft)" fg="var(--purple-bright)" ring="color-mix(in srgb, var(--purple) 34%, transparent)" />
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>
              Il piano Free copre fino a 100 ospiti per evento. Passa a <strong style={{ color: 'var(--ink)' }}>Pro</strong> per ospiti illimitati, reminder automatici e dominio personalizzato.
            </p>
          </div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {['Ospiti illimitati', 'Reminder automatici via WhatsApp', 'Dominio e branding personalizzati'].map((f) => (
              <div key={f} className="row" style={{ gap: 9, fontSize: 13.5, color: 'var(--ink-700)' }}>
                <span style={{ color: 'var(--confirm)' }}><I.Check s={16} /></span>{f}
              </div>
            ))}
          </div>
        </div>
        <ModalFooter>
          <button className="cer-btn ghost">Più tardi</button>
          <button className="cer-btn"><I.Sparkle s={14} /> Passa a Pro · 9€/mese</button>
        </ModalFooter>
      </ModalCard>
    </ModalBackdrop>
  );
}

// ── M6 · Unsaved changes ─────────────────────────────────────────
function ModalUnsaved() {
  return (
    <ModalBackdrop>
      <ModalCard width={440}>
        <ModalHeader tag="Editor invito" title="Uscire senza salvare?" />
        <div style={{ padding: '16px 24px 24px' }}>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <IconBadge icon={I.Edit} bg="var(--orange-soft)" fg="var(--orange-deep)" ring="color-mix(in srgb, var(--orange) 32%, transparent)" />
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-700)' }}>
              Hai modifiche non salvate al testo e alla copertina dell'invito. Se esci ora andranno perse.
            </p>
          </div>
        </div>
        <ModalFooter>
          <button className="cer-btn ghost">Esci comunque</button>
          <button className="cer-btn"><I.Check s={14} /> Salva e esci</button>
        </ModalFooter>
      </ModalCard>
    </ModalBackdrop>
  );
}

Object.assign(window, {
  ModalDestructive, ModalForm, ModalSuccess, ModalShare, ModalUpgrade, ModalUnsaved,
});
