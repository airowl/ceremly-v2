/**
 * POST /api/waiting-list/subscribe
 *
 * Con `NUXT_PUBLIC_FORMS_BACKEND=convex` è trasporto: la deduplica per indirizzo,
 * il limite per IP e la write vivono in Convex (una sola implementazione). Il ramo
 * legacy resta intatto fino al cutover, `23505` compreso.
 */
import { waitingListSubscribeSchema } from '~~/shared/schemas/waiting-list';
import { parseBody } from '~~/server/utils/validateBody';
import { subscribe } from '~~/server/services/waitingList.service';
import {
    PUBLIC_FORM_PATHS,
    forwardPublicForm,
    isConvexFormsBackend,
} from '~~/server/utils/publicFormsBridge';

export default defineEventHandler(async (event) => {
    if (isConvexFormsBackend()) {
        return await forwardPublicForm(
            event,
            PUBLIC_FORM_PATHS.waitingList,
            await readBody(event),
        );
    }

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
