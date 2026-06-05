/**
 * POST /api/limits/validate-downgrade
 * Validate if user can downgrade to a new plan
 * Checks all resources across user scope (events, storage) and per-event (team, pages)
 */
import { validateDowngradeSchema } from '~~/shared/schemas/subscription'
import { parseBody } from '~~/server/utils/validateBody'
import { validateDowngrade } from '../../services/planLimit.service'

export default defineEventHandler(async (event) => {
    const user = await requireAuth(event);
    const { newPlan } = await parseBody(event, validateDowngradeSchema);

    return await validateDowngrade(user.id, newPlan);
});
