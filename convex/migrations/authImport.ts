import { ConvexError, v } from "convex/values";
import type { DBAdapter } from "better-auth/adapters";
import type { BetterAuthOptions } from "better-auth/minimal";
import { internalMutation } from "../_generated/server";
import { normalizeEmail } from "../lib/identity";
import { writeAudit } from "../lib/audit";
import { assertMigrationKey } from "../lib/migrationKey";
import { authComponent, createAuth } from "../auth";

// Task 4 (migration), Step 4: idempotent import of the legacy Better Auth
// credentials into the Convex Better Auth component.
//
// Scope, by construction of the batch shape: users, accounts and 2FA only.
// Sessions and verification tokens are never imported — there is no field for
// them, so it is impossible to add one by accident (plan global constraint).

export interface LegacyAuthUser {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    createdAt: number | string | Date;
    updatedAt: number | string | Date;
    twoFactorEnabled?: boolean | null;
    [key: string]: unknown;
}

export interface LegacyAuthAccount {
    id: string;
    accountId: string;
    providerId: string;
    userId: string;
    password?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    idToken?: string | null;
    accessTokenExpiresAt?: number | string | Date | null;
    refreshTokenExpiresAt?: number | string | Date | null;
    scope?: string | null;
    createdAt: number | string | Date;
    updatedAt: number | string | Date;
}

export interface LegacyTwoFactor {
    id: string;
    secret: string;
    backupCodes: string;
    userId: string;
}

export interface AuthImportBatch {
    users: LegacyAuthUser[];
    accounts: LegacyAuthAccount[];
    twoFactors: LegacyTwoFactor[];
}

/** A stored component document: its id plus whatever columns it holds. */
export type StoredAuthDoc = { id: string } & Record<string, unknown>;

/**
 * The slice of the Better Auth adapter the import needs, so the orchestration
 * is a pure function over an interface and can be tested without a deployment.
 *
 * The `update*` methods are only called in `upsert` mode (Task 16 delta).
 */
export interface AuthImportAdapter {
    findUserByEmail(email: string): Promise<StoredAuthDoc | null>;
    createUser(data: Record<string, unknown>): Promise<{ id: string }>;
    findAccount(args: { providerId: string; accountId: string }): Promise<StoredAuthDoc | null>;
    createAccount(data: Record<string, unknown>): Promise<{ id: string }>;
    findTwoFactor(userId: string): Promise<StoredAuthDoc | null>;
    createTwoFactor(data: Record<string, unknown>): Promise<{ id: string }>;
    updateUser?(id: string, data: Record<string, unknown>): Promise<void>;
    updateAccount?(id: string, data: Record<string, unknown>): Promise<void>;
    updateTwoFactor?(id: string, data: Record<string, unknown>): Promise<void>;
}

/**
 * `insert` (default): an existing natural key is left untouched — the Task 4
 * contract, and what makes a replay write nothing.
 * `upsert` (Task 16 delta): an existing record whose imported columns changed in
 * the source since the full import is updated, column by column. Without it a
 * password changed (or a 2FA rotated) between the full import and the cutover
 * would silently keep its old value on the new stack.
 */
export type AuthImportMode = "insert" | "upsert";

interface AuthImportCounts {
    imported: number;
    skipped: number;
    updated: number;
}

export interface AuthImportResult {
    /** Records written on this run. */
    imported: number;
    /** Records left untouched because the same natural key already existed. */
    skipped: number;
    /** Existing records whose changed columns were rewritten (`upsert` only). */
    updated: number;
    detail: {
        users: AuthImportCounts;
        accounts: AuthImportCounts;
        twoFactors: AuthImportCounts;
    };
    /**
     * Legacy user columns the Better Auth component cannot store (its table has
     * a fixed schema). They are owned by the app domain tables (plan Tasks 5,
     * 10, 12) — listed here so the loss is explicit, never silent.
     */
    deferredProfileFields: string[];
    /** Emails whose casing had to be normalized (see `normalizeEmail`). */
    normalizedEmails: number;
}

/**
 * Better Auth looks users up with `email.toLowerCase()`
 * (`db/internal-adapter.mjs` → `findUserByEmail`), and lowercases on sign-up.
 * An imported mixed-case address would therefore be unreachable at sign-in, so
 * the import normalizes it and reports how many addresses it touched.
 *
 * The implementation moved to `lib/identity` in Task 5, where the organization
 * domain needs the same rule; it is re-exported here so the import contract (and
 * the test that pins it) stays where it was.
 */
export { normalizeEmail };

const toEpochMs = (value: number | string | Date | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    if (value instanceof Date) return value.getTime();

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;

/** Epoch ms or `null`: the comparable form of an optional date column. */
const optionalEpoch = (value: unknown): number | null =>
    value === null || value === undefined || value === ""
        ? null
        : toEpochMs(value as number | string | Date);

/**
 * The columns of `desired` whose value differs from `stored`. Dates are compared
 * as epoch ms (the component may hand back a `Date` for a column written as a
 * number), everything else by value with `undefined` ≡ `null`.
 */
function changedColumns(
    stored: Record<string, unknown>,
    desired: Record<string, unknown>,
    dateColumns: readonly string[] = [],
): Record<string, unknown> {
    const changed: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(desired)) {
        const before = dateColumns.includes(column) ? optionalEpoch(stored[column]) : (stored[column] ?? null);
        const after = dateColumns.includes(column) ? optionalEpoch(value) : (value ?? null);
        if (before !== after) changed[column] = value;
    }
    return changed;
}

const PROFILE_FIELDS_DEFERRED_TO_APP_TABLES = [
    "role",
    "banned",
    "banReason",
    "banExpires",
    "creemCustomerId",
    "hadTrial",
    "locale",
    "tosAcceptedAt",
    "phone",
    "bio",
    "timezone",
] as const;

function assertUserRecord(record: LegacyAuthUser, index: number): void {
    if (!record?.id || !record.email || !record.name) {
        throw new ConvexError({
            code: "INVALID_AUTH_IMPORT_RECORD",
            model: "user",
            index,
        });
    }
}

function assertAccountRecord(record: LegacyAuthAccount, index: number): void {
    if (!record?.id || !record.providerId || !record.accountId || !record.userId) {
        throw new ConvexError({
            code: "INVALID_AUTH_IMPORT_RECORD",
            model: "account",
            index,
        });
    }
}

function assertTwoFactorRecord(record: LegacyTwoFactor, index: number): void {
    if (!record?.id || !record.secret || !record.backupCodes || !record.userId) {
        throw new ConvexError({
            code: "INVALID_AUTH_IMPORT_RECORD",
            model: "twoFactor",
            index,
        });
    }
}

/**
 * Writes the legacy credentials, keyed by the natural keys Better Auth itself
 * enforces: user email (unique), account `(providerId, accountId)` and one 2FA
 * row per user. Re-running the same batch is a no-op, and a partial batch
 * resumes rather than duplicating.
 */
export async function importAuthRecordsIdempotently(
    adapter: AuthImportAdapter,
    batch: AuthImportBatch,
    options: { mode?: AuthImportMode } = {},
): Promise<AuthImportResult> {
    const upsert = options.mode === "upsert";
    const result: AuthImportResult = {
        imported: 0,
        skipped: 0,
        updated: 0,
        detail: {
            users: { imported: 0, skipped: 0, updated: 0 },
            accounts: { imported: 0, skipped: 0, updated: 0 },
            twoFactors: { imported: 0, skipped: 0, updated: 0 },
        },
        deferredProfileFields: [...PROFILE_FIELDS_DEFERRED_TO_APP_TABLES],
        normalizedEmails: 0,
    };

    // legacy user id -> Better Auth (Convex document) id
    const userIds = new Map<string, string>();

    /**
     * An existing record: skipped, or — in `upsert` mode, when an imported
     * column changed — updated with exactly the changed columns.
     */
    const reconcileExisting = async (
        model: keyof AuthImportResult["detail"],
        existing: StoredAuthDoc,
        desired: Record<string, unknown>,
        update: ((id: string, data: Record<string, unknown>) => Promise<void>) | undefined,
        dateColumns: readonly string[] = [],
    ): Promise<void> => {
        const changed = upsert ? changedColumns(existing, desired, dateColumns) : {};

        if (Object.keys(changed).length === 0) {
            result.skipped += 1;
            result.detail[model].skipped += 1;
            return;
        }
        if (!update) {
            throw new ConvexError({ code: "AUTH_IMPORT_UPSERT_UNSUPPORTED", model });
        }

        await update(existing.id, changed);
        result.updated += 1;
        result.detail[model].updated += 1;
    };

    for (const [index, record] of batch.users.entries()) {
        assertUserRecord(record, index);

        const email = normalizeEmail(record.email);
        if (email !== record.email) {
            result.normalizedEmails += 1;
        }

        const existing = await adapter.findUserByEmail(email);
        if (existing) {
            userIds.set(record.id, existing.id);
            await reconcileExisting(
                "users",
                existing,
                {
                    name: record.name,
                    emailVerified: Boolean(record.emailVerified),
                    image: nullable(record.image),
                    twoFactorEnabled: record.twoFactorEnabled ?? null,
                },
                adapter.updateUser?.bind(adapter),
            );
            continue;
        }

        const created = await adapter.createUser({
            name: record.name,
            email,
            emailVerified: Boolean(record.emailVerified),
            image: nullable(record.image),
            createdAt: toEpochMs(record.createdAt),
            updatedAt: toEpochMs(record.updatedAt),
            twoFactorEnabled: record.twoFactorEnabled ?? null,
        });

        userIds.set(record.id, created.id);
        result.imported += 1;
        result.detail.users.imported += 1;
    }

    const resolveUserId = async (legacyUserId: string, model: string, index: number) => {
        const mapped = userIds.get(legacyUserId);
        if (mapped) return mapped;

        // Cross-batch case: the user arrived in an earlier batch. The legacy id
        // is not stored on the component user table, so a record whose user is
        // unknown is a hard error rather than an orphan write.
        throw new ConvexError({
            code: "UNRESOLVED_AUTH_RECORD_USER",
            model,
            index,
            legacyUserId,
        });
    };

    for (const [index, record] of batch.accounts.entries()) {
        assertAccountRecord(record, index);

        const existing = await adapter.findAccount({
            providerId: record.providerId,
            accountId: record.accountId,
        });
        if (existing) {
            await reconcileExisting(
                "accounts",
                existing,
                {
                    password: nullable(record.password),
                    accessToken: nullable(record.accessToken),
                    refreshToken: nullable(record.refreshToken),
                    idToken: nullable(record.idToken),
                    accessTokenExpiresAt: optionalEpoch(record.accessTokenExpiresAt),
                    refreshTokenExpiresAt: optionalEpoch(record.refreshTokenExpiresAt),
                    scope: nullable(record.scope),
                },
                adapter.updateAccount?.bind(adapter),
                ["accessTokenExpiresAt", "refreshTokenExpiresAt"],
            );
            continue;
        }

        await adapter.createAccount({
            accountId: record.accountId,
            providerId: record.providerId,
            userId: await resolveUserId(record.userId, "account", index),
            password: nullable(record.password),
            accessToken: nullable(record.accessToken),
            refreshToken: nullable(record.refreshToken),
            idToken: nullable(record.idToken),
            accessTokenExpiresAt: record.accessTokenExpiresAt
                ? toEpochMs(record.accessTokenExpiresAt)
                : null,
            refreshTokenExpiresAt: record.refreshTokenExpiresAt
                ? toEpochMs(record.refreshTokenExpiresAt)
                : null,
            scope: nullable(record.scope),
            createdAt: toEpochMs(record.createdAt),
            updatedAt: toEpochMs(record.updatedAt),
        });

        result.imported += 1;
        result.detail.accounts.imported += 1;
    }

    for (const [index, record] of batch.twoFactors.entries()) {
        assertTwoFactorRecord(record, index);

        const userId = await resolveUserId(record.userId, "twoFactor", index);
        const existing = await adapter.findTwoFactor(userId);
        if (existing) {
            await reconcileExisting(
                "twoFactors",
                existing,
                { secret: record.secret, backupCodes: record.backupCodes },
                adapter.updateTwoFactor?.bind(adapter),
            );
            continue;
        }

        await adapter.createTwoFactor({
            secret: record.secret,
            backupCodes: record.backupCodes,
            userId,
        });

        result.imported += 1;
        result.detail.twoFactors.imported += 1;
    }

    return result;
}

/** Bridge the pure import onto the component's Better Auth adapter. */
export function createAdapterBridge(adapter: DBAdapter): AuthImportAdapter {
    // The component adapter returns `any`/`unknown` depending on the call, so
    // the id is read defensively and a missing id becomes a hard error at the
    // call site instead of a silent `undefined` in the records.
    const readId = (doc: unknown): string | null => {
        const id = (doc as { id?: unknown } | null | undefined)?.id;
        return id === undefined || id === null ? null : String(id);
    };
    const stored = (doc: unknown): StoredAuthDoc | null => {
        const id = readId(doc);
        return id ? { ...(doc as Record<string, unknown>), id } : null;
    };
    const update = async (model: string, id: string, data: Record<string, unknown>) => {
        await adapter.update({ model, where: [{ field: "id", value: id }], update: data });
    };

    return {
        async findUserByEmail(email) {
            // The Convex adapter rejects `mode: "insensitive"`, so the caller
            // normalizes the address (see `normalizeEmail`).
            const doc = await adapter.findOne({
                model: "user",
                where: [{ field: "email", value: email }],
            });
            return stored(doc);
        },
        async createUser(data) {
            const doc = await adapter.create({ model: "user", data });
            const id = readId(doc);
            if (!id) throw new Error("Better Auth did not return an id for the imported user");
            return { id };
        },
        async findAccount({ providerId, accountId }) {
            const doc = await adapter.findOne({
                model: "account",
                where: [
                    { field: "providerId", value: providerId },
                    { field: "accountId", value: accountId },
                ],
            });
            return stored(doc);
        },
        async createAccount(data) {
            const doc = await adapter.create({ model: "account", data });
            const id = readId(doc);
            if (!id) throw new Error("Better Auth did not return an id for the imported account");
            return { id };
        },
        async findTwoFactor(userId) {
            const doc = await adapter.findOne({
                model: "twoFactor",
                where: [{ field: "userId", value: userId }],
            });
            return stored(doc);
        },
        async createTwoFactor(data) {
            const doc = await adapter.create({ model: "twoFactor", data });
            const id = readId(doc);
            if (!id) throw new Error("Better Auth did not return an id for the imported 2FA record");
            return { id };
        },
        async updateUser(id, data) {
            await update("user", id, data);
        },
        async updateAccount(id, data) {
            await update("account", id, data);
        },
        async updateTwoFactor(id, data) {
            await update("twoFactor", id, data);
        },
    };
}

/**
 * `internal.migrations.authImport.importBatch` — the only way credentials enter
 * this deployment. Arguments are plain records so the export script can stream
 * `MigrationBatch` payloads without knowing Better Auth's types.
 */
export const importBatch = internalMutation({
    args: {
        migrationKey: v.string(),
        users: v.array(v.any()),
        accounts: v.array(v.any()),
        twoFactors: v.array(v.any()),
        mode: v.optional(v.union(v.literal("insert"), v.literal("upsert"))),
    },
    handler: async (ctx, args): Promise<AuthImportResult> => {
        assertMigrationKey(args.migrationKey);

        const auth = createAuth(ctx);
        const adapter = authComponent.adapter(ctx)(auth.options as BetterAuthOptions);

        const result = await importAuthRecordsIdempotently(createAdapterBridge(adapter), {
            users: args.users as LegacyAuthUser[],
            accounts: args.accounts as LegacyAuthAccount[],
            twoFactors: args.twoFactors as LegacyTwoFactor[],
        }, { mode: args.mode ?? "insert" });

        // Counts only: no address, no hash, no secret in the audit trail.
        await writeAudit(ctx, {
            action: "admin.migration_auth_imported",
            targetType: "migrationBatch",
            targetId: "auth",
            details: {
                mode: args.mode ?? "insert",
                users: args.users.length,
                accounts: args.accounts.length,
                twoFactors: args.twoFactors.length,
                imported: result.imported,
                skipped: result.skipped,
                updated: result.updated,
                normalizedEmails: result.normalizedEmails,
            },
        });

        return result;
    },
});
