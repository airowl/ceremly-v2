# Email Templates Requirements
<!-- Last updated: 2026-02-18 by Claude Code -->

## Current Implementation

### Templates Available
- **VerificationEmail.ts** - Email verification template ✅
- **ResetPasswordEmail.ts** - Password reset template ✅
- **WaitingListEmail.ts** - Waiting list confirmation template ✅
- **ContactConfirmationEmail.ts** - Contact form confirmation (sent to user) ✅
- **ContactNotificationEmail.ts** - Contact form notification (sent to admin) ✅
- **OrgInviteEmail.ts** - Organization invitation template ✅

### Important: Vue/React JSX Conflict Resolution
Templates use `.ts` extension (not `.tsx`) with `React.createElement()`
instead of JSX syntax to avoid conflicts with Nuxt's Vue JSX transform.

### Features
- Multi-language support (Italian/English) ✅
- React Email components ✅
- Brand colors matching landing page design ✅
- Text-based header with env-driven app name ✅
- Footer with legal links ✅
- CTA buttons with gradient styling ✅
- Security warning boxes (for password reset) ✅

### Architecture Notes
- Templates use `@react-email/components` for cross-client compatibility
- Rendering via `@react-email/render` to generate HTML
- Integration with Better Auth via `auth.ts`
- Resend API for email delivery

### Dependencies
```json
{
  "@react-email/components": "^1.0.1",
  "@react-email/render": "^2.0.0",
  "react": "^19.2.1",
  "react-dom": "^19.2.1",
  "resend": "^6.5.2"
}
```

### Configuration
- Sender: `${appName} <${appNotifyEmail}>`
- Language: Uses `user.locale` field from database (defaults to 'it')

### Email Types

#### Verification Email
- Sent on user signup
- Contains verification URL
- 24-hour expiry notice
- Fallback link text

#### Reset Password Email
- Sent on password reset request
- Contains reset URL
- 1-hour expiry notice
- Security warning box
- Fallback link text

#### Waiting List Email
- Sent when joining waiting list
- Welcome message
- CTA to visit website

#### Contact Confirmation Email
- Sent to user after contact form submission
- Shows submitted subject
- 24-48h response time note
- CTA to visit site

#### Contact Notification Email
- Sent to admin on contact form submission
- Shows sender info, subject, message
- Meta info (language, timestamp)
- Reply link to sender

#### Event Invite Email
- Sent when inviting user to event
- Shows inviter name and event name
- Accept invitation CTA
- Configurable expiry (default 7 days)
- Account creation note for new users

### Usage

```typescript
import {
    renderVerificationEmail,
    renderResetPasswordEmail,
    emailSubjects,
} from "../emailTemplates";

// Render email to HTML
const html = await renderVerificationEmail({
    language: 'it',
    verificationUrl: url,
    userName: user.name,
});

// Send via Resend
await resendInstance.emails.send({
    from: `${appName} <${appNotifyEmail}>`,
    to: user.email,
    subject: emailSubjects.verification['it'],
    html,
});
```

### Styling
<!-- Last updated: 2026-02-18 by Claude Code -->
- Primary color: `#19baf0` (cyan blue, matches landing page)
- Primary dark: `#0ea5d6`
- Background: `#f8fbfc` (light blue-gray)
- Highlight: `#e0f3fe` (light cyan)
- Text: `#0d181c` (dark)
- Text light: `#4b879b` (muted teal)
- Text muted: `#7ca8b8`
- Divider: `#e7f0f3`
- Max width: 600px
- Font: System fonts (-apple-system, BlinkMacSystemFont, etc.)
- Header: Gradient `#19baf0` → `#0ea5d6` with text-based app-name brand logo (env-driven)

### TODOs
- [x] Add user language preference support (uses `user.locale` field)
- [x] Update design to match landing page colors and branding
- [ ] Add email preview/testing endpoint
- [ ] Add more email templates (welcome, invoice, etc.)
