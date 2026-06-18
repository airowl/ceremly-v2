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
import { runtimeConfig } from '../utils/runtimeConfig';

export type SupportedLanguage = 'it' | 'en';

// Brand name from env (env-driven, fallback empty string)
const appName = (): string => runtimeConfig.public.appName || '';

// Host pubblico (es. "ceremly.app") derivato da baseURL, per i footer Ceremly
const appHost = (): string => {
    const base = runtimeConfig.public.baseURL as string | undefined;
    if (!base) return '';
    try {
        return new URL(base).host;
    } catch {
        return '';
    }
};

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

/**
 * Render verification email to HTML
 */
export async function renderVerificationEmail(options: {
    language?: SupportedLanguage;
    verificationUrl: string;
    userName?: string;
}): Promise<string> {
    const element = React.createElement(VerificationEmail, {
        language: options.language || 'it',
        verificationUrl: options.verificationUrl,
        userName: options.userName,
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render reset password email to HTML
 */
export async function renderResetPasswordEmail(options: {
    language?: SupportedLanguage;
    resetUrl: string;
    userName?: string;
}): Promise<string> {
    const element = React.createElement(ResetPasswordEmail, {
        language: options.language || 'it',
        resetUrl: options.resetUrl,
        userName: options.userName,
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render change-email confirmation email to HTML (sent to the CURRENT address)
 */
export async function renderChangeEmailEmail(options: {
    language?: SupportedLanguage;
    confirmUrl: string;
    newEmail: string;
    userName?: string;
}): Promise<string> {
    const element = React.createElement(ChangeEmailEmail, {
        language: options.language || 'it',
        confirmUrl: options.confirmUrl,
        newEmail: options.newEmail,
        userName: options.userName,
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render waiting list email to HTML
 */
export async function renderWaitingListEmail(options: {
    language?: SupportedLanguage;
}): Promise<string> {
    const element = React.createElement(WaitingListEmail, {
        language: options.language || 'it',
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render contact confirmation email to HTML (sent to user)
 */
export async function renderContactConfirmationEmail(options: {
    language?: SupportedLanguage;
    userName: string;
    subject: string;
    siteUrl?: string;
}): Promise<string> {
    const element = React.createElement(ContactConfirmationEmail, {
        language: options.language || 'it',
        userName: options.userName,
        subject: options.subject,
        siteUrl: options.siteUrl,
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render contact notification email to HTML (sent to admin)
 */
export async function renderContactNotificationEmail(options: {
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
    language: string;
    submittedAt: string;
}): Promise<string> {
    const element = React.createElement(ContactNotificationEmail, {
        senderName: options.senderName,
        senderEmail: options.senderEmail,
        subject: options.subject,
        message: options.message,
        language: options.language,
        submittedAt: options.submittedAt,
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render organization invite email to HTML (phase 1b)
 */
export async function renderOrgInviteEmail(options: {
    language?: SupportedLanguage;
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
}): Promise<string> {
    const element = React.createElement(OrgInviteEmail, {
        language: options.language || 'it',
        inviteUrl: options.inviteUrl,
        orgName: options.orgName,
        invitedByName: options.invitedByName,
        expiresInDays: options.expiresInDays || 7,
        appName: appName(),
    });
    return await render(element);
}

/**
 * Render guest invite email to HTML (Ceremly, SPEC §6 — owner B3).
 * `message` arriva con i placeholder {nome}/{link} già sostituiti.
 */
export async function renderGuestInviteEmail(options: {
    eventTitle: string;
    firstName: string;
    message: string;
    ctaUrl: string;
    pixelUrl: string;
}): Promise<string> {
    const element = React.createElement(GuestInviteEmail, {
        eventTitle: options.eventTitle,
        firstName: options.firstName,
        message: options.message,
        ctaUrl: options.ctaUrl,
        pixelUrl: options.pixelUrl,
        appName: appName(),
        appHost: appHost(),
    });
    return await render(element);
}

/**
 * Render guest reminder email to HTML (Ceremly, SPEC §6 — owner B3).
 * `message` arriva con i placeholder {nome}/{link} già sostituiti.
 */
export async function renderGuestReminderEmail(options: {
    eventTitle: string;
    firstName: string;
    message: string;
    ctaUrl: string;
    pixelUrl: string;
}): Promise<string> {
    const element = React.createElement(GuestReminderEmail, {
        eventTitle: options.eventTitle,
        firstName: options.firstName,
        message: options.message,
        ctaUrl: options.ctaUrl,
        pixelUrl: options.pixelUrl,
        appName: appName(),
        appHost: appHost(),
    });
    return await render(element);
}

// Email subject lines by language (brand injected via appName)
export const emailSubjects = {
    verification: {
        it: `Verifica il tuo indirizzo email - ${appName()}`,
        en: `Verify your email address - ${appName()}`,
    },
    resetPassword: {
        it: `Reimposta la tua password - ${appName()}`,
        en: `Reset your password - ${appName()}`,
    },
    changeEmail: {
        it: `Conferma il cambio del tuo indirizzo email - ${appName()}`,
        en: `Confirm your email address change - ${appName()}`,
    },
    waitingList: {
        it: `Benvenuto nella Waiting List di ${appName()}!`,
        en: `Welcome to ${appName()}'s Waiting List!`,
    },
    contactConfirmation: {
        it: `Abbiamo ricevuto il tuo messaggio - ${appName()}`,
        en: `We received your message - ${appName()}`,
    },
    contactNotification: (subject: string) => `[Contatto] ${subject}`,
    orgInvite: (orgName: string) => ({
        it: `Sei stato invitato a unirti a ${orgName} - ${appName()}`,
        en: `You've been invited to join ${orgName} - ${appName()}`,
    }),
    // Ceremly (solo italiano, SPEC §0): fallback quando l'organizzatore non ha
    // definito un oggetto in event.distribution / nel reminder.
    guestInvite: (eventTitle: string) => `Sei invitato: ${eventTitle}`,
    guestReminder: (eventTitle: string) => `Promemoria — ${eventTitle}`,
};
