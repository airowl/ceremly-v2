## Audit Log System
<!-- Last updated: 2026-02-18 by Claude Code -->

### Current Implementation
- Structured `logAudit()` function with H3 event auto-extraction
- `resource.verb` taxonomy for all actions (e.g. `auth.signed_in`, `page.created`)
- `details` column as `jsonb` (not text string)
- `eventId` column for multi-tenant filtering
- DB indices on `userId`, `eventId`, `category`, `action`, `createdAt`
- Better Auth hooks use `logAudit(null, ...)` with `AUTH_PATH_MAP` for path→taxonomy mapping
- Global admin API endpoint: `GET /api/admin/audit-logs`
- Per-user admin API endpoint: `GET /api/admin/users/:id/audit-logs` (with efficient `count()`)

### Architecture Notes
- **Entry point**: `server/utils/audit/index.ts` exports `logAudit()`
- **Types**: `server/utils/audit/types.ts` defines `AUDIT_CATEGORIES`, `AUDIT_ACTIONS`, `AuditAction`, `LogAuditOptions`
- **Auth hooks**: `server/utils/auth.ts` — Better Auth hooks use `logAudit(null, ...)` with `AUTH_PATH_MAP` to convert paths to `resource.verb` actions
- **Schema**: `server/database/schema/auditLog.ts` — `audit_log` table with jsonb details + eventId
- **Auto-context**: When `H3Event` is passed, `logAudit` auto-extracts `userId` (from `event.context.user`), `ipAddress` (from `x-forwarded-for` / `x-real-ip`), `userAgent`
- **Category derivation**: Category is auto-derived from action prefix (e.g. `auth.signed_in` -> `auth`, `subscription.created` -> `payment`)
- **Fail-silent**: All audit logging wrapped in try/catch to never break business logic

### Event Coverage

| Category | Actions | Source Files |
|----------|---------|-------------|
| auth | `auth.signed_in`, `auth.signed_up`, `auth.password_reset_requested`, `auth.password_reset_completed`, `auth.oauth_callback`, `auth.tos_accepted`, `auth.failed` | `server/utils/auth.ts` (Better Auth hooks, `logAudit(null, ...)` with `AUTH_PATH_MAP`) |
| payment | `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.deleted`, `checkout.completed`, `customer.created` | `server/utils/stripe.ts`, `server/utils/polar.ts`, `server/api/subscription/cancel.post.ts`, `server/api/subscription/polar-update.post.ts` |
| email | `email.sent`, `email.failed` | `server/utils/email.ts` |
| file | `file.uploaded`, `file.deleted`, `file.presign_requested`, `file.upload_confirmed` | `server/services/file/fileService.ts` |
| team | `team.member_invited`, `team.invitation_canceled`, `team.invitation_resent` | `server/api/team/invite.post.ts`, `server/api/team/invitation/[id].delete.ts`, `server/api/team/invitation/[id]/resend.post.ts` |
| event | `event.created`, `event.updated` | `server/api/events/index.post.ts`, `server/api/events/[id]/index.patch.ts` |
| page | `page.created`, `page.updated`, `page.deleted`, `page.published`, `page.restored` | `server/api/pages/*.ts` |
| admin | `admin.user_role_changed`, `admin.user_banned`, `admin.user_unbanned`, `admin.user_limits_updated`, `admin.subscription_updated` | `server/api/admin/users/[id].patch.ts`, `server/api/admin/users/[id]/limits.patch.ts`, `server/api/admin/subscriptions/[id].patch.ts` |

### API Endpoints

#### `GET /api/admin/audit-logs`
- **Auth**: `requireAdminApiKey` (NUXT_ADMIN_API_KEY header)
- **Query params**: `page`, `limit`, `category`, `action`, `userId`, `eventId`, `status`, `startDate`, `endDate`, `search`
- **Response**: `{ logs, total, page, limit, totalPages }`
- **Order**: `createdAt DESC`

#### `GET /api/admin/users/:id/audit-logs`
- **Auth**: `requireAdminApiKey`
- **Query params**: `page`, `limit`, `category`, `eventId`, `startDate`, `endDate`
- **Response**: `{ logs, total, page, limit, totalPages }`
- **Note**: Returns logs where user is actor OR target

### DB Schema

```sql
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  event_id TEXT,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  details JSONB,
  created_at TIMESTAMP NOT NULL
);

-- Indices
CREATE INDEX audit_log_user_id_idx ON audit_log (user_id);
CREATE INDEX audit_log_event_id_idx ON audit_log (event_id);
CREATE INDEX audit_log_category_idx ON audit_log (category);
CREATE INDEX audit_log_action_idx ON audit_log (action);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at);
```

### Migration Notes
- Migration `0011_red_goliath.sql` converts existing `details` (text) to jsonb using `jsonb_build_object('message', details)`
- Applied to dev branch. Production migration should be run separately via `pnpm db:migrate:prod`

### Future Considerations
- Retention policy (auto-delete logs older than N days)
- Export functionality (CSV/JSON download)
- Real-time streaming (WebSocket for admin dashboard)
- `event.deleted` action (currently no event delete endpoint)
- Full-text search on jsonb `details` using GIN index
