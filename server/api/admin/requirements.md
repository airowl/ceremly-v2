# Admin API Requirements
<!-- Last updated: 2026-02-18 by Claude Code -->

## User Custom Limits

### Current Implementation
- Custom limits override per user ✅
- API Key authentication via `requireAdminApiKey()` ✅
- Audit logging for all changes ✅
- Support for increasing or decreasing limits ✅

### Database Schema
- Table: `user_custom_limits`
- Fields: `maxEvents`, `storageMb`, `teamMembers`, `maxPages`, `note`
- `null` = use plan default, value = custom override
- Foreign key to `user` with `onDelete: cascade`

### API Endpoints

#### GET /api/admin/users/:id/limits
Returns complete limits info:
```typescript
{
  userId: string;
  plan: string;
  planLimits: PlanLimits;      // From subscription
  customLimits: Partial<PlanLimits> | null;  // Custom overrides
  effectiveLimits: PlanLimits; // Final merged limits
  hasCustom: boolean;
  note: string | null;
}
```

#### PATCH /api/admin/users/:id/limits
Update custom limits:
```typescript
// Body:
{
  max_events?: number | null;      // value=set, null=remove, absent=keep
  storage_mb?: number | null;
  team_members?: number | null;
  note?: string | null;
}
```
- Use `-1` for unlimited
- Audit event: `update_user_limits`

### Architecture Notes
- Limits merged in `getEffectiveLimits()` function
- Custom overrides take precedence over plan limits
- All limit-checking functions use effective limits:
  - `canCreateEvent()`
  - `canAddTeamMember()`

### Admin UI
- **API-only** - No dedicated UI for limits management
- Limits managed via direct API calls (curl, Postman, etc.)

### Files
| Purpose | File |
|---------|------|
| Schema | `server/database/schema/userCustomLimits.ts` |
| Logic | `server/utils/userPlan.ts` |
| GET API | `server/api/admin/users/[id]/limits.get.ts` |
| PATCH API | `server/api/admin/users/[id]/limits.patch.ts` |
