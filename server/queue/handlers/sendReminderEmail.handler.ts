import type { JobPayload } from '../types'
import {
  findGuestForEmail,
  findReminderById,
  hasReminderActivity,
} from '~~/server/repositories/distributionRepository'
import { renderGuestReminderEmail } from '~~/server/emailTemplates'
import { sendEmail } from '~~/server/utils/email'
import {
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
} from '~~/server/services/distribution.service'
import { getDB } from '~~/server/utils/db'
import * as schema from '~~/server/database/schema'

/**
 * Invia l'email di reminder RSVP a UN ospite (accodato dal cron B4, SPEC §6).
 * Re-fetch guest+event+reminder dal DB. Skip SILENZIOSO se l'ospite ha già
 * risposto, è stato rimosso, ha i reminder disattivati o è senza email
 * (lo stato può cambiare tra enqueue e delivery). Subject/message arrivano
 * dal reminder, con {nome}/{link} sostituiti qui. L'attività reminder_sent
 * la scrive QUESTO handler (meta { reminderId }), solo a invio riuscito.
 * Idempotenza: vincolo univoco su guest_activities(guest_id, type, meta->>'reminderId')
 * + catch 23505 (unique_violation) = già inviato.
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

  // Idempotenza veloce (evita render/invio se già tracciato)
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

  const result = await sendEmail({
    type: 'custom',
    to: guest.email,
    subject,
    html,
    text,
    context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId },
    idempotencyKey: `reminder/${reminder.id}/guest/${guest.id}`,
  })
  if (!result.success) {
    throw new Error(`[job:send-reminder-email] invio fallito per guest ${guest.id}: ${result.error}`)
  }

  // Inserisci activity con idempotenza DB-level (unique constraint).
  // Se fallisce per 23505 (unique_violation) = già inserito da retry concorrente.
  try {
    const db = getDB()
    await db.insert(schema.guestActivities).values({
      organizationId: guest.organizationId,
      eventId: guest.eventId,
      guestId: guest.id,
      type: 'reminder_sent',
      meta: { reminderId: reminder.id },
    })
  } catch (err: any) {
    // 23505 = unique_violation (concorrenza tra retry QStash o handler paralleli)
    // Trattiamo come successo idempotente.
    if (err?.code === '23505') {
      return
    }
    throw err
  }
}
