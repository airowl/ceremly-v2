# Authentication Requirements
<!-- Last updated: 2025-12-08 by Claude Code -->

## Current Implementation

### Core Authentication ✅
- Better Auth framework with Drizzle adapter
- Email/password authentication with email verification
- OAuth 2.0 with Google provider
- Session management via `secondaryStorage` cache
- UUID v7 for all entity IDs

### Security Features ✅
- Email verification required before login
- Password reset flow with email
- Account linking enabled (OAuth + email)
- Audit logging for all auth events
- IP and User-Agent tracking

### Admin Features ✅
- Admin plugin enabled
- User banning with reason and expiry
- Role-based access control

## Architecture Notes

### Session Management
- Sessions stored in cache client (`secondaryStorage`)
- `getAuthSession(event)` → retrieves session from headers
- `requireAuth(event)` → middleware requiring valid session

### Database Schema
```
user: id, name, email, emailVerified, image, locale, role, banned, stripeCustomerId, polarCustomerId
account: id, accountId, providerId, userId, accessToken, refreshToken, ...
verification: id, identifier, value, expiresAt
```

### API Endpoints
- `server/api/auth/[...all].ts` → Catch-all route for Better Auth API
- Trusted origins: `localhost:8787`, `baseURL`

### Middleware Stack
1. `server/middleware/1.auth.ts` → Global auth middleware
2. `app/middleware/auth.global.ts` → Client-side auth guard

### Hooks
- `after` hook logs all auth events to audit log
- Tracks: sign-in, sign-up, password reset, OAuth callbacks
- Logs success/failure with IP, User-Agent, target info

## Email Templates
- Verification email → `sendEmail({ type: "verification" })`
- Reset password email → `sendEmail({ type: "reset_password" })`
- Supports i18n with `user.locale` (it, en)

## Configuration

### Runtime Config Required
```typescript
betterAuthSecret: string      // JWT signing secret
googleClientId: string        // OAuth client ID
googleClientSecret: string    // OAuth client secret
public.baseURL: string        // App base URL
```

## Integration Points

### Stripe Integration
- `stripeCustomerId` field on user table
- Auto-creates Stripe customer on signup (if payment enabled)
- See: `docs/stripe/requirements.md`

### Polar Integration
- `polarCustomerId` field on user table
- Alternative payment provider
- See: `docs/stripe/requirements.md`

## Pending Features
- ~~Password-based auth only~~ (OAuth added 2025-12-08)
- [ ] Two-factor authentication (2FA)
- [ ] Magic link authentication
- [ ] Passkey/WebAuthn support

## API Reference

### Server Functions
| Function | Description |
|----------|-------------|
| `createBetterAuth()` | Factory for auth instance |
| `useServerAuth()` | Singleton for node-server preset |
| `getAuthSession(event)` | Get session from H3 event |
| `requireAuth(event)` | Require auth, throw 401 if missing |

### Client Plugins
- `app/plugins/auth.client.ts` → Client-side auth state
- `app/plugins/auth.server.ts` → SSR auth hydration
