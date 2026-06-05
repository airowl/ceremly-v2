/**
 * PATCH /api/user/profile
 * Update user profile
 */
import { updateProfileSchema } from '~~/shared/schemas/auth'
import { parseBody } from '~~/server/utils/validateBody'
import { updateProfile } from '~~/server/services/user.service'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)
  const body = await parseBody(event, updateProfileSchema)

  return updateProfile(event, currentUser.id, body)
})
