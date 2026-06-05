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

    // STUB phase 1a — query su schema.eventUsers + schema.events rimosse; 1c usa org membership
    const events: Array<{ id: string; name: string; isOwner: boolean; role: string }> = [];

    return {
        ...user,
        subscriptions,
        events,
    };
});
