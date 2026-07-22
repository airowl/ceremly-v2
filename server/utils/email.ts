/**
 * Email Utility - Centralized email sending for YourSaaS
 * Reusable in API routes, cron jobs, and edge functions
 */
import type { CreateEmailResponse } from "resend";
import {
    renderVerificationEmail,
    renderResetPasswordEmail,
    renderChangeEmailEmail,
    renderWaitingListEmail,
    renderOrgInviteEmail,
    emailSubjects,
    type SupportedLanguage,
} from "../emailTemplates";
import { logAudit } from "./audit";
import { getResendInstance } from "./drivers";
import { runtimeConfig } from "./runtimeConfig";
import { isEmailSuppressed } from "../repositories/emailSuppression.repository";
import { insertEmailSeed } from "../repositories/emailEvent.repository";

// Email types supported by the system
export type EmailType =
    | "verification"
    | "reset_password"
    | "change_email"
    | "waiting_list"
    | "invitation"
    | "custom";

export interface EmailContext {
    organizationId?: string;
    guestId?: string;
    eventId?: string;
}

// Base options for all emails
export interface BaseEmailOptions {
    to: string;
    language?: SupportedLanguage;
    userId?: string;
    /** Context to correlate webhooks (open/click) with the guest/event. */
    context?: EmailContext;
    /**
     * Resend Idempotency-Key (24h window): a QStash retry that re-runs the
     * handler after a successful send (e.g. a post-send DB write failed)
     * re-issues the SAME send instead of a duplicate email. Only pass keys
     * that are unique per logical send — never reused for deliberate re-sends.
     */
    idempotencyKey?: string;
}

// Template-specific options
export interface VerificationEmailOptions extends BaseEmailOptions {
    type: "verification";
    verificationUrl: string;
    userName?: string;
}

export interface ResetPasswordEmailOptions extends BaseEmailOptions {
    type: "reset_password";
    resetUrl: string;
    userName?: string;
}

export interface ChangeEmailEmailOptions extends BaseEmailOptions {
    type: "change_email";
    confirmUrl: string;
    newEmail: string;
    userName?: string;
}

export interface WaitingListEmailOptions extends BaseEmailOptions {
    type: "waiting_list";
}

export interface InvitationEmailOptions extends BaseEmailOptions {
    type: "invitation";
    inviteUrl: string;
    orgName: string;
    invitedByName: string;
    expiresInDays?: number;
}

export interface CustomEmailOptions extends BaseEmailOptions {
    type: "custom";
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
}

// Union type for all email options
export type EmailOptions =
    | VerificationEmailOptions
    | ResetPasswordEmailOptions
    | ChangeEmailEmailOptions
    | WaitingListEmailOptions
    | InvitationEmailOptions
    | CustomEmailOptions;

// Response type for email operations
export interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    /** True when the send was intentionally skipped (recipient suppressed).
     *  Terminal non-error: do NOT retry. */
    skipped?: boolean;
}

/**
 * Get the default sender address
 */
export function getDefaultSender(): string {
    return `${runtimeConfig.public.appName} <${runtimeConfig.public.appNotifyEmail}>`;
}

/** From address for event-correlated emails (tracked subdomain, open+click ON). */
function getEventsSender(): string {
    return `${runtimeConfig.public.appName} <${runtimeConfig.public.appEventsNotifyEmail}>`;
}

/** Picks the from address: tracked subdomain if the send is event-related. */
export function getSender(options: EmailOptions): string {
    if (options.context?.eventId) return getEventsSender();
    return getDefaultSender();
}

/**
 * Build email content based on type
 */
async function buildEmailContent(
    options: EmailOptions
): Promise<{ subject: string; html: string; text: string }> {
    const language = options.language || "it";

    switch (options.type) {
        case "verification": {
            const { html, text } = await renderVerificationEmail({
                language,
                verificationUrl: options.verificationUrl,
                userName: options.userName,
            });
            return { subject: emailSubjects.verification[language], html, text };
        }

        case "reset_password": {
            const { html, text } = await renderResetPasswordEmail({
                language,
                resetUrl: options.resetUrl,
                userName: options.userName,
            });
            return { subject: emailSubjects.resetPassword[language], html, text };
        }

        case "change_email": {
            const { html, text } = await renderChangeEmailEmail({
                language,
                confirmUrl: options.confirmUrl,
                newEmail: options.newEmail,
                userName: options.userName,
            });
            return { subject: emailSubjects.changeEmail[language], html, text };
        }

        case "waiting_list": {
            const { html, text } = await renderWaitingListEmail({ language });
            return { subject: emailSubjects.waitingList[language], html, text };
        }

        case "invitation": {
            const { html, text } = await renderOrgInviteEmail({
                language,
                inviteUrl: options.inviteUrl,
                orgName: options.orgName,
                invitedByName: options.invitedByName,
                expiresInDays: options.expiresInDays,
            });
            return { subject: emailSubjects.orgInvite(options.orgName)[language], html, text };
        }

        case "custom":
            return {
                subject: options.subject,
                html: options.html,
                text: options.text,
            };
    }
}

/**
 * Log email event to audit log
 */
async function logEmailEvent(
    options: EmailOptions,
    response: CreateEmailResponse
): Promise<void> {
    await logAudit(null, response.error ? 'email.failed' : 'email.sent', {
        userId: options.userId,
        targetType: 'email',
        targetId: options.to,
        status: response.error ? 'failure' : 'success',
        details: response.error
            ? { error: response.error.message, emailType: options.type }
            : { emailType: options.type },
    });
}

/**
 * Send an email using the configured template or custom content
 *
 * @example
 * // Send verification email
 * const result = await sendEmail({
 *     type: 'verification',
 *     to: user.email,
 *     userId: user.id,
 *     verificationUrl: url,
 *     userName: user.name,
 *     language: user.locale as SupportedLanguage,
 * });
 *
 * @example
 * // Send custom email
 * const result = await sendEmail({
 *     type: 'custom',
 *     to: 'user@example.com',
 *     subject: 'Custom Subject',
 *     html: '<h1>Hello</h1>',
 *     language: 'en',
 * });
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
    try {
        const { subject, html, text } = await buildEmailContent(options);

        // Enforce suppression list (hard bounce / complaint): do not send.
        if (await isEmailSuppressed(options.to)) {
            await logAudit(null, 'email.failed', {
                userId: options.userId,
                targetType: 'email',
                targetId: options.to,
                status: 'failure',
                details: { error: 'suppressed', emailType: options.type },
            });
            return { success: false, skipped: true, error: 'suppressed' };
        }

        const from = getSender(options);

        const response = await getResendInstance().emails.send({
            from,
            to: options.to,
            subject,
            html,
            text,
            ...(options.type === "custom" && options.replyTo
                ? { replyTo: options.replyTo }
                : {}),
        }, options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined);

        // Log to audit
        await logEmailEvent(options, response);

        if (response.error) {
            console.error(
                `[Email] Failed to send ${options.type} email to ${options.to}: ${response.error.message}`
            );
            return {
                success: false,
                error: response.error.message,
            };
        }

        console.log(
            `[Email] Successfully sent ${options.type} email to ${options.to}`
        );

        // Webhook → entity correlation: seed row only if there is context.
        // Best-effort: the email is already sent (audit email.sent written above).
        // A seed failure must not flip the result to "failed". The backfill in
        // insertEmailSeed only closes the race where the webhook arrives BEFORE
        // this seed write; if the seed write itself fails, there is no later
        // retry, so any events for this messageId stay uncorrelated (logged above).
        if (options.context && response.data?.id) {
            try {
                await insertEmailSeed({
                    messageId: response.data.id,
                    recipient: options.to,
                    emailType: options.type,
                    organizationId: options.context.organizationId,
                    guestId: options.context.guestId,
                    eventId: options.context.eventId,
                });
            } catch (seedErr) {
                console.error(
                    `[Email] seed correlation write failed for ${response.data.id}: ${seedErr instanceof Error ? seedErr.message : "unknown"}`
                );
            }
        }

        return {
            success: true,
            messageId: response.data?.id,
        };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        console.error(
            `[Email] Exception sending ${options.type} email to ${options.to}: ${errorMessage}`
        );

        // Log failure to audit
        await logAudit(null, 'email.failed', {
            userId: options.userId,
            targetType: 'email',
            targetId: options.to,
            status: 'failure',
            details: { error: errorMessage, emailType: options.type },
        });

        return {
            success: false,
            error: errorMessage,
        };
    }
}

// Resend's hard cap on the number of emails per `batch.send` call.
const RESEND_BATCH_MAX = 100;

/**
 * Send multiple emails in batch (useful for cron jobs).
 * Returns results for each email, in the same order as the input.
 *
 * Uses `resend.batch.send()` (one API call per chunk of <= 100) instead of
 * looping `sendEmail` — the old per-email loop made N concurrent API calls
 * and could trip Resend's rate limit under load. Note this path does NOT go
 * through `sendEmail`, so unlike single sends, batch sends are not audited
 * and do not write an email-event seed row.
 *
 * @example
 * const results = await sendBatchEmails([
 *     { type: 'verification', to: 'user1@example.com', verificationUrl: url1, userId: id1 },
 *     { type: 'verification', to: 'user2@example.com', verificationUrl: url2, userId: id2 },
 * ]);
 */
export async function sendBatchEmails(
    emails: EmailOptions[]
): Promise<EmailResult[]> {
    // Resolve suppression first so suppressed recipients never enter the batch.
    const results: (EmailResult | null)[] = await Promise.all(
        emails.map(async (e) =>
            (await isEmailSuppressed(e.to))
                ? { success: false, skipped: true, error: "suppressed" }
                : null
        )
    );

    // Collect the sendable emails with their original index for order-preserving merge.
    const sendable: { index: number; options: EmailOptions }[] = [];
    emails.forEach((options, index) => {
        if (results[index] === null) sendable.push({ index, options });
    });

    for (let i = 0; i < sendable.length; i += RESEND_BATCH_MAX) {
        const chunk = sendable.slice(i, i + RESEND_BATCH_MAX);
        const payload = await Promise.all(
            chunk.map(async ({ options }) => {
                const { subject, html, text } = await buildEmailContent(options);
                return { from: getSender(options), to: options.to, subject, html, text };
            })
        );
        const response = await getResendInstance().batch.send(payload);
        chunk.forEach(({ index }, j) => {
            if (response.error) {
                results[index] = { success: false, error: response.error.message };
            } else {
                results[index] = { success: true, messageId: response.data?.data?.[j]?.id };
            }
        });
    }

    return results.map((r) => r ?? { success: false, error: "unknown" });
}

/**
 * Check if email service is configured and available
 */
export function isEmailServiceConfigured(): boolean {
    return !!(
        runtimeConfig.resendApiKey &&
        runtimeConfig.public.appNotifyEmail &&
        runtimeConfig.public.appName
    );
}

// Re-export types and utilities for convenience
export { type SupportedLanguage } from "../emailTemplates";
