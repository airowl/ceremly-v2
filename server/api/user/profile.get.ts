/**
 * GET /api/user/profile
 * Retrieves the profile of the current user.
 */
import { getUserProfile } from "~~/server/services/user.service";

export default defineEventHandler(async (event) => {
    const authUser = await requireAuth(event);

    return getUserProfile(authUser.id);
});
