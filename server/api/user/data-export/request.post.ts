/**
 * POST /api/user/data-export/request
 * Request a GDPR data export
 */
import { requestDataExport } from '~~/server/services/user.service'

export default defineEventHandler(async (event) => {
  const currentUser = await requireAuth(event)

  return requestDataExport(event, currentUser.id)
})
