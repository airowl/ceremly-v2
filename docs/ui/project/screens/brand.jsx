// Brand showcase — "Vibrant Spontaneity" design system at a glance.
function BrandShowcase() {
  const palette = [
    { name: 'Primary',  v: '#d4a373', on: '#3F3622',  mono: '#d4a373' },
    { name: 'Camel+',   v: '#c28c54', on: '#fff',     mono: '#c28c54' },
    { name: 'Sage',     v: '#ccd5ae', on: '#3F3622',  mono: '#ccd5ae' },
    { name: 'Pale',     v: '#e9edc9', on: '#3F3622',  mono: '#e9edc9' },
    { name: 'Sand',     v: '#faedcd', on: '#3F3622',  mono: '#faedcd' },
    { name: 'Canvas',   v: '#fefae0', on: '#3F3622',  mono: '#fefae0' },
  ];

  return (
    <div className="cer" style={{ padding: 56, height: '100%', overflow: 'auto', background: 'var(--bone)' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', gap: 56, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--orange)' }}>Soft Meadow</span>
          </div>
          <div className="serif" style={{ fontSize: 90, fontWeight: 800, lineHeight: 0.95, marginTop: 12, letterSpacing: '-0.045em' }}>
            Inviti che<br />fanno <span style={{ color: 'var(--purple)' }}>rumore</span>.
          </div>
          <p style={{ maxWidth: 540, marginTop: 22, fontSize: 18, lineHeight: 1.55, color: 'var(--ink-700)' }}>
            Una piattaforma italiana per inviti digitali e RSVP intelligenti — bold, diretta,
            senza fronzoli. Per chi preferisce la connessione vera alla perfezione patinata.
          </p>
          <div className="row" style={{ marginTop: 28, gap: 12 }}>
            <button className="cer-btn" style={{ whiteSpace: 'nowrap' }}><I.Sparkle s={14} /> Inizia un evento</button>
            <button className="cer-btn ghost" style={{ whiteSpace: 'nowrap' }}>Guarda la demo</button>
          </div>

          {/* type specimen */}
          <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <div className="cer-card" style={{ padding: 18 }}>
              <div className="serif" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1 }}>Aa</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Bricolage Grotesque</div>
              <div className="small muted" style={{ marginTop: 2 }}>Display · 800 · poster</div>
            </div>
            <div className="cer-card" style={{ padding: 18 }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 38, fontWeight: 500, lineHeight: 1 }}>Aa</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Be Vietnam Pro</div>
              <div className="small muted" style={{ marginTop: 2 }}>Body · 400–600</div>
            </div>
            <div className="cer-card" style={{ padding: 18 }}>
              <div className="mono" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>Aa</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>Space Mono</div>
              <div className="small muted" style={{ marginTop: 2 }}>Label · metadati · tech</div>
            </div>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* palette */}
          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Palette</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 12 }}>
              {palette.map((s) => (
                <div key={s.name} className="col" style={{ gap: 6 }}>
                  <div style={{ background: s.v, height: 54, borderRadius: 8, border: '1px solid var(--line)', display: 'flex', alignItems: 'flex-end', padding: 7 }}>
                    <span className="mono" style={{ fontSize: 9, color: s.on }}>{s.mono}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* components */}
          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Componenti</div>
            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="cer-btn small">Primario</button>
              <button className="cer-btn small ghost">Ghost</button>
              <span className="pill confirm"><span className="cer-dot" />Conferma</span>
              <span className="pill pending"><span className="cer-dot" />In attesa</span>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <span className="cer-tag" style={{ background: 'var(--orange-soft)', color: 'var(--orange-deep)', borderColor: 'transparent' }}>Live now</span>
              <span className="cer-tag" style={{ background: 'var(--blue-soft)', color: 'var(--blue-deep)', borderColor: 'transparent' }}>Popular</span>
              <span className="cer-tag">v0.1</span>
            </div>
            <input className="cer-input" placeholder="Campo con focus hard-shadow" style={{ marginTop: 14 }} />
          </div>

          {/* categories */}
          <div className="cer-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>Categorie evento</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 12 }}>
              {[
                { k: 'Matrimonio', i: I.Ring },
                { k: 'Laurea',     i: I.Cap },
                { k: 'Battesimo',  i: I.Cross },
                { k: 'Compleanno', i: I.Cake },
              ].map((c) => (
                <div key={c.k} style={{
                  border: '1px solid var(--line)', borderRadius: 10,
                  padding: 12, textAlign: 'center', background: 'var(--bone)',
                }}>
                  <div style={{ color: 'var(--purple)' }}><c.i s={22} /></div>
                  <div style={{ fontSize: 11, marginTop: 6, color: 'var(--ink-700)' }}>{c.k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 48, paddingTop: 24,
        borderTop: '1px solid var(--line)',
        display: 'flex', gap: 40, color: 'var(--ink-500)', fontSize: 13, flexWrap: 'wrap',
      }}>
        <span className="mono" style={{ fontSize: 12 }}>v0.1 · MVP</span>
        <span style={{ color: 'var(--ink-300)' }}>—</span>
        <span>Hard shadows · crisp outlines · tonal layers</span>
        <span style={{ color: 'var(--ink-300)' }}>—</span>
        <span>8px grid · radius 8 / 16</span>
        <span style={{ color: 'var(--ink-300)' }}>—</span>
        <span>WCAG 2.1 AA</span>
      </div>
    </div>
  );
}
Object.assign(window, { BrandShowcase });
