// Mobile RSVP form — the guest's step-by-step response flow
function RSVPMobile() {
  // Multi-step form view, shown in a single scrollable artboard to mimic the journey
  return (
    <div className="cer" style={{
      background: 'var(--bone)', minHeight: '100%',
      fontFamily: 'var(--font-sans)', color: 'var(--ink)',
    }}>
      {/* Sticky top */}
      <div style={{
        padding: '52px 22px 18px',
        borderBottom: '1px solid var(--bone-200)',
        background: 'var(--bone)',
      }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="serif" style={{ fontSize: 18 }}>Giulia & Tommaso</div>
          <button className="mono small muted" style={{ background: 'none', border: 'none' }}>chiudi</button>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 4 }}>
          {[1,1,1,0,0].map((on, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 999,
              background: on ? 'var(--wine)' : 'var(--bone-200)',
            }} />
          ))}
        </div>
        <div className="mono small muted" style={{ marginTop: 8, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: 10 }}>
          Domanda 3 di 5
        </div>
      </div>

      {/* Question */}
      <div style={{ padding: '28px 22px 0' }}>
        <div className="serif" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
          Anna, ci sarai con noi?
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          La tua presenza è importante.
        </div>

        <div className="col" style={{ gap: 10, marginTop: 22 }}>
          {[
            { l: 'Sì, ci sarò',         s: 'non vediamo l\'ora',  on: true,  c: 'var(--wine)' },
            { l: 'No, mi dispiace',     s: 'sarai con noi col cuore', on: false, c: 'var(--ink-400)' },
            { l: 'Non ancora sicuro',   s: 'potrai aggiornare la risposta', on: false, c: 'var(--ink-400)' },
          ].map((o) => (
            <div key={o.l} style={{
              padding: 16, borderRadius: 14,
              border: '1.5px solid ' + (o.on ? 'var(--wine)' : 'var(--bone-200)'),
              background: o.on ? 'var(--wine-soft)' : 'var(--bone-50)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: '1.5px solid ' + (o.on ? 'var(--wine)' : 'var(--ink-300)'),
                background: o.on ? 'var(--wine)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink)',
                flexShrink: 0,
              }}>
                {o.on && <I.Check s={12} sw={3} />}
              </div>
              <div className="col" style={{ lineHeight: 1.3 }}>
                <span style={{ fontSize: 16, fontWeight: 500, color: o.on ? 'var(--wine-deep)' : 'var(--ink)' }}>{o.l}</span>
                <span className="small" style={{ color: o.on ? 'var(--wine-deep)' : 'var(--ink-500)' }}>{o.s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conditional follow-up */}
      <div style={{ padding: '40px 22px 0' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--wine-deep)' }}>
            mostrata perché hai risposto Sì
          </span>
        </div>
        <div className="serif" style={{ fontSize: 26, marginTop: 14, lineHeight: 1.2 }}>
          Quanti accompagnatori?
        </div>
        <div className="row" style={{ marginTop: 18, gap: 8 }}>
          {[0, 1, 2, 3, 4].map((n) => (
            <button key={n} style={{
              flex: 1, height: 56, borderRadius: 14,
              border: '1.5px solid ' + (n === 1 ? 'var(--ink)' : 'var(--bone-200)'),
              background: n === 1 ? 'var(--ink)' : 'var(--bone-50)',
              color: n === 1 ? 'var(--bone-50)' : 'var(--ink)',
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              cursor: 'pointer',
            }}>{n}</button>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Hai dichiarato 1 accompagnatore. Ti chiederemo i suoi dati nei prossimi passaggi.
        </div>
      </div>

      {/* Per-person menu preview */}
      <div style={{ padding: '40px 22px 0' }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="cer-tag" style={{ background: 'var(--sage-soft)', color: 'var(--blue-deep)', borderColor: 'transparent' }}>
            per ogni persona
          </span>
        </div>
        <div className="serif" style={{ fontSize: 22, marginTop: 14 }}>
          Menu di <em>Anna</em>
        </div>
        <div className="col" style={{ gap: 8, marginTop: 14 }}>
          {[
            { l: 'Carne', on: false },
            { l: 'Pesce', on: true },
            { l: 'Vegetariano', on: false },
            { l: 'Vegano', on: false },
          ].map((o) => (
            <div key={o.l} className="row" style={{
              padding: '14px 16px', borderRadius: 12,
              border: '1.5px solid ' + (o.on ? 'var(--ink)' : 'var(--bone-200)'),
              background: o.on ? 'var(--bone-100)' : 'var(--bone-50)',
              gap: 12,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '1.5px solid ' + (o.on ? 'var(--ink)' : 'var(--ink-300)'),
                background: o.on ? 'var(--ink)' : 'transparent',
                position: 'relative',
              }}>
                {o.on && <span style={{ position: 'absolute', inset: 4, background: 'var(--bone-50)', borderRadius: '50%' }} />}
              </div>
              <span style={{ fontSize: 15 }}>{o.l}</span>
            </div>
          ))}
        </div>

        <label className="mono small muted" style={{ marginTop: 18, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block' }}>
          Allergie o intolleranze (opzionale)
        </label>
        <input className="cer-input" placeholder="es. lattosio, frutta a guscio…"
          defaultValue="Glutine"
          style={{ marginTop: 6, fontSize: 15, padding: '14px 16px', borderRadius: 12 }} />
      </div>

      {/* Bottom nav */}
      <div style={{ padding: '40px 22px 38px', display: 'flex', gap: 10 }}>
        <button style={{
          padding: '14px 20px',
          background: 'transparent', color: 'var(--ink)',
          border: '1.5px solid var(--bone-200)', borderRadius: 14,
          fontSize: 14, fontWeight: 500,
        }}>Indietro</button>
        <button style={{
          flex: 1, padding: '14px',
          background: 'var(--ink)', color: 'var(--bone-50)',
          border: 'none', borderRadius: 14,
          fontSize: 15, fontWeight: 500,
        }}>Continua</button>
      </div>
    </div>
  );
}

// Mobile confirmation screen (post-RSVP)
function RSVPConfirmMobile() {
  return (
    <div className="cer" style={{
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--confirm) 16%, white) 0%, var(--bone) 40%)',
      minHeight: '100%',
      fontFamily: 'var(--font-display)',
      color: 'var(--ink)',
    }}>
      <div style={{ padding: '88px 24px 0', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'oklch(0.55 0.10 150)', color: 'var(--bone-50)',
          margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <I.Check s={36} sw={2.5} />
        </div>
        <div style={{ fontSize: 38, marginTop: 24, letterSpacing: '-0.01em' }}>
          Ci sarai.
        </div>
        <div style={{ fontStyle: 'italic', color: 'var(--ink-500)', marginTop: 6, fontSize: 16 }}>
          Grazie, Anna.
        </div>
      </div>

      {/* Summary */}
      <div style={{ padding: '36px 24px 0' }}>
        <div className="cer-card" style={{ padding: 22 }}>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>
            Riepilogo
          </div>
          <div className="col" style={{ gap: 12, marginTop: 14, fontFamily: 'var(--font-sans)' }}>
            {[
              { l: 'Partecipazione', v: 'Cerimonia + Ricevimento' },
              { l: 'Persone',        v: 'Anna + Luca (2)' },
              { l: 'Menu Anna',      v: 'Pesce · senza glutine' },
              { l: 'Menu Luca',      v: 'Carne · nessuna allergia' },
              { l: 'Alloggio',       v: 'No, prenotato altrove' },
            ].map((r) => (
              <div key={r.l} className="row" style={{ alignItems: 'flex-start', gap: 12, fontSize: 14 }}>
                <span className="muted small" style={{ width: 100, paddingTop: 1 }}>{r.l}</span>
                <span style={{ flex: 1 }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          marginTop: 20, padding: 18,
          background: 'var(--bone-50)', borderRadius: 14,
          border: '1px solid var(--bone-200)',
          textAlign: 'center',
        }}>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--ink-500)' }}>
            S A L V A   I N   A G E N D A
          </div>
          <div style={{ fontSize: 22, marginTop: 8 }}>12 settembre 2026</div>
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 14, fontFamily: 'var(--font-sans)' }}>
            <button style={{
              padding: '10px 16px', background: 'var(--bone-100)', color: 'var(--ink)',
              border: '1px solid var(--bone-200)', borderRadius: 8, fontSize: 13,
            }}>
              <I.Calendar s={13} /> Google
            </button>
            <button style={{
              padding: '10px 16px', background: 'var(--bone-100)', color: 'var(--ink)',
              border: '1px solid var(--bone-200)', borderRadius: 8, fontSize: 13,
            }}>
              <I.Calendar s={13} /> Apple
            </button>
            <button style={{
              padding: '10px 16px', background: 'var(--bone-100)', color: 'var(--ink)',
              border: '1px solid var(--bone-200)', borderRadius: 8, fontSize: 13,
            }}>
              <I.Calendar s={13} /> ICS
            </button>
          </div>
        </div>

        <div style={{ marginTop: 22, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
          <button style={{
            padding: '10px 16px', background: 'transparent', color: 'var(--ink)',
            border: '1px solid var(--bone-200)', borderRadius: 999, fontSize: 13,
          }}>
            <I.Edit s={12} /> Modifica la risposta
          </button>
        </div>

        <div style={{
          marginTop: 28, textAlign: 'center',
          fontStyle: 'italic', color: 'var(--ink-500)', fontSize: 15,
          fontFamily: 'var(--font-display)',
          padding: '0 20px 36px',
        }}>
          "Ci hai reso felici. Ti aspettiamo."<br />
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontStyle: 'normal', letterSpacing: '0.08em', color: 'var(--ink-400)' }}>
            — Giulia & Tommaso
          </span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RSVPMobile, RSVPConfirmMobile });
