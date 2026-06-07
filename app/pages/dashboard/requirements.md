# Dashboard Index Page Requirements
<!-- Last updated: 2026-06-07 by Claude Code (phase 1d: org-centric) -->

## Overview
La pagina dashboard index è la pagina principale che l'utente vede dopo il login. Mostra un benvenuto personalizzato e una panoramica generica (card/chart). La gestione delle organizzazioni vive nelle pagine dedicate `dashboard/organization/**`.

### Current Implementation
- Welcome header con nome utente, organizzazione corrente e piano ✅
- Card/chart generiche di panoramica ✅
- Stato di caricamento con skeleton ✅

### Components
- `AdminHomeWelcome.client.vue` — header di benvenuto (nome utente + `organizationStore.currentOrganization.name` + piano)
- `AdminHomeStats.client.vue` — conteggio membri dell'org attiva, link a `/dashboard/organization/[id]/members`

### Data Flow
```
User Login
  ↓
Dashboard Index Page Load
  ↓
AdminHomeWelcome: userStore.user + organizationStore.currentOrganization
  ↓
AdminHomeStats: organizationStore.members.length
```

### Organizzazioni
Lista, creazione, dettaglio e gestione membri NON vivono qui ma nelle pagine dedicate:
- `dashboard/organization/index.vue` — lista org + crea org (`AdminOrgsAddOrgModal`)
- `dashboard/organization/[id]/index.vue` — dettaglio + delete (gating owner)
- `dashboard/organization/[id]/members.vue` — membri + inviti (gating owner|admin)

Tutte consumano `organizationStore` (Pinia) costruito sui metodi del client plugin Better Auth (`authClient.organization.*`). Nessuna route REST event/team residua (dominio event strippato in FASE 1).

### Plan Limits
- `userStore.checkOrgCreationLimit()` → `{ allowed, current, limit }` (usato da `AddOrgModal`)
- Limite letto da `/api/limits` (campo `usage.organizations`, con fallback difensivo su `usage.events` finché 1c non rinomina il payload server)

### UI Components (Nuxt UI v4)
- `UDashboardPanel` / `UDashboardNavbar` — container e navbar
- `UCard` / `USkeleton` / `UBadge` / `UButton` / `UIcon`
- `UModal` / `UForm` / `UFormField` / `UInput` / `UAlert`

### Architecture Notes
- Componenti `.client.vue` per rendering solo lato client
- Auto-import dei componenti via Nuxt
- Org attiva con fallback: `getFullOrganization()` → se `null`, prima org da `listOrganizations()` + `setActive()`

### Future Improvements
- [ ] Caching della lista organizzazioni
- [ ] Ricerca/filtro organizzazioni avanzato
- [ ] Statistiche aggregate per organizzazione
