/**
 * Contact Service
 * Business logic for contact form submission, rate limiting, and email dispatch.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq, and, gte, sql } from 'drizzle-orm';
import { contactMessages } from '../database/schema';
import { sendEmail } from '../utils/email';
import {
    renderContactConfirmationEmail,
    renderContactNotificationEmail,
    emailSubjects,
    type SupportedLanguage,
} from '../emailTemplates';
import { logAudit } from '../utils/audit';
import {
    isDisposableEmail,
    isEndpointRateLimited,
    isHoneypotTriggered,
    isSubmittedTooFast,
} from '../utils/spamProtection';
import { getClientIp } from '../utils/clientIp';

const MAX_MESSAGES_PER_DAY = 3;

/**
 * Submit a contact form message.
 * Includes rate limiting, DB persistence, and email dispatch.
 */
export async function sendContactMessage(
    event: H3Event<EventHandlerRequest>,
    data: {
        name: string;
        email: string;
        subject: string;
        message: string;
        language?: string;
        website?: string;
        _t?: number;
    },
) {
    const { name, email, subject, message, language, website, _t } = data;

    const db = getDB();
    const config = useRuntimeConfig();

    // --- Anti-spam (#8): unauthenticated public endpoint that sends email ---
    // 1. Honeypot: hidden field filled in = bot → fake success (don't tip off the bot).
    if (isHoneypotTriggered(website)) {
        return { success: true, message: 'Contact form submitted successfully' };
    }
    // 2. Timing: form submitted in less than 3s from render = bot → fake success.
    if (isSubmittedTooFast(_t)) {
        return { success: true, message: 'Contact form submitted successfully' };
    }
    // 3. Per-IP rate limit (shared Redis): the per-email limit below is
    //    bypassable by rotating the email → without this, unlimited admin inbox
    //    email-bombing and Resend quota/reputation burn.
    const clientIP = getClientIp(event);
    if (await isEndpointRateLimited(clientIP, 'contact', 5, 60 * 60 * 1000)) {
        throw createError({
            statusCode: 429,
            statusMessage: language === 'it'
                ? 'Troppe richieste. Riprova più tardi.'
                : 'Too many requests. Please try again later.',
        });
    }
    // 4. Disposable email.
    if (isDisposableEmail(email.toLowerCase())) {
        throw createError({
            statusCode: 400,
            statusMessage: language === 'it'
                ? 'Usa un indirizzo email permanente.'
                : 'Please use a permanent email address.',
        });
    }

    // Rate limiting: check messages sent today by this email
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const recentMessages = await db
        .select({ count: sql<number>`count(*)` })
        .from(contactMessages)
        .where(
            and(
                eq(contactMessages.email, email.toLowerCase()),
                gte(contactMessages.createdAt, oneDayAgo),
            ),
        );

    const messageCount = Number(recentMessages[0]?.count ?? 0);

    if (messageCount >= MAX_MESSAGES_PER_DAY) {
        throw createError({
            statusCode: 429,
            statusMessage: language === 'it'
                ? 'Hai raggiunto il limite massimo di messaggi giornalieri. Riprova domani.'
                : 'You have reached the maximum daily message limit. Please try again tomorrow.',
        });
    }

    // Save message to database
    await db.insert(contactMessages).values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        subject: subject.trim(),
        message: message.trim(),
        language: language || 'it',
    });

    // Admin email: no hardcoded fallback. If the env var is missing, the admin
    // notification is skipped with a noisy log (the message is already persisted in DB above),
    // instead of silently sending to an example.com placeholder.
    const adminEmail = (config.contactAdminEmail as string) || '';
    if (!adminEmail) {
        console.error('[contact.service] NUXT_CONTACT_ADMIN_EMAIL not configured: admin notification skipped (message still saved in DB)');
    }
    const siteUrl = (config.public?.baseURL as string) || '';
    const lang = (language === 'en' ? 'en' : 'it') as SupportedLanguage;

    // Format date for notification
    const submittedAt = new Date().toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', {
        dateStyle: 'full',
        timeStyle: 'short',
    });

    // Render email templates
    const [confirmation, notification] = await Promise.all([
        renderContactConfirmationEmail({
            language: lang,
            userName: name,
            subject: subject,
            siteUrl: siteUrl,
        }),
        renderContactNotificationEmail({
            senderName: name,
            senderEmail: email,
            subject: subject,
            message: message,
            language: language || 'it',
            submittedAt: submittedAt,
        }),
    ]);

    // Send emails in parallel (admin notification only if email is configured)
    await Promise.all([
        // Confirmation email to user
        sendEmail({
            to: email,
            subject: emailSubjects.contactConfirmation[lang],
            type: 'custom',
            html: confirmation.html,
            text: confirmation.text,
        }),
        // Notification email to admin
        ...(adminEmail
            ? [sendEmail({
                to: adminEmail,
                subject: emailSubjects.contactNotification(subject),
                type: 'custom',
                html: notification.html,
                text: notification.text,
                replyTo: email,
            })]
            : []),
    ]);

    await logAudit(event, 'contact.sent', {
        targetType: 'contact',
        details: {
            email: email.toLowerCase(),
            subject,
        },
    });

    return {
        success: true,
        message: 'Contact form submitted successfully',
    };
}
