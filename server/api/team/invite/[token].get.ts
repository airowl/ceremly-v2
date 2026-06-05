/**
 * GET /api/team/invite/[token]
 * Get invitation details by token (public endpoint)
 */
import { getInvitationByToken } from '../../../services/team.service'

export default defineEventHandler(async (event) => {
    const token = getRouterParam(event, 'token');

    if (!token) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Token is required',
        });
    }

    return await getInvitationByToken(token);
});
