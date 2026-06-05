# Responses and CORS

## Table of Contents
- [CORS Configuration](#cors-configuration)
- [Response Helpers](#response-helpers)
- [Status Code Guidelines](#status-code-guidelines)
- [Error Response Patterns](#error-response-patterns)
- [Examples](#examples)

---

## CORS Configuration

### CORS Headers

```typescript
// _shared/lib/cors.ts
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};
```

### Preflight Handling

**Always handle OPTIONS requests first in every route:**

```typescript
app.post('/', async (c) => {
    // CORS preflight must be first
    if (c.req.method === 'OPTIONS') {
        return corsPreflightResponse();
    }

    // Rest of handler...
});
```

### Why OPTIONS First?

Browsers send preflight OPTIONS requests before actual requests for:
- Non-simple HTTP methods (PUT, DELETE, PATCH)
- Custom headers (Authorization, Content-Type: application/json)

Without proper handling, the browser blocks the actual request.

---

## Response Helpers

### Import

```typescript
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';
```

### successResponse

```typescript
/**
 * Creates a standardized success response
 *
 * @param data - Data to return in response body
 * @param statusCode - HTTP status code (default: 200)
 */
export function successResponse(
    data: unknown,
    statusCode: number = 200,
): Response {
    return new Response(
        JSON.stringify(data),
        {
            status: statusCode,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
            },
        },
    );
}
```

**Usage:**

```typescript
// Default 200 OK
return successResponse({ id: '123', name: 'Event' });

// Created 201
return successResponse(newEvent, 201);

// Empty success
return successResponse({ message: 'Deleted successfully' });

// List response
return successResponse({ data: events, count: events.length });
```

### errorResponse

```typescript
/**
 * Creates a standardized error response
 *
 * @param error - Error object or message string
 * @param statusCode - HTTP status code (default: 400)
 */
export function errorResponse(
    error: unknown,
    statusCode: number = 400,
): Response {
    const message = error instanceof Error ? error.message : String(error);

    return new Response(
        JSON.stringify({ error: message }),
        {
            status: statusCode,
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
            },
        },
    );
}
```

**Usage:**

```typescript
// From Error object (default 400)
return errorResponse(error);

// With custom status
return errorResponse('Unauthorized', 401);
return errorResponse('Not found', 404);
return errorResponse(error, 500);

// From string
return errorResponse('Validation failed: name is required');
```

### corsPreflightResponse

```typescript
/**
 * Creates a CORS preflight response for OPTIONS requests
 */
export function corsPreflightResponse(): Response {
    return new Response('ok', { headers: corsHeaders });
}
```

**Usage:**

```typescript
if (c.req.method === 'OPTIONS') {
    return corsPreflightResponse();
}
```

---

## Status Code Guidelines

### Success Codes

| Code | Name | When to Use |
|------|------|-------------|
| 200 | OK | GET, PUT, PATCH, DELETE success |
| 201 | Created | POST created new resource |
| 204 | No Content | DELETE with no body (rarely used) |

### Client Error Codes

| Code | Name | When to Use |
|------|------|-------------|
| 400 | Bad Request | Validation errors, malformed input |
| 401 | Unauthorized | Missing or invalid auth token |
| 403 | Forbidden | Valid auth but no permission (RLS denial) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, constraint violation |
| 422 | Unprocessable | Valid syntax but semantic error |
| 429 | Too Many Requests | Rate limit exceeded |

### Server Error Codes

| Code | Name | When to Use |
|------|------|-------------|
| 500 | Internal Server Error | Unexpected server errors |
| 503 | Service Unavailable | Dependency failure (DB, Redis) |

---

## Error Response Patterns

### Standard Error Handling

```typescript
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') {
        return corsPreflightResponse();
    }

    try {
        // Auth
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        // Parse and validate
        const body = await c.req.json();
        validateRequired(body, ['name', 'workspace_id']);

        // Business logic
        const { data, error } = await client
            .from('events')
            .insert({...})
            .select()
            .single();

        if (error) {
            // RLS denial
            if (error.code === '42501') {
                return errorResponse('Permission denied', 403);
            }
            // Constraint violation
            if (error.code === '23505') {
                return errorResponse('Resource already exists', 409);
            }
            throw new Error(error.message);
        }

        return successResponse(data, 201);
    } catch (error) {
        // Auth errors → 401
        if (error instanceof Error) {
            if (error.message.includes('token') ||
                error.message.includes('Authentication') ||
                error.message.includes('authenticated')) {
                return errorResponse(error, 401);
            }
            // Validation errors → 400 (default)
            if (error.message.includes('validation') ||
                error.message.includes('required')) {
                return errorResponse(error, 400);
            }
        }
        // Default → 400
        return errorResponse(error);
    }
});
```

### Categorized Error Response

```typescript
// Helper for consistent error categorization
function categorizeError(error: unknown): { message: string; status: number } {
    const message = error instanceof Error ? error.message : String(error);

    // Authentication errors
    if (message.includes('token') ||
        message.includes('Authentication') ||
        message.includes('authenticated')) {
        return { message, status: 401 };
    }

    // Authorization errors
    if (message.includes('Permission denied') ||
        message.includes('access denied')) {
        return { message, status: 403 };
    }

    // Not found errors
    if (message.includes('not found') ||
        message.includes('Not found')) {
        return { message, status: 404 };
    }

    // Rate limit errors
    if (message.includes('rate limit') ||
        message.includes('Too many')) {
        return { message, status: 429 };
    }

    // Plan limit errors
    if (message.includes('limit reached') ||
        message.includes('upgrade')) {
        return { message, status: 400 };
    }

    // Default to bad request
    return { message, status: 400 };
}

// Usage
try {
    // ... handler logic
} catch (error) {
    const { message, status } = categorizeError(error);
    return errorResponse(message, status);
}
```

---

## Examples

### Complete Route with All Response Types

```typescript
import { Hono } from '@hono/hono';
import { authenticateWithClient } from '../_shared/lib/auth.ts';
import { validateRequired, validateUUID } from '../_shared/lib/validation.ts';
import {
    corsPreflightResponse,
    errorResponse,
    successResponse,
} from '../_shared/lib/responses.ts';

const app = new Hono().basePath('/events');

// LIST - returns 200 with array
app.get('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const { data, error } = await client
            .from('events')
            .select('*')
            .is('deleted_at', null);

        if (error) throw new Error(error.message);

        return successResponse(data); // 200
    } catch (error) {
        return errorResponse(error, 401); // Auth error
    }
});

// GET ONE - returns 200 or 404
app.get('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const id = c.req.param('id');
        validateUUID(id, 'Event ID');

        const { data, error } = await client
            .from('events')
            .select('*')
            .eq('id', id)
            .is('deleted_at', null)
            .single();

        if (error || !data) {
            return errorResponse('Event not found', 404);
        }

        return successResponse(data); // 200
    } catch (error) {
        return errorResponse(error);
    }
});

// CREATE - returns 201
app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json();
        validateRequired(body, ['name', 'workspace_id']);

        const { data, error } = await client
            .from('events')
            .insert({
                name: body.name,
                workspace_id: body.workspace_id,
                created_by_id: user.id,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '42501') {
                return errorResponse('Permission denied', 403);
            }
            throw new Error(error.message);
        }

        return successResponse(data, 201); // Created
    } catch (error) {
        return errorResponse(error);
    }
});

// UPDATE - returns 200
app.put('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const id = c.req.param('id');
        const body = await c.req.json();

        const { data, error } = await client
            .from('events')
            .update({ name: body.name })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === '42501') {
                return errorResponse('Permission denied', 403);
            }
            throw new Error(error.message);
        }

        if (!data) {
            return errorResponse('Event not found', 404);
        }

        return successResponse(data); // 200
    } catch (error) {
        return errorResponse(error);
    }
});

// DELETE - returns 200 with message
app.delete('/:id', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const id = c.req.param('id');

        const { error } = await client
            .from('events')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            if (error.code === '42501') {
                return errorResponse('Permission denied', 403);
            }
            throw new Error(error.message);
        }

        return successResponse({ message: 'Event deleted successfully' });
    } catch (error) {
        return errorResponse(error);
    }
});

Deno.serve(app.fetch);
```
