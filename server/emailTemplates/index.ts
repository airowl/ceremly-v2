// Adapter legacy dei template email (plan Task 13).
//
// I template React Email vivono in `convex/emailTemplates/` — sono gli stessi che
// invierà il backend Convex, e tenerne due copie significherebbe due rendering che
// possono divergere. Questo file esiste per una sola ragione: il codice legacy
// (`server/utils/email.ts`, i service, la coda QStash) legge la configurazione da
// `useRuntimeConfig()`, che in Convex non esiste. Qui quella configurazione viene
// letta e iniettata nel renderer puro come prop esplicita.
//
// La firma esportata è quella di prima, quindi nessun chiamante legacy cambia.
// Quando il legacy sparisce (Task 17) sparisce anche questo file.

import { runtimeConfig } from "../utils/runtimeConfig";
import {
    emailSubjects,
    renderEmail,
    resolveBrand,
    type EmailRequest,
    type EmailBrand,
    type RenderedEmail,
    type SupportedLanguage,
} from "../../convex/emailTemplates";

export { emailSubjects };
export type { RenderedEmail, SupportedLanguage };

// Brand name from env (env-driven, fallback empty string)
const appName = (): string => runtimeConfig.public.appName || "";

// Base URL del sito (senza trailing slash) per link assoluti nelle email.
const baseUrl = (): string => ((runtimeConfig.public.baseURL as string) || "").replace(/\/$/, "");

const brand = (): EmailBrand => resolveBrand({ appName: appName(), siteUrl: baseUrl() });

const renderFor = (request: EmailRequest): Promise<RenderedEmail> =>
    renderEmail(request, brand()).then(({ html, text }) => ({ html, text }));

/**
 * Render verification email (HTML + text)
 */
export function renderVerificationEmail(options: {
    language?: SupportedLanguage;
    verificationUrl: string;
    userName?: string;
}): Promise<RenderedEmail> {
    return renderFor({ template: "verification", ...options });
}

/**
 * Render reset password email (HTML + text)
 */
export function renderResetPasswordEmail(options: {
    language?: SupportedLanguage;
    resetUrl: string;
    userName?: string;
}): Promise<RenderedEmail> {
    return renderFor({ template: "reset-password", ...options });
}

/**
 * Render change-email confirmation email (sent to the CURRENT address) — HTML + text
 */
export function renderChangeEmailEmail(options: {
    language?: SupportedLanguage;
    confirmUrl: string;
    newEmail: string;
    userName?: string;
}): Promise<RenderedEmail> {
    return renderFor({ template: "change-email", ...options });
}

/**
 * Render waiting list email (HTML + text)
 */
export function renderWaitingListEmail(options: {
    language?: SupportedLanguage;
}): Promise<RenderedEmail> {
    return renderFor({ template: "waiting-list", ...options });
}

/**
 * Render contact confirmation email (sent to user) — HTML + text
 */
export function renderContactConfirmationEmail(options: {
    language?: SupportedLanguage;
    userName: string;
    subject: string;
    siteUrl?: string;
}): Promise<RenderedEmail> {
    if (options.siteUrl) {
        const custom = resolveBrand({ appName: appName(), siteUrl: options.siteUrl });
        return renderEmail(
            {
                template: "contact-confirmation",
                language: options.language,
                userName: options.userName,
                subject: options.subject,
            },
            custom,
        ).then(({ html, text }) => ({ html, text }));
    }

    return renderFor({
        template: "contact-confirmation",
        language: options.language,
        userName: options.userName,
        subject: options.subject,
    });
}

/**
 * Render contact notification email (sent to admin) — HTML + text
 */
export function renderContactNotificationEmail(options: {
    senderName: string;
    senderEmail: string;
    subject: string;
    message: string;
    language: string;
    submittedAt: string;
}): Promise<RenderedEmail> {
    return renderFor({ template: "contact-notification", ...options });
}

/**
 * Render organization invite email (phase 1b) — HTML + text
 */
export function renderOrgInviteEmail(options: {
    language?: SupportedLanguage;
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
}): Promise<RenderedEmail> {
    return renderFor({ template: "org-invite", ...options });
}

/**
 * Render guest invite email (Ceremly, SPEC §6 — owner B3) — HTML + text.
 * `message` arriva con i placeholder {nome}/{link} già sostituiti.
 */
export function renderGuestInviteEmail(options: {
    eventTitle: string;
    firstName: string;
    message: string;
    ctaUrl: string;
    pixelUrl: string;
}): Promise<RenderedEmail> {
    return renderFor({
        template: "guest-invite",
        subject: emailSubjects.guestInvite(options.eventTitle),
        ...options,
    });
}

/**
 * Render guest reminder email (Ceremly, SPEC §6 — owner B3) — HTML + text.
 * `message` arriva con i placeholder {nome}/{link} già sostituiti.
 */
export function renderGuestReminderEmail(options: {
    eventTitle: string;
    firstName: string;
    message: string;
    ctaUrl: string;
    pixelUrl: string;
}): Promise<RenderedEmail> {
    return renderFor({
        template: "guest-reminder",
        subject: emailSubjects.guestReminder(options.eventTitle),
        ...options,
    });
}

/** Render avviso cleanup evento (SPEC §9.2) — HTML + text, i18n IT/EN. */
export function renderEventCleanupWarningEmail(options: {
    language?: SupportedLanguage;
    eventTitle: string;
    dashboardUrl: string;
    daysLeft: number;
}): Promise<RenderedEmail> {
    return renderFor({ template: "event-cleanup-warning", ...options });
}
