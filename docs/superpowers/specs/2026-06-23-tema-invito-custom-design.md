# Tema invito personalizzabile — colori liberi + catalogo font

**Data:** 2026-06-23
**Stato:** design approvato, pronto per il piano
**Evolve:** la feature "tema invito" key-based (migrazione 0009, [[ceremly-tema-invito]])

## Contesto

L'editor invito (`app/pages/dashboard/events/[id]/editor.vue`, pannello "Aspetto") oggi permette di scegliere **1 di 6 palette** e **1 di 5 font** curati: l'evento salva due *key* (`events.palette`, `events.invite_font`) risolte da `shared/constants/inviteTheme.ts`, e `InviteRenderer.vue` applica i valori come override di token CSS sul root.

Richiesta utente: **colori e font devono essere customizzabili** — non solo i preset. Decisioni prese in brainstorming:

- **Colori**: picker liberi (hex arbitrari) su **4 ruoli** — Sfondo, Accento, Titoli, Testo bottone — con **avviso di contrasto** non bloccante.
- **Font**: scelta da un **catalogo Google curato (~60 famiglie) con ricerca**, **self-hostate** (no IP dell'ospite verso Google → coerente con la postura GDPR del progetto).

## Obiettivo

L'utente compone liberamente il tema dell'invito (4 colori + un font tra ~60), con i 6 preset come scorciatoie e una rete di sicurezza sul contrasto. `null` continua a significare "look globale" (nessuna regressione sugli eventi esistenti).

## Modello dati (approccio A)

`server/database/schema/events.ts`:

- **Aggiungere** `theme jsonb` nullable = `{ paper, accent, deep, onAccent }` (stringhe hex `#rrggbb`). `null` ⇒ look globale `.cer`.
- **Riusare** `invite_font text`: cambia semantica da *key-di-5* a **nome famiglia** del catalogo (es. `"Lora"`), o `null`.
- **Rimuovere** `palette text` (introdotta in 0009): i 6 preset non sono più uno stato persistito, ma scorciatoie UI che riempiono i picker.

Il `soft` (banda chiara, card location → `--bone-100`) **non** è un campo: si **deriva** dall'accento (vedi util `deriveSoft`), così l'utente gestisce 4 colori invece di 5.

### Migrazione 0010 (data-preserving)

Ordine: prima converte, poi droppa.

1. `ALTER TABLE events ADD COLUMN theme jsonb;`
2. Converte gli eventi con `palette` non-null: `theme = {paper,accent,deep,onAccent}` presi dalla palette corrispondente in `INVITE_PALETTES` (CASE su `palette`).
3. Converte `invite_font`: le 5 key 0009 → nome famiglia (`bricolage→'Bricolage Grotesque'`, `playfair→'Playfair Display'`, `cormorant→'Cormorant Garamond'`, `garamond→'EB Garamond'`, `baskerville→'Libre Baskerville'`).
4. `ALTER TABLE events DROP COLUMN palette;`

Su DEV il watermark `__drizzle_migrations` è già a 0009 ([[ceremly-drizzle-journal-disallineato]]), quindi `pnpm db:migrate` applica 0010 in modo pulito. PROD: vedi nota compatibilità.

## Costanti (`shared/constants/inviteTheme.ts`)

- `INVITE_PALETTES` (6) **restano**: alimentano le scorciatoie preset (riempiono i 4 picker). Non più persistite come key.
- `INVITE_FONTS` (5) **sostituito** da `INVITE_FONT_CATALOG`: ~60 famiglie Google curate per inviti, ognuna `{ family, category, cssClass }` (category: serif | sans | display | handwriting per raggruppare/filtrare la ricerca).
- Nuovo tipo `InviteTheme = { paper: string; accent: string; deep: string; onAccent: string }`.
- Helper: `getCatalogFont(family)`, `isCatalogFont(family)`, `DEFAULT_THEME` (= valori toscana, per i preset/derivazioni).

## Validazione (`shared/schemas/ceremly.ts`)

- `hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)`.
- `themeSchema = z.object({ paper, accent, deep, onAccent: hexColorSchema }).nullable()`.
- `inviteFont`: `z.string()` ristretto via `.refine(isCatalogFont)` (whitelist = famiglie del catalogo → niente injection arbitraria), `.nullish()`.
- `updateEventSchema`: rimuove `palette`/`inviteFont` enum-key, aggiunge `theme: themeSchema.optional()` + `inviteFont` nuovo.
- Rimuovere `paletteKeyEnum`/`inviteFontEnum` (sostituiti).

## Utility colore (`shared/utils/inviteColor.ts`, nuovo)

- `deriveSoft(accent: string): string` — tinta chiara dell'accento (mix con bianco ~85%) per `--bone-100`.
- `contrastRatio(fg: string, bg: string): number` — rapporto WCAG (luminanza relativa).
- `isReadable(fg, bg, large = false): boolean` — soglia AA: 4.5:1 (normale) / 3:1 (grande). Funzioni pure, testabili, condivise client/editor.

## Rendering (`app/components/ceremly/InviteRenderer.vue`)

- Prop: `theme?: InviteTheme | null` (sostituisce `palette`), `font?: string | null` (nome famiglia).
- Override token quando `theme` presente: `--bone-50`=paper, `--bone-100`=`deriveSoft(accent)`, `--tpl-accent`/`--wine`=accent, `--wine-deep`=deep, `--rsvp-on-accent`=onAccent. `null` ⇒ nessun override (look globale, come oggi).
- Font: quando `font` presente, `--font-display = '<family>', serif` + classe `inv-font-<slug>`. I font del catalogo sono **self-hostati** (vedi sotto): l'@font-face esiste già, l'applicazione è runtime. Nessuna richiesta a Google dal browser.

## Self-hosting del catalogo font

Le ~60 famiglie del catalogo vanno dichiarate come `font-family` in CSS statico così @nuxt/fonts (già attivo) le **scarica e self-hosta** a build-time. Una classe `.inv-font-<slug>` per famiglia (generata dalla costante o in un CSS dedicato `app/assets/css/invite-fonts.css`). @nuxt/fonts emette gli `@font-face`; il browser scarica solo il font effettivamente applicato (`display: swap`). CSP già OK (i woff2 sono serviti dal nostro dominio).

**Editor — lazy preview**: nel combobox la lista mostra i nomi in font di sistema; il font reale si applica solo all'anteprima dell'elemento selezionato/in hover, per non scaricare decine di woff2 durante lo scroll.

## UI editor (pannello "Aspetto")

- **Colori**: 4 righe picker = `<input type="color">` + campo testo hex sincronizzato, per Sfondo/Accento/Titoli/Testo bottone.
- **Contrasto**: sotto i picker, avviso non bloccante quando `isReadable` fallisce su una di **3 coppie** — (1) testo bottone `onAccent` vs `accent`, (2) corpo testo (`--ink` globale, fisso) vs `paper`, (3) titoli `deep` vs `paper`. Messaggio specifico per coppia (es. "Etichetta bottone poco leggibile", "Testo poco leggibile sullo sfondo"). L'utente resta libero di salvare.
- **Font**: combobox con ricerca testuale sul catalogo (filtro per nome/categoria).
- **Preset**: i 6 (INVITE_PALETTES) come chip "parti da qui" → riempiono i 4 picker.
- **Reset**: svuota il tema (`theme=null`, `inviteFont=null`) → look globale.
- Stato `editor.vue`: `theme` ref + `fontFamily` ref; inclusi in `snapshot()` (dirty) e nel body del PUT; passati ai due `InviteRenderer` (preview + modale).

## Service & payload pubblico

- `server/services/event.service.ts` `updateEvent`: patch `theme`/`inviteFont` (sostituisce palette/inviteFont).
- `server/services/publicInvite.service.ts`: **entrambi** i costruttori payload (`getPublicInvite` + `getInvitePreview`) espongono `theme`/`inviteFont`.
- Tipi (`shared/types/ceremly.ts`): `CeremlyEvent` rimuove `palette`, aggiunge `theme: InviteTheme | null`, `inviteFont: string | null`; `PublicInvitePayload` Pick aggiornato.
- `app/pages/e/[slug]/[token].vue`: passa `:theme`/`:font` al renderer.

## Compatibilità

- `theme=null` / `inviteFont=null` ⇒ look globale `.cer` invariato (zero regressione).
- Eventi 0009 convertiti dalla migrazione (nessuna perdita del tema scelto).
- **PROD** (branch main): la 0010 va applicata dopo 0009; prod ha il debito journal noto → stessa procedura (allinea watermark + `db:migrate:prod`) o SQL diretto. Fuori dallo scope di questo spec (operativo).

## Testing

- `inviteColor` util: `contrastRatio` su coppie note, `isReadable` soglie AA, `deriveSoft`.
- Schema: `themeSchema` accetta hex validi / rifiuta non-hex; `inviteFont` accetta famiglie del catalogo / rifiuta estranee.
- `updateEvent`: patch include theme/inviteFont.
- Suite d'integrazione esistente (`eventRepository.*`, `creem.test.ts`) resta verde dopo 0010 applicata su dev.

## Out of scope (YAGNI)

- Upload di font proprietari (R2/licenze) — possibile iterazione futura.
- Intero catalogo Google via proxy on-demand — il curato copre gli usi reali.
- 5° picker per `soft`/divider (`--bone-200`) — derivato/lasciato globale.
- Dark mode dell'invito.

## File impattati

`shared/constants/inviteTheme.ts` · `shared/utils/inviteColor.ts` (new) · `shared/types/ceremly.ts` · `shared/schemas/ceremly.ts` · `server/database/schema/events.ts` · `drizzle/migrations/0010_*` (+ journal + snapshot) · `server/services/event.service.ts` · `server/services/publicInvite.service.ts` · `app/components/ceremly/InviteRenderer.vue` · `app/pages/dashboard/events/[id]/editor.vue` · `app/pages/e/[slug]/[token].vue` · `app/assets/css/invite-fonts.css` (new) + `ceremly.css` · i18n it+en.
