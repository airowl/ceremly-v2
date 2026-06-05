/**
 * Reminder Service
 * Business logic for reminder templates CRUD and sending reminders.
 * Also contains template interpolation and WhatsApp link generation.
 */
import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq, and, desc, inArray, count, gte, lt } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { logAudit } from "../utils/audit";
import { requireEventOwnership } from "./event.service";
import { canSendEmail } from "./planLimit.service";
import type { CreateReminderTemplateInput, UpdateReminderTemplateInput, SendReminderInput } from "~~/shared/schemas/reminder";

// ─── Template Utilities ─────────────────────────────────────────────

/**
 * Interpolate template variables in a string.
 * Replaces {{variable_name}} placeholders with actual values.
 *
 * Supported variables:
 * - guest_name, event_name, event_date, event_time
 * - event_location, rsvp_link, deadline, organizer_name
 */
export function interpolateTemplate(
    body: string,
    variables: Record<string, string>,
): string {
    return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        return variables[key] ?? "";
    });
}

/**
 * Generate a WhatsApp deep link URL.
 * Normalises Italian phone numbers to the international format (39...).
 *
 * @param phone - The phone number (may include +, 0039, or 39 prefix)
 * @param message - The pre-filled message text
 * @returns A `https://wa.me/...` URL
 */
export function generateWhatsAppLink(phone: string, message: string): string {
    // Strip all whitespace and dashes
    let cleaned = phone.replace(/[\s\-()]/g, "");

    // Remove leading "+"
    if (cleaned.startsWith("+")) {
        cleaned = cleaned.slice(1);
    }

    // Remove leading "0039" (Italian international dialling prefix variant)
    if (cleaned.startsWith("0039")) {
        cleaned = cleaned.slice(4);
    }

    // If the number does not already start with the Italian country code, prepend it
    if (!cleaned.startsWith("39")) {
        // Strip a leading "0" (local format)
        if (cleaned.startsWith("0")) {
            cleaned = cleaned.slice(1);
        }
        cleaned = `39${cleaned}`;
    }

    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${cleaned}?text=${encodedMessage}`;
}

// ─── Get Reminder History ───────────────────────────────────────────

/**
 * Fetch reminder history for all guests of an event.
 * Enriches email logs with guest names and template names.
 */
export async function getReminderHistory(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Get all guest IDs for this event
    const eventGuests = await db
        .select({ id: schema.guests.id, name: schema.guests.name })
        .from(schema.guests)
        .where(eq(schema.guests.eventId, eventId));

    if (eventGuests.length === 0) {
        return { history: [] };
    }

    const guestIds = eventGuests.map((g) => g.id);
    const guestNameMap = new Map(eventGuests.map((g) => [g.id, g.name]));

    // Fetch email logs for these guests
    const logs = await db
        .select()
        .from(schema.emailLogs)
        .where(inArray(schema.emailLogs.guestId, guestIds))
        .orderBy(desc(schema.emailLogs.sentAt));

    // Collect unique template IDs to look up names
    const templateIds = [...new Set(logs.map((l) => l.templateId).filter(Boolean))] as string[];

    let templateNameMap = new Map<string, string>();
    if (templateIds.length > 0) {
        const templates = await db
            .select({ id: schema.reminderTemplates.id, name: schema.reminderTemplates.name })
            .from(schema.reminderTemplates)
            .where(inArray(schema.reminderTemplates.id, templateIds));

        templateNameMap = new Map(templates.map((t) => [t.id, t.name]));
    }

    // Enrich logs with guest and template names
    const history = logs.map((log) => ({
        id: log.id,
        guestId: log.guestId,
        guestName: guestNameMap.get(log.guestId) ?? null,
        templateId: log.templateId,
        templateName: log.templateId ? (templateNameMap.get(log.templateId) ?? null) : null,
        type: log.type,
        status: log.status,
        resendMessageId: log.resendMessageId,
        sentAt: log.sentAt,
        createdAt: log.createdAt,
    }));

    return { history };
}

// ─── Get or Create Templates ────────────────────────────────────────

/** Default reminder templates to seed for a new event. */
function getDefaultTemplateValues(eventId: string) {
    return [
        {
            eventId,
            name: "Reminder gentile",
            type: "email" as const,
            subject: "{{event_name}} \u2014 Ci fai sapere?",
            body: "Ciao {{guest_name}}, ti ricordiamo di confermare la tua presenza per {{event_name}} del {{event_date}}. Rispondi qui: {{rsvp_link}}",
            isDefault: true,
            isActive: true,
        },
        {
            eventId,
            name: "Ultimo avviso",
            type: "email" as const,
            subject: "{{event_name}} \u2014 Ultimi giorni per confermare",
            body: "Ciao {{guest_name}}, mancano pochi giorni alla scadenza per confermare la tua presenza a {{event_name}}. Se non rispondi entro il {{deadline}}, considereremo la tua assenza. Conferma qui: {{rsvp_link}}",
            isDefault: true,
            isActive: true,
        },
        {
            eventId,
            name: "Reminder WhatsApp",
            type: "whatsapp" as const,
            subject: null,
            body: "Ciao {{guest_name}}! Ti ricordo di confermare la tua presenza per {{event_name}} del {{event_date}}. Rispondi qui: {{rsvp_link}}",
            isDefault: true,
            isActive: true,
        },
    ];
}

/**
 * Fetch reminder templates for an event.
 * Auto-creates default templates if none exist.
 */
export async function getOrCreateTemplates(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Fetch existing templates
    let templates = await db
        .select()
        .from(schema.reminderTemplates)
        .where(eq(schema.reminderTemplates.eventId, eventId));

    // Auto-create defaults if none exist
    if (templates.length === 0) {
        templates = await db
            .insert(schema.reminderTemplates)
            .values(getDefaultTemplateValues(eventId))
            .returning();
    }

    return { templates };
}

// ─── Create Template ────────────────────────────────────────────────

/**
 * Create a custom reminder template.
 * Checks ownership, inserts, logs audit.
 */
export async function createTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    input: CreateReminderTemplateInput,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    const [inserted] = await db
        .insert(schema.reminderTemplates)
        .values({
            eventId,
            name: input.name,
            type: input.type,
            subject: input.subject ?? null,
            body: input.body,
            isDefault: false,
        })
        .returning();

    await logAudit(h3Event, "reminder.template_created", {
        targetType: "reminder_template",
        targetId: inserted!.id,
        details: { name: input.name, type: input.type, eventId },
    });

    return inserted!;
}

// ─── Update Template ────────────────────────────────────────────────

/**
 * Update a reminder template.
 * Checks ownership, verifies template belongs to event, applies partial update.
 */
export async function updateTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    templateId: string,
    input: UpdateReminderTemplateInput,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Verify template belongs to this event
    const existing = await db
        .select()
        .from(schema.reminderTemplates)
        .where(
            and(
                eq(schema.reminderTemplates.id, templateId),
                eq(schema.reminderTemplates.eventId, eventId),
            ),
        )
        .limit(1);

    if (!existing[0]) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found",
        });
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.subject !== undefined) updateData.subject = input.subject;
    if (input.body !== undefined) updateData.body = input.body;

    if (Object.keys(updateData).length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: "No fields to update",
        });
    }

    const [updated] = await db
        .update(schema.reminderTemplates)
        .set(updateData)
        .where(eq(schema.reminderTemplates.id, templateId))
        .returning();

    await logAudit(h3Event, "reminder.template_updated", {
        targetType: "reminder_template",
        targetId: templateId,
        details: updateData as Record<string, unknown>,
    });

    return updated;
}

// ─── Delete Template ────────────────────────────────────────────────

/**
 * Delete a custom reminder template.
 * Only non-default templates can be deleted.
 */
export async function deleteTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    templateId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Verify template belongs to this event
    const existing = await db
        .select()
        .from(schema.reminderTemplates)
        .where(
            and(
                eq(schema.reminderTemplates.id, templateId),
                eq(schema.reminderTemplates.eventId, eventId),
            ),
        )
        .limit(1);

    if (!existing[0]) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found",
        });
    }

    // Prevent deleting default templates
    if (existing[0].isDefault) {
        throw createError({
            statusCode: 403,
            statusMessage: "Default templates cannot be deleted",
        });
    }

    await db
        .delete(schema.reminderTemplates)
        .where(eq(schema.reminderTemplates.id, templateId));

    await logAudit(h3Event, "reminder.template_deleted", {
        targetType: "reminder_template",
        targetId: templateId,
        details: { name: existing[0].name, eventId },
    });

    return { success: true };
}

// ─── Send Reminder ──────────────────────────────────────────────────

/**
 * Send a reminder to a single guest.
 * For email: creates an email_logs entry (actual Resend sending deferred).
 * For whatsapp: returns the deep link URL.
 */
export async function sendReminder(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    guestId: string,
    userId: string,
    userName: string,
    input: SendReminderInput,
) {
    const eventRow = await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // Verify guest belongs to this event
    const guestRows = await db
        .select()
        .from(schema.guests)
        .where(
            and(
                eq(schema.guests.id, guestId),
                eq(schema.guests.eventId, eventId),
            ),
        )
        .limit(1);

    const guest = guestRows[0];
    if (!guest) {
        throw createError({
            statusCode: 404,
            statusMessage: "Guest not found for this event",
        });
    }

    // Load template
    const templateRows = await db
        .select()
        .from(schema.reminderTemplates)
        .where(
            and(
                eq(schema.reminderTemplates.id, input.templateId),
                eq(schema.reminderTemplates.eventId, eventId),
            ),
        )
        .limit(1);

    const template = templateRows[0];
    if (!template) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found",
        });
    }

    // Build interpolation variables
    const runtimeConfig = useRuntimeConfig();
    const baseUrl = runtimeConfig.public.baseURL || "https://ceremly.it";
    const variables: Record<string, string> = {
        guest_name: guest.name,
        event_name: eventRow.name,
        event_date: eventRow.date,
        event_time: eventRow.time ?? "",
        event_location: eventRow.location ?? "",
        rsvp_link: `${baseUrl}/rsvp/${eventRow.slug}?guest=${guest.id}`,
        deadline: eventRow.deadline ?? "",
        organizer_name: userName,
    };

    const interpolatedBody = interpolateTemplate(template.body, variables);

    // WhatsApp flow: return the deep link
    if (template.type === "whatsapp") {
        if (!guest.phone) {
            throw createError({
                statusCode: 400,
                statusMessage: "Guest does not have a phone number",
            });
        }

        const whatsappUrl = generateWhatsAppLink(guest.phone, interpolatedBody);

        // Log the WhatsApp click
        await db.insert(schema.emailLogs).values({
            guestId: guest.id,
            templateId: template.id,
            type: "reminder",
            status: "sent",
        });

        // Update guest whatsapp tracking
        await db
            .update(schema.guests)
            .set({ lastWhatsappClickedAt: new Date() })
            .where(eq(schema.guests.id, guest.id));

        await logAudit(h3Event, "reminder.sent", {
            targetType: "guest",
            targetId: guest.id,
            details: { type: "whatsapp", templateId: template.id, eventId },
        });

        return {
            success: true,
            type: "whatsapp" as const,
            whatsappUrl,
        };
    }

    // Email flow: check email limit, then log
    const emailCheck = await canSendEmail(userId);
    if (!emailCheck.allowed) {
        throw createError({
            statusCode: 403,
            statusMessage: `Monthly email limit reached (${emailCheck.current}/${emailCheck.limit}). Upgrade your plan to send more.`,
        });
    }

    if (!guest.email) {
        throw createError({
            statusCode: 400,
            statusMessage: "Guest does not have an email address",
        });
    }

    // Create email log entry (actual sending via Resend will be added later)
    await db.insert(schema.emailLogs).values({
        guestId: guest.id,
        templateId: template.id,
        type: "reminder",
        status: "sent",
    });

    // Update guest email tracking
    await db
        .update(schema.guests)
        .set({
            lastEmailSentAt: new Date(),
            emailSentCount: guest.emailSentCount + 1,
        })
        .where(eq(schema.guests.id, guest.id));

    await logAudit(h3Event, "reminder.sent", {
        targetType: "guest",
        targetId: guest.id,
        details: { type: "email", templateId: template.id, eventId },
    });

    return {
        success: true,
        type: "email" as const,
    };
}

// ─── Toggle Template Active ────────────────────────────────────────

/**
 * Toggle the isActive state of a reminder template.
 */
export async function toggleTemplateActive(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    templateId: string,
    isActive: boolean,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    const existing = await db
        .select()
        .from(schema.reminderTemplates)
        .where(
            and(
                eq(schema.reminderTemplates.id, templateId),
                eq(schema.reminderTemplates.eventId, eventId),
            ),
        )
        .limit(1);

    if (!existing[0]) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found",
        });
    }

    const [updated] = await db
        .update(schema.reminderTemplates)
        .set({ isActive })
        .where(eq(schema.reminderTemplates.id, templateId))
        .returning();

    await logAudit(h3Event, "reminder.template_toggled", {
        targetType: "reminder_template",
        targetId: templateId,
        details: { isActive, name: existing[0].name, eventId },
    });

    return updated;
}

// ─── Get Reminder Stats ────────────────────────────────────────────

/**
 * Get reminder statistics for an event.
 * Returns total active templates, emails sent today, and WhatsApp sent today.
 */
export async function getReminderStats(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    const db = getDB();

    // 1. Count active templates
    const [activeCount] = await db
        .select({ count: count() })
        .from(schema.reminderTemplates)
        .where(
            and(
                eq(schema.reminderTemplates.eventId, eventId),
                eq(schema.reminderTemplates.isActive, true),
            ),
        );

    // 2. Get today's date boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 3. Get all guests for this event
    const eventGuests = await db
        .select({ id: schema.guests.id })
        .from(schema.guests)
        .where(eq(schema.guests.eventId, eventId));

    let emailSentToday = 0;
    let whatsappSentToday = 0;

    if (eventGuests.length > 0) {
        const guestIds = eventGuests.map((g) => g.id);

        // Get today's logs for these guests
        const todayLogs = await db
            .select({
                templateId: schema.emailLogs.templateId,
            })
            .from(schema.emailLogs)
            .where(
                and(
                    inArray(schema.emailLogs.guestId, guestIds),
                    gte(schema.emailLogs.sentAt, today),
                    lt(schema.emailLogs.sentAt, tomorrow),
                ),
            );

        // Look up template types
        const templateIds = [...new Set(todayLogs.map((l) => l.templateId).filter(Boolean))] as string[];
        let templateTypeMap = new Map<string, string>();

        if (templateIds.length > 0) {
            const templates = await db
                .select({ id: schema.reminderTemplates.id, type: schema.reminderTemplates.type })
                .from(schema.reminderTemplates)
                .where(inArray(schema.reminderTemplates.id, templateIds));

            templateTypeMap = new Map(templates.map((t) => [t.id, t.type]));
        }

        for (const log of todayLogs) {
            const type = log.templateId ? templateTypeMap.get(log.templateId) : "email";
            if (type === "whatsapp") whatsappSentToday++;
            else emailSentToday++;
        }
    }

    return {
        totalActive: activeCount?.count ?? 0,
        emailSentToday,
        whatsappSentToday,
    };
}
