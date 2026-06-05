# Nuxt SaaS Starter - AI Coding Instructions

## Architecture Overview

This is a multi-tenant SaaS boilerplate with complete workspace isolation. The system implements a two-phase authentication flow where users first log in, then select their active workspace.

### Tech Stack
- **Frontend**: Nuxt 4 + Vue 3 + TypeScript + Nuxt UI + Pinia
- **Backend**: Supabase (PostgreSQL + Deno Edge Functions)
- **Auth**: Better Auth with custom session management
- **Security**: Row Level Security (RLS) policies + Nuxt Security
- **Charts**: Unovis (@unovis/vue, @unovis/ts)
- **Deployment**: NuxtHub
- **Schema**: All tables in `public` schema

### Core Concepts
- **Workspaces**: Isolated tenant containers (companies/teams)
- **Two-phase Auth**: Login → Workspace selection → Active workspace
- **JWT Claims**: `workspace_id` + `user_permissions` array
- **RLS Policies**: Automatic data filtering by workspace
- **Permission System**: Granular permissions (events.read, guests.create, etc.)

## Critical Developer Workflows

### Authentication Flow
```typescript
// Phase 1: Login (workspace_id = null)
const { data } = await supabase.auth.signInWithPassword({ email, password })
// JWT: { user_id, email, app_metadata: {} }

// Phase 2: Workspace Selection
await fetch('/functions/v1/switch-workspace', {
  method: 'POST',
  body: JSON.stringify({ workspace_id: selectedId })
})
await supabase.auth.refreshSession() // Updates JWT with workspace_id
// JWT: { user_id, workspace_id: "abc-123", user_permissions: [...] }
```

### Workspace Switching
- Call Edge function `switch-workspace` to update `app_metadata.workspace_id`
- Always `refreshSession()` after switching to get new JWT
- RLS policies automatically filter data for active workspace

### Database Operations
```typescript
// ✅ Correct: Uses authenticated client (respects RLS)
const { data } = await supabase.from('events').select('*')

// ❌ Wrong: Service role bypasses RLS (admin only)
const adminClient = createClient(url, serviceRoleKey)
```

### Edge Functions Pattern
```typescript
import { Hono } from '@hono/hono'
import { corsHeaders } from '../_shared/lib/cors.ts'

const app = new Hono().basePath('/function-name')

app.post('/', async (c) => {
  // Handle OPTIONS for CORS
  if (c.req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify auth
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const { data: { user } } = await authClient.auth.getUser()

  // Use service role for admin operations
  const supabase = createClient(url, serviceRoleKey, { db: { schema: 'public' } })

  // Business logic...
})
```

## Project-Specific Conventions

### Frontend Patterns
- **Composables**: Use `useAsyncData` for caching, optional realtime subscriptions
- **Supabase Client**: Available as `$supabase` in Nuxt plugins
- **Error Handling**: Check `error` from Supabase calls, throw on failures
- **Realtime**: Enable only when needed (costs money), prefer `autoRefresh` on focus

### Backend Patterns
- **CORS**: Include `corsHeaders` in all Edge function responses
- **Auth Verification**: Always verify JWT token before operations
- **Service Role**: Use only for admin operations (bypasses RLS)
- **Plan Limits**: Check subscription and resource limits before operations
- **Resource Tracking**: Update `workspace_resource_usage` for billing

### Permission System
```sql
-- Check permissions in RLS policies
CREATE POLICY "events_access" ON public.events
AS PERMISSIVE FOR SELECT
USING (public.user_has_permissions(ARRAY['events.read']))

-- Permissions injected via custom_access_token_hook
-- Available in JWT as user_permissions array
```

### File Structure
```
nuxt-saas-starter/
├── app/
│   ├── composables/     # Vue composables with caching patterns
│   ├── components/      # UI components (admin/, landing/)
│   ├── layouts/         # Auth, dashboard layouts
│   ├── pages/           # File-based routing
│   ├── plugins/         # Auth client setup
│   ├── stores/          # Pinia stores
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── server/
│   ├── api/             # Nuxt server API routes
│   ├── database/schema/ # Drizzle ORM schema
│   ├── emailTemplates/  # React Email templates
│   └── utils/           # Server utilities
├── public/              # Static assets
└── .github/
    └── workflows/       # GitHub Actions (NuxtHub deployment)
```

## Development Commands

### Frontend
```bash
pnpm dev          # Development server
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm typecheck    # TypeScript checking
pnpm lint         # ESLint checking
```

### Database
```bash
pnpm db:generate  # Generate migrations from schema
pnpm db:migrate   # Run migrations locally
pnpm db:push      # Push schema directly (dev only)
pnpm db:studio    # Open Drizzle Studio
```

## Security & Best Practices

- **Never use service role in frontend** - only in Edge functions
- **Always verify workspace_id** before workspace-scoped operations
- **Check plan limits** before resource-intensive operations
- **Use RLS policies** - they provide automatic security
- **Validate permissions** in Edge functions before operations
- **Handle CORS** in all Edge function responses
- **Update resource usage** for billing accuracy

## Common Pitfalls

1. **Forgetting workspace_id check**: Operations fail silently due to RLS
2. **Using wrong Supabase client**: Service role bypasses security
3. **Not refreshing JWT**: Permissions not updated after workspace switch
4. **Missing CORS headers**: Frontend can't call Edge functions
5. **Not checking plan limits**: Users exceed quotas unexpectedly

Remember: This is a multi-tenant system where data isolation is critical. Always think about which workspace context you're operating in and verify permissions accordingly.
