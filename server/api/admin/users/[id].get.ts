import { eq } from "drizzle-orm";
import * as schema from "~~/server/database/schema";
import { requireAdminApiKey } from "~~/server/utils/requireAdminApiKey";
import { getDB } from "~~/server/utils/db";

export interface AdminUserDetail {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    phone: string | null;
    bio: string | null;
    locale: string | null;
    role: string | null;
    banned: boolean | null;
    banReason: string | null;
    banExpires: Date | null;
    creemCustomerId: string | null;
    createdAt: Date;
    updatedAt: Date;
    subscriptions: Array<{
        id: string;
        productId: string;
        status: string | null;
        periodStart: Date | null;
        periodEnd: Date | null;
    }>;
    events: Array<{
        id: string;
        name: string;
        isOwner: boolean;
        role: string;
    }>;
}

export default defineEventHandler(async (event): Promise<AdminUserDetail> => {
    await requireAdminApiKey(event);

    const db = getDB();
    const userId = getRouterParam(event, "id");

    if (!userId) {
        throw createError({
            statusCode: 400,
            statusMessage: "User ID is required",
        });
    }

    // Get user details
    const user = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
    });

    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: "User not found",
        });
    }

    // Get subscriptions
    const subscriptions = await db
        .select({
            id: schema.creem_subscription.id,
            productId: schema.creem_subscription.productId,
            status: schema.creem_subscription.status,
            periodStart: schema.creem_subscription.periodStart,
            periodEnd: schema.creem_subscription.periodEnd,
        })
        .from(schema.creem_subscription)
        .where(eq(schema.creem_subscription.referenceId, userId));

    // Get events with membership info
    const eventMemberships = await db
        .select({
            id: schema.events.id,
            name: schema.events.name,
            role: schema.eventUsers.role,
            userId: schema.events.userId,
        })
        .from(schema.eventUsers)
        .innerJoin(
            schema.events,
            eq(schema.eventUsers.eventId, schema.events.id)
        )
        .where(eq(schema.eventUsers.userId, userId));

    // Also include events where user is owner but might not be in eventUsers
    const ownedEvents = await db
        .select({
            id: schema.events.id,
            name: schema.events.name,
        })
        .from(schema.events)
        .where(eq(schema.events.userId, userId));

    // Merge owned events
    const eventMap = new Map<string, { id: string; name: string; isOwner: boolean; role: string }>();

    for (const ev of eventMemberships) {
        const isOwner = ev.userId === userId;
        eventMap.set(ev.id, {
            id: ev.id,
            name: ev.name,
            isOwner,
            role: isOwner ? 'owner' : (ev.role || 'viewer'),
        });
    }

    for (const ev of ownedEvents) {
        if (!eventMap.has(ev.id)) {
            eventMap.set(ev.id, {
                id: ev.id,
                name: ev.name,
                isOwner: true,
                role: 'owner',
            });
        }
    }

    return {
        ...user,
        subscriptions,
        events: Array.from(eventMap.values()),
    };
});
