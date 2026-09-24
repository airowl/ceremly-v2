import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { internalQuery } from "../_generated/server";
import { sha256Hex } from "../lib/bridgeHmac";
import { isDomainImportTable } from "../lib/domainBatchDigest";
import { assertMigrationKey } from "../lib/migrationKey";

/**
 * Target side of the reconciliation (plan Task 16, Step 4).
 *
 * `scripts/migration/reconcile.ts` compares the legacy source with what the
 * import wrote. These two read-only queries are how it reads the target: a page
 * of **migrated** rows of one domain table (the ones carrying a `legacyId`, so a
 * row the new stack created on its own is never in scope), and a page of the
 * Better Auth component's tables with every credential replaced by its SHA-256.
 *
 * The credential digests are computed here, inside the deployment, on purpose:
 * the comparison needs to know that a password hash, a TOTP secret or a backup
 * code blob survived byte for byte, and it can do that without the target ever
 * handing the secret itself to the machine running the reconciliation.
 */

const MAX_PAGE = 500;

const pageSize = (requested: number): number =>
    Math.max(1, Math.min(MAX_PAGE, Math.floor(requested)));

interface DynamicRangeQuery {
    withIndex(
        index: string,
        range: (q: { gte(field: string, value: unknown): unknown }) => unknown,
    ): {
        paginate(options: { cursor: string | null; numItems: number }): Promise<{
            page: Record<string, unknown>[];
            isDone: boolean;
            continueCursor: string;
        }>;
    };
}

export const tablePage = internalQuery({
    args: {
        migrationKey: v.string(),
        table: v.string(),
        cursor: v.union(v.string(), v.null()),
        numItems: v.number(),
    },
    handler: async (ctx, args) => {
        assertMigrationKey(args.migrationKey);

        if (!isDomainImportTable(args.table)) {
            throw new ConvexError({ code: "UNKNOWN_IMPORT_TABLE", table: args.table });
        }

        // `legacyId >= ""` is exactly "has a legacy id": an absent optional
        // field sorts before every string in a Convex index.
        const result = await (ctx.db.query(args.table) as unknown as DynamicRangeQuery)
            .withIndex("by_legacy_id", (q) => q.gte("legacyId", ""))
            .paginate({ cursor: args.cursor, numItems: pageSize(args.numItems) });

        return {
            page: result.page,
            isDone: result.isDone,
            continueCursor: result.continueCursor,
        };
    },
});

const digestOrNull = async (value: unknown): Promise<string | null> =>
    typeof value === "string" && value.length > 0 ? await sha256Hex(value) : null;

const idOf = (doc: Record<string, unknown>): string => String(doc._id ?? doc.id ?? "");

export const authPage = internalQuery({
    args: {
        migrationKey: v.string(),
        model: v.union(v.literal("user"), v.literal("account"), v.literal("twoFactor")),
        cursor: v.union(v.string(), v.null()),
        numItems: v.number(),
    },
    handler: async (ctx, args) => {
        assertMigrationKey(args.migrationKey);

        const result = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
            model: args.model,
            where: [],
            paginationOpts: { cursor: args.cursor, numItems: pageSize(args.numItems) },
        })) as { page: Record<string, unknown>[]; isDone: boolean; continueCursor: string };

        const page = await Promise.all(
            result.page.map(async (doc) => {
                if (args.model === "user") {
                    return {
                        id: idOf(doc),
                        email: doc.email ?? null,
                        name: doc.name ?? null,
                        emailVerified: doc.emailVerified ?? null,
                        twoFactorEnabled: doc.twoFactorEnabled ?? null,
                        createdAt: doc.createdAt ?? null,
                    };
                }
                if (args.model === "account") {
                    return {
                        userId: String(doc.userId ?? ""),
                        providerId: doc.providerId ?? null,
                        accountId: doc.accountId ?? null,
                        passwordSha256: await digestOrNull(doc.password),
                        accessTokenSha256: await digestOrNull(doc.accessToken),
                        refreshTokenSha256: await digestOrNull(doc.refreshToken),
                        idTokenSha256: await digestOrNull(doc.idToken),
                        scope: doc.scope ?? null,
                    };
                }
                return {
                    userId: String(doc.userId ?? ""),
                    secretSha256: await digestOrNull(doc.secret),
                    backupCodesSha256: await digestOrNull(doc.backupCodes),
                };
            }),
        );

        return { page, isDone: result.isDone, continueCursor: result.continueCursor };
    },
});
