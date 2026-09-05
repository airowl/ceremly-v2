# Validation Patterns

## Table of Contents
- [Overview](#overview)
- [Available Validators](#available-validators)
- [Usage Patterns](#usage-patterns)
- [Custom Validation](#custom-validation)
- [Examples](#examples)

---

## Overview

YourSaaS uses simple, focused validation utilities instead of heavy schema libraries. All validators throw errors on failure, making them easy to use in try-catch blocks.

### Import

```typescript
import {
    validateRequired,
    validateEmail,
    validateUUID,
    validateEnum,
    validateLength,
    validateURL,
} from '../_shared/lib/validation.ts';
```

### Philosophy

- **Throw on failure** - No return values to check
- **Clear error messages** - Include field names
- **Composable** - Chain validators as needed
- **Lightweight** - No external dependencies

---

## Available Validators

### validateRequired

Validates that required fields are present and non-empty.

```typescript
function validateRequired(
    obj: Record<string, unknown>,
    fields: string[],
    objectName: string = 'Object'
): void
```

**Parameters:**
- `obj` - Object to validate
- `fields` - Array of required field names
- `objectName` - Name for error context (default: "Object")

**Throws:**
- `"{objectName} validation failed: Missing required fields: {fields}"`

**Examples:**

```typescript
const body = await c.req.json();

// Basic usage
validateRequired(body, ['name', 'email']);
// Error: "Object validation failed: Missing required fields: name, email"

// With context name
validateRequired(body, ['name', 'workspace_id'], 'Event data');
// Error: "Event data validation failed: Missing required fields: workspace_id"

// Multiple fields
validateRequired(body, ['email', 'first_name', 'last_name', 'event_id'], 'Guest');
```

### validateEmail

Validates email format using regex pattern.

```typescript
function validateEmail(email: string): void
```

**Pattern:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

**Throws:**
- `"Email is required"` - If email is null/undefined/empty
- `"Invalid email format"` - If format doesn't match

**Examples:**

```typescript
validateEmail('user@example.com');  // ✅ Passes
validateEmail('user@domain');        // ❌ "Invalid email format"
validateEmail('');                   // ❌ "Email is required"
validateEmail(null);                 // ❌ "Email is required"
```

### validateUUID

Validates UUID v4 format.

```typescript
function validateUUID(uuid: string, fieldName: string = 'UUID'): void
```

**Pattern:** `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`

**Throws:**
- `"{fieldName} is required"` - If UUID is null/undefined/empty
- `"{fieldName} must be a valid UUID"` - If format doesn't match

**Examples:**

```typescript
validateUUID('123e4567-e89b-42d3-a456-426614174000');  // ✅ Passes
validateUUID('invalid');                                // ❌ "UUID must be a valid UUID"

// With field name
validateUUID(body.workspace_id, 'Workspace ID');
// Error: "Workspace ID must be a valid UUID"

validateUUID(body.event_id, 'Event ID');
// Error: "Event ID is required"
```

### validateEnum

Validates value is one of allowed options.

```typescript
function validateEnum<T>(
    value: T,
    allowedValues: T[],
    fieldName: string
): void
```

**Throws:**
- `"{fieldName} must be one of: {allowedValues}"`

**Examples:**

```typescript
// Subscription plans
validateEnum(body.plan, ['free', 'basic', 'pro'], 'Subscription plan');
// Error: "Subscription plan must be one of: free, basic, pro"

// Event status
validateEnum(body.status, ['draft', 'active', 'archived'], 'Event status');

// RSVP response
validateEnum(body.response, ['yes', 'no', 'maybe'], 'RSVP response');

// Numbers work too
validateEnum(body.priority, [1, 2, 3], 'Priority');
```

### validateLength

Validates string length constraints.

```typescript
function validateLength(
    value: string,
    options: { min?: number; max?: number },
    fieldName: string
): void
```

**Throws:**
- `"{fieldName} must be a string"` - If not a string
- `"{fieldName} must be at least {min} characters"` - If too short
- `"{fieldName} must be at most {max} characters"` - If too long

**Examples:**

```typescript
// Minimum only
validateLength(body.name, { min: 3 }, 'Event name');
// Error: "Event name must be at least 3 characters"

// Maximum only
validateLength(body.description, { max: 500 }, 'Description');
// Error: "Description must be at most 500 characters"

// Both min and max
validateLength(body.password, { min: 8, max: 100 }, 'Password');

// Common use cases
validateLength(body.name, { min: 1, max: 255 }, 'Name');
validateLength(body.bio, { max: 1000 }, 'Bio');
validateLength(body.code, { min: 6, max: 6 }, 'Verification code');
```

### validateURL

Validates URL format using URL constructor.

```typescript
function validateURL(url: string, fieldName: string = 'URL'): void
```

**Throws:**
- `"{fieldName} is required"` - If URL is null/undefined/empty
- `"{fieldName} must be a valid URL"` - If format is invalid

**Examples:**

```typescript
validateURL('https://example.com');           // ✅ Passes
validateURL('http://localhost:3000');         // ✅ Passes
validateURL('not-a-url');                     // ❌ "URL must be a valid URL"

// With field name
validateURL(body.website, 'Website URL');
validateURL(body.callback_url, 'Callback URL');
```

---

## Usage Patterns

### Basic Validation Chain

```typescript
app.post('/', async (c) => {
    try {
        const body = await c.req.json();

        // Validate all required fields first
        validateRequired(body, ['name', 'email', 'workspace_id'], 'Guest');

        // Then validate specific formats
        validateEmail(body.email);
        validateUUID(body.workspace_id, 'Workspace ID');

        // Optional: validate lengths
        validateLength(body.name, { min: 1, max: 255 }, 'Name');

        // Continue with business logic...
    } catch (error) {
        return errorResponse(error); // 400 Bad Request
    }
});
```

### Conditional Validation

```typescript
app.post('/', async (c) => {
    try {
        const body = await c.req.json();

        // Always required
        validateRequired(body, ['name', 'workspace_id']);
        validateUUID(body.workspace_id, 'Workspace ID');

        // Optional field validation
        if (body.email) {
            validateEmail(body.email);
        }

        if (body.website) {
            validateURL(body.website, 'Website');
        }

        // Enum only if provided
        if (body.status) {
            validateEnum(body.status, ['draft', 'active'], 'Status');
        }
    } catch (error) {
        return errorResponse(error);
    }
});
```

### Validation with URL Parameters

```typescript
app.get('/:id', async (c) => {
    try {
        const id = c.req.param('id');
        validateUUID(id, 'Event ID');

        // Fetch resource...
    } catch (error) {
        return errorResponse(error);
    }
});

app.delete('/:workspaceId/events/:eventId', async (c) => {
    try {
        validateUUID(c.req.param('workspaceId'), 'Workspace ID');
        validateUUID(c.req.param('eventId'), 'Event ID');

        // Delete resource...
    } catch (error) {
        return errorResponse(error);
    }
});
```

---

## Custom Validation

### Adding Custom Validators

```typescript
// In your function or _shared/lib/validation.ts

/**
 * Validates a phone number format
 */
export function validatePhone(phone: string, fieldName: string = 'Phone'): void {
    if (!phone || typeof phone !== 'string') {
        throw new Error(`${fieldName} is required`);
    }

    // E.164 format: +1234567890
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    if (!phoneRegex.test(phone)) {
        throw new Error(`${fieldName} must be a valid phone number (E.164 format)`);
    }
}

/**
 * Validates a date string
 */
export function validateDate(date: string, fieldName: string = 'Date'): void {
    if (!date) {
        throw new Error(`${fieldName} is required`);
    }

    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
        throw new Error(`${fieldName} must be a valid date`);
    }
}

/**
 * Validates date is in the future
 */
export function validateFutureDate(date: string, fieldName: string = 'Date'): void {
    validateDate(date, fieldName);

    const parsed = new Date(date);
    if (parsed <= new Date()) {
        throw new Error(`${fieldName} must be in the future`);
    }
}

/**
 * Validates a positive number
 */
export function validatePositiveNumber(
    value: number,
    fieldName: string = 'Value'
): void {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`${fieldName} must be a number`);
    }
    if (value <= 0) {
        throw new Error(`${fieldName} must be positive`);
    }
}

/**
 * Validates number is within range
 */
export function validateRange(
    value: number,
    min: number,
    max: number,
    fieldName: string
): void {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`${fieldName} must be a number`);
    }
    if (value < min || value > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}`);
    }
}
```

---

## Examples

### Complete Event Creation Validation

```typescript
interface CreateEventBody {
    name: string;
    description?: string;
    workspace_id: string;
    date?: string;
    max_guests?: number;
}

app.post('/', async (c) => {
    if (c.req.method === 'OPTIONS') return corsPreflightResponse();

    try {
        const { user, client } = await authenticateWithClient(
            c.req.header('Authorization')
        );

        const body = await c.req.json() as CreateEventBody;

        // Required fields
        validateRequired(body, ['name', 'workspace_id'], 'Event');

        // Format validation
        validateUUID(body.workspace_id, 'Workspace ID');
        validateLength(body.name, { min: 1, max: 255 }, 'Event name');

        // Optional field validation
        if (body.description) {
            validateLength(body.description, { max: 2000 }, 'Description');
        }

        if (body.date) {
            validateFutureDate(body.date, 'Event date');
        }

        if (body.max_guests !== undefined) {
            validateRange(body.max_guests, 1, 10000, 'Max guests');
        }

        // Business logic continues...
        const { data, error } = await client
            .from('events')
            .insert({
                name: body.name,
                description: body.description,
                workspace_id: body.workspace_id,
                date: body.date,
                max_guests: body.max_guests,
                created_by_id: user.id,
            })
            .select()
            .single();

        if (error) throw new Error(error.message);

        return successResponse(data, 201);
    } catch (error) {
        return errorResponse(error);
    }
});
```

### Guest RSVP Validation

```typescript
interface RSVPBody {
    event_id: string;
    email: string;
    name: string;
    response: 'yes' | 'no' | 'maybe';
    guests_count?: number;
    dietary_requirements?: string;
}

app.post('/rsvp', async (c) => {
    try {
        const body = await c.req.json() as RSVPBody;

        // Required fields
        validateRequired(body, ['event_id', 'email', 'name', 'response'], 'RSVP');

        // Format validation
        validateUUID(body.event_id, 'Event ID');
        validateEmail(body.email);
        validateLength(body.name, { min: 1, max: 255 }, 'Name');
        validateEnum(body.response, ['yes', 'no', 'maybe'], 'Response');

        // Conditional validation
        if (body.response === 'yes' && body.guests_count !== undefined) {
            validateRange(body.guests_count, 0, 10, 'Additional guests');
        }

        if (body.dietary_requirements) {
            validateLength(body.dietary_requirements, { max: 500 }, 'Dietary requirements');
        }

        // Process RSVP...
        return successResponse({ message: 'RSVP recorded' }, 201);
    } catch (error) {
        return errorResponse(error);
    }
});
```
