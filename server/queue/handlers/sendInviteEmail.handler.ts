import type { JobPayload } from '../types'
import { findGuestForEmail } from '~~/server/repositories/distributionRepository'
import { emailSubjects, renderGuestInviteEmail } from '~~/server/emailTemplates'
import { sendEmail } from '~~/server/utils/email'
import {
  applyInvitePlaceholders,
  buildGuestInviteLink,
  buildGuestPixelUrl,
} from '~~/server/services/distribution.service'

/** Fallback body if event.distribution does not yet have an emailBody. */
const FALLBACK_INVITE_BODY
  = 'Ciao {nome},\n\nc\'è un invito che ti aspetta. Apri il link per scoprire tutti i dettagli e confermare la tua presenza:\n{link}'

/**
 * Sends the invite email to ONE guest (1 job per guest, SPEC §6).
 * Re-fetches guest+event from the DB (the payload carries only the id); subject/body
 * come from event.distribution (saved by the service before dispatch),
 * with {nome}/{link} substituted here. SILENT skip if the guest has been
 * removed or has no email (can change between enqueue and delivery).
 * On send failure, throws → QStash retries.
 */
export async function handleSendInviteEmail(payload: JobPayload<'send-invite-email'>): Promise<void> {
  const row = await findGuestForEmail(payload.guestId)
  if (!row) {
    console.warn(`[job:send-invite-email] guest ${payload.guestId} not found, skip`)
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

  const result = await sendEmail({ type: 'custom', to: guest.email, subject, html, text, context: { organizationId: guest.organizationId, guestId: guest.id, eventId: guest.eventId } })
  if (!result.success) {
    throw new Error(`[job:send-invite-email] send failed for guest ${guest.id}: ${result.error}`)
  }
}
