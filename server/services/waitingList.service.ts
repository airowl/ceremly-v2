/**
 * Waiting List Service
 * Business logic for waiting list subscription including anti-spam,
 * duplicate detection, email dispatch, and audit logging.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq } from 'drizzle-orm';
import { waitingList } from '../database/schema';
import { sendEmail, type SupportedLanguage } from '../utils/email';
import {
    isDisposableEmail,
    isEndpointRateLimited,
    isHoneypotTriggered,
    isSubmittedTooFast,
} from '../utils/spamProtection';
import { logAudit } from '../utils/audit';

/**
 * Subscribe an email to the waiting list.
 * Includes all anti-spam logic, duplicate check, and email sending.
 */
export async function subscribe(
    event: H3Event<EventHandlerRequest>,
    data: {
        email: string;
        language: string;
        website?: string;
        _t?: number;
        source?: string;
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
    },
) {
    const { email, language, website, _t, source, utmSource, utmMedium, utmCampaign } = data;

    // --- Anti-spam checks ---
    // Return fake success to not reveal detection to bots

    // 1. Honeypot: bot filled the hidden field
    if (isHoneypotTriggered(website)) {
        return { success: true, alreadySubscribed: false, emailSent: true };
    }

    // 2. Timestamp: form submitted in under 3 seconds
    if (isSubmittedTooFast(_t)) {
        return { success: true, alreadySubscribed: false, emailSent: true };
    }

    // 3. Endpoint rate limit: max 5 submissions per hour per IP
    const clientIP =
        event.node.req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
        event.node.req.socket.remoteAddress ||
        'unknown';

    if (isEndpointRateLimited(clientIP, 'waiting-list-subscribe', 5, 60 * 60 * 1000)) {
        throw createError({
            statusCode: 429,
            message: 'Too many requests. Please try again later.',
        });
    }

    const normalizedEmail = email.toLowerCase();

    // 4. Disposable email check
    if (isDisposableEmail(normalizedEmail)) {
        throw createError({
            statusCode: 400,
            message: 'Please use a permanent email address.',
        });
    }

    const db = getDB();

    // Check if already subscribed
    const existing = await db
        .select()
        .from(waitingList)
        .where(eq(waitingList.email, normalizedEmail))
        .limit(1);

    if (existing.length > 0) {
        return {
            success: true,
            alreadySubscribed: true,
            emailSent: false,
        };
    }

    // Capture client info from headers
    const userAgent = getHeader(event, 'user-agent') || undefined;

    // Insert new subscriber
    await db.insert(waitingList).values({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        language,
        source: source || undefined,
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined,
        ipAddress: clientIP !== 'unknown' ? clientIP : undefined,
        userAgent,
    });

    // Send welcome email
    let emailSent = false;
    const emailResult = await sendEmail({
        type: 'waiting_list',
        to: normalizedEmail,
        language: language as SupportedLanguage,
    });
    emailSent = emailResult.success;

    await logAudit(event, 'waiting_list.subscribed', {
        targetType: 'waiting_list',
        details: {
            email: normalizedEmail,
            source: source || null,
        },
    });

    return {
        success: true,
        alreadySubscribed: false,
        emailSent,
    };
}
