import { internal } from "../_generated/api";
import { action as rawAction, mutation as rawMutation } from "../_generated/server";
import { readSiteMode } from "../siteSettings";
import { assertWritableMode, type WritePolicy } from "./writeGuard";

/**
 * The builders every **public** Convex write goes through (migration Task 17,
 * fix round 1). Same types as `_generated/server`; the only difference is the
 * site-mode check that runs before the handler (`lib/writeGuard.ts`).
 *
 * - `mutation`            → policy `domain` (the default for anything public)
 * - `guestMutation`       → policy `guest` (RSVP by token)
 * - `siteModeMutation`    → policy `siteModeSwitch` (only `admin.setSiteMode`)
 * - `action`              → policy `domain`, checked through an internal query
 * - `readAction`          → no check; for actions that only read/sign (tagged `read`)
 * - `tagged(policy, fn)`  → marks a raw builder whose handler enforces the guard
 *                           itself on its write branch (provisioning, open
 *                           tracking), so the enumeration test can see it.
 *
 * Every function built here carries `WRITE_GUARD_TAG`; `convex/writeGuard.test.ts`
 * fails on a public mutation/action without it.
 */

export const WRITE_GUARD_TAG = "__siteModeWritePolicy";
export type GuardTag = WritePolicy | "read" | "inline";

type Def = ((ctx: never, args: never) => unknown) | { handler: (ctx: never, args: never) => unknown };

function tag<T extends object>(registered: T, value: GuardTag): T {
    return Object.assign(registered, { [WRITE_GUARD_TAG]: value });
}

function wrapHandler<Ctx, Args, R>(
    handler: (ctx: Ctx, args: Args) => R,
    check: (ctx: Ctx) => Promise<void>,
): (ctx: Ctx, args: Args) => Promise<R> {
    return async (ctx, args) => {
        await check(ctx);
        return handler(ctx, args);
    };
}

function guardedMutation(policy: WritePolicy): typeof rawMutation {
    return ((def: Def) => {
        const check = async (ctx: Parameters<typeof readSiteMode>[0]) => assertWritableMode(await readSiteMode(ctx), policy);
        const built =
            typeof def === "function"
                ? rawMutation(wrapHandler(def as never, check) as never)
                : rawMutation({ ...def, handler: wrapHandler(def.handler as never, check) } as never);
        return tag(built, policy);
    }) as unknown as typeof rawMutation;
}

export const mutation = guardedMutation("domain");
export const guestMutation = guardedMutation("guest");
export const siteModeMutation = guardedMutation("siteModeSwitch");

export const action = ((def: Def) => {
    const check = async (ctx: { runQuery: (ref: never, args: never) => Promise<unknown> }) => {
        const { mode } = (await ctx.runQuery(internal.siteSettings.getForWorker as never, {} as never)) as {
            mode: Parameters<typeof assertWritableMode>[0];
        };
        assertWritableMode(mode, "domain");
    };
    const built =
        typeof def === "function"
            ? rawAction(wrapHandler(def as never, check) as never)
            : rawAction({ ...def, handler: wrapHandler(def.handler as never, check) } as never);
    return tag(built, "domain");
}) as unknown as typeof rawAction;

export const readAction = ((def: Parameters<typeof rawAction>[0]) => tag(rawAction(def), "read")) as typeof rawAction;

/** For a raw builder whose handler calls the guard itself (see the header). */
export function tagged<T extends object>(value: "inline", registered: T): T {
    return tag(registered, value);
}
