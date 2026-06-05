/**
 * DELETE /api/team/invitation/:id
 * Cancella un invito pendente
 */
import { cancelInvitation } from '../../../services/team.service'

export default defineEventHandler(async (event) => {
    const currentUser = await requireAuth(event);
    const id = getRouterParam(event, 'id');

    if (!id) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invitation ID is required',
        });
    }

    return await cancelInvitation(event, currentUser.id, id);
});
