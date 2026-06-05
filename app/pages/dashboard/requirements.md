# Dashboard Index Page Requirements
<!-- Last updated: 2026-02-18 by Claude Code -->

## Overview
La pagina dashboard index è la pagina principale che l'utente vede dopo il login. Mostra un benvenuto personalizzato e una griglia di tutti gli event a cui l'utente appartiene.

### Current Implementation
- Welcome header con nome utente e event corrente ✅
- Griglia di card event con Nuxt UI v4 ✅
- Visualizzazione membri per event ✅
- Visualizzazione evento più recente per event ✅
- Stato di caricamento con skeleton ✅
- Stato vuoto con CTA ✅
- Stato errore ✅
- Modal creazione event con form ✅
- Validazione plan limits per creazione event ✅
- Auto-generazione slug da nome ✅

### Components
- `AdminHomeWelcome.client.vue` - Header di benvenuto con nome utente, event corrente, piano e data
- `AdminHomeEventCards.client.vue` - Griglia di card degli event dell'utente

### Data Flow
```
User Login
  ↓
Dashboard Index Page Load
  ↓
AdminHomeWelcome: userStore.user + eventStore.currentEvent
  ↓
AdminHomeEventCards:
  1. Query event_users → Get user's event memberships
  2. For each event:
     - Query event_users count → Members count
     - Query events (limit 1, order by created_at desc) → Recent event
  ↓
Render event cards with details
```

### Database Queries
1. **Get user events**: `event_users` join `events` where `user_id = current_user`
2. **Members count**: `event_users` count where `event_id = X`
3. **Recent event**: `events` where `event_id = X` order by `created_at desc` limit 1

### UI Components (Nuxt UI v4)
- `UDashboardPanel` - Container principale
- `UDashboardNavbar` - Navbar con titolo
- `UCard` - Card per event con slots `#header`, `#default`, `#footer`
- `USkeleton` - Loading state
- `UBadge` - Badge stato attivo
- `UButton` - Pulsanti azione
- `UIcon` - Icone (lucide)
- `UModal` - Modal per creazione event
- `UForm` / `UFormField` - Form con validazione Zod
- `UInput` - Campi input con slot `#leading`
- `UAlert` - Avvisi per limiti piano
- `UProgress` - Barra progresso utilizzo event

### Create Event Modal
La modal per creare nuovo event include:

**Validazione Form (Zod)**
- Nome: minimo 2 caratteri
- Slug: minimo 2 caratteri, solo lettere minuscole, numeri e trattini
- Auto-generazione slug da nome (watch on name field)

**Plan Limits Check**
- `userStore.checkEventCreationLimit(userId)` → `{ allowed, current, limit }`
- `userStore.isReadOnlyPlan()` → blocco completo per piano free
- Progress bar visuale per utilizzo corrente
- Alert warning quando limite raggiunto
- Link upgrade a `/dashboard/subscription`

**Edge Function Integration**
```typescript
await $supabase.functions.invoke('events', {
    body: { name, slug }
})
```

**Flow**
```
Click "Nuovo Event"
  ↓
loadLimits() → checkEventCreationLimit()
  ↓
Modal opens with:
  - Free plan? → Alert blocco con link upgrade
  - Limite raggiunto? → Alert warning con link upgrade
  - OK? → Progress bar + Form attivo
  ↓
Submit form → Edge function "events"
  ↓
Success → Toast + Refresh lista event
```

### Architecture Notes
- Componenti `.client.vue` per rendering solo lato client
- Query parallele con `Promise.all` per performance
- Gestione errori con stato dedicato
- Auto-import dei componenti via Nuxt
- **Authentication timing**: Uso di `watch` su `userStore.user?.id` con `immediate: true` invece di `onMounted` per gestire correttamente il caricamento asincrono dell'utente
- **Card navigation**: `UCard` wrappato in `NuxtLink` per navigazione a `/dashboard/event/[id]`
- **Hover effects**: `hover:ring-primary/50 hover:ring-2 transition-all` per feedback visivo

### Future Improvements
- [ ] Caching delle query event
- [ ] Real-time updates con Supabase subscriptions
- [ ] Ricerca/filtro event
- [ ] Ordinamento event (nome, data creazione, attività)
- [ ] Statistiche aggregate per event
