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

// Email types supported by the system
export type EmailType =
    | "verification"
    | "reset_password"
    | "change_email"
    | "waiting_list"
    | "invitation"
    | "custom";

// Base options for all emails
export interface BaseEmailOptions {
    to: string;
    language?: SupportedLanguage;
    userId?: string;
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
}

/**
 * Get the default sender address
 */
export function getDefaultSender(): string {
    return `${runtimeConfig.public.appName} <${runtimeConfig.public.appNotifyEmail}>`;
}

/**
 * Build email content based on type
 */
async function buildEmailContent(
    options: EmailOptions
): Promise<{ subject: string; html: string }> {
    const language = options.language || "it";

    switch (options.type) {
        case "verification":
            return {
                subject: emailSubjects.verification[language],
                html: await renderVerificationEmail({
                    language,
                    verificationUrl: options.verificationUrl,
                    userName: options.userName,
                }),
            };

        case "reset_password":
            return {
                subject: emailSubjects.resetPassword[language],
                html: await renderResetPasswordEmail({
                    language,
                    resetUrl: options.resetUrl,
                    userName: options.userName,
                }),
            };

        case "change_email":
            return {
                subject: emailSubjects.changeEmail[language],
                html: await renderChangeEmailEmail({
                    language,
                    confirmUrl: options.confirmUrl,
                    newEmail: options.newEmail,
                    userName: options.userName,
                }),
            };

        case "waiting_list":
            return {
                subject: emailSubjects.waitingList[language],
                html: await renderWaitingListEmail({ language }),
            };

        case "invitation":
            return {
                subject: emailSubjects.orgInvite(options.orgName)[language],
                html: await renderOrgInviteEmail({
                    language,
                    inviteUrl: options.inviteUrl,
                    orgName: options.orgName,
                    invitedByName: options.invitedByName,
                    expiresInDays: options.expiresInDays,
                }),
            };

        case "custom":
            return {
                subject: options.subject,
                html: options.html,
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
        const { subject, html } = await buildEmailContent(options);
        const from = getDefaultSender();

        const response = await getResendInstance().emails.send({
            from,
            to: options.to,
            subject,
            html,
            ...(options.type === "custom" && options.replyTo
                ? { replyTo: options.replyTo }
                : {}),
        });

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

/**
 * Send multiple emails in batch (useful for cron jobs)
 * Returns results for each email
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
    // Process in parallel with concurrency limit
    const BATCH_SIZE = 10;
    const results: EmailResult[] = [];

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map((email) => sendEmail(email))
        );
        results.push(...batchResults);
    }

    return results;
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
