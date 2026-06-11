import type { JobPayload } from '../types'
import {
  findGuestForEmail,
  findReminderById,
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
 * Invia l'email di reminder RSVP a UN ospite (accodato dal cron B4, SPEC §6).
 * Re-fetch guest+event+reminder dal DB. Skip SILENZIOSO se l'ospite ha già
 * risposto, è stato rimosso, ha i reminder disattivati o è senza email
 * (lo stato può cambiare tra enqueue e delivery). Subject/message arrivano
 * dal reminder, con {nome}/{link} sostituiti qui. L'attività reminder_sent
 * la scrive QUESTO handler (meta { reminderId }), solo a invio riuscito.
 * Su invio fallito lancia → QStash ritenta.
 */
export async function handleSendReminderEmail(payload: JobPayload<'send-reminder-email'>): Promise<void> {
  const row = await findGuestForEmail(payload.guestId)
  if (!row) {
    console.warn(`[job:send-reminder-email] guest ${payload.guestId} non trovato, skip`)
    return
  }
  const { guest, event, responseId } = row
  if (guest.removedAt || !guest.email || guest.remindersDisabled || responseId) {
    return
  }

  const reminder = await findReminderById(payload.reminderId)
  // Guardia difensiva: il reminder deve esistere ed appartenere allo stesso evento.
  if (!reminder || reminder.eventId !== guest.eventId) {
    console.warn(`[job:send-reminder-email] reminder ${payload.reminderId} non valido per guest ${payload.guestId}, skip`)
    return
  }

  const link = buildGuestInviteLink(event.slug, guest.token)
  const values = { nome: guest.firstName, link }
  const subject = applyInvitePlaceholders(reminder.subject, values)
  const message = applyInvitePlaceholders(reminder.message, values)

  const html = await renderGuestReminderEmail({
    eventTitle: event.title,
    firstName: guest.firstName,
    message,
    ctaUrl: link,
    pixelUrl: buildGuestPixelUrl(guest.token),
  })

  const result = await sendEmail({ type: 'custom', to: guest.email, subject, html })
  if (!result.success) {
    throw new Error(`[job:send-reminder-email] invio fallito per guest ${guest.id}: ${result.error}`)
  }

  await insertActivities([{
    organizationId: guest.organizationId,
    eventId: guest.eventId,
    guestId: guest.id,
    type: 'reminder_sent',
    meta: { reminderId: reminder.id },
  }])
}
