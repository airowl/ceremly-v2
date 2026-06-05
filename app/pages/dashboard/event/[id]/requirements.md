## Dashboard Home Requirements
<!-- Last updated: 2026-02-18 by Claude Code -->

### Current Implementation
- Welcome section with user name and event ✅
- Real-time event stats (Events, Guests, Members, Images) ✅
- Usage limits with progress bars ✅
- Recent events list with table ✅
- Quick actions dropdown (New Event, Invite Member, Settings) ✅

### Components
| Component | File | Description |
|-----------|------|-------------|
| HomeWelcome | `components/admin/home/HomeWelcome.client.vue` | Welcome message with user name, event, plan badge |
| HomeStats | `components/admin/home/HomeStats.client.vue` | 4-column stat cards with real event data |
| HomeRecentEvents | `components/admin/home/HomeRecentEvents.client.vue` | Table of recent 5 events with actions |
| EventUsageDashboard | `components/admin/EventUsageDashboard.vue` | Plan limits with progress bars |

### Data Sources
- `useUserStore()` - User info, subscription, plan limits
- `useEventStore()` - Event data, resources, resource usage
- `useDashboard()` - Dashboard UI state (notifications slideover)

### Architecture Notes
- Data loaded via `eventStore.loadEvent()` on mount
- Stats computed from `eventStore.resourceUsage`
- Loading states with `USkeleton` components
- Empty states handled for no events scenario

### Nuxt UI Components Used
- `UDashboardPanel`, `UDashboardNavbar` - Layout structure
- `UPageGrid`, `UPageCard` - Stats grid
- `UCard`, `UTable` - Content sections
- `UBadge`, `UProgress` - Status indicators
- `UTooltip`, `UButton`, `UIcon` - Interactive elements
- `USkeleton` - Loading states

### Routes
- Dashboard: `/dashboard`
- Events list: `/dashboard/event` (includes create event modal)
- Event detail: `/dashboard/event/:id`
- Settings: `/dashboard/settings`
- Members: `/dashboard/settings/members`
