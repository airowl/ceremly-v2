import { getResendInstance } from "../utils/drivers";
import { runtimeConfig } from "../utils/runtimeConfig";
import { upsertSuppression } from "../repositories/emailSuppression.repository";
import { insertEmailEvent, recordGuestOpen, findSeedContext } from "../repositories/emailEvent.repository";

export interface ResendWebhookEvent {
    type: string;
    created_at: string;
    data: {
        email_id: string;
        from: string;
        to: string[];
        subject?: string;
        click?: { link?: string };
        bounce?: { subType?: string };
    };
}

/**
 * Verifica la firma Svix tramite l'SDK Resend (usa svix internamente). Lancia se invalida.
 *
 * NOTA ADATTAMENTO SDK: il tipo `VerifyWebhookOptions` dell'SDK Resend usa:
 *   - `webhookSecret` (NON `secret` come nella documentazione ufficiale)
 *   - `headers.id`, `headers.timestamp`, `headers.signature` (senza prefisso "svix-")
 * La route (Task 8) passa le intestazioni svix-* — questo wrapper le rimappa.
 */
export function verifyResendEvent(
    payload: string,
    headers: { "svix-id": string; "svix-timestamp": string; "svix-signature": string }
): ResendWebhookEvent {
    return getResendInstance().webhooks.verify({
        payload,
        headers: {
            id: headers["svix-id"],
            timestamp: headers["svix-timestamp"],
            signature: headers["svix-signature"],
        },
        webhookSecret: runtimeConfig.resendWebhookSecret as string,
    }) as ResendWebhookEvent;
}

function domainOf(from: string): string {
    // "Name <addr@domain>" oppure "addr@domain"
    const m = from.match(/<([^>]+)>/);
    const addr = (m?.[1] ?? from).trim();
    return addr.split("@")[1]?.toLowerCase() ?? "";
}

/** True se il `from` appartiene ai domini di QUESTO ambiente (dominio principale o sottodominio eventi). */
export function isOwnDomain(from: string): boolean {
    const d = domainOf(from);
    const own = [runtimeConfig.public.appNotifyEmail, runtimeConfig.public.appEventsNotifyEmail]
        .map((e) => domainOf(String(e ?? "")))
        .filter(Boolean);
    return own.includes(d);
}

export async function handleResendEvent(event: ResendWebhookEvent): Promise<void> {
    const { type, data } = event;
    const recipient = data.to?.[0] ?? "";
    if (!recipient) return; // niente recipient → niente da sopprimere/attribuire (eventi sottoscritti hanno sempre `to`)
    const occurredAt = new Date(event.created_at);
    const ctx = await findSeedContext(data.email_id);

    const baseEvent = {
        messageId: data.email_id,
        recipient,
        occurredAt,
        payload: event,
        organizationId: ctx?.organizationId ?? null,
        guestId: ctx?.guestId ?? null,
        eventId: ctx?.eventId ?? null,
        emailType: ctx?.emailType ?? null,
    };

    switch (type) {
        case "email.bounced":
            await upsertSuppression({ email: recipient, reason: "hard_bounce", bounceSubtype: data.bounce?.subType });
            await insertEmailEvent({ ...baseEvent, type: "bounced" });
            break;
        case "email.complained":
            await upsertSuppression({ email: recipient, reason: "complaint" });
            await insertEmailEvent({ ...baseEvent, type: "complained" });
            break;
        case "email.delivered":
        case "email.delivery_delayed":
        case "email.failed":
            await insertEmailEvent({ ...baseEvent, type: type.replace("email.", "") });
            break;
        case "email.opened":
            if (ctx?.guestId) await recordGuestOpen(ctx.guestId, occurredAt);
            await insertEmailEvent({ ...baseEvent, type: "opened" });
            break;
        case "email.clicked":
            await insertEmailEvent({ ...baseEvent, type: "clicked", clickedUrl: data.click?.link });
            break;
        default:
            // evento non gestito → ignora (la rotta risponde comunque 200)
            break;
    }
}
