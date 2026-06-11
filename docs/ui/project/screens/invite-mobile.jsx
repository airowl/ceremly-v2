// Guest-side mobile invitation view (what Anna sees on her phone)
function InviteMobile() {
  return (
    <div className="cer" style={{
      background: 'linear-gradient(180deg, var(--wine-soft) 0%, var(--bone) 30%)',
      minHeight: '100%',
      fontFamily: 'var(--font-display)',
      color: 'var(--ink)',
    }}>
      {/* Salutation banner — personalized */}
      <div style={{ padding: '60px 22px 8px', textAlign: 'center' }}>
        <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--wine)' }}>
          C A R A   A N N A
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
        <div style={{ fontStyle: 'italic', fontSize: 15, color: 'var(--ink-500)' }}>
          con gioia annunciamo il matrimonio di
        </div>
        <div style={{
          fontSize: 60, lineHeight: 1.0, marginTop: 14,
          color: 'var(--wine-deep)', letterSpacing: '-0.015em',
        }}>
          <em>Giulia</em>
          <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--ink-500)', margin: '6px 0' }}>e</div>
          <em>Tommaso</em>
        </div>
        <div className="mono" style={{
          fontFamily: 'var(--font-mono)', marginTop: 20, fontSize: 11,
          letterSpacing: '0.16em', color: 'var(--ink-700)',
        }}>
          1 2 · 0 9 · 2 0 2 6
        </div>
        <div style={{ marginTop: 2, fontSize: 12, fontStyle: 'italic', color: 'var(--ink-500)' }}>
          ore 16:00 · Villa Erba, Cernobbio
        </div>
      </div>

      {/* Countdown ring */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
        <CountdownRing days={115} />
      </div>

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '36px 28px 24px' }} />

      {/* Personal message */}
      <div style={{ padding: '0 28px', textAlign: 'center' }}>
        <p style={{
          fontSize: 17, lineHeight: 1.55, fontStyle: 'italic',
          color: 'var(--ink-700)', margin: 0,
        }}>
          Dopo anni a coltivare la stessa felicità, vogliamo celebrarla con le persone che l'hanno resa possibile. Ci sei tu.
        </p>
      </div>

      {/* Program */}
      <div style={{ padding: '36px 28px 0' }}>
        <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--wine)', textAlign: 'center' }}>
          I L   G I O R N O
        </div>
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { t: '16:00', l: 'Cerimonia',    s: 'Chiesa di S. Maria' },
            { t: '17:30', l: 'Aperitivo',    s: 'Terrazza panoramica' },
            { t: '19:30', l: 'Cena',         s: 'Sala degli Affreschi' },
            { t: '22:00', l: 'Festa',        s: 'fino a tarda notte' },
          ].map((it) => (
            <div key={it.t} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div className="mono" style={{
                fontFamily: 'var(--font-mono)', fontSize: 12,
                color: 'var(--wine-deep)', width: 50, paddingTop: 2,
              }}>{it.t}</div>
              <div>
                <div style={{ fontSize: 19 }}>{it.l}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-500)' }}>{it.s}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Location */}
      <div style={{ padding: '32px 28px 0' }}>
        <div style={{
          padding: 18, borderRadius: 12,
          background: 'var(--bone-50)', border: '1px solid var(--bone-200)',
        }}>
          <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--wine)' }}>D O V E</div>
          <div style={{ fontSize: 23, marginTop: 8 }}>Villa Erba</div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-500)' }}>
            Largo L. Visconti 4, Cernobbio (CO)
          </div>
          <div style={{
            marginTop: 12, height: 110,
            background: `repeating-linear-gradient(135deg, var(--bone-200), var(--bone-200) 2px, var(--bone-100) 2px, var(--bone-100) 6px)`,
            borderRadius: 8, position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-500)',
            }}>mappa Google Maps</div>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-100%)', color: 'var(--wine)',
            }}><I.Pin s={22} /></div>
          </div>
          <button style={{
            marginTop: 12, width: '100%',
            padding: '10px 16px',
            background: 'var(--bone-100)', color: 'var(--ink)',
            border: '1px solid var(--bone-200)', borderRadius: 8,
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
          }}>Apri in Google Maps</button>
        </div>
      </div>

      {/* Dress code */}
      <div style={{ padding: '24px 28px 0', textAlign: 'center' }}>
        <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--wine)' }}>D R E S S   C O D E</div>
        <div style={{ fontSize: 22, marginTop: 6 }}>Elegante, toni pastello</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
          niente bianco · scarpe comode consigliate
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--bone-200)', margin: '36px 28px 28px' }} />

      {/* RSVP CTA — sticky-ish at bottom */}
      <div style={{ padding: '0 28px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 22 }}>Ci sarai?</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-500)', marginTop: 4 }}>
          Conferma entro il 15 luglio · ci servono 30 secondi
        </div>
        <button style={{
          marginTop: 18, width: '100%',
          padding: '14px',
          background: 'var(--wine)', color: 'var(--ink)',
          border: 'none', borderRadius: 14,
          fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 500,
          letterSpacing: '0.02em',
        }}>
          Rispondi all'invito
        </button>
        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-400)', letterSpacing: '0.06em' }}>
          ceremly.app · creato con cura
        </div>
      </div>
    </div>
  );
}

function CountdownRing({ days }) {
  const size = 132, r = 56, c = 2 * Math.PI * r;
  const progress = 1 - days / 365;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bone-200)" strokeWidth="1.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--wine)" strokeWidth="1.5"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 36, color: 'var(--wine-deep)', lineHeight: 1 }}>{days}</div>
        <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', color: 'var(--ink-500)', textTransform: 'uppercase', marginTop: 4 }}>
          giorni al sì
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { InviteMobile, CountdownRing });
