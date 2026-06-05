# Shared Zod Validation Schemas
<!-- Last updated: 2026-02-18 by Claude Code -->

## Overview

Centralized Zod validation schemas in `shared/schemas/` used by both frontend (UForm) and backend (API routes). Replaces inline manual validation (`if (!field)`, regex checks) with structured Zod schemas parsed via `parseBody()`.

### Architecture Notes
- **Plain schemas** without custom i18n messages. Frontend forms needing i18n create local schemas with `t()` referencing the same rules.
- **Shared enums** in `shared/constants/enums.ts` (single source of truth for suggestion categories/statuses).
- **Server utility** `server/utils/validateBody.ts` provides `parseBody(event, schema)` helper.
- **Explicit imports** via `~~/shared/schemas` (not auto-imported).
- Zod v4 (`zod@^4.1.12`) — standard `z.object()` / `z.enum()` API.

## File Structure

```
shared/
  constants/
    enums.ts              # Suggestion categories, statuses
  schemas/
    index.ts              # Barrel export
    common.ts             # Reusable field validators (email, slug, password, language)
    auth.ts               # changePassword, changeEmail, updateProfile
    team.ts               # invite, acceptInvite, updatePermissions, resendInvite
    event.ts              # create, update
    page.ts               # create, update, assetPresign, assetConfirm
    file.ts               # presign, confirm
    contact.ts            # contact form
    suggestion.ts         # create, updateStatus
    subscription.ts       # polarUpdate, validateDowngrade
    admin.ts              # updateUser, updateLimits, updateSubscription, cleanupFiles
    waiting-list.ts       # subscribe
    requirements.md       # This file

server/utils/
  validateBody.ts         # parseBody(event, schema) helper
```

## Schema Inventory

| Schema File | Exported Schemas | Used By |
|-------------|-----------------|---------|
| `common.ts` | `emailField`, `slugField`, `languageField`, `languageFieldOptional`, `passwordField`, `nonEmptyString` | All domain schemas |
| `auth.ts` | `changePasswordSchema`, `changeEmailSchema`, `updateProfileSchema` | `user/password.put.ts`, `user/email.put.ts`, `user/profile.patch.ts` |
| `team.ts` | `teamInviteSchema`, `acceptInviteSchema`, `updatePermissionsSchema`, `resendInviteSchema` | `team/invite.post.ts`, `team/accept-invite.post.ts`, `team/[userId]/permissions.patch.ts`, `team/invitation/[id]/resend.post.ts` |
| `event.ts` | `createEventSchema`, `updateEventSchema` | `events/index.post.ts`, `events/[id]/index.patch.ts` |
| `page.ts` | `createPageSchema`, `updatePageSchema`, `pageAssetPresignSchema`, `pageAssetConfirmSchema` | `pages/index.post.ts`, `pages/[id].patch.ts`, `pages/assets/presign.post.ts`, `pages/assets/confirm.post.ts` |
| `file.ts` | `filePresignSchema`, `fileConfirmSchema` | `file/presign.post.ts`, `file/confirm.post.ts` |
| `contact.ts` | `contactSchema` | `contact.post.ts` |
| `suggestion.ts` | `createSuggestionSchema`, `updateSuggestionStatusSchema` | `suggestions/index.post.ts`, `suggestions/[id]/status.patch.ts` |
| `subscription.ts` | `polarUpdateSchema`, `validateDowngradeSchema` | `subscription/polar-update.post.ts`, `limits/validate-downgrade.post.ts` |
| `admin.ts` | `adminUpdateUserSchema`, `adminUpdateLimitsSchema`, `adminUpdateSubscriptionSchema`, `adminCleanupFilesSchema` | `admin/users/[id].patch.ts`, `admin/users/[id]/limits.patch.ts`, `admin/subscriptions/[id].patch.ts` |
| `waiting-list.ts` | `waitingListSubscribeSchema` | `waiting-list/subscribe.post.ts` |

## Common Field Validators

| Field | Type | Constraints |
|-------|------|-------------|
| `emailField` | `z.string().email()` | Valid email format |
| `slugField` | `z.string().min(2).max(50).regex(/^[a-z0-9-]+$/)` | Lowercase alphanumeric + hyphens |
| `languageField` | `z.enum(["it", "en"]).default("it")` | Italian default |
| `languageFieldOptional` | `z.enum(["it", "en"]).optional()` | Optional locale |
| `passwordField` | `z.string().min(8)` | Minimum 8 characters |
| `nonEmptyString` | `z.string().min(1)` | Non-empty string |

## Server Utility: parseBody

```typescript
// server/utils/validateBody.ts
export async function parseBody<T extends z.ZodType>(
    event: H3Event,
    schema: T,
): Promise<z.infer<T>>
```

- Reads request body via `readBody(event)`
- Validates against Zod schema via `safeParse`
- Returns typed, validated data on success
- Throws `createError({ statusCode: 400, statusMessage: 'Validation failed', data: error.flatten() })` on failure

## Routes NOT Using Schemas (No Body)

These routes have no request body or use multipart uploads:
- `data-export/request` (no body)
- `pages/publish`, `pages/restore` (no body)
- `suggestions/vote` (no body)
- `subscription/cancel`, `subscription/ensure-customer`, `subscription/sync`, `subscription/polar-sync` (no body)
- `admin/sync-stripe-subscription` (no body)
- `file/upload`, `pages/assets/upload` (multipart — handled separately)

## Migration Summary

| Phase | Routes Migrated | Description |
|-------|----------------|-------------|
| Phase 1 | — | Foundation: enums, 12 schema files, validateBody utility |
| Phase 2 | 5 | Existing inline Zod schemas replaced with shared imports |
| Phase 3 | 19 | Manual validation replaced with `parseBody(event, schema)` |
| **Total** | **24** | All body-accepting API routes now use shared Zod schemas |

## Frontend Integration

Schemas are importable in frontend code:
```typescript
import { createEventSchema } from '~~/shared/schemas/event';
```

For UForm with i18n, create a local schema wrapping the shared rules:
```typescript
const localSchema = z.object({
    name: z.string().min(2, t('validation.name_min')).max(100, t('validation.name_max')),
    slug: z.string().min(2, t('validation.slug_min')).regex(/^[a-z0-9-]+$/, t('validation.slug_format')),
});
```

## Error Response Format

When validation fails, the API returns:
```json
{
    "statusCode": 400,
    "statusMessage": "Validation failed",
    "data": {
        "formErrors": [],
        "fieldErrors": {
            "email": ["Invalid email"],
            "name": ["String must contain at least 1 character(s)"]
        }
    }
}
```
