/**
 * DELETE /api/user/account
 * Delete user account (soft delete via ban)
 */
import { deleteAccount } from '~~/server/services/user.service'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)

  return deleteAccount(event, currentUser.id)
})
