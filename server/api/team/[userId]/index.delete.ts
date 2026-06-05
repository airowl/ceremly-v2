/**
 * DELETE /api/team/:userId
 * Remove a member from the event
 */
import { removeMember } from '~~/server/services/team.service'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)
  const targetUserId = getRouterParam(event, 'userId')

  if (!targetUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  return removeMember(event, currentUser.id, targetUserId)
})
