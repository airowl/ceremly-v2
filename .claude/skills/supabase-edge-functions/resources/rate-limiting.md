# Rate Limiting

## Table of Contents
- [Overview](#overview)
- [Configuration](#configuration)
- [Presets](#presets)
- [Middleware Setup](#middleware-setup)
- [Advanced Usage](#advanced-usage)
- [Redis Configuration](#redis-configuration)

---

## Overview

YourSaaS uses a distributed rate limiting system with:
- **Upstash Redis** for production (distributed across instances)
- **In-memory fallback** for development (per-instance)

### Import

```typescript
import {
    rateLimit,
    rateLimitByUser,
    rateLimitByWorkspace,
    rateLimitHeaders,
    RateLimitPresets,
} from '../_shared/lib/rate-limit.ts';
```

---

## Configuration

### RateLimitConfig Interface

```typescript
interface RateLimitConfig {
    /** Maximum requests allowed in window */
    limit: number;

    /** Time window in seconds */
    window: number;

    /** Custom identifier (defaults to IP address) */
    identifier?: string;

    /** Prefix for Redis keys */
    prefix?: string;
}
```

### RateLimitResult Interface

```typescript
interface RateLimitResult {
    /** Whether request is allowed */
    success: boolean;

    /** Total limit for window */
    limit: number;

    /** Remaining requests in window */
    remaining: number;

    /** Unix timestamp when window resets */
    reset: number;
}
```

---

## Presets

Use predefined presets for common scenarios:

```typescript
export const RateLimitPresets = {
    /** Standard API: 100 requests per minute */
    standard: { limit: 100, window: 60 },

    /** Strict: 30 requests per minute (sensitive operations) */
    strict: { limit: 30, window: 60 },

    /** Auth: 10 requests per minute (login/signup) */
    auth: { limit: 10, window: 60 },

    /** Webhook: 1000 requests per minute (Stripe webhooks) */
    webhook: { limit: 1000, window: 60 },

    /** Burst: 20 requests per 10 seconds */
    burst: { limit: 20, window: 10 },
} as const;
```

### When to Use Each Preset

| Preset | Use Case | Example Endpoints |
|--------|----------|-------------------|
| `standard` | General API endpoints | CRUD operations, list queries |
| `strict` | Resource-intensive operations | File uploads, exports, bulk operations |
| `auth` | Authentication endpoints | Login, signup, password reset |
| `webhook` | External service callbacks | Stripe webhooks, payment notifications |
| `burst` | High-frequency operations | Real-time updates, polling |

---

## Middleware Setup

### Basic Usage

```typescript
import { Hono } from '@hono/hono';
import { rateLimit, rateLimitHeaders, RateLimitPresets } from '../_shared/lib/rate-limit.ts';

const app = new Hono().basePath('/events');

// Rate limit middleware
app.use('*', async (c, next) => {
    // Skip for OPTIONS (CORS preflight)
    if (c.req.method === 'OPTIONS') return next();

    const result = await rateLimit(c.req.raw, RateLimitPresets.standard);

    // Add rate limit headers to all responses
    const headers = rateLimitHeaders(result);
    for (const [key, value] of Object.entries(headers)) {
        c.header(key, value);
    }

    // Block if limit exceeded
    if (!result.success) {
        return c.json({
            error: 'Too many requests',
            message: `Rate limit exceeded. Try again in ${result.reset - Math.floor(Date.now() / 1000)} seconds.`,
            retryAfter: result.reset,
        }, 429, headers);
    }

    await next();
});

// Routes
app.get('/', async (c) => { /* ... */ });
app.post('/', async (c) => { /* ... */ });

Deno.serve(app.fetch);
```

### Custom Rate Limit Config

```typescript
// Custom config for specific endpoint
app.use('/upload', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();

    const result = await rateLimit(c.req.raw, {
        limit: 5,      // Only 5 uploads
        window: 300,   // Per 5 minutes
    });

    if (!result.success) {
        return c.json({ error: 'Upload limit exceeded' }, 429);
    }

    await next();
});
```

---

## Advanced Usage

### Rate Limit by User ID

For authenticated endpoints, rate limit per user instead of per IP:

```typescript
import { rateLimitByUser } from '../_shared/lib/rate-limit.ts';

app.post('/sensitive-action', async (c) => {
    const { user } = await authenticateWithClient(
        c.req.header('Authorization')
    );

    // Rate limit specific user
    const result = await rateLimitByUser(user.id, {
        limit: 5,
        window: 60,
    });

    if (!result.success) {
        return c.json({
            error: 'Too many requests',
            message: 'Please wait before trying again',
        }, 429);
    }

    // Continue with action...
});
```

### Rate Limit by Workspace

For workspace-scoped operations:

```typescript
import { rateLimitByWorkspace } from '../_shared/lib/rate-limit.ts';

app.post('/bulk-invite', async (c) => {
    const body = await c.req.json();

    // Rate limit the entire workspace
    const result = await rateLimitByWorkspace(body.workspace_id, {
        limit: 10,
        window: 3600, // 10 bulk invites per hour per workspace
    });

    if (!result.success) {
        return c.json({
            error: 'Workspace rate limit exceeded',
        }, 429);
    }

    // Continue...
});
```

### Multiple Rate Limits

Apply different limits for different concerns:

```typescript
app.post('/api-intensive', async (c) => {
    // 1. Global IP rate limit
    const ipResult = await rateLimit(c.req.raw, RateLimitPresets.standard);
    if (!ipResult.success) {
        return c.json({ error: 'IP rate limit exceeded' }, 429);
    }

    const { user } = await authenticateWithClient(
        c.req.header('Authorization')
    );

    // 2. Per-user rate limit (stricter)
    const userResult = await rateLimitByUser(user.id, {
        limit: 10,
        window: 60,
    });
    if (!userResult.success) {
        return c.json({ error: 'User rate limit exceeded' }, 429);
    }

    // Continue with both limits passed...
});
```

### Rate Limit Response Headers

The `rateLimitHeaders` function returns standard rate limit headers:

```typescript
function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
    };
}
```

Response headers example:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1699123456
```

---

## Redis Configuration

### Upstash Setup

1. Create a Redis database at [upstash.com](https://upstash.com)
2. Get REST URL and token from dashboard
3. Set environment variables:

```bash
# Set secrets in Supabase
supabase secrets set UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
supabase secrets set UPSTASH_REDIS_REST_TOKEN=your-token
```

### How It Works

**With Upstash (Production):**
```typescript
async function upstashRateLimit(identifier, config) {
    // Uses Redis pipeline for atomic operations
    const response = await fetch(`${UPSTASH_REDIS_REST_URL}/pipeline`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        },
        body: JSON.stringify([
            ["INCR", key],              // Increment counter
            ["EXPIRE", key, window, "NX"], // Set expiry (only if not set)
            ["TTL", key],               // Get time remaining
        ]),
    });
    // Parse and return result
}
```

**In-Memory Fallback (Development):**
```typescript
// Per-instance Map, not distributed
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

async function inMemoryRateLimit(identifier, config) {
    const now = Math.floor(Date.now() / 1000);
    const key = `${config.prefix}:${identifier}`;

    let entry = inMemoryStore.get(key);

    // Create new window or increment existing
    if (!entry || entry.resetAt < now) {
        entry = { count: 1, resetAt: now + config.window };
    } else {
        entry.count++;
    }

    inMemoryStore.set(key, entry);

    return {
        success: entry.count <= config.limit,
        remaining: Math.max(0, config.limit - entry.count),
        // ...
    };
}
```

### Fallback Behavior

If Upstash is not configured or fails:
1. Warning logged: `"[rate-limit] Upstash not configured, falling back to in-memory rate limiting"`
2. In-memory rate limiting used
3. **Note:** In-memory is per-instance, not distributed across Edge Function instances

---

## Best Practices

### Do's

✅ Apply rate limiting to all public endpoints
✅ Use stricter limits for auth endpoints
✅ Add rate limit headers to responses
✅ Use per-user limits for authenticated actions
✅ Configure Upstash for production
✅ Log rate limit violations for monitoring

### Don'ts

❌ Skip rate limiting for "internal" endpoints
❌ Use very high limits that don't actually protect
❌ Forget to handle OPTIONS preflight
❌ Rely on in-memory limits in production (not distributed)
❌ Block legitimate webhook traffic with strict limits
