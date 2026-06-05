# Architecture Overview

## Table of Contents
- [Directory Structure](#directory-structure)
- [Request Lifecycle](#request-lifecycle)
- [Multi-Tenancy Model](#multi-tenancy-model)
- [Database Schema](#database-schema)
- [Shared Libraries](#shared-libraries)

---

## Directory Structure

```
be/supabase/
├── functions/                    # Edge Functions
│   ├── _shared/                  # Shared code (not deployed)
│   │   ├── lib/                  # Utility libraries
│   │   │   ├── auth.ts           # Authentication helpers
│   │   │   ├── cors.ts           # CORS headers
│   │   │   ├── email.ts          # Email sending (Resend)
│   │   │   ├── limit-overrides.ts # Per-entity limit overrides
│   │   │   ├── permissions.ts    # Permission checking
│   │   │   ├── plan-limits.ts    # Subscription limit enforcement
│   │   │   ├── rate-limit.ts     # Rate limiting (Upstash)
│   │   │   ├── resource-tracking.ts # Resource usage counters
│   │   │   ├── responses.ts      # HTTP response helpers
│   │   │   ├── soft-delete.ts    # Soft delete utilities
│   │   │   ├── supabase.ts       # Service role client
│   │   │   └── validation.ts     # Input validation
│   │   └── types/
│   │       └── database.types.ts # Generated DB types
│   ├── _templates/               # React Email templates
│   │   ├── GuestInviteEmail.tsx
│   │   ├── InvoiceEmail.tsx
│   │   ├── PaymentFailedEmail.tsx
│   │   ├── SubscriptionUpdatedEmail.tsx
│   │   └── WaitingListEmail.tsx
│   ├── events/                   # Events CRUD
│   │   └── index.ts
│   ├── guests/                   # Guest management
│   │   └── index.ts
│   ├── workspaces/               # Workspace operations
│   │   └── index.ts
│   ├── stripe-webhook/           # Stripe payment webhooks
│   │   └── index.ts
│   ├── create-stripe-session/    # Stripe checkout
│   │   └── index.ts
│   └── subscribe-waiting-list/   # Waiting list signup
│       └── index.ts
├── migrations/                   # Database migrations
│   ├── 20251103140947_create_remote_schema_tables.sql
│   ├── 20251103142149_create_base_schema_tables.sql
│   ├── 20251103142226_create_multi_tenancy_workspace_tables.sql
│   ├── 20251103150118_create_multi_custom_claim_hook_tables.sql
│   ├── 20251103150706_create_rls_policies_tables.sql
│   ├── 20251103152134_create_waiting_list_tables.sql
│   ├── 20251103152749_create_subscriptions_tables.sql
│   ├── 20251103152750_create_plan_limits_tables.sql
│   ├── 20251103154132_create_stripe_tables.sql
│   ├── 20251103163801_create_events_tables.sql
│   ├── 20251103175737_create_guests_tables.sql
│   ├── 20251103181947_create_templates_tables.sql
│   ├── 20251123100000_create_email_system_tables.sql
│   └── 20251129100000_create_soft_delete_system.sql
├── tests/                        # Deno tests
│   ├── _setup.ts
│   ├── events_test.ts
│   ├── guests_test.ts
│   └── workspaces_test.ts
├── config.toml                   # Supabase configuration
└── seed.sql                      # Test data seeding
```

---

## Request Lifecycle

### Complete Flow

```
1. HTTP Request arrives
   ↓
2. Deno.serve(app.fetch) receives request
   ↓
3. Hono router matches path (app.basePath)
   ↓
4. Rate Limit Middleware checks limits
   ├── 429 Too Many Requests if exceeded
   └── Continue if allowed
   ↓
5. Route handler executes
   ↓
6. CORS check (OPTIONS returns early)
   ↓
7. Authentication (authenticateWithClient)
   ├── 401 Unauthorized if no/invalid token
   └── Returns { user, client, token }
   ↓
8. Input Validation (validateRequired, etc.)
   ├── 400 Bad Request if invalid
   └── Continue if valid
   ↓
9. Plan Limit Check (checkPlanLimit)
   ├── 400 Limit Exceeded if over limit
   └── Continue if within limits
   ↓
10. Business Logic (RLS-enabled queries)
    ├── 403 Forbidden if RLS denies
    └── Data returned if allowed
    ↓
11. Resource Tracking (updateResourceUsage)
    ↓
12. Response (successResponse/errorResponse)
```

### Middleware Stack Example

```typescript
const app = new Hono().basePath('/events');

// 1. Rate limiting middleware
app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const result = await rateLimit(c.req.raw, RateLimitPresets.standard);
    const headers = rateLimitHeaders(result);

    for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
    }

    if (!result.success) {
        return c.json({
            error: 'Too many requests',
            retryAfter: result.reset
        }, 429, headers);
    }

    await next();
});

// 2. Route handlers
app.post('/', async (c) => { /* ... */ });
app.delete('/:id', async (c) => { /* ... */ });

// 3. Start server
Deno.serve(app.fetch);
```

---

## Multi-Tenancy Model

### Workspace-Based Isolation

YourSaaS uses workspace-based multi-tenancy where:

1. **Users** can belong to multiple workspaces
2. **Workspaces** contain events, guests, templates
3. **RLS policies** enforce data isolation based on JWT claims

### Two-Phase Authentication

```
Phase 1: Login
├── User authenticates with email/password
├── JWT issued with workspace_id = NULL
└── User can only see workspace selection

Phase 2: Workspace Selection
├── User selects workspace
├── JWT refreshed with workspace_id + permissions
└── RLS policies now filter by workspace_id
```

### JWT Claims Structure

```typescript
{
  // Standard Supabase claims
  sub: "user-uuid",
  email: "user@example.com",

  // Custom claims (set by custom_access_token_hook)
  app_metadata: {
    workspace_id: "workspace-uuid",       // Selected workspace
    user_permissions: ["events.read", "events.create", ...]
  }
}
```

### RLS Policy Pattern

```sql
-- Events visible only within workspace
CREATE POLICY "events_workspace_isolation" ON base.events
    FOR SELECT
    USING (
        workspace_id = (
            (current_setting('request.jwt.claims', true)::jsonb
             -> 'app_metadata' ->> 'workspace_id')::uuid
        )
    );
```

---

## Database Schema

### Schema Configuration

All business tables live in `base` schema (not `public`):

```typescript
// Edge Function client configuration
const client = createClient(url, key, {
    db: { schema: 'base' }
});
```

### Core Tables

| Table | Schema | Purpose |
|-------|--------|---------|
| `workspaces` | base | Workspace definitions |
| `workspace_members` | base | User-workspace relationships |
| `events` | base | Events per workspace |
| `guests` | base | Guests per event |
| `templates` | base | Event templates |
| `subscriptions` | base | User subscriptions |
| `plan_limits` | base | Plan limit definitions |
| `user_limit_overrides` | base | Per-user limit overrides |
| `workspace_limit_overrides` | base | Per-workspace limit overrides |
| `stripe_customers` | base | Stripe customer mapping |
| `waiting_list` | base | Pre-launch signups |

### Active Views (Soft Delete)

```sql
-- Views that automatically exclude soft-deleted records
CREATE VIEW base.active_workspaces AS
    SELECT * FROM base.workspaces WHERE deleted_at IS NULL;

CREATE VIEW base.active_events AS
    SELECT * FROM base.events WHERE deleted_at IS NULL;

CREATE VIEW base.active_guests AS
    SELECT * FROM base.guests WHERE deleted_at IS NULL;
```

---

## Shared Libraries

### Library Reference

| Library | Purpose | Key Exports |
|---------|---------|-------------|
| `auth.ts` | Authentication | `authenticateUser`, `authenticateWithClient` |
| `cors.ts` | CORS headers | `corsHeaders` |
| `responses.ts` | HTTP responses | `successResponse`, `errorResponse`, `corsPreflightResponse` |
| `validation.ts` | Input validation | `validateRequired`, `validateEmail`, `validateUUID`, `validateEnum`, `validateLength` |
| `rate-limit.ts` | Rate limiting | `rateLimit`, `rateLimitByUser`, `RateLimitPresets` |
| `plan-limits.ts` | Subscription limits | `checkPlanLimit` |
| `soft-delete.ts` | Soft delete ops | `softDelete`, `restore`, `listActive`, `getActive` |
| `supabase.ts` | Service role client | `supabase` (pre-configured client) |
| `resource-tracking.ts` | Usage counters | `updateResourceUsage` |
| `email.ts` | Email sending | `sendEmail` |

### Import Pattern

```typescript
// Import from _shared/lib relative to function
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { successResponse, errorResponse } from '../_shared/lib/responses.ts';
import { validateRequired } from '../_shared/lib/validation.ts';
import { rateLimit, RateLimitPresets } from '../_shared/lib/rate-limit.ts';
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';
import { supabase } from '../_shared/lib/supabase.ts';
```

---

## Environment Configuration

### Local Development

```bash
# be/supabase/functions/.env
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJ...local-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...local-service-key
```

### Production Secrets

Set via Supabase CLI or dashboard:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
supabase secrets set UPSTASH_REDIS_REST_TOKEN=xxx
```
