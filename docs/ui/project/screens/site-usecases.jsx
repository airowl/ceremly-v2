// Sito pubblico — colonna "Per chi" del footer
// Matrimoni · Lauree · Battesimi · Compleanni · Wedding planner
// Un template, cinque declinazioni.

const UC = {
  matrimoni: {
    label: 'Matrimoni',
    tag: 'Per i matrimoni',
    title: <span>Il matrimonio si gode.<br /><Mark>La lista si delega</Mark>.</span>,
    sub: 'Da centocinquanta invitati in su, il problema non è la festa: è sapere chi c\'è, cosa mangia e con chi arriva. Ceremly se ne occupa.',
    invite: { date: '12 · settembre · 2026', names: <span>Giulia &amp;<br />Tommaso</span>, italic: 'si sposano', sub: 'Villa Erba, Cernobbio', bg: 'var(--bone-300)' },
    chip: { n: '87/142', l: 'conferme · 89% aperture' },
    pains: [
      { t: 'La lista cambia ogni settimana', d: 'Zii aggiunti, colleghi tolti, fidanzati nuovi. Su Ceremly la lista è una sola, sempre aggiornata.' },
      { t: 'Menu e intolleranze a voce', d: 'Celiaci, vegetariani, bimbi: il form RSVP raccoglie tutto, il catering riceve un export pulito.' },
      { t: 'Navette, bus e plus-one', d: 'Domande logistiche nel form, risposte in dashboard. Niente più “me lo segno dopo”.' },
    ],
    feats: [
      { i: I.Guests, t: 'Nuclei familiari', d: 'Un invito per famiglia, risposte individuali. Adulti e bambini contati a parte.' },
      { i: I.Heart, t: 'Menu & allergie', d: 'Preferenze alimentari raccolte nel form, senza telefonate.' },
      { i: I.Bell, t: 'Promemoria automatici', d: 'Chi non risponde riceve un sollecito gentile. Tu non rincorri nessuno.' },
      { i: I.Upload, t: 'Export per il catering', d: 'Lista finale con menu e note, in CSV o PDF, pronta da inoltrare.' },
    ],
    quote: { text: '“Ho organizzato il matrimonio di mia sorella senza un solo gruppo WhatsApp.”', who: 'Francesca B.', meta: 'Matrimonio · 168 ospiti · Verona' },
  },
  lauree: {
    label: 'Lauree',
    tag: 'Per le lauree',
    title: <span>Proclamazione alle 11.<br />Lista chiusa <Mark c="var(--purple)">per pranzo</Mark>.</span>,
    sub: 'La data arriva all\'improvviso e l\'invito serve subito. Un link su WhatsApp, e in poche ore sai chi viene alla cerimonia e chi al brindisi.',
    invite: { date: '17 · luglio · 2026', names: <span>Sara<br />si laurea</span>, sub: 'Aula magna + brindisi in cortile', bg: 'var(--purple)' },
    chip: { n: '47/52', l: 'conferme in 48 ore' },
    pains: [
      { t: 'Tutto deciso all\'ultimo', d: 'La data ufficiale arriva tardi. L\'invito Ceremly è pronto in cinque minuti, modifiche comprese.' },
      { t: 'Posti contati in aula', d: 'La cerimonia ha capienza limitata: sai in tempo reale quanti hanno confermato.' },
      { t: '“Vieni anche al brindisi?”', d: 'Due momenti, due conferme nello stesso form: cerimonia e festa, contati separatamente.' },
    ],
    feats: [
      { i: I.Sparkle, t: 'Pronto in 5 minuti', d: 'Modello Toga, foto, data e luogo. L\'invito parte oggi stesso.' },
      { i: I.Whatsapp, t: 'Un link su WhatsApp', d: 'Niente email formali: condividi il link dove parlate già.' },
      { i: I.Calendar, t: 'Doppia tappa', d: 'Cerimonia e brindisi come momenti separati, ognuno con la sua conferma.' },
      { i: I.Chart, t: 'Conteggio live', d: 'Le risposte entrano in tempo reale: prenoti il locale con i numeri giusti.' },
    ],
    quote: { text: '“Ho mandato il link alle 9 di mattina. A pranzo sapevo già in quanti eravamo.”', who: 'Sara M.', meta: 'Laurea · 52 invitati · Bologna' },
  },
  battesimi: {
    label: 'Battesimi',
    tag: 'Per i battesimi',
    title: <span>Famiglia allargata,<br />numeri <Mark c="var(--bone-300)">precisi</Mark>.</span>,
    sub: 'Nonni, cugini, bambini al seguito: il battesimo è la festa dei numeri ballerini. Il ristorante invece li vuole esatti.',
    invite: { date: '8 · marzo · 2026', names: <span>Il battesimo<br />di Leo</span>, sub: 'San Martino + pranzo in famiglia', bg: 'var(--bone-200)' },
    chip: { n: '72/84', l: 'ospiti · 12 bambini' },
    pains: [
      { t: 'Inviti a voce che si perdono', d: '“Glielo dice la zia” non è una strategia. Ogni famiglia riceve il suo invito, con nome.' },
      { t: 'Bambini da contare', d: 'Il ristorante vuole adulti e bambini separati. Il form li conta a parte, automaticamente.' },
      { t: 'Il pranzo si prenota prima', d: 'Numeri chiusi con giorni d\'anticipo, export pronto da girare al ristorante.' },
    ],
    feats: [
      { i: I.Home, t: 'Gruppi famiglia', d: 'Un invito per nucleo: risponde uno, conta per tutti.' },
      { i: I.Guests, t: 'Adulti e bambini', d: 'Conteggi separati per fasce d\'età, menu bimbi incluso.' },
      { i: I.Heart, t: 'Menu & intolleranze', d: 'Raccolte nel form, esportate per il ristorante.' },
      { i: I.QR, t: 'QR sul bigliettino', d: 'La bomboniera resta di carta: il QR porta alla conferma digitale.' },
    ],
    quote: { text: '“Il ristorante voleva i numeri esatti. Li ho esportati in un click.”', who: 'Davide P.', meta: 'Battesimo · 84 ospiti · Lecce' },
  },
  compleanni: {
    label: 'Compleanni',
    tag: 'Per i compleanni',
    title: <span>Basta sondaggi<br />nel gruppo. <Mark>Un link</Mark>.</span>,
    sub: 'Per i compleanni che contano — i 18, i 40, i 70 — serve sapere chi viene davvero. Senza pollici alzati da interpretare.',
    invite: { date: '21 · novembre · 2026', names: <span>I 40<br />di Marco</span>, sub: 'Cascina Boscaccio, ore 20', bg: 'var(--orange-soft)' },
    chip: { n: '48/64', l: 'conferme · 9 in attesa' },
    pains: [
      { t: 'I “forse” cronici', d: 'Il pollice alzato non è una conferma. Il form chiede sì o no — e una scadenza.' },
      { t: 'La location vuole un numero', d: 'Caparra e menu si bloccano in anticipo: l\'andamento live ti dice quando chiudere.' },
      { t: 'Rincorrere nei gruppi', d: 'I promemoria partono da soli. Tu non scrivi “raga, confermate” per la terza volta.' },
    ],
    feats: [
      { i: I.Send, t: 'Un link, zero account', d: 'Si apre, si risponde. Anche dalla chat di classe del 1986.' },
      { i: I.Bell, t: 'Promemoria gentili', d: 'Solleciti automatici ai ritardatari, col tono giusto.' },
      { i: I.Guests, t: 'Plus-one controllati', d: 'Decidi tu chi può portare qualcuno, e quanti.' },
      { i: I.Chart, t: 'Andamento live', d: 'Sai sempre quanti siete. La location ringrazia.' },
    ],
    quote: { text: '“Niente sondaggini nel gruppo. Un link e via — e per una volta sapevo chi veniva.”', who: 'Marco T.', meta: 'Compleanno · 64 invitati · Milano' },
  },
  planner: {
    label: 'Wedding planner',
    tag: 'Atelier · per professionisti',
    title: <span>Dodici eventi in parallelo.<br /><Mark c="var(--purple)">Un solo pannello</Mark>.</span>,
    sub: 'Per wedding planner e organizzatori di mestiere: workspace con il tuo brand, eventi illimitati e liste che si esportano da sole.',
    invite: { date: 'Workspace · Studio Fiore', names: <span>Atelier<br />di Elisa R.</span>, sub: '12 eventi attivi · 4 in chiusura · 1.840 ospiti', bg: 'var(--ink)', color: 'var(--bone-50)', cta: 'Apri →' },
    chip: { n: '12', l: 'eventi attivi nel workspace' },
    pains: [
      { t: 'Ogni cliente vuole il suo stile', d: 'Inviti con i colori e il dominio del cliente: il tuo workspace, il loro brand.' },
      { t: 'Report settimanali ai clienti', d: 'Andamento RSVP condivisibile in sola lettura: il cliente guarda, tu lavori.' },
      { t: 'Liste su dieci fogli diversi', d: 'Tutti gli eventi in un pannello, export uniformi per catering e location.' },
    ],
    feats: [
      { i: I.Settings, t: 'Workspace col tuo logo', d: 'Brand tuo su pannello, email e pagine invito.' },
      { i: I.Send, t: 'Domini personalizzati', d: 'inviti.studiofiore.it invece di ceremly.it: più tuo di così.' },
      { i: I.Guests, t: 'Account team', d: 'Assistenti e collaboratori con permessi per evento.' },
      { i: I.Copy, t: 'API & integrazioni', d: 'RSVP nei tuoi sistemi: CRM, catering, fogli condivisi.' },
    ],
    quote: { text: '“I clienti vedono il loro brand. Io vedo tutti gli eventi in una schermata.”', who: 'Elisa R.', meta: 'Wedding planner · 31 eventi nel 2026 · Torino' },
    cta: { title: <span>Organizzi per mestiere?<br /><Mark c="var(--orange)">Parliamone</Mark>.</span>, sub: 'Atelier costa €24 al mese, eventi e ospiti illimitati. Demo di 30 minuti, senza impegno.', primary: 'Parla con noi', secondary: 'Vedi i prezzi' },
  },
};

function UseCasePage({ id }) {
  const u = UC[id];
  return (
    <SitePage label={u.label}>
      {/* hero */}
      <div style={{ padding: '72px 72px 80px', borderBottom: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 56, alignItems: 'center' }}>
        <div>
          <span className="cer-tag" style={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent' }}>{u.tag}</span>
          <h1 className="serif" style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em', margin: '18px 0 0' }}>{u.title}</h1>
          <p style={{ fontSize: 17, color: 'var(--ink-700)', lineHeight: 1.6, maxWidth: 520, margin: '20px 0 0' }}>{u.sub}</p>
          <div className="row" style={{ gap: 12, marginTop: 30 }}>
            <button className="cer-btn" style={{ padding: '14px 22px', fontSize: 14 }}>
              <I.Sparkle s={14} /> {id === 'planner' ? 'Parla con noi' : 'Crea il tuo invito — gratis'}
            </button>
            <button className="cer-btn ghost" style={{ padding: '14px 22px', fontSize: 14 }}>
              <I.Eye s={14} /> Invito d'esempio
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', height: 440, display: 'flex', justifyContent: 'center' }}>
          <MiniInvite w={310} h={400} rotate={-3} bg={u.invite.bg} color={u.invite.color || 'var(--ink)'}
            date={u.invite.date} names={u.invite.names} italic={u.invite.italic} sub={u.invite.sub} cta={u.invite.cta || 'Conferma →'} />
          <div style={{
            position: 'absolute', right: 26, bottom: 8, width: 218, padding: 16,
            background: 'var(--bone-50)', borderRadius: 14, border: '2px solid var(--ink)',
            boxShadow: '6px 6px 0 var(--ink)', transform: 'rotate(2deg)',
          }}>
            <div className="serif" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em' }}>{u.chip.n}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{u.chip.l}</div>
          </div>
        </div>
      </div>

      {/* pains */}
      <div style={{ padding: '72px 72px', background: 'var(--bone-100)', borderBottom: '1px solid var(--line)' }}>
        <SiteH2 tag="Il problema" tagStyle={{ background: 'var(--orange-soft)', color: 'var(--orange-deep)', borderColor: 'transparent' }} title="Ti suona familiare?" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
          {u.pains.map((p, i) => (
            <div key={p.t} className="cer-card" style={{ padding: 24 }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>{'0' + (i + 1)}</div>
              <div className="serif" style={{ fontSize: 22, fontWeight: 700, marginTop: 10, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{p.t}</div>
              <div style={{ fontSize: 14, marginTop: 8, color: 'var(--ink-700)', lineHeight: 1.55 }}>{p.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* features */}
      <div style={{ padding: '72px 72px' }}>
        <SiteH2 tag="Cosa fa Ceremly" tagStyle={{ background: 'var(--wine-soft)', color: 'var(--purple-ink)', borderColor: 'transparent' }} title={id === 'planner' ? 'Pensato per chi organizza tanto' : 'Pensato per questa occasione'} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {u.feats.map((f) => (
            <div key={f.t} className="cer-card" style={{ padding: 22 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bone-200)', border: '1.5px solid var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <f.i s={19} />
              </div>
              <div className="serif" style={{ fontSize: 19, fontWeight: 700, marginTop: 16, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{f.t}</div>
              <div style={{ fontSize: 13, marginTop: 8, color: 'var(--ink-700)', lineHeight: 1.55 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* quote */}
      <div style={{ padding: '64px 72px', background: 'var(--bone-100)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
          <blockquote className="serif" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.25, margin: 0, letterSpacing: '-0.025em' }}>{u.quote.text}</blockquote>
          <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 22 }}>
            <div className="av lg">{u.quote.who.split(' ').map((w) => w[0]).join('')}</div>
            <div className="col" style={{ alignItems: 'flex-start' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{u.quote.who}</span>
              <span className="small muted">{u.quote.meta}</span>
            </div>
          </div>
        </div>
      </div>

      <SiteCTA
        title={u.cta ? u.cta.title : undefined}
        sub={u.cta ? u.cta.sub : 'Crea il tuo primo invito in cinque minuti. Trenta ospiti gratis, per sempre.'}
        primary={u.cta ? u.cta.primary : 'Inizia gratis'}
        secondary={u.cta ? u.cta.secondary : 'Guarda un esempio'}
      />
    </SitePage>
  );
}

function MatrimoniPage()  { return <UseCasePage id="matrimoni" />; }
function LaureePage()     { return <UseCasePage id="lauree" />; }
function BattesimiPage()  { return <UseCasePage id="battesimi" />; }
function CompleanniPage() { return <UseCasePage id="compleanni" />; }
function PlannerPage()    { return <UseCasePage id="planner" />; }

Object.assign(window, { MatrimoniPage, LaureePage, BattesimiPage, CompleanniPage, PlannerPage });
