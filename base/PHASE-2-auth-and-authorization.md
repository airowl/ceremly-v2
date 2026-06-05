# PHASE 2 — Authentication & Authorization

> **Obiettivo della fase.** Due cose distinte e ugualmente importanti: **authentication** (chi è l'utente — Better Auth) e **authorization** (cosa può fare — ruoli, permessi, ownership). La seconda è quella che la maggior parte dei boilerplate dimentica, ed è un buco di sicurezza. Qui si costruiscono entrambe, integrate con la multi-tenancy della Fase 1.
>
> **Leggi prima `STACK-AND-CONVENTIONS.md`** e assicurati che la Fase 1 abbia passato il suo checkpoint (lo schema tenant esiste).

---

## La distinzione chiave (non confonderle)

- **Authentication** = verificare l'identità. "Questo è davvero Mario?" → Better Auth (sessioni, login, signup, verifica email, reset password).
- **Authorization** = verificare il permesso. "Mario può cancellare questo progetto?" → ruoli + ownership + gating. Questa è logica TUA, sopra Better Auth.

Un boilerplate con solo la prima è insicuro: chiunque loggato potrebbe toccare risorse non sue. Servono entrambe.

---

## Scope

### ✅ In questa fase
- **Better Auth** configurato con adapter Drizzle, integrato con lo schema della Fase 1.
- **Plugin organization** di Better Auth attivo: creazione org, inviti, membri, ruoli, organizzazione "attiva" in sessione.
- Flussi auth: signup, login, logout, verifica email, reset password (gli endpoint email veri arrivano in Fase 4 — qui si predispongono i trigger).
- Al signup di un nuovo utente: **creazione automatica della sua organization personale** (il caso B2C degenere della Fase 1). Questo è un punto critico di integrazione.
- **Middleware di authentication** (`server/middleware/`): popola il contesto della richiesta con utente + organization attiva. Le rotte protette lo usano.
- **Layer di authorization**:
  - Definizione dei ruoli e dei permessi (allineata ai ruoli del plugin organization: owner/admin/member).
  - Un helper/pattern stile **Policy/Gate di Laravel**: funzioni che rispondono "questo utente, con questo ruolo, in questa org, può fare questa azione su questa risorsa?".
  - Controllo di **ownership**: una risorsa con `organizationId` è accessibile solo a membri di quell'org. Helper riutilizzabile.
- Composable/utility lato frontend per conoscere utente, org attiva, ruolo (per gating UI).

### ❌ NON in questa fase
- L'invio reale delle email (verifica/reset) → Fase 4 (qui si chiama un placeholder `sendEmail` o si logga; la vera implementazione Resend è Fase 4)
- Gating per **piano di abbonamento** (Pro vs Free) → Fase 3 (dipende dal billing). Qui si fa solo il gating per **ruolo**.
- Rate limiting sulle rotte auth → Fase 4

---

## Task dettagliati

### 2.1 — Configura Better Auth
- Consulta via web la doc aggiornata di Better Auth (setup con Nuxt/Nitro + adapter Drizzle).
- Configura l'istanza in `server/utils/auth.ts` (o percorso idiomatico): adapter Drizzle sul client della Fase 1, secret da `env`, email+password provider.
- Allinea/migra lo schema se Better Auth richiede tabelle non ancora presenti (coordina con la decisione documentata in Fase 1.1).

### 2.2 — Attiva il plugin organization
- Abilita il plugin organization. Configura i ruoli (owner/admin/member) coerenti con la tabella `members` della Fase 1.
- Abilita la nozione di **organization attiva** nella sessione (l'utente "agisce dentro" un'org alla volta).

### 2.3 — Auto-creazione org personale al signup (CRITICO)
- Aggancia un hook al signup: quando nasce un nuovo utente, crea automaticamente la sua organization personale e aggiungilo come owner. Imposta quell'org come attiva.
- Questo realizza il "B2C = org con 1 membro" della Fase 1. Senza questo, un utente nuovo non avrebbe un tenant.

### 2.4 — Middleware di authentication
- Crea un middleware server che, su rotte protette, verifica la sessione e popola il context con `{ user, organization, role }`.
- Le rotte non protette (landing, health, webhook) restano fuori.
- Definisci una convenzione chiara per marcare una rotta come protetta.

### 2.5 — Layer di authorization (Policy/Gate-style)
- Crea `server/services/authorization/` (o `server/utils/authorization.ts`):
  - Una mappa ruolo→permessi (es. solo owner/admin possono invitare membri; member no).
  - Una funzione `can(user, action, resource?)` che valuta il permesso.
  - Un helper `assertOwnership(organizationId, resource)` che lancia un errore 403 se la risorsa non appartiene all'org dell'utente.
- **Pattern d'uso:** i service chiamano `can(...)` / `assertOwnership(...)` prima di eseguire azioni sensibili. Documentalo con un esempio.

### 2.6 — Gating UI lato frontend
- Composable `useAuth()` / `useOrganization()` che espongono utente, org attiva, ruolo.
- Helper per nascondere/disabilitare elementi UI in base al ruolo (es. il bottone "Invita membro" non appare ai member).

### 2.7 — Pagine auth di base
- Pagine: signup, login, logout, richiesta reset password, verifica email (UI minimale ma funzionante; lo styling fine non è l'obiettivo).
- I trigger email chiamano un `sendEmail` placeholder (Fase 4 lo implementa per davvero).

---

## Checkpoint di verifica

- [ ] Signup crea un utente E automaticamente la sua organization personale (owner)
- [ ] Login/logout funzionano; la sessione contiene l'organization attiva
- [ ] Un utente può creare una seconda organization (caso B2B) ed essere owner
- [ ] Un owner/admin può invitare un membro; un member NON può (test del gating per ruolo)
- [ ] Il middleware auth protegge le rotte: una rotta protetta senza sessione restituisce 401
- [ ] `assertOwnership` blocca l'accesso a una risorsa di un'altra organization (403) — testato
- [ ] `can(...)` valuta correttamente i permessi per i tre ruoli
- [ ] Il frontend nasconde le azioni non permesse in base al ruolo
- [ ] I flussi verifica-email e reset-password scattano (anche solo loggando l'email per ora)
- [ ] `npm run typecheck` e `npm run lint` passano
- [ ] Commit: `feat: phase 2 — authentication and authorization`

> ⚠️ Verifica davvero l'authorization, non solo l'authentication. Il test "utente A non può toccare risorse di org B" è il più importante di questa fase.
