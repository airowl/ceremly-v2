import { verifyResendEvent, isOwnDomain, handleResendEvent } from "~~/server/services/emailWebhook.service";
import { cacheClient } from "~~/server/utils/drivers";

const DEDUPE_TTL_SECONDS = 86400; // 24h

export default defineEventHandler(async (event) => {
    const payload = await readRawBody(event); // mai readBody (romperebbe la firma)
    if (!payload) throw createError({ statusCode: 400, statusMessage: "Empty body" });

    const headers = {
        "svix-id": getHeader(event, "svix-id") ?? "",
        "svix-timestamp": getHeader(event, "svix-timestamp") ?? "",
        "svix-signature": getHeader(event, "svix-signature") ?? "",
    };

    let parsed;
    try {
        parsed = verifyResendEvent(payload, headers);
    } catch {
        throw createError({ statusCode: 401, statusMessage: "Invalid signature" });
    }

    // Idempotenza: dedup su svix-id, chiave settata SOLO a processing riuscito.
    const dedupeKey = headers["svix-id"] ? `resend:webhook:${headers["svix-id"]}` : undefined;
    if (dedupeKey && (await cacheClient.get(dedupeKey))) {
        return { ok: true, deduped: true };
    }

    // Env isolation: webhook account-wide → processa solo i domini di questo ambiente.
    if (!isOwnDomain(parsed.data.from)) {
        return { ok: true, skipped: "foreign-domain" };
    }

    await handleResendEvent(parsed);

    if (dedupeKey) await cacheClient.set(dedupeKey, "1", DEDUPE_TTL_SECONDS);
    return { ok: true };
});
