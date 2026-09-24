import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inArray, sql } from "drizzle-orm";

import { getDB } from "../../server/utils/db";
import * as schema from "../../server/database/schema";
import { encryptJson, parseMigrationKey, sealBatch } from "./crypto";
import { fixtureEmails } from "./auth-fixtures";

/**
 * Task 4 (migration), Step 4 — legacy auth exporter.
 *
 * Reads the current Better Auth tables (Neon/Drizzle) and writes encrypted
 * `MigrationBatch` files that `convex/migrations/authImport.ts` consumes.
 *
 * Scope: users, accounts (password + Google), 2FA. Sessions and verification
 * tokens are deliberately not exported — the import has no shape for them.
 *
 * Usage (dev branch by default, `.env.prod` with NUXT_ENV=prod):
 *   npx tsx scripts/migration/export-auth.ts --out .gate/auth-export \
 *     --email gate-user@example.com
 *   npx tsx scripts/migration/export-auth.ts --out .gate/auth-export --fixtures
 *
 * Needs `MIGRATION_ENCRYPTION_KEY` (32 bytes, base64; `--key-env NAME` to read
 * another variable). Files use the Task 16 bundle format (`crypto.ts`).
 *
 * Read-only against the source database; the only write is the encrypted output.
 */

interface CliOptions {
    out: string;
    emails: string[];
    batchSize: number;
    keyEnv: string;
    fixtures: boolean;
}

const parseArgs = (argv: string[]): CliOptions => {
    const options: CliOptions = {
        out: ".gate/auth-export",
        emails: [],
        batchSize: 200,
        keyEnv: "MIGRATION_ENCRYPTION_KEY",
        fixtures: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--out") {
            options.out = argv[++index] ?? options.out;
        } else if (arg === "--fixtures") {
            // Gate G03–G05 input: only the synthetic accounts, never real users.
            options.fixtures = true;
        } else if (arg === "--email") {
            options.emails.push(...(argv[++index] ?? "").split(",").map((email) => email.trim()).filter(Boolean));
        } else if (arg === "--batch-size") {
            options.batchSize = Number(argv[++index] ?? options.batchSize);
        } else if (arg === "--key-env") {
            options.keyEnv = argv[++index] ?? options.keyEnv;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
};

const chunk = <T>(records: T[], size: number): T[][] => {
    const batches: T[][] = [];
    for (let index = 0; index < records.length; index += size) {
        batches.push(records.slice(index, index + size));
    }
    return batches.length > 0 ? batches : [[]];
};

async function main() {
    config({ path: process.env.NUXT_ENV === "prod" ? ".env.prod" : ".env" });

    const options = parseArgs(process.argv.slice(2));
    // Same key and bundle format as the full export (Task 16): 32 bytes, base64.
    const key = parseMigrationKey(process.env[options.keyEnv]);

    if (options.fixtures) {
        options.emails.push(...fixtureEmails());
    }

    const db = getDB();
    const normalizedEmails = options.emails.map((email) => email.toLowerCase());

    // Better Auth stores mixed-case addresses as typed and looks them up
    // lowercased, so the filter compares lowercased on both sides.
    const users = normalizedEmails.length > 0
        ? await db
            .select()
            .from(schema.user)
            .where(inArray(sql`lower(${schema.user.email})`, normalizedEmails))
        : await db.select().from(schema.user).limit(options.batchSize);

    const userIds = users.map((user) => user.id);

    const accounts = userIds.length > 0
        ? await db.select().from(schema.account).where(inArray(schema.account.userId, userIds))
        : [];

    const twoFactors = userIds.length > 0
        ? await db.select().from(schema.twoFactor).where(inArray(schema.twoFactor.userId, userIds))
        : [];

    const outDir = resolve(options.out);
    await mkdir(outDir, { recursive: true });

    const watermark = new Date().toISOString();
    const tables: Array<{ table: string; records: unknown[] }> = [
        { table: "auth_user", records: users },
        { table: "auth_account", records: accounts },
        { table: "auth_two_factor", records: twoFactors },
    ];

    let files = 0;
    for (const { table, records } of tables) {
        for (const [batchIndex, batchRecords] of chunk(records, options.batchSize).entries()) {
            // JSON round trip first: `Date` columns become ISO strings, which is
            // the wire shape the digest (and the importer) sees.
            const batch = sealBatch({
                table,
                watermark,
                batchIndex,
                records: JSON.parse(JSON.stringify(batchRecords)) as unknown[],
            });

            // Only the batch index, the record count and the digest are logged:
            // hashes and 2FA secrets never reach stdout.
            const file = join(outDir, `${table}.batch-${batchIndex}.enc`);
            await writeFile(file, encryptJson(batch, key), { mode: 0o600 });
            files += 1;
        }
    }

    console.log(JSON.stringify({
        out: outDir,
        files,
        counts: {
            users: users.length,
            accounts: accounts.length,
            twoFactors: twoFactors.length,
        },
    }));
}

main().catch((error: unknown) => {
    console.error(`[export-auth] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
