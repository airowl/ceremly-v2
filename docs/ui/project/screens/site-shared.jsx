// Shared scaffolding for public-site sub-pages (footer pages)
// Reuses LandingNav / LandingFooter from landing.jsx.

function SitePage({ children, label }) {
  return (
    <div className="cer" data-screen-label={label} style={{ background: 'var(--bone)' }}>
      <LandingNav />
      {children}
      <LandingFooter />
    </div>
  );
}

/* Page hero — smaller than landing hero, used by every sub-page */
function SiteHero({ tag, tagStyle, title, sub, center, children }) {
  const align = center ? 'center' : 'left';
  return (
    <div style={{ padding: '72px 72px 64px', borderBottom: '1px solid var(--line)', textAlign: align }}>
      {tag && (
        <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent', display: 'inline-flex', ...(tagStyle || {}) }}>
          {tag}
        </span>
      )}
      <h1 className="serif" style={{
        fontSize: 62, fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em',
        margin: center ? '18px auto 0' : '18px 0 0', maxWidth: 900,
      }}>{title}</h1>
      {sub && (
        <p style={{ fontSize: 17, color: 'var(--ink-700)', lineHeight: 1.6, maxWidth: 620, margin: center ? '20px auto 0' : '20px 0 0' }}>
          {sub}
        </p>
      )}
      {children}
    </div>
  );
}

/* In-page section header */
function SiteH2({ tag, tagStyle, title, sub, center }) {
  return (
    <div style={{ textAlign: center ? 'center' : 'left', marginBottom: 40 }}>
      {tag && (
        <span className="cer-tag" style={{ display: 'inline-flex', ...(tagStyle || {}) }}>{tag}</span>
      )}
      <h2 className="serif" style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.035em', margin: '14px 0 0' }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: 'var(--ink-700)', lineHeight: 1.6, maxWidth: 560, margin: center ? '14px auto 0' : '14px 0 0' }}>{sub}</p>}
    </div>
  );
}

/* Dark CTA band — compact version of the landing CTA */
function SiteCTA({ title, sub, primary = 'Inizia gratis', secondary }) {
  return (
    <div style={{ padding: '80px 72px', background: 'var(--ink)', color: '#fff', textAlign: 'center' }}>
      <h2 className="serif" style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em', margin: '0 auto', maxWidth: 820 }}>
        {title || <span>Il tuo prossimo evento <Mark c="var(--orange)">parte da qui</Mark>.</span>}
      </h2>
      {sub && <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', maxWidth: 480, margin: '20px auto 0', lineHeight: 1.55 }}>{sub}</p>}
      <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 32 }}>
        <button className="cer-btn" style={{ background: 'var(--bone-50)', color: 'var(--ink)', padding: '14px 24px', fontSize: 14 }}>
          <I.Sparkle s={14} /> {primary}
        </button>
        {secondary && (
          <button className="cer-btn" style={{ background: 'var(--purple)', color: 'var(--ink)', padding: '14px 24px', fontSize: 14 }}>
            {secondary}
          </button>
        )}
      </div>
    </div>
  );
}

/* Miniature invitation card — used in galleries and use-case heroes */
function MiniInvite({ bg = 'var(--purple)', color = 'var(--ink)', date, names, italic, sub, cta = 'Conferma →', w = 300, h = 400, rotate = 0, shadow = 'var(--ink)', style }) {
  return (
    <div style={{
      width: w, height: h, background: bg, color,
      borderRadius: 16, border: '2px solid var(--ink)', boxShadow: `8px 8px 0 ${shadow}`,
      padding: '28px 26px', transform: rotate ? `rotate(${rotate}deg)` : 'none',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexShrink: 0,
      ...(style || {}),
    }}>
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.72 }}>{date}</div>
        <div className="serif" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.02, marginTop: 16, letterSpacing: '-0.03em' }}>
          {names}{italic && <span style={{ fontWeight: 400, fontStyle: 'italic' }}><br />{italic}</span>}
        </div>
        {sub && <div style={{ marginTop: 12, fontSize: 13, opacity: 0.88, lineHeight: 1.5 }}>{sub}</div>}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.72 }}>RSVP</div>
        <div style={{ background: 'var(--orange)', color: 'var(--ink)', padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, border: '2px solid var(--ink)' }}>{cta}</div>
      </div>
    </div>
  );
}

/* FAQ — static two-column grid of question cards */
function FaqGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {items.map((f) => (
        <div key={f.q} className="cer-card" style={{ padding: 22 }}>
          <div className="serif" style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{f.q}</div>
          <div style={{ fontSize: 14, marginTop: 8, color: 'var(--ink-700)', lineHeight: 1.55 }}>{f.a}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { SitePage, SiteHero, SiteH2, SiteCTA, MiniInvite, FaqGrid });
