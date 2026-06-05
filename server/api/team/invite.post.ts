/**
 * POST /api/team/invite
 * Invita un nuovo membro all'evento
 */
import { teamInviteSchema } from '~~/shared/schemas/team'
import { parseBody } from '~~/server/utils/validateBody'
import { inviteMember } from '../../services/team.service'

export default defineEventHandler(async (event) => {
    const currentUser = await requireAuth(event);
    const input = await parseBody(event, teamInviteSchema);

    return await inviteMember(event, currentUser, input);
});
