# Tema invito personalizzabile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il tema invito da preset key-based (6 palette + 5 font) a personalizzazione libera: 4 colori hex arbitrari (con avviso contrasto) + un font da un catalogo Google curato (~60) self-hostato.

**Architecture:** L'evento salva `theme jsonb {paper,accent,deep,onAccent}` + `invite_font` come nome famiglia (sostituendo la colonna `palette`). `InviteRenderer` applica i valori come override dei token CSS (`soft` derivato dall'accento). I font sono self-hostati via @nuxt/fonts (no IP ospite verso Google). I 6 preset restano come scorciatoie UI. `null` ⇒ look globale `.cer` invariato.

**Tech Stack:** Nuxt 4 / Vue 3 / TypeScript, Drizzle + Neon, Zod v4, Vitest, @nuxt/fonts.

## Global Constraints

- Validazione body sempre via `parseBody(event, schema)` con schemi da `shared/schemas/` — mai inline.
- Ogni query su `events` filtra per `organizationId` (già garantito dai repository scoped esistenti).
- `theme=null` / `inviteFont=null` DEVE rendere il look globale `.cer` identico a oggi (zero regressione).
- Colori hex nel formato `#rrggbb` (6 cifre). Font ammessi solo se `isCatalogFont(family)` (whitelist).
- Date in memoria/commit assolute. Commit automatici OK su branch `dev`; push manuale (mai automatico).
- Migrazioni: file Drizzle + `_journal.json` + snapshot coerenti. Su dev il watermark `__drizzle_migrations` è a 0009 → `db:migrate` applica 0010 pulito.

---

### Task 0: Baseline — commit del lavoro tema preset (0009)

Il working tree contiene la feature tema key-based (0009) non committata. Va committata come baseline così i diff dei task 0010 restano puliti.

**Files:** (nessuna modifica di codice — solo git)

- [ ] **Step 1: Verifica stato**

Run: `git status --short`
Expected: elenco file modificati (inviteTheme.ts, InviteRenderer.vue, editor.vue, events.ts, ceremly.ts schema+types, publicInvite.service.ts, event.service.ts, e/[slug]/[token].vue, ceremly.css, i18n, migrazioni 0009).

- [ ] **Step 2: Commit baseline**

```bash
git add -A
git commit -m "feat(editor): tema invito a preset (6 palette + 5 font, migrazione 0009)"
```

---

### Task 1: Utility colore (contrasto + soft derivato)

**Files:**
- Create: `shared/utils/inviteColor.ts`
- Test: `shared/utils/inviteColor.test.ts`

**Interfaces:**
- Produces: `hexToRgb(hex): {r,g,b}`, `relativeLuminance(hex): number`, `contrastRatio(fg,bg): number`, `isReadable(fg,bg,large?): boolean`, `deriveSoft(accent): string`.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/utils/inviteColor.test.ts
import { describe, it, expect } from "vitest";
import { contrastRatio, isReadable, deriveSoft, hexToRgb } from "./inviteColor";

describe("inviteColor", () => {
    it("contrastRatio nero/bianco = 21", () => {
        expect(Math.round(contrastRatio("#000000", "#ffffff"))).toBe(21);
    });
    it("contrastRatio è simmetrico", () => {
        expect(contrastRatio("#d4a373", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#d4a373"), 5);
    });
    it("isReadable: bianco su nero ok, grigio chiaro su bianco no", () => {
        expect(isReadable("#ffffff", "#000000")).toBe(true);
        expect(isReadable("#cccccc", "#ffffff")).toBe(false);
    });
    it("deriveSoft restituisce una tinta chiara hex valida", () => {
        const soft = deriveSoft("#8C3B4A");
        expect(soft).toMatch(/^#[0-9a-f]{6}$/);
        // più chiaro dell'accento: luminanza vicina al bianco
        expect(hexToRgb(soft).r).toBeGreaterThan(hexToRgb("#8C3B4A").r);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run shared/utils/inviteColor.test.ts`
Expected: FAIL — "Cannot find module './inviteColor'".

- [ ] **Step 3: Write minimal implementation**

```typescript
// shared/utils/inviteColor.ts
/** Utility colore per il tema invito: contrasto WCAG + derivazione tinta chiara. Funzioni pure. */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace("#", "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

function channelLin(c: number): number {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

/** Rapporto di contrasto WCAG (1..21). */
export function contrastRatio(fg: string, bg: string): number {
    const l1 = relativeLuminance(fg);
    const l2 = relativeLuminance(bg);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

/** Soglia WCAG AA: 4.5:1 testo normale, 3:1 testo grande. */
export function isReadable(fg: string, bg: string, large = false): boolean {
    return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

/** Tinta chiara dell'accento (mix con bianco all'85%) per `--bone-100`. */
export function deriveSoft(accent: string): string {
    const { r, g, b } = hexToRgb(accent);
    const mix = (c: number) => Math.round(c + (255 - c) * 0.85);
    const toHex = (c: number) => mix(c).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run shared/utils/inviteColor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/utils/inviteColor.ts shared/utils/inviteColor.test.ts
git commit -m "feat(invite): util contrasto WCAG + deriveSoft per tema custom"
```

---

### Task 2: Costanti — tipo InviteTheme + catalogo font, refactor preset

**Files:**
- Modify: `shared/constants/inviteTheme.ts`

**Interfaces:**
- Produces: `InviteTheme` type, `INVITE_PALETTES` (invariato, usato come scorciatoie), `INVITE_FONT_CATALOG: CatalogFont[]`, `fontSlug(family)`, `isCatalogFont(family)`, `getCatalogFont(family)`, `DEFAULT_THEME`.
- Rimuove: `PALETTE_KEYS`, `INVITE_FONT_KEYS`, `INVITE_FONTS`, `PaletteKey`, `InviteFontKey`, `getPalette`, `getInviteFont` (key-based, non più usati).

- [ ] **Step 1: Riscrivere il file**

Sostituire l'intero contenuto di `shared/constants/inviteTheme.ts` con:

```typescript
/**
 * Ceremly — tema invito personalizzabile (colori liberi + catalogo font).
 *
 * Il tema è una proprietà dell'evento: `event.theme` (4 colori hex) e
 * `event.inviteFont` (nome famiglia del catalogo). NULL ⇒ token globali `.cer`.
 * Le 6 palette restano come SCORCIATOIE UI (riempiono i picker), non sono più
 * persistite come key. I font del catalogo sono self-hostati via @nuxt/fonts.
 */

export interface InviteTheme {
    /** Sfondo carta → `--bone-50`. */
    paper: string;
    /** Accento (mono titoli, pin, bottone RSVP) → `--tpl-accent` + `--wine`. */
    accent: string;
    /** Tinta profonda (nomi header, orari) → `--wine-deep`. */
    deep: string;
    /** Testo leggibile sopra l'accento (label bottone RSVP) → `--rsvp-on-accent`. */
    onAccent: string;
}

/** Default impliciti = token globali `.cer` (look "toscana"). */
export const DEFAULT_THEME: InviteTheme = {
    paper: "#FFFDF6",
    accent: "#d4a373",
    deep: "#5E4426",
    onAccent: "#3F3622",
};

/** Scorciatoie curate: applicate, riempiono i 4 picker (non persistite). */
export const INVITE_PALETTES: readonly (InviteTheme & { key: string; label: string })[] = [
    { key: "toscana", label: "Toscana", paper: "#FFFDF6", accent: "#d4a373", deep: "#5E4426", onAccent: "#3F3622" },
    { key: "bordeaux", label: "Bordeaux", paper: "#FBF6F4", accent: "#8C3B4A", deep: "#4A2230", onAccent: "#FBF6F4" },
    { key: "salvia", label: "Salvia", paper: "#F7F8F1", accent: "#7E8C5A", deep: "#3F4A2C", onAccent: "#F7F8F1" },
    { key: "polvere", label: "Blu polvere", paper: "#F5F7F9", accent: "#6E8AA6", deep: "#324558", onAccent: "#F5F7F9" },
    { key: "terracotta", label: "Terracotta", paper: "#FBF4F0", accent: "#C2683F", deep: "#6E3318", onAccent: "#FBF4F0" },
    { key: "notte", label: "Notte", paper: "#F3F2F0", accent: "#3F3622", deep: "#1E1A12", onAccent: "#F3F2F0" },
] as const;

export type FontCategory = "serif" | "sans" | "display" | "handwriting";
export interface CatalogFont {
    /** Nome famiglia Google esatto (persistito in `event.inviteFont`). */
    family: string;
    category: FontCategory;
}

/** Catalogo curato di famiglie Google adatte agli inviti, self-hostate. */
export const INVITE_FONT_CATALOG: readonly CatalogFont[] = [
    // Serif
    { family: "Playfair Display", category: "serif" },
    { family: "Cormorant Garamond", category: "serif" },
    { family: "EB Garamond", category: "serif" },
    { family: "Libre Baskerville", category: "serif" },
    { family: "Lora", category: "serif" },
    { family: "Cormorant", category: "serif" },
    { family: "Crimson Text", category: "serif" },
    { family: "Crimson Pro", category: "serif" },
    { family: "Spectral", category: "serif" },
    { family: "Source Serif 4", category: "serif" },
    { family: "PT Serif", category: "serif" },
    { family: "Bitter", category: "serif" },
    { family: "Frank Ruhl Libre", category: "serif" },
    { family: "Noto Serif", category: "serif" },
    { family: "Vollkorn", category: "serif" },
    { family: "Cardo", category: "serif" },
    { family: "Domine", category: "serif" },
    { family: "Bodoni Moda", category: "serif" },
    { family: "DM Serif Display", category: "serif" },
    { family: "DM Serif Text", category: "serif" },
    { family: "Marcellus", category: "serif" },
    { family: "Gilda Display", category: "serif" },
    { family: "Italiana", category: "serif" },
    { family: "Tenor Sans", category: "serif" },
    { family: "Sorts Mill Goudy", category: "serif" },
    { family: "Petrona", category: "serif" },
    // Sans
    { family: "Manrope", category: "sans" },
    { family: "Montserrat", category: "sans" },
    { family: "Be Vietnam Pro", category: "sans" },
    { family: "Inter", category: "sans" },
    { family: "Work Sans", category: "sans" },
    { family: "Nunito Sans", category: "sans" },
    { family: "Raleway", category: "sans" },
    { family: "Poppins", category: "sans" },
    { family: "Jost", category: "sans" },
    { family: "Outfit", category: "sans" },
    { family: "Mulish", category: "sans" },
    { family: "Karla", category: "sans" },
    { family: "Rubik", category: "sans" },
    { family: "DM Sans", category: "sans" },
    { family: "Hanken Grotesk", category: "sans" },
    { family: "Bricolage Grotesque", category: "sans" },
    { family: "Archivo", category: "sans" },
    { family: "Sora", category: "sans" },
    // Display
    { family: "Cinzel", category: "display" },
    { family: "Cinzel Decorative", category: "display" },
    { family: "Fraunces", category: "display" },
    { family: "Cormorant Upright", category: "display" },
    { family: "Yeseva One", category: "display" },
    { family: "Abril Fatface", category: "display" },
    { family: "Della Respira", category: "display" },
    { family: "Forum", category: "display" },
    // Handwriting / Script
    { family: "Great Vibes", category: "handwriting" },
    { family: "Dancing Script", category: "handwriting" },
    { family: "Parisienne", category: "handwriting" },
    { family: "Pinyon Script", category: "handwriting" },
    { family: "Tangerine", category: "handwriting" },
    { family: "Sacramento", category: "handwriting" },
    { family: "Allura", category: "handwriting" },
    { family: "Alex Brush", category: "handwriting" },
    { family: "Petit Formal Script", category: "handwriting" },
    { family: "Marck Script", category: "handwriting" },
] as const;

/** Slug CSS-safe per la classe `.inv-font-<slug>`. */
export function fontSlug(family: string): string {
    return family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function isCatalogFont(family: string): boolean {
    return INVITE_FONT_CATALOG.some((f) => f.family === family);
}

export function getCatalogFont(family: string | null | undefined): CatalogFont | undefined {
    if (!family) return undefined;
    return INVITE_FONT_CATALOG.find((f) => f.family === family);
}
```

- [ ] **Step 2: Typecheck (atteso rosso altrove — è previsto)**

Run: `pnpm typecheck 2>&1 | grep -E "inviteTheme|getPalette|PALETTE_KEYS|INVITE_FONT_KEYS"`
Expected: errori nei file consumer (schema, types, renderer, editor) — verranno risolti nei task seguenti. Confermano i punti da aggiornare.

- [ ] **Step 3: Commit**

```bash
git add shared/constants/inviteTheme.ts
git commit -m "feat(invite): InviteTheme + catalogo font ~60, preset come scorciatoie"
```

---

### Task 3: Schema validazione

**Files:**
- Modify: `shared/schemas/ceremly.ts`
- Test: `shared/schemas/inviteTheme.schema.test.ts`

**Interfaces:**
- Consumes: `isCatalogFont` da Task 2.
- Produces: `hexColorSchema`, `themeSchema`; `updateEventSchema` con `theme`/`inviteFont`.

- [ ] **Step 1: Write the failing test**

```typescript
// shared/schemas/inviteTheme.schema.test.ts
import { describe, it, expect } from "vitest";
import { themeSchema, updateEventSchema } from "./ceremly";

describe("themeSchema + updateEventSchema (tema custom)", () => {
    const theme = { paper: "#FFFFFF", accent: "#d4a373", deep: "#5E4426", onAccent: "#3F3622" };
    it("accetta un tema hex valido", () => {
        expect(themeSchema.safeParse(theme).success).toBe(true);
    });
    it("rifiuta hex non validi", () => {
        expect(themeSchema.safeParse({ ...theme, accent: "red" }).success).toBe(false);
    });
    it("updateEvent accetta inviteFont in catalogo, rifiuta estranei", () => {
        expect(updateEventSchema.safeParse({ inviteFont: "Lora" }).success).toBe(true);
        expect(updateEventSchema.safeParse({ inviteFont: "Comic Sans MS" }).success).toBe(false);
    });
    it("updateEvent accetta theme e inviteFont null (reset)", () => {
        expect(updateEventSchema.safeParse({ theme: null, inviteFont: null }).success).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run shared/schemas/inviteTheme.schema.test.ts`
Expected: FAIL — `themeSchema` non esiste / `inviteFont` non validato.

- [ ] **Step 3: Edit `shared/schemas/ceremly.ts`**

Cambiare l'import (riga ~7) da:
```typescript
import { INVITE_FONT_KEYS, PALETTE_KEYS } from "../constants/inviteTheme";
```
a:
```typescript
import { isCatalogFont } from "../constants/inviteTheme";
```

Rimuovere le due righe enum (dopo `attendingEnum`):
```typescript
export const paletteKeyEnum = z.enum(PALETTE_KEYS);
export const inviteFontEnum = z.enum(INVITE_FONT_KEYS);
```
e sostituirle con:
```typescript
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido (atteso #rrggbb)");
export const themeSchema = z.object({
    paper: hexColorSchema,
    accent: hexColorSchema,
    deep: hexColorSchema,
    onAccent: hexColorSchema,
});
```

In `updateEventSchema`, sostituire:
```typescript
    palette: paletteKeyEnum.nullish(),
    inviteFont: inviteFontEnum.nullish(),
```
con:
```typescript
    theme: themeSchema.nullish(),
    inviteFont: z.string().max(80).refine(isCatalogFont, "Font non in catalogo").nullish(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run shared/schemas/inviteTheme.schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/schemas/ceremly.ts shared/schemas/inviteTheme.schema.test.ts
git commit -m "feat(invite): schema theme hex + inviteFont whitelist catalogo"
```

---

### Task 4: Tipi condivisi

**Files:**
- Modify: `shared/types/ceremly.ts`

**Interfaces:**
- Consumes: `InviteTheme` da Task 2.
- Produces: `CeremlyEvent.theme`/`inviteFont`; `PublicInvitePayload` aggiornato.

- [ ] **Step 1: Aggiungere import del tipo (in cima al file, dopo il commento di intestazione)**

```typescript
import type { InviteTheme } from '../constants/inviteTheme'
```

- [ ] **Step 2: In `CeremlyEvent`, sostituire le righe `palette`/`inviteFont`**

Da:
```typescript
  /** Key palette colori (shared/constants/inviteTheme). null ⇒ token globali (look toscana). */
  palette: string | null
  /** Key carattere display (shared/constants/inviteTheme). null ⇒ --font-display globale. */
  inviteFont: string | null
```
a:
```typescript
  /** Tema colori custom; null ⇒ token globali (look toscana). */
  theme: InviteTheme | null
  /** Nome famiglia del catalogo font; null ⇒ --font-display globale. */
  inviteFont: string | null
```

- [ ] **Step 3: In `PublicInvitePayload`, aggiornare il Pick**

Da `| 'templateKey' | 'palette' | 'inviteFont' |` a `| 'templateKey' | 'theme' | 'inviteFont' |`.

- [ ] **Step 4: Typecheck mirato**

Run: `pnpm typecheck 2>&1 | grep -E "ceremly.ts|theme|palette" | head`
Expected: restano errori in renderer/editor/service/db (prossimi task), non nei tipi stessi.

- [ ] **Step 5: Commit**

```bash
git add shared/types/ceremly.ts
git commit -m "feat(invite): CeremlyEvent.theme + payload pubblico"
```

---

### Task 5: Schema DB + migrazione 0010 (data-preserving)

**Files:**
- Modify: `server/database/schema/events.ts`
- Create: `drizzle/migrations/0010_event_invite_theme_custom.sql`
- Modify: `drizzle/migrations/meta/_journal.json`
- Create: `drizzle/migrations/meta/0010_snapshot.json`

**Interfaces:**
- Consumes: `InviteTheme` da Task 2.

- [ ] **Step 1: Edit `server/database/schema/events.ts`**

Aggiungere l'import del tipo su riga separata (da constants — `types/ceremly` non lo esporta):
```typescript
import type { InviteTheme } from "~~/shared/constants/inviteTheme";
```
(lasciare invariato l'import esistente `EventDistribution, InviteBlock, RsvpQuestion` da `~~/shared/types/ceremly`.)

Sostituire il blocco colonne tema. Da:
```typescript
        palette: text("palette"),
        inviteFont: text("invite_font"),
```
a:
```typescript
        theme: jsonb("theme").$type<InviteTheme>(),
        inviteFont: text("invite_font"),
```

- [ ] **Step 2: Create `drizzle/migrations/0010_event_invite_theme_custom.sql`**

```sql
ALTER TABLE "events" ADD COLUMN "theme" jsonb;--> statement-breakpoint
UPDATE "events" SET "theme" = CASE "palette"
  WHEN 'toscana' THEN '{"paper":"#FFFDF6","accent":"#d4a373","deep":"#5E4426","onAccent":"#3F3622"}'::jsonb
  WHEN 'bordeaux' THEN '{"paper":"#FBF6F4","accent":"#8C3B4A","deep":"#4A2230","onAccent":"#FBF6F4"}'::jsonb
  WHEN 'salvia' THEN '{"paper":"#F7F8F1","accent":"#7E8C5A","deep":"#3F4A2C","onAccent":"#F7F8F1"}'::jsonb
  WHEN 'polvere' THEN '{"paper":"#F5F7F9","accent":"#6E8AA6","deep":"#324558","onAccent":"#F5F7F9"}'::jsonb
  WHEN 'terracotta' THEN '{"paper":"#FBF4F0","accent":"#C2683F","deep":"#6E3318","onAccent":"#FBF4F0"}'::jsonb
  WHEN 'notte' THEN '{"paper":"#F3F2F0","accent":"#3F3622","deep":"#1E1A12","onAccent":"#F3F2F0"}'::jsonb
  ELSE "theme" END
WHERE "palette" IS NOT NULL;--> statement-breakpoint
UPDATE "events" SET "invite_font" = CASE "invite_font"
  WHEN 'bricolage' THEN 'Bricolage Grotesque'
  WHEN 'playfair' THEN 'Playfair Display'
  WHEN 'cormorant' THEN 'Cormorant Garamond'
  WHEN 'garamond' THEN 'EB Garamond'
  WHEN 'baskerville' THEN 'Libre Baskerville'
  ELSE "invite_font" END
WHERE "invite_font" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "events" DROP COLUMN "palette";
```

- [ ] **Step 3: Aggiornare `_journal.json`**

Aggiungere dopo la entry idx 9 (within `entries`):
```json
    ,{
      "idx": 10,
      "version": "7",
      "when": 1782200000000,
      "tag": "0010_event_invite_theme_custom",
      "breakpoints": true
    }
```
(inserire la virgola corretta: la entry 9 chiude con `}` → aggiungere `,` prima della nuova `{`.)

- [ ] **Step 4: Create `0010_snapshot.json`**

Copiare `0009_snapshot.json` → `0010_snapshot.json`, poi:
- Header: `id` = nuovo uuid (genera con `node -e "console.log(require('crypto').randomUUID())"`), `prevId` = id di 0009 (`37c7904b-46c9-4b40-bd71-5952be2497b9`).
- Nella tabella `public.events` → `columns`: rimuovere il blocco `"palette": {...}` e sostituire con:
```json
        "theme": {
          "name": "theme",
          "type": "jsonb",
          "primaryKey": false,
          "notNull": false
        },
```
(lasciare `"invite_font"` invariato.)

- [ ] **Step 5: Applicare su dev**

Run: `pnpm db:migrate`
Expected: "migrations applied successfully!" (watermark già a 0009 → applica solo 0010).

- [ ] **Step 6: Verificare schema**

Run:
```bash
NODE_PATH=$(pwd)/node_modules node -e "const{readFileSync}=require('fs');const pg=require('pg');const u=readFileSync('.env','utf8').match(/^NUXT_DATABASE_URL_DIRECT=(.*)$/m)[1].trim();const c=new pg.Client({connectionString:u});c.connect().then(async()=>{const r=await c.query(\"select column_name from information_schema.columns where table_name='events' and column_name in ('palette','theme')\");console.log(r.rows.map(x=>x.column_name));await c.end()})"
```
Expected: `[ 'theme' ]` (palette assente).

- [ ] **Step 7: Commit**

```bash
git add server/database/schema/events.ts drizzle/migrations/0010_event_invite_theme_custom.sql drizzle/migrations/meta/_journal.json drizzle/migrations/meta/0010_snapshot.json
git commit -m "feat(db): migrazione 0010 — theme jsonb, drop palette (data-preserving)"
```

---

### Task 6: Service (updateEvent + payload pubblico)

**Files:**
- Modify: `server/services/event.service.ts:280-303` (patch `updateEvent`)
- Modify: `server/services/publicInvite.service.ts` (entrambi i payload)

**Interfaces:**
- Consumes: `InviteTheme` (tipo), `themeSchema`-validated `UpdateEventInput`.

- [ ] **Step 1: Edit `event.service.ts` — tipo del patch**

Nel `patch` di `updateEvent`, sostituire:
```typescript
        palette: string | null;
        inviteFont: string | null;
```
con:
```typescript
        theme: InviteTheme | null;
        inviteFont: string | null;
```
Aggiungere l'import in cima se assente: `import type { InviteTheme } from "~~/shared/constants/inviteTheme";`

- [ ] **Step 2: Edit `event.service.ts` — assegnazioni patch**

Sostituire:
```typescript
    if (data.palette !== undefined) patch.palette = data.palette;
    if (data.inviteFont !== undefined) patch.inviteFont = data.inviteFont;
```
con:
```typescript
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.inviteFont !== undefined) patch.inviteFont = data.inviteFont;
```

- [ ] **Step 3: Edit `publicInvite.service.ts` — getPublicInvite**

Sostituire (nel return di `getPublicInvite`):
```typescript
            palette: eventRow.palette,
            inviteFont: eventRow.inviteFont,
```
con:
```typescript
            theme: eventRow.theme,
            inviteFont: eventRow.inviteFont,
```

- [ ] **Step 4: Edit `publicInvite.service.ts` — getInvitePreview**

Stessa sostituzione nel return di `getInvitePreview`.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck 2>&1 | grep -E "event.service|publicInvite" | head`
Expected: nessun errore in questi due file.

- [ ] **Step 6: Commit**

```bash
git add server/services/event.service.ts server/services/publicInvite.service.ts
git commit -m "feat(invite): service e payload pubblico usano theme custom"
```

---

### Task 7: InviteRenderer — applica tema custom

**Files:**
- Modify: `app/components/ceremly/InviteRenderer.vue`

**Interfaces:**
- Consumes: `InviteTheme`, `fontSlug`, `getCatalogFont` da Task 2; `deriveSoft` da Task 1.
- Produces: prop `theme: InviteTheme | null`, `font: string | null`.

- [ ] **Step 1: Aggiornare gli import**

Sostituire:
```typescript
import { getInviteFont, getPalette } from "~~/shared/constants/inviteTheme";
```
con:
```typescript
import type { InviteTheme } from "~~/shared/constants/inviteTheme";
import { fontSlug, getCatalogFont } from "~~/shared/constants/inviteTheme";
import { deriveSoft } from "~~/shared/utils/inviteColor";
```

- [ ] **Step 2: Aggiornare le prop**

Sostituire le righe prop `palette`/`font`:
```typescript
        /** Key palette (inviteTheme). null/assente ⇒ accento dal template. */
        palette?: string | null;
        /** Key carattere (inviteTheme). null/assente ⇒ --font-display globale. */
        font?: string | null;
```
con:
```typescript
        /** Tema colori custom. null/assente ⇒ accento dal template. */
        theme?: InviteTheme | null;
        /** Nome famiglia del catalogo font. null/assente ⇒ --font-display globale. */
        font?: string | null;
```
E nel blocco `withDefaults` sostituire `palette: null,` con `theme: null,` (lasciare `font: null,`).

- [ ] **Step 3: Sostituire il blocco palette/font computed + rootStyle**

Sostituire:
```typescript
const palette = computed(() => getPalette(props.palette));
const inviteFont = computed(() => getInviteFont(props.font));

const accent = computed(() => palette.value?.accent ?? tpl.value.accent);
const accentSoft = computed(() => palette.value?.soft ?? tpl.value.accentSoft);

const rootClass = computed(() => inviteFont.value?.cssClass ?? "");
```
con:
```typescript
const theme = computed(() => props.theme ?? null);
const catalogFont = computed(() => getCatalogFont(props.font));

const accent = computed(() => theme.value?.accent ?? tpl.value.accent);
const accentSoft = computed(() => (theme.value ? deriveSoft(theme.value.accent) : tpl.value.accentSoft));

const rootClass = computed(() => (catalogFont.value ? `inv-font-${fontSlug(catalogFont.value.family)}` : ""));
```

E nel `rootStyle` sostituire il ramo palette/font:
```typescript
        ...(p
            ? {
                "--bone-50": p.paper,
                "--bone-100": p.soft,
                "--wine": p.accent,
                "--wine-deep": p.deep,
                "--rsvp-on-accent": p.onAccent,
            }
            : {}),
        ...(f ? { "--font-display": f.family } : {}),
```
con (rinominare `const p = palette.value; const f = inviteFont.value;` → `const t = theme.value; const f = catalogFont.value;`):
```typescript
        ...(t
            ? {
                "--bone-50": t.paper,
                "--bone-100": deriveSoft(t.accent),
                "--wine": t.accent,
                "--wine-deep": t.deep,
                "--rsvp-on-accent": t.onAccent,
            }
            : {}),
        ...(f ? { "--font-display": `'${f.family}', serif` } : {}),
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck 2>&1 | grep "InviteRenderer"`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add app/components/ceremly/InviteRenderer.vue
git commit -m "feat(invite): renderer applica tema custom + font catalogo"
```

---

### Task 8: Self-hosting catalogo font (CSS + @nuxt/fonts)

**Files:**
- Create: `app/assets/css/invite-fonts.css`
- Modify: `nuxt.config.ts` (registrare il CSS + weights)
- Modify: `app/assets/css/ceremly.css` (rimuovere le 5 classi `.inv-font-*` 0009)

**Interfaces:**
- Consumes: famiglie da `INVITE_FONT_CATALOG` (Task 2). Una classe `.inv-font-<slug>` per famiglia.

- [ ] **Step 1: Generare il CSS dal catalogo**

Run (genera il file dalle costanti, evita errori di battitura sui 60 nomi):
```bash
NODE_PATH=$(pwd)/node_modules npx tsx -e "
import { INVITE_FONT_CATALOG, fontSlug } from './shared/constants/inviteTheme';
import { writeFileSync } from 'fs';
const fb = { serif: 'Georgia, serif', sans: 'system-ui, sans-serif', display: 'Georgia, serif', handwriting: 'cursive' };
const head = '/* Catalogo font invito (inviteTheme.INVITE_FONT_CATALOG) self-hostato da @nuxt/fonts.\n   Le font-family esplicite fanno scaricare i webfont; le classi sono applicate\n   sul root di InviteRenderer. GENERATO — rigenerare se cambia il catalogo. */\n';
const body = INVITE_FONT_CATALOG.map(f => \`.inv-font-\${fontSlug(f.family)} { font-family: '\${f.family}', \${fb[f.category]}; }\`).join('\n');
writeFileSync('app/assets/css/invite-fonts.css', head + body + '\n');
console.log('scritte', INVITE_FONT_CATALOG.length, 'classi');
"
```
Expected: "scritte 60 classi" (circa). Verificare con `head -5 app/assets/css/invite-fonts.css`.

- [ ] **Step 2: Registrare il CSS in `nuxt.config.ts`**

Aggiungere `'~/assets/css/invite-fonts.css'` all'array `css: [...]`. Configurare i pesi per il bold dei titoli — nel blocco modulo fonts (crearlo se assente):
```typescript
  fonts: {
    defaults: { weights: [400, 600, 700] },
  },
```

- [ ] **Step 3: Rimuovere le 5 classi 0009 da `ceremly.css`**

Eliminare il blocco `.inv-font-bricolage … .inv-font-baskerville` (commento "Caratteri invito (inviteTheme · INV_FONTS)") — ora vivono in `invite-fonts.css` generato.

- [ ] **Step 4: Verificare build dei font**

Run: `pnpm build 2>&1 | tail -20`
Expected: build completa senza errori sui font (il warning pre-esistente `sharp-wasm32` è atteso e ignorabile).

- [ ] **Step 5: Commit**

```bash
git add app/assets/css/invite-fonts.css app/assets/css/ceremly.css nuxt.config.ts
git commit -m "feat(invite): self-host catalogo font (~60) via @nuxt/fonts"
```

---

### Task 9: Editor — pannello Aspetto custom (picker + ricerca font + contrasto)

**Files:**
- Modify: `app/pages/dashboard/events/[id]/editor.vue`
- Modify: `i18n/locales/it-IT.json`, `i18n/locales/en-US.json`

**Interfaces:**
- Consumes: `INVITE_PALETTES`, `INVITE_FONT_CATALOG`, `DEFAULT_THEME`, `fontSlug` (Task 2); `isReadable` (Task 1); `InviteTheme` (Task 2).

- [ ] **Step 1: Aggiornare gli import (script)**

Sostituire:
```typescript
import { INVITE_FONTS, INVITE_PALETTES, getPalette } from "~~/shared/constants/inviteTheme";
```
con:
```typescript
import type { InviteTheme } from "~~/shared/constants/inviteTheme";
import { DEFAULT_THEME, INVITE_FONT_CATALOG, INVITE_PALETTES, fontSlug } from "~~/shared/constants/inviteTheme";
import { isReadable } from "~~/shared/utils/inviteColor";
```

- [ ] **Step 2: Sostituire lo stato tema**

Sostituire:
```typescript
const paletteKey = ref<string | null>(null);
const fontKey = ref<string | null>(null);
```
con:
```typescript
const theme = ref<InviteTheme | null>(null);
const fontFamily = ref<string | null>(null);
const fontSearch = ref("");
```

- [ ] **Step 3: loadEvent — caricare i nuovi campi**

Sostituire:
```typescript
        paletteKey.value = ev.palette;
        fontKey.value = ev.inviteFont;
```
con:
```typescript
        theme.value = ev.theme ? { ...ev.theme } : null;
        fontFamily.value = ev.inviteFont;
```

- [ ] **Step 4: snapshot() — includere i nuovi campi**

Sostituire `palette: paletteKey.value, inviteFont: fontKey.value` con `theme: theme.value, inviteFont: fontFamily.value`.

- [ ] **Step 5: save() body**

Sostituire `palette: paletteKey.value, inviteFont: fontKey.value,` con `theme: theme.value, inviteFont: fontFamily.value,`.

- [ ] **Step 6: Sostituire le funzioni/computed dell'aspetto**

Sostituire il blocco `currentAccent`/`fontSampleNames` con i nuovi helper:
```typescript
/** Pallino nella libreria: accento del tema scelto o, se null, del template. */
const currentAccent = computed(() => theme.value?.accent ?? getTemplate(eventData.value?.templateKey ?? "")?.accent ?? "#d4a373");

/** Anteprima carattere: i nomi reali della coppia se presenti, altrimenti sample. */
const fontSampleNames = computed(() => {
    const header = blocks.value.find((b) => b.type === "header");
    if (header?.type === "header") {
        const names = header.data.names.filter(Boolean).join(" & ");
        if (names) return names;
    }
    return t("ceremly.event.editor.appearance.fontSample");
});

/** I 4 ruoli colore mostrati come picker. */
const COLOR_ROLES = [
    { key: "paper", label: () => t("ceremly.event.editor.appearance.colorPaper") },
    { key: "accent", label: () => t("ceremly.event.editor.appearance.colorAccent") },
    { key: "deep", label: () => t("ceremly.event.editor.appearance.colorDeep") },
    { key: "onAccent", label: () => t("ceremly.event.editor.appearance.colorOnAccent") },
] as const;

/** Lettura/scrittura di un singolo colore: inizializza da DEFAULT_THEME se null. */
function colorValue(role: keyof InviteTheme): string {
    return theme.value?.[role] ?? DEFAULT_THEME[role];
}
function setColor(role: keyof InviteTheme, value: string) {
    const base = theme.value ?? { ...DEFAULT_THEME };
    theme.value = { ...base, [role]: value };
}

/** Applica un preset (riempie i 4 picker). */
function applyPreset(p: InviteTheme) {
    theme.value = { paper: p.paper, accent: p.accent, deep: p.deep, onAccent: p.onAccent };
}

/** Reset al look globale. */
function resetTheme() {
    theme.value = null;
    fontFamily.value = null;
}

/** Catalogo filtrato dalla ricerca. */
const filteredFonts = computed(() => {
    const q = fontSearch.value.trim().toLowerCase();
    if (!q) return INVITE_FONT_CATALOG;
    return INVITE_FONT_CATALOG.filter((f) => f.family.toLowerCase().includes(q));
});

/** Avvisi di contrasto (non bloccanti) sulle 3 coppie critiche. */
const contrastWarnings = computed<string[]>(() => {
    const t0 = theme.value;
    if (!t0) return [];
    const w: string[] = [];
    if (!isReadable(t0.onAccent, t0.accent)) w.push(t("ceremly.event.editor.appearance.warnButton"));
    if (!isReadable("#57492F", t0.paper)) w.push(t("ceremly.event.editor.appearance.warnBody"));
    if (!isReadable(t0.deep, t0.paper, true)) w.push(t("ceremly.event.editor.appearance.warnTitle"));
    return w;
});
```

- [ ] **Step 7: Passare i nuovi campi ai due renderer (template)**

In entrambe le occorrenze di `<CeremlyInviteRenderer …>` sostituire `:palette="paletteKey"` con `:theme="theme"` e `:font="fontKey"` con `:font="fontFamily"`.

- [ ] **Step 8: Sostituire il pannello inspector "Tema & colori" (template)**

Rimpiazzare il contenuto del `<template v-if="appearance"> … </template>` (griglia palette + lista font 0009) con:
```html
                <template v-if="appearance">
                    <div>
                        <div class="mono" style="font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-500);">
                            {{ $t('ceremly.event.editor.appearance.heading') }}
                        </div>
                        <div class="serif" style="font-size: 22px; margin-top: 2px;">{{ $t('ceremly.event.editor.appearance.themeColors') }}</div>
                    </div>

                    <!-- Preset scorciatoie -->
                    <div class="col" style="gap: 6px;">
                        <label class="ins-label">{{ $t('ceremly.event.editor.appearance.presets') }}</label>
                        <div class="row" style="gap: 6px; flex-wrap: wrap;">
                            <button
                                v-for="p in INVITE_PALETTES"
                                :key="p.key"
                                type="button"
                                class="cer-btn ghost small"
                                style="padding: 4px 8px; gap: 6px;"
                                @click="applyPreset(p)"
                            >
                                <span :style="{ width: '12px', height: '12px', borderRadius: '50%', background: p.accent, border: '1px solid var(--line)' }" />
                                {{ p.label }}
                            </button>
                        </div>
                    </div>

                    <!-- Color picker (4 ruoli) -->
                    <div class="col" style="gap: 8px;">
                        <label class="ins-label">{{ $t('ceremly.event.editor.appearance.colors') }}</label>
                        <div v-for="role in COLOR_ROLES" :key="role.key" class="row" style="gap: 8px; align-items: center;">
                            <input
                                type="color"
                                :value="colorValue(role.key)"
                                style="width: 34px; height: 28px; border: 1px solid var(--line); border-radius: 6px; padding: 0; background: none; cursor: pointer;"
                                @input="setColor(role.key, ($event.target as HTMLInputElement).value)"
                            >
                            <input
                                class="cer-input"
                                :value="colorValue(role.key)"
                                style="flex: 1; font-family: var(--font-mono); text-transform: uppercase;"
                                maxlength="7"
                                @change="setColor(role.key, ($event.target as HTMLInputElement).value)"
                            >
                            <span style="font-size: 12px; flex: 1;">{{ role.label() }}</span>
                        </div>
                        <div v-if="contrastWarnings.length" class="col" style="gap: 2px;">
                            <div v-for="(w, i) in contrastWarnings" :key="i" class="small" style="color: var(--decline);">
                                ⚠ {{ w }}
                            </div>
                        </div>
                    </div>

                    <div class="divider" />

                    <!-- Font con ricerca -->
                    <div class="col" style="gap: 8px;">
                        <label class="ins-label">{{ $t('ceremly.event.editor.appearance.font') }}</label>
                        <input v-model="fontSearch" class="cer-input" :placeholder="$t('ceremly.event.editor.appearance.fontSearch')">
                        <div class="col" style="gap: 4px; max-height: 260px; overflow-y: auto;">
                            <div
                                v-for="ft in filteredFonts"
                                :key="ft.family"
                                class="row"
                                :style="{
                                    gap: '10px', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
                                    alignItems: 'center', justifyContent: 'space-between',
                                    background: fontFamily === ft.family ? 'var(--bone-100)' : 'transparent',
                                    border: '1px solid ' + (fontFamily === ft.family ? 'var(--ink)' : 'transparent'),
                                }"
                                @click="fontFamily = ft.family"
                            >
                                <span :class="`inv-font-${fontSlug(ft.family)}`" style="font-size: 16px;">{{ fontSampleNames }}</span>
                                <span class="mono" style="font-size: 9px; color: var(--ink-500);">{{ ft.family }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="divider" />
                    <button type="button" class="cer-btn ghost small" style="justify-content: center;" @click="resetTheme">
                        {{ $t('ceremly.event.editor.appearance.reset') }}
                    </button>
                </template>
```
(Nota: il preview font nella lista applica la classe `inv-font-*` direttamente — accettabile; per ottimizzare in seguito si può lazy-load, ma il catalogo self-hostato carica on-demand al primo render della classe.)

- [ ] **Step 9: Aggiungere le chiavi i18n**

In `it-IT.json` e `en-US.json`, sotto `ceremly.event.editor.appearance`: **rimuovere** `palette` e `paletteHint`; **conservare** `heading`, `themeColors`, `font`, `fontSample` (già presenti da 0009); **aggiungere** le nuove chiavi. it-IT:
```json
          "presets": "Punto di partenza",
          "colors": "Colori",
          "colorPaper": "Sfondo",
          "colorAccent": "Accento",
          "colorDeep": "Titoli",
          "colorOnAccent": "Testo bottone",
          "fontSearch": "Cerca un font…",
          "reset": "Ripristina look predefinito",
          "warnButton": "Etichetta bottone poco leggibile sull'accento",
          "warnBody": "Testo poco leggibile sullo sfondo",
          "warnTitle": "Titoli poco leggibili sullo sfondo"
```
en-US (stesse chiavi, tradotte): `"presets": "Starting point"`, `"colors": "Colors"`, `"colorPaper": "Background"`, `"colorAccent": "Accent"`, `"colorDeep": "Titles"`, `"colorOnAccent": "Button text"`, `"fontSearch": "Search a font…"`, `"reset": "Reset to default look"`, `"warnButton": "Button label hard to read on the accent"`, `"warnBody": "Text hard to read on the background"`, `"warnTitle": "Titles hard to read on the background"`.

- [ ] **Step 10: Typecheck**

Run: `pnpm typecheck 2>&1 | grep -E "editor.vue|error TS" | head`
Expected: nessun errore.

- [ ] **Step 11: Commit**

```bash
git add app/pages/dashboard/events/\[id\]/editor.vue i18n/locales/it-IT.json i18n/locales/en-US.json
git commit -m "feat(editor): pannello Aspetto custom — color picker, ricerca font, contrasto"
```

---

### Task 10: Pagina pubblica invito

**Files:**
- Modify: `app/pages/e/[slug]/[token].vue`

- [ ] **Step 1: Passare theme/font al renderer**

Sostituire `:palette="ev!.palette"` con `:theme="ev!.theme"` (lasciare `:font="ev!.inviteFont"`).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck 2>&1 | grep -E "token.vue|error TS" | head`
Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add app/pages/e/\[slug\]/\[token\].vue
git commit -m "feat(invite): pagina pubblica usa tema custom"
```

---

### Task 11: Verifica finale (typecheck + suite + smoke)

**Files:** (nessuna modifica — gate di qualità)

- [ ] **Step 1: Typecheck completo**

Run: `pnpm typecheck`
Expected: EXIT 0, 0 errori.

- [ ] **Step 2: Suite test**

Run: `pnpm test`
Expected: tutti i file verdi (inclusi i nuovi `inviteColor.test.ts`, `inviteTheme.schema.test.ts` e gli `eventRepository.*`/`creem.test.ts` d'integrazione dopo 0010 su dev).

- [ ] **Step 3: Smoke manuale (dev server)**

Run: `pnpm dev` → aprire un evento → editor → "Aspetto". Verificare: i 4 picker cambiano il preview live; un preset riempie i picker; la ricerca font filtra; selezionando un font il preview cambia carattere; un accento scuro con onAccent scuro mostra l'avviso contrasto; "Ripristina" torna al look default; Salva persiste (ricarica pagina).

- [ ] **Step 4: Commit finale (se restano aggiustamenti)**

```bash
git add -A
git commit -m "chore(invite): rifiniture tema custom dopo verifica"
```

---

## Note operative (post-piano)

- **PROD**: la 0010 (come la 0009) va applicata al branch main, che ha il debito journal. Procedura fuori scope del piano (operativa): allineare watermark + `db:migrate:prod`, oppure SQL diretto additivo (`ALTER TABLE events ADD COLUMN theme jsonb;` + UPDATE conversione + `DROP COLUMN palette;`). Vedi [[ceremly-drizzle-journal-disallineato]].
- **Push** sempre manuale.
