---
name: supabase-edge-functions
description: Comprehensive guide for Supabase Edge Functions development with Deno and TypeScript. Use when creating edge functions, working with authentication, RLS policies, CORS handling, validation, rate limiting, plan limits, soft delete operations, or Stripe integrations. Covers Hono framework patterns, workspace multi-tenancy, shared libraries (_shared/lib), email templates, and YourSaaS backend architecture.
---

# Supabase Edge Functions Development Guide

## Purpose

Establish consistency and best practices for Supabase Edge Functions development in the YourSaaS backend, using Deno runtime with TypeScript and Hono framework.

## When to Use This Skill

Automatically activates when working on:
- Creating or modifying edge functions
- Authentication and RLS patterns
- CORS handling and HTTP responses
- Input validation
- Rate limiting
- Plan limits and subscription checks
- Soft delete operations
- Email templates with React Email
- Stripe webhook integration
- Workspace multi-tenancy

---

## Quick Start

### New Edge Function Checklist

- [ ] **Function file**: `be/supabase/functions/{name}/index.ts`
- [ ] **Hono setup**: Base path, middleware, routes
- [ ] **Auth**: Use `authenticateWithClient()` for RLS
- [ ] **CORS**: Handle OPTIONS preflight
- [ ] **Validation**: Use shared validation utilities
- [ ] **Rate limiting**: Apply appropriate preset
- [ ] **Responses**: Use `successResponse()` / `errorResponse()`
- [ ] **Plan limits**: Check before resource creation
- [ ] **Requirements.md**: Document function requirements

---

## Architecture Overview

### Directory Structure

```
be/supabase/
├── functions/
│   ├── _shared/
│   │   ├── lib/              # Shared utilities
│   │   │   ├── auth.ts       # Authentication helpers
│   │   │   ├── cors.ts       # CORS headers
│   │   │   ├── responses.ts  # HTTP response helpers
│   │   │   ├── validation.ts # Input validation
│   │   │   ├── rate-limit.ts # Rate limiting
│   │   │   ├── plan-limits.ts # Subscription limits
│   │   │   ├── soft-delete.ts # Soft delete operations
│   │   │   ├── supabase.ts   # Service role client
│   │   │   └── email.ts      # Email sending
│   │   └── types/
│   │       └── database.types.ts
│   ├── _templates/           # React Email templates
│   ├── events/               # Events CRUD
│   ├── guests/               # Guests management
│   ├── workspaces/           # Workspace operations
│   ├── stripe-webhook/       # Stripe integration
│   └── subscribe-waiting-list/
├── migrations/               # SQL migrations
├── tests/                    # Deno tests
├── config.toml              # Supabase config
└── seed.sql                 # Test data
```

### Request Flow

```
HTTP Request
    ↓
Hono Router (path matching)
    ↓
Rate Limit Middleware
    ↓
Authentication (authenticateWithClient)
    ↓
Validation (validateRequired, etc.)
    ↓
Plan Limit Check (if creating resources)
    ↓
Business Logic (RLS-enabled queries)
    ↓
Resource Tracking (if applicable)
    ↓
Response (successResponse/errorResponse)
```

See [architecture-overview.md](resources/architecture-overview.md) for detailed explanation.

---

## Core Principles (7 Key Rules)

### 1. Always Use RLS-Enabled Client

```typescript
// ✅ ALWAYS: Use authenticateWithClient for RLS enforcement
const { user, client } = await authenticateWithClient(
    c.req.header('Authorization')
);
// RLS policies apply automatically
const { data } = await client.from('events').select('*');

// ❌ NEVER: Use service role for user operations
const { data } = await supabase.from('events').select('*');
```

### 2. Handle CORS for All Endpoints

```typescript
// ✅ ALWAYS: Handle OPTIONS preflight
if (c.req.method === 'OPTIONS') {
    return corsPreflightResponse();
}
```

### 3. Validate All Input

```typescript
// ✅ ALWAYS: Validate before processing
validateRequired(body, ['name', 'workspace_id'], 'Event data');
validateEmail(body.email);
validateUUID(body.id, 'Event ID');
```

### 4. Use Standard Response Helpers

```typescript
// ✅ ALWAYS: Use shared response helpers
return successResponse(data, 201);
return errorResponse(error);

// ❌ NEVER: Create Response objects manually
return new Response(JSON.stringify(data), {...});
```

### 5. Apply Rate Limiting

```typescript
// ✅ ALWAYS: Add rate limit middleware
app.use('*', async (c, next) => {
    const result = await rateLimit(c.req.raw, RateLimitPresets.standard);
    if (!result.success) return c.json({ error: 'Too many requests' }, 429);
    await next();
});
```

### 6. Check Plan Limits Before Resource Creation

```typescript
// ✅ ALWAYS: Check limits before creating resources
await checkPlanLimit(supabase, {
    scope: 'workspace',
    workspaceId: workspace_id,
    limitField: 'max_events_per_workspace',
    resourceType: 'events',
    resourceTable: 'events',
    filterField: 'workspace_id',
    filterValue: workspace_id,
});
```

### 7. Use Soft Delete Pattern

```typescript
// ✅ ALWAYS: Soft delete instead of hard delete
const { error } = await client
    .from('events')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', eventId);

// ✅ ALWAYS: Exclude soft-deleted in queries
.is('deleted_at', null)
```

---

## Common Imports

```typescript
// Hono framework
import { Hono } from '@hono/hono';

// Authentication
import { authenticateWithClient } from '../_shared/lib/auth.ts';

// Service role client (for plan limits, resource tracking)
import { supabase } from '../_shared/lib/supabase.ts';

// Responses
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';

// Validation
import { validateRequired, validateEmail, validateUUID } from '../_shared/lib/validation.ts';

// Rate limiting
import { rateLimit, rateLimitHeaders, RateLimitPresets } from '../_shared/lib/rate-limit.ts';

// Plan limits
import { checkPlanLimit } from '../_shared/lib/plan-limits.ts';

// Resource tracking
import { updateResourceUsage } from '../_shared/lib/resource-tracking.ts';

// Soft delete
import { softDelete, restore, listActive } from '../_shared/lib/soft-delete.ts';
```

---

## Quick Reference

### HTTP Status Codes

| Code | Use Case |
|------|----------|
| 200 | Success (GET, PUT, DELETE) |
| 201 | Created (POST) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (RLS denied) |
| 404 | Not Found |
| 429 | Too Many Requests |
| 500 | Server Error |

### Rate Limit Presets

| Preset | Limit | Window | Use Case |
|--------|-------|--------|----------|
| `standard` | 100 | 60s | General API |
| `strict` | 30 | 60s | Sensitive operations |
| `auth` | 10 | 60s | Login/signup |
| `webhook` | 1000 | 60s | Stripe webhooks |
| `burst` | 20 | 10s | Burst operations |

### Plan Limit Fields

**User-scoped:**
- `max_workspaces` - Workspaces per user

**Workspace-scoped:**
- `max_events_per_workspace` - Events per workspace
- `max_guests_per_event` - Guests per event
- `max_images_per_event` - Images per event
- `max_users_per_workspace` - Team members

---

## Anti-Patterns to Avoid

❌ Using service role client for user operations
❌ Missing CORS preflight handling
❌ Hardcoded error responses without proper status codes
❌ No input validation
❌ Missing rate limiting
❌ Hard delete instead of soft delete
❌ Not checking plan limits before resource creation
❌ Manual Response object creation
❌ Not updating resource usage after create/delete

---

## Navigation Guide

| Need to... | Read this |
|------------|-----------|
| Understand architecture | [architecture-overview.md](resources/architecture-overview.md) |
| Implement authentication | [auth-patterns.md](resources/auth-patterns.md) |
| Handle responses/CORS | [responses-and-cors.md](resources/responses-and-cors.md) |
| Validate input | [validation-patterns.md](resources/validation-patterns.md) |
| Add rate limiting | [rate-limiting.md](resources/rate-limiting.md) |
| Check plan limits | [plan-limits.md](resources/plan-limits.md) |
| Soft delete operations | [soft-delete.md](resources/soft-delete.md) |
| See complete examples | [complete-examples.md](resources/complete-examples.md) |

---

## Resource Files

### [architecture-overview.md](resources/architecture-overview.md)
Directory structure, request flow, multi-tenancy, schema setup

### [auth-patterns.md](resources/auth-patterns.md)
Authentication, RLS enforcement, workspace context, JWT claims

### [responses-and-cors.md](resources/responses-and-cors.md)
Response helpers, CORS configuration, error handling

### [validation-patterns.md](resources/validation-patterns.md)
Input validation, email/UUID/enum validation, length constraints

### [rate-limiting.md](resources/rate-limiting.md)
Rate limit middleware, presets, Upstash Redis, headers

### [plan-limits.md](resources/plan-limits.md)
Subscription limits, user/workspace scopes, limit overrides

### [soft-delete.md](resources/soft-delete.md)
Soft delete patterns, active views, bulk operations, restore

### [complete-examples.md](resources/complete-examples.md)
Full edge function examples, CRUD patterns, Stripe webhook

---

## Related Commands

```bash
# Start local Supabase
cd be/ && supabase start

# Serve edge functions locally
cd be/ && supabase functions serve

# Deploy specific function
supabase functions deploy events

# Run tests
cd be/supabase/tests && deno test

# Generate types
supabase gen types typescript --local > functions/_shared/types/database.types.ts
```

---

## Environment Variables

```bash
# Required
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Rate limiting (optional - falls back to in-memory)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
RESEND_API_KEY=
```

---

**Skill Status**: COMPLETE ✅
**Line Count**: < 500 ✅
**Progressive Disclosure**: 8 resource files ✅
