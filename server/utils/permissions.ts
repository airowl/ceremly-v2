/**
 * Role-based access control
 * Simple role system: owner > editor > viewer
 *
 * - Owner: full access (implicit from events.userId)
 * - Editor: everything except billing
 * - Viewer: read-only (GET requests only)
 */

import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";
import { eq, and, isNull } from 'drizzle-orm';
import { getDB } from './db';
import * as schema from '../database/schema';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type EventRole = 'owner' | 'editor' | 'viewer';

export interface UserRoleContext {
    userId: string;
    eventId: string;
    role: EventRole;
    isOwner: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get user's role for an event
 */
export async function getUserRole(
    userId: string,
    eventId: string
): Promise<UserRoleContext | null> {
    const db = getDB();

    // Check event ownership
    const eventRow = await db
        .select({ userId: schema.events.userId })
        .from(schema.events)
        .where(
            and(
                eq(schema.events.id, eventId),
                isNull(schema.events.deletedAt)
            )
        )
        .limit(1);

    if (!eventRow[0]) {
        return null;
    }

    // Owner has implicit full access
    if (eventRow[0].userId === userId) {
        return {
            userId,
            eventId,
            role: 'owner',
            isOwner: true,
        };
    }

    // Get membership role
    const membership = await db
        .select({ role: schema.eventUsers.role })
        .from(schema.eventUsers)
        .where(
            and(
                eq(schema.eventUsers.eventId, eventId),
                eq(schema.eventUsers.userId, userId)
            )
        )
        .limit(1);

    if (!membership[0]) {
        return null; // Not a member
    }

    const role = (membership[0].role as EventRole) || 'viewer';

    return {
        userId,
        eventId,
        role,
        isOwner: false,
    };
}

/**
 * Check if role can write (POST, PATCH, DELETE)
 */
export function canWrite(role: EventRole): boolean {
    return role === 'owner' || role === 'editor';
}

/**
 * Check if role can access billing
 */
export function canAccessBilling(role: EventRole): boolean {
    return role === 'owner';
}

/**
 * Check if role can manage team (invite, remove, change roles)
 */
export function canManageTeam(role: EventRole): boolean {
    return role === 'owner' || role === 'editor';
}

// ═══════════════════════════════════════════════════════════════════════════════
// H3 EVENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get role context from H3 event
 */
export async function getRoleFromEvent(
    event: H3Event<EventHandlerRequest>,
    eventId: string
): Promise<UserRoleContext | null> {
    const user = event.context.user;
    if (!user?.id) {
        return null;
    }
    return getUserRole(user.id, eventId);
}

/**
 * Require user to be a member of the event
 */
export async function requireMember(
    event: H3Event<EventHandlerRequest>,
    eventId: string
): Promise<UserRoleContext> {
    const context = await getRoleFromEvent(event, eventId);

    if (!context) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Non sei membro di questo evento',
        });
    }

    return context;
}

/**
 * Require write access (owner or editor)
 */
export async function requireWrite(
    event: H3Event<EventHandlerRequest>,
    eventId: string
): Promise<UserRoleContext> {
    const context = await requireMember(event, eventId);

    if (!canWrite(context.role)) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Non hai i permessi per questa operazione',
        });
    }

    return context;
}

/**
 * Require owner role
 */
export async function requireOwner(
    event: H3Event<EventHandlerRequest>,
    eventId: string
): Promise<UserRoleContext> {
    const context = await requireMember(event, eventId);

    if (!context.isOwner) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Solo il proprietario può eseguire questa operazione',
        });
    }

    return context;
}
