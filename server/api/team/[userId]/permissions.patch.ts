/**
 * PATCH /api/team/:userId/permissions
 * Update an event member's role
 */
import { updatePermissionsSchema } from '~~/shared/schemas/team'
import { parseBody } from '~~/server/utils/validateBody'
import { updateMemberPermissions } from '~~/server/services/team.service'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)
  const targetUserId = getRouterParam(event, 'userId')

  if (!targetUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'User ID is required',
    })
  }

  const body = await parseBody(event, updatePermissionsSchema)

  return updateMemberPermissions(event, currentUser.id, targetUserId, body)
})
