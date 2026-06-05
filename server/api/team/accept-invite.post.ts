/**
 * POST /api/team/accept-invite
 * Accept an invitation to join an event
 */
import { acceptInviteSchema } from '~~/shared/schemas/team'
import { parseBody } from '~~/server/utils/validateBody'
import { acceptInvite } from '~~/server/services/team.service'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)
  const body = await parseBody(event, acceptInviteSchema)

  return acceptInvite(event, currentUser.id, currentUser.email, body)
})
