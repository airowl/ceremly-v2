// Landing page — sito pubblico Ceremly · "Vibrant Spontaneity"
// Cream canvas · bold Bricolage headlines · hard shadows · crisp outlines.
// Layout fisso 1400px, altezza ~3560px.

function LandingPage() {
  return (
    <div className="cer" style={{ height: '100%', background: 'var(--bone)', overflow: 'hidden' }}>
      <LandingNav />
      <LandingHero />
      <LandingProblem />
      <LandingHow />
      <LandingFeatures />
      <LandingPricing />
      <LandingQuote />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}

/* helper — orange highlight behind text */
function Mark({ children, c = 'var(--orange)' }) {
  return <span style={{ background: c, color: 'var(--ink)', padding: '0 8px', borderRadius: 6, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}>{children}</span>;
}

/* ─────────────────────────────────────────────  NAV  */
function LandingNav() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 72px',
      borderBottom: '1px solid var(--line)',
      background: 'var(--bone)',
      position: 'sticky', top: 0, zIndex: 5,
    }}>
      <div className="row" style={{ gap: 7 }}>
        <span className="serif" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>Ceremly</span>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
      </div>
      <div className="row" style={{ gap: 32, fontSize: 14, color: 'var(--ink-700)', fontWeight: 500 }}>
        <span style={{ cursor: 'pointer' }}>Come funziona</span>
        <span style={{ cursor: 'pointer' }}>Funzionalità</span>
        <span style={{ cursor: 'pointer' }}>Prezzi</span>
        <span style={{ cursor: 'pointer' }}>Esempi</span>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button className="cer-btn ghost small">Accedi</button>
        <button className="cer-btn small">Registrati</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  HERO  */
function LandingHero() {
  return (
    <div style={{ padding: '88px 72px 100px', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 56, alignItems: 'center' }}>
      <div>
        <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent', marginBottom: 22 }}>
          <I.Sparkle s={12} /> v0.1 · aperto agli organizzatori italiani
        </span>
        <h1 className="serif" style={{ fontSize: 92, fontWeight: 800, lineHeight: 0.95, letterSpacing: '-0.045em', margin: '14px 0 0' }}>
          Gli inviti<br />che contano<br /><Mark c="var(--purple)">davvero</Mark>.
        </h1>
        <p style={{ maxWidth: 510, marginTop: 28, fontSize: 18, lineHeight: 1.55, color: 'var(--ink-700)' }}>
          Smetti di rincorrere conferme su WhatsApp. Un link, un invito digitale,
          una dashboard che ti dice chi viene davvero — per matrimoni, lauree,
          battesimi e compleanni.
        </p>
        <div className="row" style={{ marginTop: 32, gap: 12 }}>
          <button className="cer-btn" style={{ padding: '15px 24px', fontSize: 14 }}>
            <I.Sparkle s={14} /> Crea il tuo primo invito — gratis
          </button>
          <button className="cer-btn ghost" style={{ padding: '15px 24px', fontSize: 14 }}>
            <I.Eye s={14} /> Invito d'esempio
          </button>
        </div>
        <div className="row" style={{ marginTop: 26, gap: 18, fontSize: 13, color: 'var(--ink-500)', flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 6 }}><I.Check s={14} /> Nessuna carta richiesta</span>
          <span className="row" style={{ gap: 6 }}><I.Check s={14} /> 30 ospiti gratis</span>
          <span className="row" style={{ gap: 6 }}><I.Check s={14} /> Ospiti senza account</span>
        </div>
      </div>

      {/* Hero visual */}
      <div style={{ position: 'relative', height: 560 }}>
        {/* invito card — blocco viola */}
        <div style={{
          position: 'absolute', left: 30, top: 0, width: 360, height: 510,
          background: 'var(--purple)',
          borderRadius: 18,
          border: '2px solid var(--ink)',
          boxShadow: '10px 10px 0 var(--ink)',
          color: 'var(--ink)',
          padding: '40px 32px',
          transform: 'rotate(-3deg)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wine-deep)' }}>
              12 · settembre · 2026
            </div>
            <div className="serif" style={{ fontSize: 46, fontWeight: 800, lineHeight: 1.0, marginTop: 22, letterSpacing: '-0.03em' }}>
              Giulia &amp;<br />Tommaso<br /><span style={{ fontWeight: 400, fontStyle: 'italic' }}>si sposano</span>
            </div>
            <div style={{ marginTop: 20, fontSize: 14, opacity: 0.9, lineHeight: 1.5 }}>
              Villa Erba, Cernobbio<br />ore 16 — cerimonia all'aperto
            </div>
          </div>
          <div>
            <div style={{ height: 2, background: 'rgba(63,54,34,0.28)', marginBottom: 16 }} />
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--wine-deep)', textTransform: 'uppercase' }}>
                  Rispondi entro il
                </div>
                <div style={{ fontSize: 15, marginTop: 4, fontWeight: 500 }}>1 luglio</div>
              </div>
              <div style={{
                background: 'var(--orange)', color: 'var(--ink)',
                padding: '11px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: '2px solid var(--ink)',
              }}>
                Conferma →
              </div>
            </div>
          </div>
        </div>

        {/* stat card */}
        <div style={{
          position: 'absolute', right: 0, top: 56, width: 282, padding: 20,
          background: 'var(--bone-50)', borderRadius: 16,
          border: '2px solid var(--ink)', boxShadow: '6px 6px 0 var(--ink)',
          transform: 'rotate(2deg)',
        }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="mono" style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-500)' }}>RSVP live</span>
            <span className="pill confirm"><span className="cer-dot" />+12 oggi</span>
          </div>
          <div className="serif" style={{ fontSize: 60, fontWeight: 800, lineHeight: 1, marginTop: 12, letterSpacing: '-0.03em' }}>87<span style={{ color: 'var(--ink-300)', fontSize: 30 }}>/142</span></div>
          <div className="small muted" style={{ marginTop: 4 }}>conferme · 89% inviti aperti</div>
          <div style={{ marginTop: 14, height: 8, background: 'var(--bone-100)', borderRadius: 999, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <div style={{ height: '100%', width: '61%', background: 'var(--purple)' }} />
          </div>
        </div>

        {/* mini card mobile */}
        <div style={{
          position: 'absolute', right: 24, bottom: 24, width: 236, padding: 16,
          background: 'var(--bone-50)', borderRadius: 16,
          border: '2px solid var(--ink)', boxShadow: '6px 6px 0 var(--blue)',
          transform: 'rotate(-2deg)',
        }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="av sage lg">MR</div>
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Marta R.</span>
              <span className="small muted">ha confermato +1</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <span className="cer-tag" style={{ fontSize: 10, padding: '2px 7px' }}>vegetariana</span>
            <span className="cer-tag" style={{ fontSize: 10, padding: '2px 7px' }}>bus 16:30</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  PROBLEM  */
function LandingProblem() {
  const pains = [
    { k: '01', t: 'Gruppi WhatsApp infiniti', d: 'Una conferma sì, un forse, tre messaggi vocali. La lista finale resta un mistero fino a tre giorni prima.' },
    { k: '02', t: 'Allergie a voce', d: 'Lo zio è celiaco, la cugina vegetariana — e nessuno se lo ricorda quando arriva il catering.' },
    { k: '03', t: 'Plus-one fantasma', d: '"Posso portare il mio fidanzato?" — chiesto cinque volte, dimenticato due. Il conteggio non torna mai.' },
    { k: '04', t: 'Inviti cartacei dispersi', d: 'Belli sì, ma costosi, lenti e impossibili da modificare se cambia data o location.' },
  ];
  return (
    <div style={{ padding: '96px 72px', background: 'var(--bone-100)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <span className="cer-tag" style={{ background: 'var(--orange-soft)', color: 'var(--orange-deep)', borderColor: 'transparent', marginBottom: 24 }}>Il problema</span>
      <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 72, alignItems: 'start', marginTop: 12 }}>
        <h2 className="serif" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.0, margin: 0, letterSpacing: '-0.035em' }}>
          Organizzare<br />un evento è bello.<br /><span style={{ color: 'var(--purple)' }}>Contare gli ospiti</span><br />molto meno.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {pains.map((p) => (
            <div key={p.k} className="cer-card" style={{ padding: 22 }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{p.k}</div>
              <div className="serif" style={{ fontSize: 23, fontWeight: 700, marginTop: 10, letterSpacing: '-0.02em' }}>{p.t}</div>
              <div style={{ fontSize: 14, marginTop: 8, color: 'var(--ink-700)', lineHeight: 1.55 }}>{p.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  HOW IT WORKS  */
function LandingHow() {
  const steps = [
    { k: '01', t: 'Crea l\'invito', d: 'Scegli un modello — matrimonio, laurea, battesimo, compleanno — e personalizza colori, foto e testi. Pronto in 5 minuti.', i: I.Edit, c: 'var(--purple)' },
    { k: '02', t: 'Importa la lista', d: 'Incolla da Excel, da rubrica o digita. Raggruppa per famiglia, lato sposi o tavolo. Riconosciamo i duplicati.', i: I.Guests, c: 'var(--orange)' },
    { k: '03', t: 'Distribuisci', d: 'Un link per tutti, oppure WhatsApp ed email personalizzati con nome dell\'ospite. QR per inviti cartacei.', i: I.Send, c: 'var(--blue)' },
    { k: '04', t: 'Ricevi RSVP', d: 'Conferme, menu, plus-one e note arrivano in dashboard. Promemoria automatici a chi tarda.', i: I.Chart, c: 'var(--confirm)' },
  ];
  return (
    <div style={{ padding: '96px 72px' }}>
      <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent' }}>Come funziona</span>
      <h2 className="serif" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.0, margin: '16px 0 0', letterSpacing: '-0.035em', maxWidth: 820 }}>
        Quattro passaggi, dalla bozza<br />alla <span style={{ color: 'var(--purple)' }}>lista finale</span>.
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginTop: 56 }}>
        {steps.map((s) => (
          <div key={s.k} className="cer-card" style={{ padding: 24 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-300)' }}>{s.k}</div>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: s.c, color: 'var(--ink)',
                border: '2px solid var(--ink)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <s.i s={20} />
              </div>
            </div>
            <div className="serif" style={{ fontSize: 25, fontWeight: 800, marginTop: 24, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{s.t}</div>
            <div style={{ fontSize: 14, marginTop: 10, color: 'var(--ink-700)', lineHeight: 1.55 }}>{s.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  FEATURES  */
function LandingFeatures() {
  const feats = [
    { i: I.Mail,   t: 'Email & WhatsApp personalizzati', d: 'Ogni ospite riceve il suo invito con nome e link unico — niente moduli generici.' },
    { i: I.Bell,   t: 'Promemoria automatici',           d: 'Solleciti gentili a chi non ha ancora risposto, con la cadenza che decidi tu.' },
    { i: I.QR,     t: 'QR per inviti cartacei',          d: 'Mantieni la carta se ti piace — il QR porta lo stesso al form di conferma digitale.' },
    { i: I.Heart,  t: 'Menu, allergie, intolleranze',    d: 'Raccogli preferenze alimentari nel form RSVP, esporta tutto per il catering.' },
    { i: I.Guests, t: 'Plus-one e nuclei familiari',     d: 'Gestisci accompagnatori, bambini e gruppi famiglia in un colpo solo.' },
    { i: I.Chart,  t: 'Andamento in tempo reale',        d: 'Dashboard con tasso apertura, conferme per fascia, previsione costi catering.' },
  ];
  return (
    <div style={{ padding: '96px 72px', background: 'var(--ink)', color: 'var(--bone-50)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 72, alignItems: 'start' }}>
        <div>
          <span className="cer-tag" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--bone-200)', borderColor: 'rgba(255,255,255,0.18)' }}>Funzionalità</span>
          <h2 className="serif" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.0, margin: '16px 0 0', letterSpacing: '-0.035em' }}>
            Tutto quello<br />che serve.<br /><span style={{ color: 'var(--blue)' }}>Niente di più.</span>
          </h2>
          <p style={{ fontSize: 16, color: 'var(--bone-200)', lineHeight: 1.6, marginTop: 20, maxWidth: 360 }}>
            Ceremly non vuole sostituire il wedding planner né il fotografo. Risolve un solo problema — sapere chi viene — e lo risolve bene.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {feats.map((f) => (
            <div key={f.t} style={{
              padding: 24, borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}>
              <div style={{ color: 'var(--orange)' }}><f.i s={24} /></div>
              <div className="serif" style={{ fontSize: 21, fontWeight: 700, marginTop: 14, letterSpacing: '-0.02em' }}>{f.t}</div>
              <div style={{ fontSize: 14, marginTop: 8, color: 'var(--bone-200)', lineHeight: 1.55 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  PRICING  */
function LandingPricing() {
  const tiers = [
    {
      n: 'Free', p: '0', sub: 'per sempre',
      desc: 'Per piccoli eventi e prove. Tutto il necessario per iniziare.',
      feats: ['Fino a 30 ospiti', '1 evento attivo', '3 modelli di invito', 'RSVP via link', 'Dashboard base'],
      cta: 'Inizia gratis', kind: 'ghost',
    },
    {
      n: 'Celebrazione', p: '39', sub: 'una tantum · per evento',
      desc: 'Per matrimoni, lauree e battesimi. L\'opzione consigliata per la maggior parte degli eventi.',
      feats: ['Fino a 250 ospiti', 'Tutti i modelli + brand colors', 'WhatsApp & email personalizzati', 'Menu, allergie, plus-one', 'Promemoria automatici', 'Esporta lista per catering'],
      cta: 'Scegli Celebrazione', highlight: true, tag: 'Più scelto',
    },
    {
      n: 'Atelier', p: '24', sub: '/mese · per planner',
      desc: 'Per chi organizza eventi di lavoro. Eventi illimitati e brand su misura.',
      feats: ['Eventi e ospiti illimitati', 'Workspace con il tuo logo', 'Domini personalizzati', 'API & integrazioni catering', 'Account team', 'Supporto prioritario'],
      cta: 'Parla con noi', kind: 'ghost',
    },
  ];
  return (
    <div style={{ padding: '96px 72px' }}>
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent', display: 'inline-flex' }}>Prezzi</span>
        <h2 className="serif" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.0, margin: '16px 0 12px', letterSpacing: '-0.035em' }}>
          <span style={{ color: 'var(--purple)' }}>Trasparenti</span>, senza<br />percentuali sugli ospiti.
        </h2>
        <p style={{ fontSize: 16, color: 'var(--ink-700)', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
          Paghi una volta per evento, oppure un abbonamento se organizzi per lavoro. Mai per RSVP, mai per ospite.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, alignItems: 'start' }}>
        {tiers.map((t) => (
          <div key={t.n} style={{
            background: t.highlight ? 'var(--ink)' : 'var(--bone-50)',
            color: t.highlight ? '#fff' : 'var(--ink)',
            border: '2px solid var(--ink)',
            borderRadius: 16,
            padding: 32,
            position: 'relative',
            boxShadow: t.highlight ? '8px 8px 0 var(--ink)' : 'none',
            marginTop: t.highlight ? -8 : 8,
          }}>
            {t.tag && (
              <div style={{
                position: 'absolute', top: -14, left: 28,
                background: 'var(--orange)', color: 'var(--ink)',
                fontSize: 12, padding: '4px 12px', borderRadius: 999,
                fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                border: '2px solid var(--ink)',
              }}>{t.tag}</div>
            )}
            <div className="serif" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{t.n}</div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="serif" style={{ fontSize: 66, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>€{t.p}</span>
              <span style={{ fontSize: 13, color: t.highlight ? 'var(--blue-soft)' : 'var(--ink-500)' }}>{t.sub}</span>
            </div>
            <div style={{ fontSize: 13, marginTop: 12, lineHeight: 1.55, color: t.highlight ? 'rgba(255,255,255,0.85)' : 'var(--ink-700)', minHeight: 58 }}>
              {t.desc}
            </div>
            <div style={{ height: 1, background: t.highlight ? 'rgba(255,255,255,0.25)' : 'var(--line)', margin: '20px 0' }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
              {t.feats.map((f) => (
                <li key={f} className="row" style={{ gap: 10, fontSize: 14, color: t.highlight ? 'rgba(255,255,255,0.92)' : 'var(--ink-700)' }}>
                  <span style={{ color: t.highlight ? 'var(--blue)' : 'var(--purple)' }}><I.Check s={15} /></span> {f}
                </li>
              ))}
            </ul>
            <button
              className={'cer-btn ' + (t.kind === 'ghost' ? 'ghost' : '')}
              style={{
                width: '100%', justifyContent: 'center', marginTop: 28, padding: '13px 16px',
                background: t.highlight ? 'var(--orange)' : undefined,
                color: t.highlight ? 'var(--ink)' : undefined,
                borderColor: 'var(--ink)',
              }}>
              {t.cta} <I.ChevR s={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', gap: 20, marginTop: 36, fontSize: 13, color: 'var(--ink-500)', flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 6 }}><I.Check s={14} /> Fatturazione elettronica</span>
        <span className="row" style={{ gap: 6 }}><I.Check s={14} /> Server in UE · GDPR</span>
        <span className="row" style={{ gap: 6 }}><I.Check s={14} /> Cancella quando vuoi</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  TESTIMONIAL  */
function LandingQuote() {
  return (
    <div style={{ padding: '88px 72px', background: 'var(--bone-100)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <span className="cer-tag" style={{ background: 'var(--blue-soft)', color: 'var(--blue-deep)', borderColor: 'transparent', display: 'inline-flex' }}>Beta · 142 eventi gestiti</span>
        <blockquote className="serif" style={{
          fontSize: 42, fontWeight: 700, lineHeight: 1.2, margin: '24px 0 28px', letterSpacing: '-0.03em', color: 'var(--ink)',
        }}>
          “Ho organizzato il matrimonio di mia sorella senza <span style={{ color: 'var(--purple)' }}>un solo gruppo WhatsApp</span>.
          La lista è arrivata al catering tre giorni prima — completa, con le allergie.”
        </blockquote>
        <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
          <div className="av lg">FB</div>
          <div className="col" style={{ alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Francesca B.</span>
            <span className="small muted">Matrimonio · 168 ospiti · Verona</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  CTA  */
function LandingCTA() {
  return (
    <div style={{ padding: '116px 72px', background: 'var(--ink)', color: '#fff', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <h2 className="serif" style={{ fontSize: 76, fontWeight: 800, lineHeight: 0.98, letterSpacing: '-0.04em', margin: 0, maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
        Il tuo prossimo evento<br /><Mark c="var(--orange)">merita una lista vera</Mark>.
      </h2>
      <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.88)', maxWidth: 520, margin: '26px auto 0', lineHeight: 1.55 }}>
        Crea il tuo primo invito in cinque minuti. Trenta ospiti gratis, per sempre.
      </p>
      <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 36 }}>
        <button className="cer-btn" style={{
          background: 'var(--bone-50)', color: 'var(--ink)', borderColor: 'var(--ink)',
          padding: '15px 26px', fontSize: 14,
        }}>
          <I.Sparkle s={14} /> Inizia gratis
        </button>
        <button className="cer-btn" style={{
          background: 'var(--purple)', color: 'var(--ink)', borderColor: 'var(--ink)',
          padding: '15px 26px', fontSize: 14,
        }}>
          <I.Mail s={14} /> Parla con il team
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────  FOOTER  */
function LandingFooter() {
  const cols = [
    { t: 'Prodotto', items: ['Come funziona', 'Funzionalità', 'Modelli di invito', 'Prezzi', 'Esempi reali'] },
    { t: 'Per chi', items: ['Matrimoni', 'Lauree', 'Battesimi', 'Compleanni', 'Wedding planner'] },
    { t: 'Risorse',  items: ['Guida RSVP', 'Centro aiuto', 'Stato servizio', 'Changelog', 'API per partner'] },
    { t: 'Ceremly',  items: ['Chi siamo', 'Contatti', 'Termini', 'Privacy & GDPR', 'Cookie'] },
  ];
  return (
    <div style={{ padding: '64px 72px 40px', background: 'var(--bone)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 1fr)', gap: 48 }}>
        <div>
          <div className="row" style={{ gap: 7 }}>
            <span className="serif" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>Ceremly</span>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-500)', lineHeight: 1.6, marginTop: 12, maxWidth: 280 }}>
            Inviti digitali e RSVP intelligenti, per eventi che contano davvero. Fatto in Italia.
          </p>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 18 }}>
            © 2026 Ceremly Srl · P.IVA 12345670156
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.t} className="col" style={{ gap: 10 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)' }}>{c.t}</div>
            {c.items.map((it) => (
              <span key={it} style={{ fontSize: 14, color: 'var(--ink-700)', cursor: 'pointer' }}>{it}</span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ height: 1, background: 'var(--line)', margin: '40px 0 16px' }} />
      <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-500)' }}>
        <span>Server in UE · GDPR compliant · pagamenti via Stripe</span>
        <span className="row" style={{ gap: 16 }}>
          <span style={{ fontWeight: 600 }}>IT</span>
          <span style={{ color: 'var(--ink-300)' }}>EN — soon</span>
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { LandingPage, LandingNav, LandingFooter, LandingPricing, Mark });
