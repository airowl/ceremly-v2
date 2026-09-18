import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptJson, parseEncryptedEnvelope, sha256Hex } from "../../scripts/migration/crypto";
import { AUTH_FIXTURES, GATE_TOTP_SECRET, type AuthFixture } from "../../scripts/migration/auth-fixtures";
import { generateTotp } from "./totp";

/**
 * Gates G03–G05 (plan Task 4, Step 5): real credential migration, verified
 * against the staging Convex deployment.
 *
 * The chain under test is the production one, only with synthetic accounts:
 *   legacy Neon rows → encrypted MigrationBatch export → internal import →
 *   sign-in on Convex Better Auth.
 *
 * Prerequisites (armed with `G03_GATE=live`, see `pnpm test:gate:g03-g05`):
 *   npx tsx scripts/migration/seed-auth-fixture.ts
 *   npx tsx scripts/migration/export-auth.ts --out .gate/auth-export --email <fixtures>
 *
 * Sessions and verification tokens are deliberately never imported: every
 * scenario below logs out, asserts the session is gone, and logs in again.
 */
const armed = process.env.G03_GATE === "live";
const siteUrl = (process.env.CONVEX_GATE_SITE_URL ?? process.env.NUXT_PUBLIC_CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
const deploymentUrl = (process.env.CONVEX_GATE_URL ?? process.env.NUXT_PUBLIC_CONVEX_URL ?? "").replace(/\/+$/, "");
const exportDir = process.env.G03_EXPORT_DIR ?? ".gate/auth-export";
// Browser-facing origin: Better Auth validates `Origin` against the deployment's
// `SITE_URL` (the Nuxt origin), not against its own `.convex.site` host.
const appOrigin = (process.env.G03_APP_ORIGIN ?? process.env.NUXT_PUBLIC_BASE_URL ?? "")
    .trim()
    .split(/\s+/)[0]!;
const migrationKey = process.env.NUXT_MIGRATION_API_KEY ?? "";
const exportKey = process.env.NUXT_MIGRATION_EXPORT_KEY ?? "";

const fixtureOf = (gate: AuthFixture["gate"]): AuthFixture => {
    const fixture = AUTH_FIXTURES.find((candidate) => candidate.gate === gate);
    if (!fixture) throw new Error(`Missing ${gate} fixture`);
    return fixture;
};

interface ImportBatch<T> {
    version: string;
    table: string;
    watermark: string;
    batchIndex: number;
    records: T[];
    sha256: string;
}

/** Reads and decrypts every batch of a table, verifying each digest. */
function readBatches<T>(table: string): T[] {
    const files = readdirSync(exportDir)
        .filter((file) => file.startsWith(`${table}.batch-`) && file.endsWith(".json.enc"))
        .sort();

    if (files.length === 0) {
        throw new Error(`No encrypted batch for ${table} in ${exportDir}`);
    }

    return files.flatMap((file) => {
        const envelope = parseEncryptedEnvelope(readFileSync(join(exportDir, file), "utf8"));
        const batch = decryptJson<ImportBatch<T>>(envelope, exportKey);

        if (sha256Hex(batch.records) !== batch.sha256) {
            throw new Error(`Batch digest mismatch for ${file}: the payload was tampered with`);
        }

        return batch.records;
    });
}

interface ImportResult {
    imported: number;
    skipped: number;
    detail: Record<string, { imported: number; skipped: number }>;
    deferredProfileFields: string[];
    normalizedEmails: number;
}

/** Runs the import through the CLI, the only path to an `internalMutation`. */
function runImport(payload: unknown): ImportResult {
    const stdout = execFileSync(
        "npx",
        [
            "--no-install",
            "convex",
            "run",
            "migrations/authImport:importBatch",
            JSON.stringify(payload),
        ],
        { encoding: "utf8", cwd: process.cwd() },
    );

    // `convex run` prints the function result as pretty-printed JSON after its
    // own banner lines, so the payload starts at the first line holding `{`.
    const start = stdout.split("\n").findIndex((line) => line.trim() === "{");
    if (start === -1) {
        throw new Error(`convex run produced no JSON result:\n${stdout}`);
    }

    return JSON.parse(stdout.split("\n").slice(start).join("\n")) as ImportResult;
}

class CookieJar {
    private readonly jar = new Map<string, string>();

    absorb(response: Response): void {
        for (const cookie of response.headers.getSetCookie()) {
            const separator = cookie.indexOf("=");
            if (separator === -1) continue;

            const name = cookie.slice(0, separator).trim();
            const value = cookie.slice(separator + 1).split(";")[0]!.trim();

            if (!value || /max-age=0/i.test(cookie)) {
                this.jar.delete(name);
            } else {
                this.jar.set(name, value);
            }
        }
    }

    header(): Record<string, string> {
        if (this.jar.size === 0) return {};
        return { cookie: [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ") };
    }

    names(): string[] {
        return [...this.jar.keys()];
    }
}

interface AuthCall {
    status: number;
    data: unknown;
    cookies: string[];
}

async function authCall(
    path: string,
    options: { method?: string; body?: unknown; jar?: CookieJar } = {},
): Promise<AuthCall> {
    const method = options.method ?? "GET";
    const response = await fetch(`${siteUrl}${path}`, {
        method,
        headers: {
            // A browser always sends Origin, and Better Auth validates it against
            // `trustedOrigins` whenever a cookie is present (or the CSRF check is
            // forced). Sending it here is what the Nuxt proxy does in production
            // too: it copies request headers verbatim.
            origin: appOrigin,
            ...(method === "GET" ? {} : { "content-type": "application/json" }),
            ...options.jar?.header(),
        },
        // Better Auth rejects an untyped POST with 415, so every write carries a
        // JSON body (an empty object when the endpoint takes no fields).
        body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
        redirect: "manual",
    });

    const cookies = response.headers.getSetCookie();
    options.jar?.absorb(response);

    const text = await response.text();

    return {
        status: response.status,
        data: text.length > 0 ? JSON.parse(text) : null,
        cookies,
    };
}

const signIn = (fixture: AuthFixture, jar: CookieJar, password = fixture.password) =>
    authCall("/api/auth/sign-in/email", {
        method: "POST",
        body: { email: fixture.email, password },
        jar,
    });

describe.skipIf(!armed)("G03–G05 live · legacy credentials on Convex Better Auth", () => {
    let importResult: ImportResult;
    let secondImport: ImportResult;
    let totalRecords = 0;

    beforeAll(() => {
        expect(siteUrl).toMatch(/\.convex\.site$/);
        expect(appOrigin).toMatch(/^https?:\/\//);
        expect(migrationKey).not.toBe("");
        expect(exportKey).not.toBe("");
        expect(existsSync(exportDir)).toBe(true);

        const users = readBatches<Record<string, unknown>>("auth_user");
        const accounts = readBatches<Record<string, unknown>>("auth_account");
        const twoFactors = readBatches<Record<string, unknown>>("auth_two_factor");

        expect(users).toHaveLength(AUTH_FIXTURES.length);
        totalRecords = users.length + accounts.length + twoFactors.length;

        const payload = { migrationKey, users, accounts, twoFactors };
        importResult = runImport(payload);
        // Second identical run is the idempotency proof (plan Task 4 Step 4).
        secondImport = runImport(payload);
    }, 180_000);

    it("accounts for every record once and never writes on a replay", () => {
        const imported = importResult.imported + importResult.skipped;

        // Re-runnable by design: on a fresh deployment the first run imports
        // everything, on a warm one it skips everything. Either way the batch is
        // fully accounted for and the replay writes nothing.
        expect(imported).toBe(totalRecords);
        expect(secondImport.imported).toBe(0);
        expect(secondImport.skipped).toBe(totalRecords);
        expect(importResult.detail.users.imported + importResult.detail.users.skipped)
            .toBe(AUTH_FIXTURES.length);
        // Profile columns the component cannot store are reported, never silent.
        expect(importResult.deferredProfileFields).toEqual(
            expect.arrayContaining(["role", "locale", "tosAcceptedAt", "phone", "bio", "timezone"]),
        );
    });

    it("G03: the imported password hash authenticates with the original password", async () => {
        const fixture = fixtureOf("G03");
        const jar = new CookieJar();

        // Negative control: the import must not have loosened verification.
        const rejected = await signIn(fixture, jar, "not-the-password");
        expect(rejected.status).toBe(401);
        expect(jar.names()).toHaveLength(0);

        const signedIn = await signIn(fixture, jar);
        expect(signedIn.status).toBe(200);
        expect(signedIn.data).toMatchObject({ user: { email: fixture.email, emailVerified: true } });

        const session = await authCall("/api/auth/get-session", { jar });
        expect(session.status).toBe(200);
        expect(session.data).toMatchObject({ session: { id: expect.any(String) }, user: { email: fixture.email } });

        // Logout invalidates the session for real…
        const signedOut = await authCall("/api/auth/sign-out", { method: "POST", jar });
        expect(signedOut.status).toBe(200);

        const afterSignOut = await authCall("/api/auth/get-session", { jar });
        expect(afterSignOut.data).toBeNull();

        // …and a fresh login with the same password still works afterwards.
        const again = await signIn(fixture, new CookieJar());
        expect(again.status).toBe(200);
    }, 60_000);

    it("issues a Convex JWT accepted as an identity by the deployment", async () => {
        const jar = new CookieJar();
        await signIn(fixtureOf("G03"), jar);

        const token = await authCall("/api/auth/convex/token", { jar });
        expect(token.status).toBe(200);
        const jwt = (token.data as { token?: string } | null)?.token;
        expect(typeof jwt).toBe("string");

        const identity = await fetch(`${deploymentUrl}/api/query`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
            body: JSON.stringify({ path: "health:whoami", args: {}, format: "json" }),
        });

        expect(identity.status).toBe(200);
        const payload = (await identity.json()) as { value?: { subject?: string; issuer?: string } };
        expect(payload.value?.subject).toEqual(expect.any(String));
        expect(payload.value?.issuer).toBe(siteUrl);
    }, 60_000);

    it("G04: the Google account row survives the import, on the same user (no duplicate)", async () => {
        const fixture = fixtureOf("G04");
        const jar = new CookieJar();
        await signIn(fixture, jar);

        const accounts = await authCall("/api/auth/list-accounts", { jar });
        expect(accounts.status).toBe(200);

        const rows = (accounts.data as Array<{ providerId: string; accountId: string; userId: string }>) ?? [];
        const credential = rows.find((row) => row.providerId === "credential");
        const google = rows.find((row) => row.providerId === "google");

        expect(credential).toBeDefined();
        expect(google?.accountId).toBe(fixture.google?.accountId);
        // Same `userId` means the social identity is linked to the imported
        // account, not to a second user created for the same email address.
        expect(google?.userId).toBe(credential?.userId);

        // Blocked for the gate: the OAuth round trip itself needs a real Google
        // browser consent, so `G04` stays NOT_RUN until the minimized production
        // copy and a staging Google client are available.
    }, 60_000);

    it("G05: the imported TOTP secret validates an independently computed code", async () => {
        const fixture = fixtureOf("G05");
        const jar = new CookieJar();

        const signedIn = await signIn(fixture, jar);
        expect(signedIn.status).toBe(200);
        expect(signedIn.data).toMatchObject({ twoFactorRedirect: true });
        expect((signedIn.data as { twoFactorMethods?: string[] }).twoFactorMethods).toContain("totp");

        // Better Auth only redirects to 2FA because the imported user row still
        // carries `twoFactorEnabled: true` and a 2FA row exists.
        const factorCookie = jar.names().find((name) => name.includes("two_factor"));
        expect(factorCookie).toBeDefined();

        const verification = await authCall("/api/auth/two-factor/verify-totp", {
            method: "POST",
            body: { code: generateTotp(GATE_TOTP_SECRET) },
            jar,
        });
        expect(verification.status).toBe(200);

        const session = await authCall("/api/auth/get-session", { jar });
        expect(session.data).toMatchObject({ user: { email: fixture.email, twoFactorEnabled: true } });

        // Logout: the 2FA step must be repeatable from scratch.
        await authCall("/api/auth/sign-out", { method: "POST", jar });
    }, 60_000);

    it("G05: a backup code is consumed exactly once and recovery survives", async () => {
        const fixture = fixtureOf("G05");

        // 1. Full session for the imported account: password + imported TOTP.
        const sessionJar = new CookieJar();
        const signedIn = await signIn(fixture, sessionJar);
        expect(signedIn.data).toMatchObject({ twoFactorRedirect: true });

        const totp = await authCall("/api/auth/two-factor/verify-totp", {
            method: "POST",
            body: { code: generateTotp(GATE_TOTP_SECRET) },
            jar: sessionJar,
        });
        expect(totp.status).toBe(200);

        // 2. Fresh codes for this run.
        //
        // The imported backup-code column is an opaque `symmetricEncrypt` blob
        // (its preservation is asserted byte-for-byte in auth-import.test.ts),
        // and a previous run consumes the plaintext of the imported set. Rather
        // than making the suite pass only on a clean deployment, the gate asks
        // the product for a new set through its own endpoint — which is itself
        // part of the 2FA surface being migrated.
        const generated = await authCall("/api/auth/two-factor/generate-backup-codes", {
            method: "POST",
            body: { password: fixture.password },
            jar: sessionJar,
        });
        expect(generated.status).toBe(200);

        const codes = (generated.data as { backupCodes?: string[] } | null)?.backupCodes ?? [];
        expect(codes.length).toBeGreaterThanOrEqual(3);
        const [firstCode, secondCode] = codes;

        // 3. Consumption, replay and recovery, each from a clean challenge.
        const startFlow = async () => {
            const jar = new CookieJar();
            const challenge = await signIn(fixture, jar);
            expect(challenge.data).toMatchObject({ twoFactorRedirect: true });
            return jar;
        };

        const consume = (jar: CookieJar, code: string) =>
            authCall("/api/auth/two-factor/verify-backup-code", {
                method: "POST",
                body: { code },
                jar,
            });

        const first = await consume(await startFlow(), firstCode!);
        expect(first.status).toBe(200);

        // Same code, second time: already consumed.
        const replay = await consume(await startFlow(), firstCode!);
        expect(replay.status).toBeGreaterThanOrEqual(400);

        // Recovery is still possible with an untouched code.
        const recovery = await consume(await startFlow(), secondCode!);
        expect(recovery.status).toBe(200);
    }, 90_000);
});
