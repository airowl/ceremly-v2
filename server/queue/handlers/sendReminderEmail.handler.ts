import type { JobPayload } from '../types'
import {
  findGuestForEmail,
  findReminderById,
  hasReminderActivity,
  insertActivities,
} from '~~/server/repositories/distributionRepository'
import { renderGuestReminderEmail } from '~~/server/emailTemplates'
import { sendEmail } from '~~/server/utils/email'
import {
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
} from '~~/server/services/distribution.service'

/**
 * Sends the RSVP reminder email to ONE guest (enqueued by cron B4, SPEC §6).
 * Re-fetches guest+event+reminder from the DB. SILENT skip if the guest has already
 * responded, has been removed, has reminders disabled, or has no email
 * (state can change between enqueue and delivery). Subject/message come
 * from the reminder, with {nome}/{link} substituted here. The reminder_sent
 * activity is written by THIS handler (meta { reminderId }), only on successful send.
 * On send failure, throws → QStash retries.
 */
export async function handleSendReminderEmail(payload: JobPayload<'send-reminder-email'>): Promise<void> {
  const row = await findGuestForEmail(payload.guestId)
  if (!row) {
    console.warn(`[job:send-reminder-email] guest ${payload.guestId} not found, skip`)
    return
  }
  const { guest, event, responseId } = row
  if (guest.removedAt || !guest.email || guest.remindersDisabled || responseId) {
    return
  }

  const reminder = await findReminderById(payload.reminderId)
  // Defensive guard: the reminder must exist and belong to the same event.
  if (!reminder || reminder.eventId !== guest.eventId) {
    console.warn(`[job:send-reminder-email] reminder ${payload.reminderId} not valid for guest ${payload.guestId}, skip`)
    return
  }

  // Idempotency (defense in depth on the most visible path): if this reminder
  // has already been sent to the guest, do not re-send on a QStash retry.
  if (await hasReminderActivity(guest.id, reminder.id)) {
    return
  }

  const link = buildGuestInviteLink(event.slug, guest.token)
  const values = { nome: guest.firstName, link }
  const subject = applyInvitePlaceholders(reminder.subject, values)
  const message = applyInvitePlaceholders(reminder.message, values)

  const { html, text } = await renderGuestReminderEmail({
    eventTitle: event.title,
    firstName: guest.firstName,
    message,
    ctaUrl: link,
    pixelUrl: buildGuestPixelUrl(guest.token),
  })

  const result = await sendEmail({ type: 'custom', to: guest.email, subject, html, text, context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId } })
  if (!result.success) {
    throw new Error(`[job:send-reminder-email] send failed for guest ${guest.id}: ${result.error}`)
  }

  await insertActivities([{
    organizationId: guest.organizationId,
    eventId: guest.eventId,
    guestId: guest.id,
    type: 'reminder_sent',
    meta: { reminderId: reminder.id },
  }])
}
