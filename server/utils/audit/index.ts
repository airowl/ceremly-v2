import type { H3Event, EventHandlerRequest } from "~~/server/types/h3"
import { auditLog } from '../../database/schema/auditLog'
import { getDB } from '../db'
import type { AuditAction, LogAuditOptions } from './types'
import { getCategoryFromAction } from './types'

/**
 * Log an audit event with automatic context extraction from H3 events.
 *
 * @param event - H3 event for auto-extraction of userId, IP, userAgent. Pass null for webhooks/non-HTTP contexts.
 * @param action - Audit action using resource.verb taxonomy (e.g. 'auth.signed_in')
 * @param opts - Additional options (userId override, eventId, details, etc.)
 */
export async function logAudit(
  event: H3Event<EventHandlerRequest> | null,
  action: AuditAction,
  opts?: Partial<LogAuditOptions>
): Promise<void> {
  try {
    // Auto-extract context from H3 event
    let userId = opts?.userId
    let ipAddress = opts?.ipAddress
    let userAgent = opts?.userAgent

    if (event) {
      if (!userId) {
        userId = event.context.user?.id
      }
      if (!ipAddress) {
        ipAddress = getHeader(event, 'x-forwarded-for')
          || getHeader(event, 'x-real-ip')
          || undefined
      }
      if (!userAgent) {
        userAgent = getHeader(event, 'user-agent') || undefined
      }
    }

    const category = getCategoryFromAction(action)

    const db = getDB()
    await db.insert(auditLog).values({
      userId,
      eventId: opts?.eventId,
      category,
      action,
      targetType: opts?.targetType,
      targetId: opts?.targetId,
      ipAddress,
      userAgent,
      status: opts?.status || 'success',
      details: opts?.details ?? null,
    })
  } catch (error) {
    console.error('Failed to log audit event:', error)
  }
}
