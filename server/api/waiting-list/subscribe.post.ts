/**
 * POST /api/waiting-list/subscribe
 * Subscribe to the waiting list
 */
import { waitingListSubscribeSchema } from '~~/shared/schemas/waiting-list';
import { parseBody } from '~~/server/utils/validateBody';
import { subscribe } from '~~/server/services/waitingList.service';

export default defineEventHandler(async (event) => {
    try {
        const data = await parseBody(event, waitingListSubscribeSchema);
        return await subscribe(event, data);
    } catch (error: unknown) {
        console.error('[WaitingList] Subscription error:', error);

        // Handle PostgreSQL unique constraint violation (race condition)
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505'
        ) {
            return {
                success: true,
                alreadySubscribed: true,
                emailSent: false,
            };
        }

        const err = error as { statusCode?: number; message?: string };
        throw createError({
            statusCode: err?.statusCode || 500,
            message: err?.message || 'Failed to subscribe',
        });
    }
});
