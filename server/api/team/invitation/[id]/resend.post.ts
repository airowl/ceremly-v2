/**
 * POST /api/team/invitation/:id/resend
 * Reinvia un invito pendente all'evento
 */
import { resendInviteSchema } from '~~/shared/schemas/team'
import { parseBody } from '~~/server/utils/validateBody'
import { resendInvitation } from '../../../../services/team.service'

export default defineEventHandler(async (event) => {
    const currentUser = await requireAuth(event);
    const invitationId = getRouterParam(event, 'id');

    if (!invitationId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invitation ID is required',
        });
    }

    const input = await parseBody(event, resendInviteSchema);

    return await resendInvitation(event, currentUser, invitationId, input);
});
