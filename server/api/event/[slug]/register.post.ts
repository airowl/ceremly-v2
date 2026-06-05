/**
 * POST /api/event/:slug/register
 * Public endpoint - NO auth required.
 * Guest self-registration for an event.
 */
import { publicRegistrationSchema } from '~~/shared/schemas/guest'
import { parseBody } from '~~/server/utils/validateBody'
import { registerGuest } from '~~/server/services/publicEvent.service'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing event slug',
    })
  }

  const body = await parseBody(event, publicRegistrationSchema)

  return registerGuest(event, slug, body)
})
