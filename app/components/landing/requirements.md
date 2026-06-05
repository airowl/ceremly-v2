# Contact Form Requirements
<!-- Last updated: 2025-12-08 by Claude Code -->

## Overview
Contact form component that allows users to submit messages to the YourSaaS team.

## Current Implementation

### Frontend Component
- **File**: `app/components/landing/Contact.vue`
- **Validation**: Zod schema with i18n error messages
- **Fields**: name, email, subject, message
- **Language**: Automatically detects locale (it/en)

### Backend API
- **File**: `server/api/contact.post.ts`
- **Features**:
  - Saves message to database ✅
  - Rate limiting: 3 messages per email per 24 hours ✅
  - Sends confirmation email to user ✅
  - Sends notification email to admin ✅

### Database Schema
- **File**: `server/database/schema/contactMessage.ts`
- **Table**: `contact_messages`
- **Fields**:
  - `id` (serial, primary key)
  - `name` (text, required)
  - `email` (text, required)
  - `subject` (text, required)
  - `message` (text, required)
  - `language` (text, default: 'it')
  - `isArchived` (boolean, default: false) - Soft delete support
  - `archivedAt` (timestamp, nullable)
  - `createdAt` (timestamp, auto)

### Email Templates
- **Confirmation**: `server/emailTemplates/ContactConfirmationEmail.ts`
  - Sent to user after form submission
  - i18n support (it/en)
  - Professional React Email template

- **Notification**: `server/emailTemplates/ContactNotificationEmail.ts`
  - Sent to admin email
  - Contains all message details
  - Reply-to set to sender's email

### Environment Variables
```env
NUXT_CONTACT_ADMIN_EMAIL=team.jaitechs@gmail.com
```

## Architecture Notes
- Rate limiting: 3 requests per email per 24 hours (database-based)
- Soft delete: Messages can be archived instead of permanently deleted
- Email rendering: Uses React Email with React.createElement (no JSX)
- Translations: Inline in email templates, frontend uses i18n files

## Security Considerations
- Email validation on both frontend and backend
- Rate limiting to prevent spam
- No sensitive data exposed in API responses
- Admin email stored in environment variable
