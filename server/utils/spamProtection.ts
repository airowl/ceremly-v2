/**
 * Anti-spam utilities for public forms (waiting list, contact, etc.)
 * Platform-agnostic: no external dependencies.
 */

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

// --- Endpoint-Specific Rate Limiter ---

interface RateLimitEntry {
    count: number;
    startTime: number;
}

const endpointLimits = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 30 minutes
const CLEANUP_INTERVAL = 30 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries(windowMs: number) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;

    for (const [key, entry] of endpointLimits) {
        if (now - entry.startTime > windowMs) {
            endpointLimits.delete(key);
        }
    }
}

/**
 * Check if an IP has exceeded the rate limit for a specific endpoint.
 * Returns true if the request should be blocked.
 */
export function isEndpointRateLimited(
    ip: string,
    endpoint: string,
    maxRequests: number = 5,
    windowMs: number = 60 * 60 * 1000, // 1 hour default
): boolean {
    cleanupStaleEntries(windowMs);

    const now = Date.now();
    const key = `${ip}:${endpoint}`;
    const entry = endpointLimits.get(key);

    if (!entry || now - entry.startTime > windowMs) {
        endpointLimits.set(key, { count: 1, startTime: now });
        return false;
    }

    entry.count++;
    return entry.count > maxRequests;
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
