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
    },
) {
    const { name, email, subject, message, language } = data;

    const db = getDB();
    const config = useRuntimeConfig();

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

    // Admin email: nessun fallback hardcoded. Se manca la env, la notifica admin
    // viene saltata con log rumoroso (il messaggio è già persistito in DB sopra),
    // invece di inviare silenziosamente a un placeholder example.com.
    const adminEmail = (config.contactAdminEmail as string) || '';
    if (!adminEmail) {
        console.error('[contact.service] NUXT_CONTACT_ADMIN_EMAIL non configurata: notifica admin saltata (messaggio comunque salvato in DB)');
    }
    const siteUrl = (config.public?.baseURL as string) || '';
    const lang = (language === 'en' ? 'en' : 'it') as SupportedLanguage;

    // Format date for notification
    const submittedAt = new Date().toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB', {
        dateStyle: 'full',
        timeStyle: 'short',
    });

    // Render email templates
    const [confirmationHtml, notificationHtml] = await Promise.all([
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

    // Send emails in parallel (notifica admin solo se l'email è configurata)
    await Promise.all([
        // Confirmation email to user
        sendEmail({
            to: email,
            subject: emailSubjects.contactConfirmation[lang],
            type: 'custom',
            html: confirmationHtml,
        }),
        // Notification email to admin
        ...(adminEmail
            ? [sendEmail({
                to: adminEmail,
                subject: emailSubjects.contactNotification(subject),
                type: 'custom',
                html: notificationHtml,
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
