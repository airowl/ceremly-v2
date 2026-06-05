/**
 * Event Template Service
 * CRUD operations for event landing page templates.
 * System templates (isSystem=true, userId=null) are global.
 * User templates are personal and owned by a specific user.
 */
import type { EventHandlerRequest, H3Event } from "~~/server/types/h3";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import * as schema from "../database/schema";
import { getDB } from "../utils/db";
import { logAudit } from "../utils/audit";
import { requireEventOwnership } from "./event.service";
import type {
    CreateEventTemplateInput,
    ListTemplatesQuery,
    UpdateEventTemplateInput,
} from "~~/shared/schemas/eventTemplate";

// ─── List Templates ──────────────────────────────────────────────────

/**
 * List all templates visible to the user:
 * - All system templates (isSystem=true)
 * - User's own templates (userId match)
 * Optionally filtered by category.
 */
export async function listTemplates(
    userId: string,
    filters?: ListTemplatesQuery,
) {
    const db = getDB();

    const conditions = [
        or(
            eq(schema.eventTemplates.isSystem, true),
            eq(schema.eventTemplates.userId, userId),
        ),
    ];

    if (filters?.category) {
        conditions.push(eq(schema.eventTemplates.category, filters.category));
    }

    const templates = await db
        .select()
        .from(schema.eventTemplates)
        .where(and(...conditions))
        .orderBy(
            desc(schema.eventTemplates.isSystem),
            desc(schema.eventTemplates.createdAt),
        );

    return { templates };
}

// ─── Get Template by ID ──────────────────────────────────────────────

/**
 * Get a single template by ID.
 * Returns the template if it's system or owned by the user.
 */
export async function getTemplateById(templateId: string, userId: string) {
    const db = getDB();

    const [template] = await db
        .select()
        .from(schema.eventTemplates)
        .where(
            and(
                eq(schema.eventTemplates.id, templateId),
                or(
                    eq(schema.eventTemplates.isSystem, true),
                    eq(schema.eventTemplates.userId, userId),
                ),
            ),
        )
        .limit(1);

    if (!template) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found",
        });
    }

    return template;
}

// ─── Create Template ─────────────────────────────────────────────────

/**
 * Create a user-owned template.
 */
export async function createTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    userId: string,
    input: CreateEventTemplateInput,
) {
    const db = getDB();

    const [inserted] = await db
        .insert(schema.eventTemplates)
        .values({
            userId,
            name: input.name,
            description: input.description ?? null,
            category: input.category,
            data: input.data,
            thumbnailUrl: input.thumbnailUrl ?? null,
            isSystem: false,
            isAiGenerated: false,
        })
        .returning();

    await logAudit(h3Event, "template.created", {
        targetType: "event_template",
        targetId: inserted!.id,
        details: { name: input.name, category: input.category },
    });

    return inserted!;
}

// ─── Create AI-Generated Template ────────────────────────────────────

/**
 * Save an AI-generated template for the user.
 */
export async function createAiTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    userId: string,
    name: string,
    category: string,
    data: Record<string, unknown>,
) {
    const db = getDB();

    const [inserted] = await db
        .insert(schema.eventTemplates)
        .values({
            userId,
            name,
            category,
            data,
            isSystem: false,
            isAiGenerated: true,
        })
        .returning();

    await logAudit(h3Event, "template.ai_generated", {
        targetType: "event_template",
        targetId: inserted!.id,
        details: { name, category },
    });

    return inserted!;
}

// ─── Update Template ─────────────────────────────────────────────────

/**
 * Update a user-owned template.
 * Cannot update system templates.
 */
export async function updateTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    userId: string,
    templateId: string,
    input: UpdateEventTemplateInput,
) {
    const db = getDB();

    // Verify template exists and is owned by user (not system)
    const [existing] = await db
        .select()
        .from(schema.eventTemplates)
        .where(
            and(
                eq(schema.eventTemplates.id, templateId),
                eq(schema.eventTemplates.userId, userId),
                eq(schema.eventTemplates.isSystem, false),
            ),
        )
        .limit(1);

    if (!existing) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found or not editable",
        });
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) {
        updateData.description = input.description;
    }
    if (input.category !== undefined) updateData.category = input.category;
    if (input.data !== undefined) updateData.data = input.data;
    if (input.thumbnailUrl !== undefined) {
        updateData.thumbnailUrl = input.thumbnailUrl;
    }

    if (Object.keys(updateData).length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: "No fields to update",
        });
    }

    const [updated] = await db
        .update(schema.eventTemplates)
        .set(updateData)
        .where(eq(schema.eventTemplates.id, templateId))
        .returning();

    await logAudit(h3Event, "template.updated", {
        targetType: "event_template",
        targetId: templateId,
        details: updateData as Record<string, unknown>,
    });

    return updated;
}

// ─── Delete Template ─────────────────────────────────────────────────

/**
 * Delete a user-owned template.
 * Cannot delete system templates.
 */
export async function deleteTemplate(
    h3Event: H3Event<EventHandlerRequest>,
    userId: string,
    templateId: string,
) {
    const db = getDB();

    const [existing] = await db
        .select()
        .from(schema.eventTemplates)
        .where(
            and(
                eq(schema.eventTemplates.id, templateId),
                eq(schema.eventTemplates.userId, userId),
                eq(schema.eventTemplates.isSystem, false),
            ),
        )
        .limit(1);

    if (!existing) {
        throw createError({
            statusCode: 404,
            statusMessage: "Template not found or not deletable",
        });
    }

    await db
        .delete(schema.eventTemplates)
        .where(eq(schema.eventTemplates.id, templateId));

    await logAudit(h3Event, "template.deleted", {
        targetType: "event_template",
        targetId: templateId,
        details: { name: existing.name },
    });

    return { success: true };
}

// ─── Apply Template to Event ─────────────────────────────────────────

/**
 * Apply a template's data to an event's landing page.
 * Upserts the landing_pages row with the template's JSONB data.
 */
export async function applyTemplateToEvent(
    h3Event: H3Event<EventHandlerRequest>,
    eventId: string,
    userId: string,
    templateId: string,
) {
    await requireEventOwnership(h3Event, eventId);

    // Load template (must be visible to user)
    const template = await getTemplateById(templateId, userId);

    const db = getDB();

    // Upsert landing page with template data
    const [upserted] = await db
        .insert(schema.landingPages)
        .values({
            eventId,
            data: template.data,
        })
        .onConflictDoUpdate({
            target: schema.landingPages.eventId,
            set: {
                data: template.data,
                updatedAt: new Date(),
            },
        })
        .returning();

    await logAudit(h3Event, "template.applied", {
        targetType: "landing_page",
        targetId: upserted!.id,
        eventId,
        details: { templateId, templateName: template.name },
    });

    return { success: true, landingPageId: upserted!.id };
}
