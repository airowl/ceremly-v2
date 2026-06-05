/**
 * POST /api/rsvp/:slug/respond
 * Public endpoint - NO auth required.
 * Allows a guest to respond to an RSVP (yes/no).
 */
import { rsvpRespondSchema } from '~~/shared/schemas/guest'
import { parseBody } from '~~/server/utils/validateBody'
import { respondRsvp } from '~~/server/services/publicEvent.service'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing event slug',
    })
  }

  const body = await parseBody(event, rsvpRespondSchema)

  return respondRsvp(event, slug, body)
})
