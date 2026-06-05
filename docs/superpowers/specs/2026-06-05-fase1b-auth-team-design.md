# FASE 1b — Auth flows + signup→org + team via plugin (Scope)

> **Scope delineato, non dettaglio implementabile.** Sotto-step di FASE 1 (vedi
> `2026-06-05-fase1-tenancy-organization-design.md` per architettura e mappa). Il dettaglio
> a passi-fini si produce col brainstorm dedicato di 1b, **dopo** che 1a è chiuso e ha confermato
> lo schema generato da `auth:schema`. Questo file fissa obiettivo, scope in/out, task delineati,
> checkpoint e rischi.

**Prerequisito:** 1a chiuso (schema org generato, repository, isolamento verificato, consumer team
stubbati con `501`).

---

## Obiettivo

Rendere viva la membership org: al signup nasce automaticamente l'organization personale (caso B2C),
e tutta la gestione team/inviti passa per le **API native del plugin** organization, rimuovendo gli
stub lasciati da 1a e sostituendo il `team.service.ts` fatto a mano.

---

## Scope

### ✅ In 1b

- **Hook signup → org personale (CRITICO).** Aggancio al ciclo di creazione utente: alla nascita di
  un nuovo utente, crea la sua organization personale e aggiungilo come `owner` (riga `member`).
  Imposta quell'org come attiva. È il punto che realizza "B2C = org con 1 membro" — senza, un utente
  nuovo non avrebbe tenant. *(Meccanismo: hook **after**-create utente, perché l'org ha bisogno che
  l'utente esista già; l'attuale `databaseHooks.user.create.before` setta solo `tosAcceptedAt`.)*
- **Org attiva in sessione.** Abilitare la nozione di organization attiva (l'utente "agisce dentro"
  un'org alla volta). Coordinare con l'accertamento di 1a su dove vive `activeOrganizationId`
  (colonna `session` vs KV Redis).
- **Team via plugin.** Sostituire `team.service.ts` con le API native: `inviteMember`,
  `acceptInvitation`, `rejectInvitation`, `cancelInvitation`, `removeMember`, `updateMemberRole`.
  Rimuovere gli stub `501` lasciati da 1a sui consumer team.
- **Email invito via hook.** Collegare l'hook `sendInvitationEmail` del plugin al `sendEmail`
  esistente (riusa il template invito i18n; il vecchio `renderEventInviteEmail` va genericizzato da
  "evento" a "organization" o sostituito).
- **planLimit org-level.** `canAddTeamMember` → conteggio membership su `member` per org (firma e
  logica riviste; oggi conta su `event_users`).
- **Auth flows base.** Verificare che signup/login/logout/verifica-email/reset-password funzionino
  col modello org (gli endpoint email veri restano quelli esistenti; non è FASE 4).

### ❌ NON in 1b

- Riscrittura `permissions.ts` / `requireOrgRole` / middleware → **1c**
- Route `/api/organizations/*` (CRUD org) → **1c**
- Frontend (store/pagine/composable) → **1d**
- Driver Neon, deploy, `projects` completa, docs → FASI 2-5

---

## Task delineati

1. **Config plugin** — estendere `organization({ ... })` in `server/utils/auth.ts` con: ruoli
   (owner/admin/member via config), `sendInvitationEmail`, eventuali `organizationHooks`
   (`afterAcceptInvitation` per setup membro).
2. **Hook signup→org** — after-create utente: crea org (slug derivato da nome/email) + riga `member`
   owner + set org attiva. Audit log dell'evento. *(Verificare l'API esatta del plugin per
   `createOrganization` server-side vs scrittura diretta via repository.)*
3. **Sostituzione team** — i consumer stubbati in 1a (`/api/team/*`) chiamano le API plugin. Valutare
   se le route `/api/team/*` restano (deleghando al plugin) o se il client chiama direttamente il
   plugin (decisione che tocca anche 1c per le route). Audit log su invite/accept/remove preservato.
4. **Email invito** — genericizzare/sostituire `renderEventInviteEmail`; collegare a
   `sendInvitationEmail`. Riuso `getResendInstance` + `getDefaultSender` esistenti.
5. **planLimit** — `canAddTeamMember` su `member` per org; `getEffectiveLimits` invariato.

---

## Checkpoint 1b

- [ ] Signup crea utente **+ org personale (owner) automaticamente**, org impostata come attiva
- [ ] Login/logout funzionano; la sessione contiene l'org attiva
- [ ] Un utente può creare una 2ª org (caso B2B) ed esserne owner
- [ ] Owner/admin può invitare un membro; l'invito arriva via email (hook)
- [ ] Accept invito aggiunge la riga `member` col ruolo corretto
- [ ] Nessuno stub `501` residuo sui flussi team
- [ ] `pnpm typecheck` verde
- [ ] Commit: `feat: auth flows + auto org creation + team via plugin (phase 1b)`

> ⚠️ Punto critico: l'hook signup→org. Se fallisce, ogni utente nuovo resta senza tenant e tutto il
> resto del boilerplate non ha dove agire.

---

## Rischi noti

| Rischio | Mitigazione |
|---|---|
| API esatta plugin per create-org server-side / hook signup diversa dai doc | Confermare col brainstorm 1b sui fatti reali post-1a |
| `activeOrganizationId` colonna vs KV (eredità 1a) | Risolto in 1a, riusato qui |
| Email invito ancora "evento-flavored" | Genericizzare template + subject in 1b |
| Doppia gestione inviti (plugin + vecchia `invitations` custom) | La vecchia `invitations` cade con `event.ts` in 1a — qui solo plugin |
