import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Public liveness probe used by the migration gate G02 to prove the reactive
// query path end to end (HTTP client on SSR, websocket subscription on CSR).
export const ping = query({ args: {}, handler: async () => ({ ok: true as const }) });

// G02 gate instrumentation, scoped to the throwaway `migrationHealth` table:
// `record`+`latest` give the gate one observable write so it can assert that a
// typed mutation lands and that an open subscription re-executes afterwards.
// Idempotent by `key` so re-running the gate never accumulates rows.
export const record = mutation({
    args: { key: v.string(), value: v.string() },
    handler: async (ctx, args) => {
        const updatedAt = Date.now();
        const existing = await ctx.db
            .query("migrationHealth")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, { value: args.value, updatedAt });
        } else {
            await ctx.db.insert("migrationHealth", { key: args.key, value: args.value, updatedAt });
        }

        return { key: args.key, value: args.value, updatedAt };
    },
});

// G02 gate instrumentation: proves a JWT-bearing client reaches Convex as an
// authenticated identity (and that an anonymous client stays anonymous).
export const whoami = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        return {
            subject: identity.subject,
            issuer: identity.issuer,
            tokenIdentifier: identity.tokenIdentifier,
        };
    },
});

export const latest = query({
    args: { key: v.string() },
    handler: async (ctx, args) => {
        const row = await ctx.db
            .query("migrationHealth")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .unique();

        return row ? { value: row.value, updatedAt: row.updatedAt } : null;
    },
});
