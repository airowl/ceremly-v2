/**
 * GET /api/user/profile
 * Recupera il profilo dell'utente corrente.
 */
import { getUserProfile } from "~~/server/services/user.service";

export default defineEventHandler(async (event) => {
    const authUser = await requireAuth(event);

    return getUserProfile(authUser.id);
});
