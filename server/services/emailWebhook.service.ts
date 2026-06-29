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
 * Verifies the Svix signature via the Resend SDK (uses svix internally). Throws if invalid.
 *
 * SDK ADAPTATION NOTE: the Resend SDK's `VerifyWebhookOptions` type uses:
 *   - `webhookSecret` (NOT `secret` as in the official documentation)
 *   - `headers.id`, `headers.timestamp`, `headers.signature` (without "svix-" prefix)
 * The route (Task 8) passes svix-* headers — this wrapper remaps them.
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
    // "Name <addr@domain>" or "addr@domain"
    const m = from.match(/<([^>]+)>/);
    const addr = (m?.[1] ?? from).trim();
    return addr.split("@")[1]?.toLowerCase() ?? "";
}

/** True if `from` belongs to THIS environment's domains (main domain or events subdomain). */
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
    if (!recipient) return; // no recipient → nothing to suppress/attribute (subscribed events always have `to`)
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
            // Intentional order: the durable record is written BEFORE the non-idempotent counter.
            // On retry (insertEmailEvent throws → 500 → Resend retries), the counter is not
            // incremented a second time because the branch never reaches recordGuestOpen.
            // The counter is a best-effort derived value; the append is the source of truth.
            await insertEmailEvent({ ...baseEvent, type: "opened" });
            if (ctx?.guestId) await recordGuestOpen(ctx.guestId, occurredAt);
            break;
        case "email.clicked":
            await insertEmailEvent({ ...baseEvent, type: "clicked", clickedUrl: data.click?.link });
            break;
        default:
            // unhandled event → ignore (the route still responds 200)
            break;
    }
}
