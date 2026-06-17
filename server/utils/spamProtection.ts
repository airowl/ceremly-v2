/**
 * Anti-spam utilities for public forms (waiting list, contact, RSVP, etc.).
 *
 * Il rate limiter è backed da Upstash Redis (cacheClient) così il conteggio è
 * CONDIVISO tra le istanze serverless Vercel (una Map in-process si resetta a
 * ogni cold start e non è condivisa → inefficace). Fallback in-memory
 * best-effort quando Redis non è configurato (dev / self-host).
 */
import { cacheClient } from "./drivers";

// --- Disposable Email Blocking ---

const DISPOSABLE_DOMAINS = new Set([
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "guerrillamail.org",
    "tempmail.com",
    "throwaway.email",
    "temp-mail.org",
    "fakeinbox.com",
    "sharklasers.com",
    "guerrillamailblock.com",
    "grr.la",
    "dispostable.com",
    "yopmail.com",
    "yopmail.fr",
    "trashmail.com",
    "trashmail.me",
    "trashmail.net",
    "mailnesia.com",
    "maildrop.cc",
    "discard.email",
    "tempail.com",
    "mohmal.com",
    "getnada.com",
    "emailondeck.com",
    "10minutemail.com",
    "10minutemail.net",
    "minutemail.com",
    "tempinbox.com",
    "harakirimail.com",
    "mailcatch.com",
    "mytrashmail.com",
    "throwam.com",
    "mailexpire.com",
    "incognitomail.org",
    "mailnull.com",
    "spamgourmet.com",
    "jetable.org",
    "mailmoat.com",
    "trashymail.com",
    "mailzilla.com",
    "tempr.email",
    "burnermail.io",
    "guerrillamail.de",
    "tmail.ws",
]);

export function isDisposableEmail(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return false;
    return DISPOSABLE_DOMAINS.has(domain);
}

// --- Endpoint-Specific Rate Limiter (Redis-backed, shared across instances) ---

/**
 * Check if an IP has exceeded the rate limit for a specific endpoint.
 * Returns true if the request should be blocked (count oltre maxRequests nella
 * finestra). Conteggio condiviso via Upstash (cacheClient.increment).
 */
export async function isEndpointRateLimited(
    ip: string,
    endpoint: string,
    maxRequests: number = 5,
    windowMs: number = 60 * 60 * 1000, // 1 hour default
): Promise<boolean> {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const key = `rl:${endpoint}:${ip}`;
    const count = await cacheClient.increment(key, windowSeconds);
    return count > maxRequests;
}

// --- Honeypot Validation ---

/**
 * Returns true if the honeypot field was filled (likely a bot).
 */
export function isHoneypotTriggered(value: unknown): boolean {
    return typeof value === "string" && value.length > 0;
}

// --- Timestamp Validation ---

const MIN_SUBMIT_TIME_MS = 3000; // 3 seconds minimum

/**
 * Returns true if the form was submitted too quickly (likely a bot).
 * `loadedAt` is the timestamp (ms) set when the form was rendered.
 */
export function isSubmittedTooFast(loadedAt: unknown): boolean {
    if (typeof loadedAt !== "number" || loadedAt <= 0) return true;
    return Date.now() - loadedAt < MIN_SUBMIT_TIME_MS;
}
