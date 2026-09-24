import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    importAuthRecordsIdempotently,
    normalizeEmail,
    type AuthImportAdapter,
    type AuthImportBatch,
    type LegacyAuthAccount,
    type LegacyAuthUser,
    type LegacyTwoFactor,
} from "../../convex/migrations/authImport";
import { decryptJson, encryptJson } from "../../scripts/migration/crypto";

/**
 * Task 4 (migration), Step 4: the import orchestration is a pure function over
 * an adapter interface, so its contract — idempotency, natural keys, refusal of
 * orphan records — is tested here without a deployment or a database.
 */
type FakeDoc = { id: string } & Record<string, unknown>;

interface FakeAdapterState {
    users: Map<string, FakeDoc>;
    accounts: Map<string, FakeDoc>;
    twoFactors: Map<string, FakeDoc>;
    createdUsers: Array<Record<string, unknown>>;
    createdAccounts: Array<Record<string, unknown>>;
    createdTwoFactors: Array<Record<string, unknown>>;
    updates: Array<{ model: string; id: string; data: Record<string, unknown> }>;
}

function createFakeAdapter(): { adapter: AuthImportAdapter; state: FakeAdapterState } {
    const state: FakeAdapterState = {
        users: new Map(),
        accounts: new Map(),
        twoFactors: new Map(),
        createdUsers: [],
        createdAccounts: [],
        createdTwoFactors: [],
        updates: [],
    };
    const patch = (map: Map<string, FakeDoc>, model: string, id: string, data: Record<string, unknown>) => {
        for (const doc of map.values()) {
            if (doc.id === id) Object.assign(doc, data);
        }
        state.updates.push({ model, id, data });
    };
    let sequence = 0;
    const nextId = (prefix: string) => `${prefix}_${(sequence += 1)}`;

    return {
        state,
        adapter: {
            async findUserByEmail(email) {
                return state.users.get(email) ?? null;
            },
            async createUser(data) {
                const id = nextId("user");
                const email = String(data.email);
                state.users.set(email, { ...data, id, email });
                state.createdUsers.push({ ...data, id });
                return { id };
            },
            async findAccount({ providerId, accountId }) {
                return state.accounts.get(`${providerId}:${accountId}`) ?? null;
            },
            async createAccount(data) {
                const id = nextId("account");
                state.accounts.set(`${data.providerId}:${data.accountId}`, { ...data, id });
                state.createdAccounts.push({ ...data, id });
                return { id };
            },
            async findTwoFactor(userId) {
                return state.twoFactors.get(userId) ?? null;
            },
            async createTwoFactor(data) {
                const id = nextId("twoFactor");
                state.twoFactors.set(String(data.userId), { ...data, id });
                state.createdTwoFactors.push({ ...data, id });
                return { id };
            },
            async updateUser(id, data) {
                patch(state.users, "user", id, data);
            },
            async updateAccount(id, data) {
                patch(state.accounts, "account", id, data);
            },
            async updateTwoFactor(id, data) {
                patch(state.twoFactors, "twoFactor", id, data);
            },
        },
    };
}

const legacyUser = (overrides: Partial<LegacyAuthUser> = {}): LegacyAuthUser => ({
    id: "legacy-user-1",
    name: "Legacy Person",
    email: "legacy@example.com",
    emailVerified: true,
    image: null,
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-02-03T04:05:06.000Z",
    twoFactorEnabled: false,
    // Columns the Convex component cannot store: they must be reported, not
    // silently dropped.
    role: "superAdmin",
    locale: "it",
    tosAcceptedAt: "2026-01-02T03:04:05.000Z",
    phone: "+39 000",
    bio: "bio",
    timezone: "Europe/Rome",
    creemCustomerId: "creem_1",
    hadTrial: true,
    ...overrides,
});

const legacyAccount = (overrides: Partial<LegacyAuthAccount> = {}): LegacyAuthAccount => ({
    id: "legacy-account-1",
    accountId: "legacy-user-1",
    providerId: "credential",
    userId: "legacy-user-1",
    password: "$scrypt$hash",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    ...overrides,
});

/**
 * Both 2FA columns are `symmetricEncrypt` output in the legacy database (better
 * auth 1.6.15 encrypts the TOTP secret and defaults `storeBackupCodes` to
 * `"encrypted"`), so the fixtures use opaque hex payloads: the import must
 * preserve them byte-for-byte, it can never interpret them.
 */
const legacyTwoFactor = (overrides: Partial<LegacyTwoFactor> = {}): LegacyTwoFactor => ({
    id: "legacy-2fa-1",
    secret: "7f3a91c25b0e4d88aa61f0c3",
    backupCodes: "41b0d97e6c2f8a35e1d4c7ba",
    userId: "legacy-user-1",
    ...overrides,
});

const batch = (overrides: Partial<AuthImportBatch> = {}): AuthImportBatch => ({
    users: [legacyUser()],
    accounts: [legacyAccount()],
    twoFactors: [],
    ...overrides,
});

describe("importAuthRecordsIdempotently", () => {
    it("imports users, password accounts and 2FA rows, preserving hashes and secrets", async () => {
        const { adapter, state } = createFakeAdapter();

        const result = await importAuthRecordsIdempotently(
            adapter,
            batch({ twoFactors: [legacyTwoFactor()] }),
        );

        expect(result.imported).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.detail).toEqual({
            users: { imported: 1, skipped: 0, updated: 0 },
            accounts: { imported: 1, skipped: 0, updated: 0 },
            twoFactors: { imported: 1, skipped: 0, updated: 0 },
        });

        // Credentials survive verbatim; timestamps become epoch ms.
        expect(state.createdUsers[0]).toMatchObject({
            email: "legacy@example.com",
            emailVerified: true,
            createdAt: Date.parse("2026-01-02T03:04:05.000Z"),
            updatedAt: Date.parse("2026-02-03T04:05:06.000Z"),
        });
        expect(state.createdAccounts[0]).toMatchObject({
            providerId: "credential",
            password: "$scrypt$hash",
            userId: "user_1",
        });
        expect(state.createdTwoFactors[0]).toMatchObject({
            secret: "7f3a91c25b0e4d88aa61f0c3",
            backupCodes: "41b0d97e6c2f8a35e1d4c7ba",
            userId: "user_1",
        });
    });

    it("is idempotent: re-importing the same batch writes nothing", async () => {
        const { adapter, state } = createFakeAdapter();
        const payload = batch({ twoFactors: [legacyTwoFactor()] });

        const first = await importAuthRecordsIdempotently(adapter, payload);
        const second = await importAuthRecordsIdempotently(adapter, payload);

        expect(first.imported).toBe(3);
        expect(second.imported).toBe(0);
        expect(second.skipped).toBe(3);
        expect(state.createdUsers).toHaveLength(1);
        expect(state.createdAccounts).toHaveLength(1);
        expect(state.createdTwoFactors).toHaveLength(1);
    });

    it("keys accounts by provider+account id, so a Google row and a password row coexist", async () => {
        const { adapter, state } = createFakeAdapter();

        await importAuthRecordsIdempotently(adapter, batch({
            accounts: [
                legacyAccount(),
                legacyAccount({
                    id: "legacy-account-2",
                    providerId: "google",
                    accountId: "google-sub-1",
                    password: null,
                }),
            ],
        }));

        expect(state.createdAccounts).toHaveLength(2);
        expect(state.accounts.has("credential:legacy-user-1")).toBe(true);
        expect(state.accounts.has("google:google-sub-1")).toBe(true);
    });

    it("normalizes the email to lower case, because Better Auth looks users up that way", async () => {
        const { adapter, state } = createFakeAdapter();

        const result = await importAuthRecordsIdempotently(
            adapter,
            batch({ users: [legacyUser({ email: "Legacy.Person@Example.COM" })], twoFactors: [] }),
        );

        expect(normalizeEmail(" Legacy.Person@Example.COM ")).toBe("legacy.person@example.com");
        expect(result.normalizedEmails).toBe(1);
        expect(state.users.has("legacy.person@example.com")).toBe(true);

        // A second batch carrying the original casing resolves to the same user.
        const second = await importAuthRecordsIdempotently(
            adapter,
            batch({ users: [legacyUser({ email: "Legacy.Person@Example.COM" })], accounts: [], twoFactors: [] }),
        );
        expect(second.skipped).toBe(1);
        expect(state.createdUsers).toHaveLength(1);
    });

    it("reports the legacy profile columns the Convex component cannot store", async () => {
        const { adapter } = createFakeAdapter();

        const result = await importAuthRecordsIdempotently(adapter, batch());

        expect(result.deferredProfileFields).toEqual(
            expect.arrayContaining(["role", "locale", "tosAcceptedAt", "phone", "bio", "timezone"]),
        );
    });

    it("refuses an account whose user is not part of the import instead of orphaning it", async () => {
        const { adapter, state } = createFakeAdapter();

        await expect(
            importAuthRecordsIdempotently(adapter, batch({
                accounts: [legacyAccount({ userId: "missing-user" })],
            })),
        ).rejects.toMatchObject({ data: { code: "UNRESOLVED_AUTH_RECORD_USER", model: "account" } });

        expect(state.createdAccounts).toHaveLength(0);
    });

    it("refuses a 2FA row without a resolvable user", async () => {
        const { adapter } = createFakeAdapter();

        await expect(
            importAuthRecordsIdempotently(adapter, batch({
                twoFactors: [legacyTwoFactor({ userId: "missing-user" })],
            })),
        ).rejects.toMatchObject({ data: { code: "UNRESOLVED_AUTH_RECORD_USER", model: "twoFactor" } });
    });

    it("rejects malformed records before writing anything", async () => {
        const { adapter, state } = createFakeAdapter();

        await expect(
            importAuthRecordsIdempotently(adapter, batch({
                users: [legacyUser({ email: "" })],
            })),
        ).rejects.toMatchObject({ data: { code: "INVALID_AUTH_IMPORT_RECORD", model: "user" } });

        expect(state.createdUsers).toHaveLength(0);
    });
});

describe("importAuthRecordsIdempotently — upsert (Task 16 delta)", () => {
    it("default mode never rewrites an existing credential, even a changed one", async () => {
        const { adapter, state } = createFakeAdapter();
        await importAuthRecordsIdempotently(adapter, batch());

        const replay = await importAuthRecordsIdempotently(adapter, batch({
            accounts: [legacyAccount({ password: "$scrypt$new-hash" })],
        }));

        expect(replay.imported).toBe(0);
        expect(replay.updated).toBe(0);
        expect(state.updates).toHaveLength(0);
    });

    it("upsert carries a password changed after the full import", async () => {
        const { adapter, state } = createFakeAdapter();
        await importAuthRecordsIdempotently(adapter, batch());

        const delta = await importAuthRecordsIdempotently(
            adapter,
            batch({ accounts: [legacyAccount({ password: "$scrypt$new-hash" })] }),
            { mode: "upsert" },
        );

        expect(delta.updated).toBe(1);
        expect(delta.detail.accounts).toEqual({ imported: 0, skipped: 0, updated: 1 });
        expect(state.updates).toEqual([
            { model: "account", id: expect.any(String), data: { password: "$scrypt$new-hash" } },
        ]);
    });

    it("upsert carries a user profile and a 2FA rotation, and only the changed columns", async () => {
        const { adapter, state } = createFakeAdapter();
        await importAuthRecordsIdempotently(adapter, batch({ twoFactors: [legacyTwoFactor()] }));

        const delta = await importAuthRecordsIdempotently(
            adapter,
            batch({
                users: [legacyUser({ name: "Renamed", twoFactorEnabled: true })],
                twoFactors: [legacyTwoFactor({ backupCodes: "99aa" })],
            }),
            { mode: "upsert" },
        );

        expect(delta.detail.users.updated).toBe(1);
        expect(delta.detail.twoFactors.updated).toBe(1);
        expect(state.updates.map((update) => [update.model, Object.keys(update.data).sort()])).toEqual([
            ["user", ["name", "twoFactorEnabled"]],
            ["twoFactor", ["backupCodes"]],
        ]);
    });

    it("an unchanged upsert replay writes nothing", async () => {
        const { adapter, state } = createFakeAdapter();
        await importAuthRecordsIdempotently(adapter, batch({ twoFactors: [legacyTwoFactor()] }));

        const replay = await importAuthRecordsIdempotently(
            adapter,
            batch({ twoFactors: [legacyTwoFactor()] }),
            { mode: "upsert" },
        );

        expect(replay.updated).toBe(0);
        expect(replay.skipped).toBe(3);
        expect(state.updates).toHaveLength(0);
    });
});

describe("encrypted migration batches", () => {
    // The envelope moved to the Task 16 bundle format (`crypto.test.ts` pins
    // it); this case keeps the credential-specific guarantee next to the import.
    const key = randomBytes(32);

    it("round-trips a credential batch and leaves no secret in the file", () => {
        const payload = batch({ twoFactors: [legacyTwoFactor()] });
        const bundle = encryptJson(payload, key);
        const asText = bundle.toString("latin1");

        expect(asText).not.toContain("$scrypt$hash");
        expect(asText).not.toContain("7f3a91c25b0e4d88aa61f0c3");
        // JSON is the transport format: `Date` values arrive as ISO strings and
        // `toEpochMs` handles both, so equality is asserted on the wire shape.
        expect(decryptJson<AuthImportBatch>(bundle, key)).toEqual(JSON.parse(JSON.stringify(payload)));
    });

    it("fails to decrypt with the wrong key or a tampered ciphertext", () => {
        const bundle = encryptJson(batch(), key);

        expect(() => decryptJson(bundle, randomBytes(32))).toThrow();

        const tampered = Buffer.from(bundle);
        tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
        expect(() => decryptJson(tampered, key)).toThrow();
    });
});
