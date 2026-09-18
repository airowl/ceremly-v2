import { config } from "dotenv";
import { inArray, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { hashPassword, symmetricEncrypt } from "better-auth/crypto";

import { getDB } from "../../server/utils/db";
import * as schema from "../../server/database/schema";
import { AUTH_FIXTURES, fixtureEmails } from "./auth-fixtures";

/**
 * Task 4 (migration), Step 5 — writes the G03–G05 fixtures into the legacy
 * schema (dev branch; `NUXT_ENV=prod` switches to `.env.prod` and is refused
 * unless `--force-prod` is passed).
 *
 * Real rows, real crypto: password hashes and both 2FA payloads come from
 * `better-auth/crypto`, the same code the legacy deployment uses, so the
 * export → import → sign-in chain is exercised with the exact values the legacy
 * system would store:
 *   - TOTP secret: `symmetricEncrypt({ key: authSecret, data: rawSecret })` — a
 *     bare-hex ciphertext (no `$ba$` envelope) because a single `secret` means
 *     `secretConfig` is that string;
 *   - backup codes: `symmetricEncrypt(JSON.stringify(codes))`, since better-auth
 *     1.6.15 defaults `storeBackupCodes` to `"encrypted"`. Plaintext JSON in
 *     that column makes `verify-backup-code` fail with a hex decode error on
 *     the target deployment.
 *
 * Idempotent: previous fixture rows are removed (by email) before insertion, so
 * re-running never accumulates duplicates.
 *
 *   npx tsx scripts/migration/seed-auth-fixture.ts
 */

async function main() {
    const target = process.env.NUXT_ENV === "prod" ? "prod" : "dev";
    config({ path: target === "prod" ? ".env.prod" : ".env" });

    if (target === "prod" && !process.argv.includes("--force-prod")) {
        throw new Error("Refusing to seed fixtures on prod without --force-prod");
    }

    const db = getDB();
    const emails = fixtureEmails().map((email) => email.toLowerCase());

    // Measured on better-auth 1.6.15: with a single `secret` (no `secrets`
    // array) `secretConfig` *is* the secret string, so the two-factor plugin
    // stores the TOTP secret as `xchacha20poly1305` ciphertext derived from
    // BETTER_AUTH_SECRET (`rawEncrypt`, bare hex — no `$ba$` envelope).
    //
    // Migration consequence: the target deployment MUST be configured with the
    // same BETTER_AUTH_SECRET, or every imported TOTP secret becomes
    // undecryptable. The fixture therefore stores exactly what the legacy
    // deployment would store.
    const authSecret = process.env.NUXT_BETTER_AUTH_SECRET;
    if (!authSecret) {
        throw new Error("NUXT_BETTER_AUTH_SECRET is required to build a faithful 2FA fixture");
    }

    const existing = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(inArray(sql`lower(${schema.user.email})`, emails));

    if (existing.length > 0) {
        const ids = existing.map((row) => row.id);
        await db.delete(schema.twoFactor).where(inArray(schema.twoFactor.userId, ids));
        await db.delete(schema.account).where(inArray(schema.account.userId, ids));
        await db.delete(schema.user).where(inArray(schema.user.id, ids));
    }

    const summary: Array<{ gate: string; email: string; accounts: number; twoFactors: number }> = [];

    for (const fixture of AUTH_FIXTURES) {
        const userId = uuidv7();
        const now = new Date();

        // Mirrors a real legacy row, including the columns the Convex import
        // cannot carry (locale, tosAcceptedAt, phone, bio, timezone...).
        await db.insert(schema.user).values({
            id: userId,
            name: fixture.name,
            email: fixture.email,
            emailVerified: true,
            image: null,
            createdAt: now,
            updatedAt: now,
            role: "user",
            banned: false,
            twoFactorEnabled: Boolean(fixture.twoFactor),
            creemCustomerId: null,
            hadTrial: false,
            locale: "it",
            tosAcceptedAt: now,
            phone: null,
            bio: null,
            timezone: "Europe/Rome",
        });

        await db.insert(schema.account).values({
            id: uuidv7(),
            accountId: userId,
            providerId: "credential",
            userId,
            password: await hashPassword(fixture.password),
            createdAt: now,
            updatedAt: now,
        });

        let accounts = 1;

        if (fixture.google) {
            await db.insert(schema.account).values({
                id: uuidv7(),
                accountId: fixture.google.accountId,
                providerId: "google",
                userId,
                createdAt: now,
                updatedAt: now,
            });
            accounts += 1;
        }

        if (fixture.twoFactor) {
            await db.insert(schema.twoFactor).values({
                id: uuidv7(),
                secret: await symmetricEncrypt({ key: authSecret, data: fixture.twoFactor.secret }),
                backupCodes: await symmetricEncrypt({
                    key: authSecret,
                    data: JSON.stringify(fixture.twoFactor.backupCodes),
                }),
                userId,
            });
        }

        summary.push({
            gate: fixture.gate,
            email: fixture.email,
            accounts,
            twoFactors: fixture.twoFactor ? 1 : 0,
        });
    }

    console.log(JSON.stringify({ target, fixtures: summary }));
}

main().catch((error: unknown) => {
    console.error(`[seed-auth-fixture] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
