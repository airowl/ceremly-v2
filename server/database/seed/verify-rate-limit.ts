import { config } from "dotenv";

import { isEndpointRateLimited } from "../../utils/spamProtection";
import { cacheClient } from "../../utils/drivers";
config({ path: process.env.NUXT_ENV === "prod" ? ".env.production" : ".env" });

/**
 * Gate FIX #7/#9: il rate limiter degli endpoint pubblici è durevole
 * (Redis-backed via cacheClient.increment), non una Map in-process.
 *
 * INVARIANTE: con max=5 nella finestra, le prime 5 richieste passano e la 6ª
 * viene bloccata. Verifica i meccanismi del limiter (incr atomico + soglia).
 * Gira contro l'Upstash di .env se configurato, altrimenti il fallback memoria.
 * Self-contained: pulisce la propria chiave prima e dopo.
 */
async function main() {
    const ip = "203.0.113.250"; // TEST-NET-3 (RFC 5737), non instradabile
    const endpoint = "verify-rate-limit";
    const key = `rl:${endpoint}:${ip}`;
    const max = 5;
    const windowMs = 60 * 1000;

    await cacheClient.delete(key); // baseline pulita

    const results: boolean[] = [];
    try {
        for (let i = 1; i <= 6; i++) {
            results.push(await isEndpointRateLimited(ip, endpoint, max, windowMs));
        }
    } finally {
        await cacheClient.delete(key); // cleanup sempre
    }

    // Prime 5 (conteggio 1..5 <= max) → false; 6ª (conteggio 6 > max) → true.
    const expected = [false, false, false, false, false, true];
    const ok = results.length === expected.length && results.every((r, i) => r === expected[i]);

    console.log(`[verify-rate-limit] results=${JSON.stringify(results)}`);
    if (!ok) {
        console.error(`[verify-rate-limit] FAIL — atteso ${JSON.stringify(expected)}`);
        process.exit(1);
    }
    console.log("[verify-rate-limit] OK — passa 5, blocca la 6ª (Redis-backed, condiviso tra istanze)");
    process.exit(0);
}

main().catch((e) => {
    console.error("[verify-rate-limit] errore", e);
    process.exit(1);
});
