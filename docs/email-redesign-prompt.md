# Prompt per Claude — Redesign dei template email di Ceremly

> Copia tutto ciò che segue (dalla riga `---`) e incollalo a Claude.

---

Sei un designer/sviluppatore esperto di **email transazionali HTML** (React Email) con forte sensibilità per il design di brand. Devi **ridisegnare i template email di un prodotto chiamato Ceremly** per allinearli alla sua identità visiva "Soft Meadow". Output finale: **codice React Email pronto all'uso**, drop-in nel progetto esistente.

## 1. Cos'è Ceremly

Ceremly è un servizio di **inviti digitali e RSVP intelligenti** per gli eventi privati che contano — matrimoni, lauree, battesimi, compleanni. L'organizzatore crea un invito, lo distribuisce via link personalizzato, raccoglie le risposte (con domande su allergie, menu, plus-one) e gestisce tutto da una dashboard. Pubblico prevalentemente B2C italiano (chi organizza un evento), più qualche wedding/event planner.

## 2. Situazione attuale e obiettivo

Nel progetto convivono **due stili di email**:
- ✅ Due template (invito ospite e promemoria RSVP) sono **già nel design corretto "Soft Meadow"** — usali come **riferimento canonico** (struttura descritta sotto).
- ❌ Tutti gli altri template (autenticazione, lista d'attesa, contatti, invito team) hanno ancora un **design "blu" da boilerplate**, estraneo al brand: header con gradiente azzurro `#19baf0`, font di sistema generico. **Vanno ridisegnati** nel linguaggio Soft Meadow.

**Obiettivo: unificare tutti i template email sotto il design "Soft Meadow", mantenendo intatta la struttura tecnica e le props esistenti.**

## 3. Design system "Soft Meadow"

Estetica: **warm earthy** — tela color crema, card pulita, accenti camel/sage, titoli serif eleganti, etichette monospace, tono caldo e curato. NON aziendale/freddo, NON gradienti sgargianti.

### Palette (usa ESATTAMENTE questi hex)
| Ruolo | Hex |
|------|------|
| Canvas / sfondo pagina (warm cream "bone") | `#fefae0` |
| Card / contenitore contenuto | `#ffffff` |
| Bordo card (sottile, 1px) | `#e9e4ce` |
| Accento principale "camel" (CTA, eyebrow) | `#d4a373` |
| Testo corpo "ink" (marrone caldo profondo) | `#3F3622` |
| Titoli "wine-deep" | `#5E4426` |
| Testo footer / note secondarie "muted" | `#a89e7e` |
| Accento secondario "sage" (opzionale) | `#ccd5ae` |
| Semantico — successo/conferma | `#6B8E23` |
| Semantico — errore/avviso | `#B0481A` |

### Tipografia (font **email-safe** con fallback di sistema)
I font del brand (Bricolage Grotesque, Be Vietnam Pro, Space Mono) **non si caricano in modo affidabile nei client email** → usa stack di sistema che ne evocano il carattere, esattamente come i template già corretti:
- **Titoli evento/sezione**: serif → `Georgia, 'Times New Roman', serif` — es. 24–32px, weight 600, color `#5E4426`.
- **Corpo del testo**: sans di sistema → `'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif` — 15px, line-height ~1.7, color `#3F3622`.
- **Eyebrow / etichette / footer / pulsanti-testo**: monospace → `'Space Mono', 'Courier New', monospace` — 11–13px, uppercase, letter-spacing 0.06–0.3em, color `#a89e7e` (footer) o `#d4a373` (eyebrow).

### Elementi caratteristici
- **Eyebrow**: piccola etichetta monospace uppercase sopra il titolo (es. `UN INVITO PER TE`).
- **Card**: sfondo bianco `#ffffff`, bordo `1px solid #e9e4ce`, border-radius ~18px, padding ~40px 36px, centrata su canvas crema.
- **CTA "pill"**: pulsante a pillola — `border-radius: 999px`, sfondo `#d4a373`, testo `#3F3622`, padding ~13px 30px, font 14–15px weight 600.
- **Footer**: monospace `#a89e7e`, con `appName` ed eventuale host, link legali (privacy/tos/dpa).
- **Niente** gradienti azzurri, niente header colorati pieni stile boilerplate.
- Container centrale **max-width 560–600px**.

## 4. Vincoli tecnici (CRITICI — il codice deve essere drop-in)

1. **React Email** (`@react-email/components`): `Html, Head, Preview, Body, Container, Section, Text, Link, Button, Hr`, ecc.
2. **NON usare JSX.** Il progetto evita JSX per conflitti con Vue: usa **`React.createElement`** (alias locale `const h = React.createElement`). Questo è un requisito non negoziabile — replica lo stile dei template esistenti.
3. **Stili inline** tramite oggetti `style` (niente CSS esterno, niente classi, niente `<style>` con selettori complessi).
4. **Compatibilità client email** (Gmail, Apple Mail, Outlook): layout robusto, max-width 600px, nessun JavaScript, nessun web font remoto indispensabile (solo fallback di sistema), unità in px, colori in hex.
5. **Internazionalizzazione it/en**: un oggetto `translations` con chiavi `it` ed `en`, default `'it'`. La copy DEVE essere fornita in entrambe le lingue (tranne i template solo-IT indicati).
6. **Deve renderizzare bene anche in plain-text**: il progetto genera una versione testo via `render(el, { plainText: true })`. Struttura semantica pulita (titoli, paragrafi, link espliciti), niente layout che abbia senso solo visivamente.
7. **Link legali via prop** `legalLinks: { privacy: string; tos: string; dpa: string }` — **mai** URL hardcoded tipo `example.com`.
8. **Brand env-driven**: `appName` arriva sempre come prop (non hardcodare "Ceremly").
9. Mantieni le **props esistenti** di ciascun template (sotto) — non cambiare le firme.

### Scheletro di riferimento (replica questo pattern)
```ts
import * as React from 'react';
import { Html, Head, Preview, Body, Container, Section, Text, Link, Button, Hr } from '@react-email/components';

interface XxxEmailProps { language?: 'it' | 'en'; /* ...props specifiche... */ appName: string; legalLinks: { privacy: string; tos: string; dpa: string }; }

const buildTranslations = (appName: string) => ({
  it: { /* tutte le stringhe in italiano */ },
  en: { /* tutte le stringhe in inglese */ },
});

const colors = { bone: '#fefae0', card: '#ffffff', border: '#e9e4ce', accent: '#d4a373', ink: '#3F3622', wineDeep: '#5E4426', muted: '#a89e7e' };
const styles = { /* oggetti stile inline */ };
const h = React.createElement;

export function XxxEmail({ language = 'it', appName, legalLinks, /* ... */ }: XxxEmailProps): React.ReactElement {
  const t = buildTranslations(appName)[language];
  return h(Html, { lang: language }, h(Head), h(Preview, null, t.preview), h(Body, { style: styles.body }, /* ... */));
}
export default XxxEmail;
```

### Design canonico già corretto (da imitare)
I template invito/promemoria ospite usano: canvas `#fefae0`; card bianca centrata (max-width ~560px) con bordo `1px #e9e4ce` e border-radius 18px; **eyebrow** monospace uppercase color camel; **titolo** serif Georgia 32px color `#5E4426`; **messaggio** sans 15px line-height 1.7 color `#3F3622` (con a capo preservati); **CTA pill** camel; **footer** monospace muted. Riproduci questo linguaggio su tutti i template sotto.

## 5. Template da ridisegnare (props + scopo + tono)

Per ciascuno fornisci il componente completo (it + en):

1. **VerificationEmail** — verifica email alla registrazione. Props: `language?, verificationUrl, userName?, appName, legalLinks`. Tono: benvenuto caldo. (Evita "grazie per esserti registrato sul boilerplate"!)
2. **ResetPasswordEmail** — reset password. Props: `language?, resetUrl, userName?, appName, legalLinks`. Includi una nota di sicurezza (link a tempo, ignora se non richiesto).
3. **ChangeEmailEmail** — conferma cambio email, inviata all'indirizzo **attuale**. Props: `language?, confirmUrl, newEmail, userName?, appName, legalLinks`. Mostra `newEmail` in evidenza; spiega che dopo la conferma arriverà una verifica al nuovo indirizzo.
4. **WaitingListEmail** — conferma iscrizione lista d'attesa. Props: `language?, appName, siteUrl, legalLinks`. CTA "visita il sito" → `siteUrl`. Tono: entusiasta, "ti avviseremo al lancio".
5. **OrgInviteEmail** — invito a unirsi a un'organizzazione/team. Props: `language?, inviteUrl, orgName, invitedByName, expiresInDays?, appName, legalLinks`. Tono: cordiale, professionale.
6. **ContactConfirmationEmail** — conferma all'utente che il messaggio è stato ricevuto. Props: `language?, userName, subject, siteUrl?, appName`. Tono: rassicurante ("ti rispondiamo a breve").
7. **ContactNotificationEmail** — notifica all'admin di un nuovo messaggio dal form contatti (**solo italiano**, più utilitaria/interna). Props: `senderName, senderEmail, subject, message, language, submittedAt, appName`. Mostra mittente, oggetto, messaggio (a capo preservati), data.

> Gli inviti/promemoria ospite sono **già fatti**: non rifarli, ma assicurati che i nuovi 7 siano coerenti con loro.

## 6. Tono di voce per la copy

Caldo, rassicurante, concreto. Empatico verso lo stress di chi organizza un evento, **mai pomposo**. Frasi brevi, conversazionali, italiano curato (la versione it è quella di riferimento; l'en ne è la traduzione naturale). Evita gergo tecnico (token, serverless, "piattaforma all-in-one"). Parla all'utente come a una persona, non a un "cliente". Per le email transazionali resta sobrio e chiaro: l'eleganza è nel design, non in copy magniloquente.

## 7. Output atteso

Per ognuno dei 7 template: un file `.ts` completo (componente + `buildTranslations` it/en + `colors`/`styles` + interface props + `export`), conforme ai vincoli §4 e al design §3. Se utile, includi anche una breve nota di anteprima testuale (come apparirà in plain-text) per confermare la resa.

## 8. Checklist di qualità (verifica prima di consegnare)
- [ ] Palette Soft Meadow esatta (niente `#19baf0` né gradienti azzurri).
- [ ] `React.createElement` (NO JSX), stili inline, max-width ≤600px.
- [ ] it + en completi (tranne ContactNotification, solo it).
- [ ] Footer con `legalLinks` (niente URL hardcoded/`example.com`).
- [ ] `appName` da prop, props originali invariate.
- [ ] Buona resa anche in plain-text.
- [ ] Coerenza visiva con i template invito/promemoria ospite esistenti.
