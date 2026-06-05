# Profile Management Feature Requirements
<!-- Last updated: 2026-02-18 by Claude Code -->

## Overview
User profile management system allowing authenticated users to view and update their personal information, change passwords, and manage account settings including account deletion with soft delete (30-day retention).

## Current Implementation

### Files Structure
```
app/pages/dashboard/
├── profile.vue             # Profile section layout (UDashboardPanel with tabs)
└── profile/
    ├── index.vue           # Main profile information form
    ├── security.vue        # Password change & account deletion
    └── requirements.md     # This documentation

app/stores/
└── profileStore.ts         # Pinia store for profile management

server/api/user/
├── profile.get.ts          # GET /api/user/profile - Fetch profile
├── profile.patch.ts        # PATCH /api/user/profile - Update profile
└── account.delete.ts       # DELETE /api/user/account - Soft delete

server/database/schema/
└── auth.ts                 # User schema with phone/bio fields

supabase/migrations/
└── 0004_redundant_human_torch.sql  # Added phone, bio columns (2025-12-09)
```

### Navigation Structure
- **Sidebar** (dashboard.vue): Home | Organizations | Profile
- **Profile Tabs** (profile.vue): General | Security

### State Management
- **Store**: `fe/app/stores/profileStore.ts`
- **Pattern**: Pinia composition API (consistent with existing userStore.ts)

## Features

### Profile Information (index.vue)
- [x] Display user profile data (name, email, phone, bio)
- [x] Edit profile fields with Zod validation
- [x] Email change with confirmation flow
- [x] Loading states during operations
- [x] Toast notifications for success/error
- [x] Data synced to `base.users` table (not just auth metadata)
- ~~Avatar upload~~ (Removed 2026-01-18)

### Security Settings (security.vue)
- [x] Password change with current password verification
- [x] Password validation (min 8 characters)
- [x] Validation: new password must differ from current
- [x] **OAuth user detection**: Password section hidden for Google/GitHub users
- [x] OAuth info message explaining password managed by provider
- [x] Account deletion with confirmation modal
- [x] Safety confirmation: type "DELETE" to proceed
- [x] **Soft delete**: 30-day retention before permanent deletion
- [x] Loading states during operations
- [x] Toast notifications for success/error

## Architecture Notes

### Data Flow
```
User Input → Zod Validation → profileStore Action → Supabase API → Response → Toast Notification
```

### Profile Store Actions
| Action | Description | API Used |
|--------|-------------|----------|
| `fetchProfile()` | Load profile from auth + base.users | `auth.getUser()` + `from('users').select()` |
| `updateProfile()` | Update auth metadata + base.users | `auth.updateUser()` + `from('users').update()` |
| `updateEmail()` | Request email change (requires confirmation) | `auth.updateUser()` |
| `updatePassword()` | Update account password | `auth.updateUser()` |
| `verifyCurrentPassword()` | Verify password before change | `auth.signInWithPassword()` |
| `deleteAccount()` | Soft delete user account | Edge Function `delete-account` |

### OAuth Detection
The store detects OAuth users via `user.identities[0].provider`:
- `email` → Standard email/password user → Show password change
- `google`, `github`, etc. → OAuth user → Hide password, show info message

### Validation Rules
- **Name**: Minimum 2 characters
- **Email**: Valid email format
- **Password**: Minimum 8 characters
- **New Password**: Must differ from current password

## Backend Architecture

### Database Schema (`user` table - Drizzle/Better Auth)
```sql
-- Core fields (Better Auth)
id TEXT PRIMARY KEY
name TEXT NOT NULL           -- Display name
email TEXT NOT NULL UNIQUE   -- Email address
email_verified BOOLEAN       -- Email verification status
image TEXT                   -- Avatar URL

-- Profile fields (added 2025-12-09 via migration 0004)
phone TEXT                   -- User phone number
bio TEXT                     -- User biography/description

-- Settings
locale TEXT DEFAULT 'it'     -- Preferred language (it, en)

-- Auth metadata
role TEXT                    -- User role
banned BOOLEAN               -- Account banned status
ban_reason TEXT              -- Reason for ban
ban_expires TIMESTAMP        -- Ban expiration

-- Payment
stripe_customer_id TEXT      -- Stripe customer ID
polar_customer_id TEXT       -- Polar customer ID

-- Timestamps
created_at TIMESTAMP DEFAULT NOW()
updated_at TIMESTAMP DEFAULT NOW()
```

### RLS Policies
| Policy | Operation | Description |
|--------|-----------|-------------|
| `users_select_own` | SELECT | Users can read their own profile |
| `users_update_own` | UPDATE | Users can update their own profile |

### Database Functions
| Function | Permission | Description |
|----------|------------|-------------|
| `base.soft_delete_user(uuid)` | service_role | Set deleted_at + cascade to event_users |
| `base.restore_user(uuid)` | service_role | Restore soft-deleted user (admin use) |

### Edge Function: `delete-account`
- **Endpoint**: `POST /functions/v1/delete-account`
- **Auth**: Required (Bearer token)
- **Rate Limit**: Auth preset (10 req/60s)
- **Process**:
  1. Authenticate user via Bearer token
  2. Call `soft_delete_user()` RPC with service role
  3. Returns success message about 30-day retention
  4. Frontend calls `userStore.logout()` after success

### Soft Delete Flow
```
User clicks Delete → Type "DELETE" → Edge Function → soft_delete_user() RPC
→ Sets deleted_at on base.users → Cascades to event_users → Frontend logout
```

### Views
- `base.active_users` - View of non-deleted users (WHERE deleted_at IS NULL)

## i18n Support
- English: `fe/i18n/locales/en-US.json` → `profile.*` namespace
- Italian: `fe/i18n/locales/it-IT.json` → `profile.*` namespace

### Translation Keys
- `profile.title`, `profile.tabs.general`, `profile.tabs.security`
- `profile.description`
- `profile.name`, `profile.nameDescription`
- `profile.email`, `profile.emailDescription`
- `profile.phone`, `profile.phoneDescription`
- `profile.bio`, `profile.bioDescription`
- `profile.password`, `profile.passwordDescription`
- `profile.oauthPasswordInfo` - Message for OAuth users
- `profile.currentPassword`, `profile.newPassword`
- `profile.updateSuccess`, `profile.updateError`
- `profile.deleteAccount*` (multiple keys with soft delete messaging)
- `profile.validation.*` (error messages)
- `common.success`, `common.error`, `common.saveChanges`, etc.

## Security Considerations

### Password Change Flow
1. User enters current password
2. System verifies via `signInWithPassword()`
3. Only if valid, proceed with `updateUser()` for new password
4. Prevents unauthorized password changes even with valid session
5. **OAuth users**: Password section completely hidden (cannot change)

### Account Deletion
1. User clicks "Delete Account" button
2. Modal opens requiring confirmation
3. User must type "DELETE" exactly
4. Edge Function `delete-account` handles server-side soft delete
5. Sets `deleted_at` timestamp (30-day retention)
6. User is logged out and redirected to home
7. Data can be restored by admin within 30 days via `restore_user()`

### Data Protection
- Profile data stored in both Supabase Auth metadata AND `base.users` table
- No sensitive data stored in browser localStorage
- RLS policies ensure users can only access their own profile

## UI Components Used
- `UPageCard` - Section containers
- `UForm` / `UFormField` - Form structure with Zod schema
- `UInput` - Text/email/password inputs
- `UTextarea` - Bio field (autoresize)
- `UButton` - Actions with loading states
- `UModal` / `UCard` - Delete confirmation dialog
- `USeparator` - Section dividers
- `UIcon` - Visual indicators

## Dependencies
- `zod` - Schema validation
- `@nuxt/ui` - UI components
- `pinia` - State management
- `@supabase/supabase-js` - Backend integration
- `vue-i18n` - Internationalization

## Backend Requirements

### Edge Function Requirements
- `delete-account`: Handles user account soft deletion
- Requires authenticated user
- Uses service role to call `soft_delete_user()` RPC
- Returns soft delete confirmation with 30-day message

## Future Enhancements
- [ ] Two-factor authentication settings
- [ ] Session management (view/revoke active sessions)
- [ ] Connected accounts (OAuth providers)
- [ ] Email notification preferences
- [ ] Profile visibility settings (public/private)
- [ ] Account export (GDPR data portability)
- [ ] Hard delete scheduler (auto-delete after 30 days)
- [ ] Account recovery request form
