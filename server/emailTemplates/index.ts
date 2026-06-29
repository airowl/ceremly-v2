// Email Templates - React Email based templates
// Export all email templates and render utility

import { render } from '@react-email/render';
import * as React from 'react';
import { VerificationEmail } from './VerificationEmail';
import { ResetPasswordEmail } from './ResetPasswordEmail';
import { ChangeEmailEmail } from './ChangeEmailEmail';
import { WaitingListEmail } from './WaitingListEmail';
import { ContactConfirmationEmail } from './ContactConfirmationEmail';
import { ContactNotificationEmail } from './ContactNotificationEmail';
import { OrgInviteEmail } from './OrgInviteEmail';
import { GuestInviteEmail } from './GuestInviteEmail';
import { GuestReminderEmail } from './GuestReminderEmail';
import { EventCleanupWarning } from './EventCleanupWarning';
import { runtimeConfig } from '../utils/runtimeConfig';

export type SupportedLanguage = 'it' | 'en';

// Rendered email: both HTML and a plain-text alternative (better deliverability,
// avoids spam filters). Generated once per template via renderBoth().
export interface RenderedEmail {
    html: string;
    text: string;
}

// Brand name from env (env-driven, fallback empty string)
const appName = (): string => runtimeConfig.public.appName || '';

// Public host (e.g. "ceremly.app") derived from baseURL, used in Ceremly email footers
const appHost = (): string => {
    const base = runtimeConfig.public.baseURL as string | undefined;
    if (!base) return '';
    try {
        return new URL(base).host;
    } catch {
        return '';
    }
};

// Site base URL (without trailing slash) for absolute links in emails.
const baseUrl = (): string => ((runtimeConfig.public.baseURL as string) || '').replace(/\/$/, '');

// Links to the actual legal pages (not locale-prefixed: same document for every language).
const legalLinks = (): { privacy: string; tos: string; dpa: string } => ({
    privacy: `${baseUrl()}/legal/privacy`,
    tos: `${baseUrl()}/legal/tos`,
    dpa: `${baseUrl()}/legal/dpa`,
});

// Renders both HTML and plain text from a single React element (React Email plainText).
async function renderBoth(element: React.ReactElement): Promise<RenderedEmail> {
    return {
        html: await render(element),
        text: await render(element, { plainText: true }),
    };
}

// Re-export components
export { VerificationEmail } from './VerificationEmail';
export { ResetPasswordEmail } from './ResetPasswordEmail';
export { ChangeEmailEmail } from './ChangeEmailEmail';
export { WaitingListEmail } from './WaitingListEmail';
export { ContactConfirmationEmail } from './ContactConfirmationEmail';
export { ContactNotificationEmail } from './ContactNotificationEmail';
export { OrgInviteEmail } from './OrgInviteEmail';
export { GuestInviteEmail } from './GuestInviteEmail';
export { GuestReminderEmail } from './GuestReminderEmail';
export { EventCleanupWarning } from './EventCleanupWarning';

/**
 * Render verification email (HTML + text)
 */
export async function renderVerificationEmail(options: {
    language?: SupportedLanguage;
    verificationUrl: string;
    userName?: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(VerificationEmail, {
        language: options.language || 'it',
        verificationUrl: options.verificationUrl,
        userName: options.userName,
        appName: appName(),
        legalLinks: legalLinks(),
    });
    return renderBoth(element);
}

/**
 * Render reset password email (HTML + text)
 */
export async function renderResetPasswordEmail(options: {
    language?: SupportedLanguage;
    resetUrl: string;
    userName?: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(ResetPasswordEmail, {
        language: options.language || 'it',
        resetUrl: options.resetUrl,
        userName: options.userName,
        appName: appName(),
        legalLinks: legalLinks(),
    });
    return renderBoth(element);
}

/**
 * Render change-email confirmation email (sent to the CURRENT address) — HTML + text
 */
export async function renderChangeEmailEmail(options: {
    language?: SupportedLanguage;
    confirmUrl: string;
    newEmail: string;
    userName?: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(ChangeEmailEmail, {
        language: options.language || 'it',
        confirmUrl: options.confirmUrl,
        newEmail: options.newEmail,
        userName: options.userName,
        appName: appName(),
        legalLinks: legalLinks(),
    });
    return renderBoth(element);
}

/**
 * Render waiting list email (HTML + text)
 */
export async function renderWaitingListEmail(options: {
    language?: SupportedLanguage;
}): Promise<RenderedEmail> {
    const element = React.createElement(WaitingListEmail, {
        language: options.language || 'it',
        appName: appName(),
        siteUrl: baseUrl(),
        legalLinks: legalLinks(),
    });
    return renderBoth(element);
}

/**
 * Render contact confirmation email (sent to user) — HTML + text
 */
export async function renderContactConfirmationEmail(options: {
    language?: SupportedLanguage;
    userName: string;
    subject: string;
    siteUrl?: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(ContactConfirmationEmail, {
        language: options.language || 'it',
        userName: options.userName,
        subject: options.subject,
        siteUrl: options.siteUrl || baseUrl(),
        appName: appName(),
    });
    return renderBoth(element);
}

/**
 * Render contact notification email (sent to admin) — HTML + text
 */
export async function renderContactNotificationEmail(options: {
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
    language: string;
    submittedAt: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(ContactNotificationEmail, {
        senderName: options.senderName,
        senderEmail: options.senderEmail,
        subject: options.subject,
        message: options.message,
        language: options.language,
        submittedAt: options.submittedAt,
        appName: appName(),
    });
    return renderBoth(element);
}

/**
 * Render organization invite email (phase 1b) — HTML + text
 */
export async function renderOrgInviteEmail(options: {
    language?: SupportedLanguage;
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
}): Promise<RenderedEmail> {
    const element = React.createElement(OrgInviteEmail, {
        language: options.language || 'it',
        inviteUrl: options.inviteUrl,
        orgName: options.orgName,
        invitedByName: options.invitedByName,
        expiresInDays: options.expiresInDays || 7,
        appName: appName(),
        legalLinks: legalLinks(),
    });
    return renderBoth(element);
}

/**
 * Render guest invite email (Ceremly, SPEC §6 — owner B3) — HTML + text.
 * `message` arrives with the {name}/{link} placeholders already substituted.
 */
export async function renderGuestInviteEmail(options: {
    eventTitle: string;
    firstName: string;
    message: string;
    ctaUrl: string;
    pixelUrl: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(GuestInviteEmail, {
        eventTitle: options.eventTitle,
        firstName: options.firstName,
        message: options.message,
        ctaUrl: options.ctaUrl,
        pixelUrl: options.pixelUrl,
        appName: appName(),
        appHost: appHost(),
    });
    return renderBoth(element);
}

/**
 * Render guest reminder email (Ceremly, SPEC §6 — owner B3) — HTML + text.
 * `message` arrives with the {name}/{link} placeholders already substituted.
 */
export async function renderGuestReminderEmail(options: {
    eventTitle: string;
    firstName: string;
    message: string;
    ctaUrl: string;
    pixelUrl: string;
}): Promise<RenderedEmail> {
    const element = React.createElement(GuestReminderEmail, {
        eventTitle: options.eventTitle,
        firstName: options.firstName,
        message: options.message,
        ctaUrl: options.ctaUrl,
        pixelUrl: options.pixelUrl,
        appName: appName(),
        appHost: appHost(),
    });
    return renderBoth(element);
}

/** Renders event archival warning email (SPEC §9.2) — HTML + text, i18n IT/EN. */
export async function renderEventCleanupWarningEmail(options: {
    language?: SupportedLanguage;
    eventTitle: string;
    dashboardUrl: string;
    daysLeft: number;
}): Promise<RenderedEmail> {
    const element = React.createElement(EventCleanupWarning, {
        language: options.language || 'it',
        eventTitle: options.eventTitle,
        dashboardUrl: options.dashboardUrl,
        daysLeft: options.daysLeft,
        appName: appName(),
        appHost: appHost(),
    });
    return renderBoth(element);
}

// Email subject lines by language (brand injected via appName)
export const emailSubjects = {
    verification: {
        it: 'Confermiamo che sei tu',
        en: "Let's confirm it's you",
    },
    resetPassword: {
        it: 'Reimposta la password',
        en: 'Reset your password',
    },
    changeEmail: {
        it: 'Confermi il nuovo indirizzo?',
        en: 'Confirm your new address?',
    },
    waitingList: {
        it: 'Ci sei. Ti avvisiamo noi.',
        en: "You're in. We'll be in touch.",
    },
    contactConfirmation: {
        it: 'Ci pensiamo noi',
        en: "We're on it",
    },
    contactNotification: (subject: string) => `[Contatto] ${subject}`,
    orgInvite: (orgName: string) => ({
        it: `Ti hanno invitato nel team — ${orgName}`,
        en: `You're invited to the team — ${orgName}`,
    }),
    // Ceremly (Italian only, SPEC §0): fallback when the organiser has not
    // defined a subject in event.distribution / in the reminder.
    guestInvite: (eventTitle: string) => `Sei invitato: ${eventTitle}`,
    guestReminder: (eventTitle: string) => `Promemoria — ${eventTitle}`,
    eventCleanupWarning: (eventTitle: string) => ({
        it: `Stiamo per archiviare "${eventTitle}"`,
        en: `We're about to archive "${eventTitle}"`,
    }),
};
