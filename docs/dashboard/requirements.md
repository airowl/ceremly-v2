# Dashboard Requirements
<!-- Last updated: 2026-02-21 by Claude Code -->

## Overview
The dashboard provides event management, team management, and guest management functionality for authenticated users.

## Architecture

### Permission Model (Role-Based)
- Role-based permissions: owner, editor, viewer
- Event owners have implicit full access (`is_owner: true`)
- Team members assigned roles via `event_users` table

### Key Data Structures

#### EventMember
```typescript
interface EventMember {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    is_owner: boolean;
    role: EventRole;  // 'owner' | 'editor' | 'viewer'
    invited_by: string | null;
    last_login_at: string | null;
    joined_at: string;
    status: 'active' | 'pending';
}
```

#### PendingInvitation
```typescript
interface PendingInvitation {
    id: string;
    email: string;
    invited_by: string;
    expires_at: string;
    created_at: string;
    status: 'pending';
}
```

## Dashboard Pages

### Home (`/dashboard`)
- Event cards showing user's events
- Quick actions for event management
- Recent activity summary

### Event Dashboard (`/dashboard/event/[id]`)

#### Layout (Grid-based, responsive)
```
┌───────────────────────────┬─────────────────────────┐
│ Event Summary Card (2/3)  │ RSVP Countdown (1/3)    │
├───────────────────────────┴─────────────────────────┤
│ Guest Stats Grid (4 columns)                         │
├─────────────────────────────────┬───────────────────┤
│ Recent Guests Table (3/4)       │ Sidebar (1/4)     │
│                                 │ - Stats veloci    │
│                                 │ - Team mini-list  │
│                                 │ - Resource Usage  │
└─────────────────────────────────┴───────────────────┘
```

#### Components
| Component | Path | Props |
|-----------|------|-------|
| `HomeEventSummaryCard` | `admin/home/HomeEventSummaryCard.client.vue` | `event: EventDetail, eventId: string` |
| `HomeRsvpCountdownCard` | `admin/home/HomeRsvpCountdownCard.client.vue` | `deadline: string \| null` |
| `HomeGuestStatsGrid` | `admin/home/HomeGuestStatsGrid.client.vue` | `total, confirmed, declined, pending, isLoading` |
| `HomeRecentGuestsTable` | `admin/home/HomeRecentGuestsTable.client.vue` | `guests: Guest[], isLoading, eventId` |
| `HomeDashboardSidebar` | `admin/home/HomeDashboardSidebar.client.vue` | `total, confirmed, pending, declined, teamMembers, isLoadingTeam, eventId` |
| `AdminEventUsageDashboard` | `admin/EventUsageDashboard.vue` | `eventId, eventName` (existing, unchanged) |

#### Data Sources
- `eventStore.currentEvent` → Event details (name, date, location, deadline, slug)
- `eventStore.counts` → Guest counts (loaded with `loadEvent()`)
- `useGuests(eventId).summary` → Real-time guest summary (total, confirmed, pending, declined)
- `useGuests(eventId).guests` → Guest list (first 5 shown in preview table)
- `eventStore.teamMembers` → Team members list (loaded via `loadTeamMembers()`)
- `userStore.limitsData` → Plan limits (loaded by `AdminEventUsageDashboard` internally)

#### Data Loading Strategy
1. `eventStore.loadEvent(eventId)` — on mount + eventId watch
2. `eventStore.loadTeamMembers()` — fire-and-forget after loadEvent
3. `useGuests(eventId)` — auto-loads via internal watch (no explicit call needed)
4. `AdminEventUsageDashboard` — calls `fetchLimits` internally

#### Countdown Behavior
- Live countdown (setInterval 1000ms) to RSVP deadline
- `deadline === null` → "Nessuna scadenza impostata"
- Expired → "Scadenza RSVP superata"
- Active → 4 units (Giorni/Ore/Minuti/Secondi) with zero-padding

#### Sidebar Sections
1. **Statistiche Veloci**: Tasso di Risposta `(confirmed+declined)/total*100`, Tasso di Accettazione `confirmed/(confirmed+declined)*100`
2. **Team Members**: Mini-list (max 4), "Gestisci Team" link
3. **Resource Usage**: Existing `AdminEventUsageDashboard` component

### Team Management (`/dashboard/event/[id]/team`)
- List active team members
- Display member roles (owner/editor/viewer)
- Display pending invitations
- Invite new members
- Edit member roles
- Remove team members

## Store Dependencies

### userStore.ts
- Handles authentication state
- Plan limits checking (uses `userId` for event ownership)
- Subscription management

### eventStore.ts
- Event CRUD operations
- Team member management
- Invitation management

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `eventStore.loadTeamMembers()` | Load event members with role info |
| `eventStore.inviteTeamMember(email, language)` | Send invitation |
| `eventStore.updateMemberRole(userId, role)` | Update member role |
| `eventStore.removeTeamMember(userId)` | Remove member from event |

## UI Components

### Team Table
- Shows member info (avatar, name, email)
- Owner badge for event owners
- Role badges for role assignments
- Join date and last login
- Action buttons (edit role, remove)

### Invite Modal
- Email input
- Language selection (it/en)

## Permission Categories
- **events**: view, create, edit, delete
- **guests**: view, create, edit, delete
- **templates**: view, create, edit, delete
- **team**: view, invite, manage

## Migration Notes (2026-02-18)

### Database Schema Changes (workspace → event)
- `workspaces` table removed, `events` table is now the primary entity
- `workspace_users` → `event_users` table with `role` field (owner/editor/viewer)
- `events` table has: date, time, location, address, deadline, maxGuests, primaryColor, showGuestCount, autoConfirmRegistration, description, deletedAt
- `invitations` now references `eventId` instead of `workspaceId`

### Code Changes
- `workspaceStore.ts` deleted, functionality merged into `eventStore.ts`
- `userStore.ts`: `checkEventCreationLimit` replaces `checkWorkspaceCreationLimit`
- Dashboard route: `/dashboard/event/[id]/...` replaces `/dashboard/org/[id]/...`
- All API routes updated: workspace → event references
