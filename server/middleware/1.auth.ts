import { requireAdminApiKey } from '~~/server/utils/requireAdminApiKey'
import { getAuthSession } from '~~/server/utils/auth'
import type { User } from '~~/shared/utils/types'

export default defineEventHandler(async (event) => {
  const path = event.path

  // Admin API routes use API Key authentication
  if (path?.startsWith('/api/admin')) {
    await requireAdminApiKey(event)
    return
  }

  // For API routes (excluding auth catch-all), try to inject session.
  // Non-blocking: if no session, routes that need auth will use requireAuth()
  if (path?.startsWith('/api/') && !path.startsWith('/api/auth/')) {
    try {
      const session = await getAuthSession(event)
      if (session?.user) {
        event.context.user = session.user as unknown as User
      }
    } catch {
      // Silently ignore — routes will handle auth requirements via requireAuth()
    }
  }
})
