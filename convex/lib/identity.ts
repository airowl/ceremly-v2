import { ConvexError } from "convex/values";
import type { Value } from "convex/values";
import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Identity resolution (plan Task 5, Step 3).
 *
 * The browser is never an authority: every tenant-scoped function starts from
 * `ctx.auth.getUserIdentity()`, which Convex derives from the verified Better
 * Auth JWT — the client cannot forge `subject`. `organizationId` is resolved
 * from the app-owned `appUsers` row, never from function arguments.
 */

/** Context shape shared by helpers used from queries and mutations. */
export type ReadCtx = QueryCtx | MutationCtx;

export interface Identity {
    /** Better Auth user id (`sub` of the Convex JWT) — the component's `user._id`. */
    authUserId: string;
    tokenIdentifier: string;
    /** Normalized address from the JWT when present, `null` otherwise. */
    email: string | null;
    name: string | null;
}

/**
 * The error shape the client can switch on. `code` is a stable, machine-readable
 * string; extra fields carry context for logs without leaking data to callers
 * that should not see it.
 */
export function forbidden(code: string, details: Record<string, Value> = {}) {
    return new ConvexError({ code, ...details });
}

/**
 * Better Auth lower-cases every address it stores and looks up (`findUserByEmail`
 * → `email.toLowerCase()`), and its JWT carries the stored value. Normalizing on
 * our side is what makes invitation matching case-insensitive on both paths.
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Requires an authenticated caller, returning the parts of the identity we use. */
export async function requireIdentity(ctx: ReadCtx): Promise<Identity> {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
        throw forbidden("UNAUTHENTICATED");
    }
    if (!identity.subject) {
        throw forbidden("INVALID_IDENTITY", { reason: "missing_subject" });
    }

    return {
        authUserId: identity.subject,
        tokenIdentifier: identity.tokenIdentifier,
        email:
            typeof identity.email === "string" && identity.email.length > 0
                ? normalizeEmail(identity.email)
                : null,
        name: typeof identity.name === "string" && identity.name.length > 0 ? identity.name : null,
    };
}

/** The application profile of a Better Auth user, or `null` when not provisioned. */
export async function findAppUserByAuthId(
    ctx: ReadCtx,
    authUserId: string,
): Promise<Doc<"appUsers"> | null> {
    return await ctx.db
        .query("appUsers")
        .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
        .unique();
}

/**
 * The email of a Better Auth user.
 *
 * The Convex JWT carries the standard OIDC `email` claim (the component's
 * `definePayload` omits only `id` and `image`), so the common path costs nothing.
 * The component lookup is the fallback for tokens minted without that claim
 * (custom providers, or a payload override): the domain must still be able to
 * answer "is this invitation yours?" instead of silently denying it.
 */
export async function getAuthEmail(ctx: ReadCtx, authUserId: string): Promise<string> {
    const identity = await ctx.auth.getUserIdentity();

    if (
        identity &&
        identity.subject === authUserId &&
        typeof identity.email === "string" &&
        identity.email.length > 0
    ) {
        return normalizeEmail(identity.email);
    }

    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "_id", value: authUserId }],
    })) as { email?: unknown } | null;

    const email = typeof user?.email === "string" ? user.email : "";
    if (email.length === 0) {
        throw forbidden("AUTH_USER_EMAIL_UNAVAILABLE", { authUserId });
    }

    return normalizeEmail(email);
}
