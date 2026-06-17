import type { H3Event, EventHandlerRequest } from "~~/server/types/h3";

/**
 * IP del client per rate limiting / audit. Su Vercel il primo hop di
 * `x-forwarded-for` è l'IP reale (la piattaforma lo imposta). Fallback al
 * socket remoto, poi "unknown". NB: in ambienti senza proxy fidato l'header è
 * spoofabile — qui è accettabile perché serve a un limiter best-effort, non a
 * decisioni di sicurezza forti.
 */
export function getClientIp(event: H3Event<EventHandlerRequest>): string {
    const fwd = event.node.req.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.toString().split(",")[0]?.trim();
    return first || event.node.req.socket.remoteAddress || "unknown";
}
