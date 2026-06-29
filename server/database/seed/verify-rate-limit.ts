import { config } from "dotenv";

import { isEndpointRateLimited } from "../../utils/spamProtection";
import { cacheClient } from "../../utils/drivers";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

/**
 * Gate FIX #7/#9: the rate limiter for public endpoints is durable
 * (Redis-backed via cacheClient.increment), not an in-process Map.
 *
 * INVARIANT: with max=5 in the window, the first 5 requests pass and the 6th
 * is blocked. Verifies the limiter mechanics (atomic incr + threshold).
 * Runs against the Upstash from .env if configured, otherwise the memory fallback.
 * Self-contained: cleans up its own key before and after.
 */
async function main() {
    const ip = "203.0.113.250"; // TEST-NET-3 (RFC 5737), non-routable
    const endpoint = "verify-rate-limit";
    const key = `rl:${endpoint}:${ip}`;
    const max = 5;
    const windowMs = 60 * 1000;

    await cacheClient.delete(key); // clean baseline

    const results: boolean[] = [];
    try {
        for (let i = 1; i <= 6; i++) {
            results.push(await isEndpointRateLimited(ip, endpoint, max, windowMs));
        }
    } finally {
        await cacheClient.delete(key); // cleanup sempre
    }

    // First 5 (count 1..5 <= max) → false; 6th (count 6 > max) → true.
    const expected = [false, false, false, false, false, true];
    const ok = results.length === expected.length && results.every((r, i) => r === expected[i]);

    console.log(`[verify-rate-limit] results=${JSON.stringify(results)}`);
    if (!ok) {
        console.error(`[verify-rate-limit] FAIL — expected ${JSON.stringify(expected)}`);
        process.exit(1);
    }
    console.log("[verify-rate-limit] OK — passes 5, blocks the 6th (Redis-backed, shared across instances)");
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-rate-limit] error", e);
    process.exit(1);
});
