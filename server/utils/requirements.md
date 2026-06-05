# Server Utils Requirements
<!-- Last updated: 2024-12-08 by Claude Code -->

## Email Utility (`email.ts`)

### Current Implementation
- Centralized email sending via Resend API ✅
- Template-based emails (verification, reset password, waiting list) ✅
- Custom HTML email support ✅
- Automatic audit logging ✅
- Batch email sending for cron jobs ✅
- Multi-language support (it/en) ✅

### Architecture Notes
- Uses `resendInstance` from `drivers.ts`
- Templates rendered via `@react-email/render` from `../emailTemplates`
- Audit events logged via `logAudit()` from `./audit`
- Sender address configured from `runtimeConfig.public`

### Email Types Supported
| Type | Description | Required Fields |
|------|-------------|-----------------|
| `verification` | Email verification on signup | `verificationUrl`, `userName?` |
| `reset_password` | Password reset request | `resetUrl`, `userName?` |
| `waiting_list` | Waiting list confirmation | None |
| `custom` | Custom HTML emails | `subject`, `html`, `replyTo?` |

### Usage Examples

```typescript
import { sendEmail, sendBatchEmails } from '~/server/utils/email';

// Send verification email
const result = await sendEmail({
    type: 'verification',
    to: user.email,
    userId: user.id,
    verificationUrl: url,
    userName: user.name,
    language: 'it',
});

// Send custom email
await sendEmail({
    type: 'custom',
    to: 'user@example.com',
    subject: 'Custom Subject',
    html: '<h1>Hello</h1>',
    replyTo: 'support@example.com',
});

// Batch send for cron jobs
const results = await sendBatchEmails([
    { type: 'verification', to: 'user1@example.com', verificationUrl: url1, userId: id1 },
    { type: 'verification', to: 'user2@example.com', verificationUrl: url2, userId: id2 },
]);
```

### API Reference

#### `sendEmail(options: EmailOptions): Promise<EmailResult>`
Sends a single email with automatic audit logging.

**Returns:**
```typescript
interface EmailResult {
    success: boolean;
    messageId?: string;  // Resend message ID if successful
    error?: string;      // Error message if failed
}
```

#### `sendBatchEmails(emails: EmailOptions[]): Promise<EmailResult[]>`
Sends multiple emails with concurrency limit (10 parallel).

#### `isEmailServiceConfigured(): boolean`
Checks if email service is properly configured.

#### `getDefaultSender(): string`
Returns the default sender address from config.

### Configuration
- `NUXT_RESEND_API_KEY`: Resend API key
- `NUXT_APP_NAME`: Application name for sender
- `NUXT_APP_NOTIFY_EMAIL`: Sender email address

### Error Handling
- Errors are logged to console with `[Email]` prefix
- Failed sends are recorded in audit log with status `failure`
- Function returns `EmailResult` with `success: false` on errors

### Rate Limiting
- Batch processing with 10 concurrent requests max
- Resend API has its own rate limits (check plan)

### TODOs
- [ ] Add email queue for high-volume sending
- [ ] Add retry mechanism for transient failures
- [ ] Add email tracking/webhook handling
- [ ] Add template preview endpoint
