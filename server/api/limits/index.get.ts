/**
 * GET /api/limits?eventId=xxx
 * Consolidated endpoint: returns user plan + all usage data in one call.
 *
 * - Without eventId → plan info + events count
 * - With eventId    → plan info + events count + event-scoped (team)
 *
 * Event-scoped limits use the event OWNER's plan (not the requester's).
 */
import { eq } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { optionalEventIdQuerySchema } from "~~/shared/schemas/common";
import { parseQueryParams } from "~~/server/utils/validateBody";
import { exceedsLimit, isUnlimited } from "~~/shared/constants/pricing";
import { getDB } from "~~/server/utils/db";
import {
    getEffectiveLimits,
    countUserEvents,
    countReservedSlots,
} from "~~/server/services/planLimit.service";

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const { eventId } = parseQueryParams(event, optionalEventIdQuerySchema);

    // User's own plan info + events count (always returned)
    const [userEffective, eventsCount] = await Promise.all([
        getEffectiveLimits(user.id),
        countUserEvents(user.id),
    ]);

    const eventsMax = userEffective.limits.max_events;

    const response = {
        plan: userEffective.plan,
        limits: userEffective.limits,
        usage: {
            events: {
                current: eventsCount,
                limit: isUnlimited(eventsMax) ? -1 : eventsMax,
                allowed: !exceedsLimit(eventsCount, eventsMax),
            },
            team: null as { current: number; limit: number; allowed: boolean } | null,
        },
    };

    // Event-scoped data (only when eventId provided)
    if (eventId) {
        const db = getDB();
        const eventResult = await db
            .select({ userId: schema.events.userId })
            .from(schema.events)
            .where(eq(schema.events.id, eventId))
            .limit(1);

        if (eventResult[0]) {
            const ownerId = eventResult[0].userId;

            // Use event owner's limits (may differ from requester if team member)
            const [ownerEffective, reservedSlots] = await Promise.all([
                ownerId !== user.id
                    ? getEffectiveLimits(ownerId)
                    : Promise.resolve(userEffective),
                countReservedSlots(eventId),
            ]);

            const teamMax = ownerEffective.limits.team_members;

            response.usage.team = {
                current: reservedSlots,
                limit: isUnlimited(teamMax) ? -1 : teamMax,
                allowed: !exceedsLimit(reservedSlots, teamMax),
            };
        }
    }

    return response;
});
