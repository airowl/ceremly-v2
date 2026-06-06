// Email Templates - React Email based templates for Ceremly
// Export all email templates and render utility

import { render } from '@react-email/render';
import * as React from 'react';
import { VerificationEmail } from './VerificationEmail';
import { ResetPasswordEmail } from './ResetPasswordEmail';
import { WaitingListEmail } from './WaitingListEmail';
import { ContactConfirmationEmail } from './ContactConfirmationEmail';
import { ContactNotificationEmail } from './ContactNotificationEmail';
import { EventInviteEmail } from './EventInviteEmail';
import { OrgInviteEmail } from './OrgInviteEmail';

export type SupportedLanguage = 'it' | 'en';

// Re-export components
export { VerificationEmail } from './VerificationEmail';
export { ResetPasswordEmail } from './ResetPasswordEmail';
export { WaitingListEmail } from './WaitingListEmail';
export { ContactConfirmationEmail } from './ContactConfirmationEmail';
export { ContactNotificationEmail } from './ContactNotificationEmail';
export { EventInviteEmail } from './EventInviteEmail';
export { OrgInviteEmail } from './OrgInviteEmail';

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
    });
    return await render(element);
}

/**
 * Render event invite email to HTML
 */
export async function renderEventInviteEmail(options: {
    language?: SupportedLanguage;
    inviteUrl: string;
    eventName: string;
    invitedByName: string;
    expiresInDays?: number;
}): Promise<string> {
    const element = React.createElement(EventInviteEmail, {
        language: options.language || 'it',
        inviteUrl: options.inviteUrl,
        eventName: options.eventName,
        invitedByName: options.invitedByName,
        expiresInDays: options.expiresInDays || 7,
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
    });
    return await render(element);
}

// Email subject lines by language
export const emailSubjects = {
    verification: {
        it: 'Verifica il tuo indirizzo email - Ceremly',
        en: 'Verify your email address - Ceremly',
    },
    resetPassword: {
        it: 'Reimposta la tua password - Ceremly',
        en: 'Reset your password - Ceremly',
    },
    waitingList: {
        it: 'Benvenuto nella Waiting List di Ceremly!',
        en: "Welcome to Ceremly's Waiting List!",
    },
    contactConfirmation: {
        it: 'Abbiamo ricevuto il tuo messaggio - Ceremly',
        en: 'We received your message - Ceremly',
    },
    contactNotification: (subject: string) => `[Contatto] ${subject}`,
    eventInvite: (eventName: string) => ({
        it: `Sei stato invitato a unirti all'evento ${eventName} - Ceremly`,
        en: `You've been invited to join the event ${eventName} - Ceremly`,
    }),
    orgInvite: (orgName: string) => ({
        it: `Sei stato invitato a unirti a ${orgName} - Ceremly`,
        en: `You've been invited to join ${orgName} - Ceremly`,
    }),
};
