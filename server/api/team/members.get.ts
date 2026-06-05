/**
 * GET /api/team/members
 * Lista i membri dell'evento corrente e gli inviti pendenti
 */
import { getEventMembers } from '../../services/team.service'

export default defineEventHandler(async (event) => {
    const currentUser = await requireAuth(event);

    return await getEventMembers(currentUser.id);
});
