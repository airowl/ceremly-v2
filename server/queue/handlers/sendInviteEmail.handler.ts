import type { JobPayload } from '../types'
import { findGuestForEmail } from '~~/server/repositories/distributionRepository'
import { emailSubjects, renderGuestInviteEmail } from '~~/server/emailTemplates'
import { sendEmail } from '~~/server/utils/email'
import {
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
} from '~~/server/services/distribution.service'

/** Corpo di fallback se event.distribution non ha ancora un emailBody. */
const FALLBACK_INVITE_BODY
  = 'Ciao {nome},\n\nc\'è un invito che ti aspetta. Apri il link per scoprire tutti i dettagli e confermare la tua presenza:\n{link}'

/**
 * Invia l'email d'invito a UN ospite (1 job per ospite, SPEC §6).
 * Re-fetch guest+event dal DB (il payload porta solo l'id); subject/body
 * arrivano da event.distribution (salvati dal service prima del dispatch),
 * con {nome}/{link} sostituiti qui. Skip SILENZIOSO se l'ospite è stato
 * rimosso o non ha email (può cambiare tra enqueue e delivery).
 * Su invio fallito lancia → QStash ritenta.
 */
export async function handleSendInviteEmail(payload: JobPayload<'send-invite-email'>): Promise<void> {
  const row = await findGuestForEmail(payload.guestId)
  if (!row) {
    console.warn(`[job:send-invite-email] guest ${payload.guestId} non trovato, skip`)
    return
  }
  const { guest, event } = row
  if (guest.removedAt || !guest.email) {
    return
  }

  const link = buildGuestInviteLink(event.slug, guest.token)
  const values = { nome: guest.firstName, link }
  const subject = applyInvitePlaceholders(
    event.distribution.emailSubject || emailSubjects.guestInvite(event.title),
    values,
  )
  const message = applyInvitePlaceholders(
    event.distribution.emailBody || FALLBACK_INVITE_BODY,
    values,
  )

  const { html, text } = await renderGuestInviteEmail({
    eventTitle: event.title,
    firstName: guest.firstName,
    message,
    ctaUrl: link,
    pixelUrl: buildGuestPixelUrl(guest.token),
  })

  const result = await sendEmail({ type: 'custom', to: guest.email, subject, html, text })
  if (!result.success) {
    throw new Error(`[job:send-invite-email] invio fallito per guest ${guest.id}: ${result.error}`)
  }
}
