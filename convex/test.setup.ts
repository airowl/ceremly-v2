import { convexTest } from "convex-test";
import { createRequire } from "node:module";
import schema from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

// Test harness shared by `convex/**/*.test.ts`.
//
// The glob must live here (Convex root) so convex-test resolves function
// modules relative to this file: `convexTest(schema)` on its own falls back to
// convex-test's internal `import.meta.glob`, which is not transformed when the
// package is consumed from node_modules under pnpm.
//
// `import.meta.glob` is a Vite (Vitest) transform: these tests only run under
// Vitest, never in a deployed function bundle.
export const modules = import.meta.glob("./**/*.*s");

export function initConvexTest() {
    return convexTest(schema, modules);
}

// The Better Auth component is mounted by `convex/convex.config.ts` at deploy
// time; convex-test knows nothing about it, so a component call fails with
// "Component \"betterAuth\" is not registered" unless the schema and modules are
// handed over explicitly. The package's `exports` map refuses deep specifiers
// (`@convex-dev/better-auth/dist/component/schema.js` is not exported), so the
// path is resolved through the package manifest instead.
const requireFromHere = createRequire(import.meta.url);
const componentRoot = requireFromHere
    .resolve("@convex-dev/better-auth/package.json")
    .replace(/\/package\.json$/, "");
const componentModules = import.meta.glob("../node_modules/@convex-dev/better-auth/dist/component/**/*.js");

/**
 * A minimal but *valid* `events` row.
 *
 * Task 10 completed the table: an event now carries its invitation content
 * (`type`, `templateKey`, `title`, `slug`, `status`, blocks, RSVP config), so a
 * suite that only needs an event to exist — billing, media scoping — builds it
 * here instead of restating eleven required fields. The legacy behaviour these
 * suites assert is unchanged; what changed is that an event without a title or a
 * slug is no longer representable, which is the point of the completed model.
 */
export function eventFixture(
    organizationId: Id<"organizations">,
    overrides: Partial<
        Omit<Doc<"events">, "_id" | "_creationTime" | "organizationId">
    > = {},
): Omit<Doc<"events">, "_id" | "_creationTime"> {
    return {
        organizationId,
        type: "matrimonio",
        templateKey: "toscana-basic",
        title: "Evento di prova",
        // A distinct slug per fixture: the legacy `slug UNIQUE` is enforced in
        // the domain layer, and two suites creating "the" event must not collide.
        slug: `evento-${Math.random().toString(36).slice(2, 10)}`,
        status: "draft",
        blocks: [],
        rsvpConfig: [],
        distribution: {},
        tier: "free",
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
    };
}

/**
 * `initConvexTest` with the auth component registered.
 *
 * Opt-in rather than the default: registering it changes what a component call
 * resolves to (a real, empty component table instead of an error), so suites that
 * do not drive the auth handler keep the behaviour they were written against —
 * and only the suites that need the real Better Auth pipeline pay for it.
 */
export async function initConvexTestWithAuthComponent() {
    const { default: componentSchema } = await import(`${componentRoot}/dist/component/schema.js`);
    const t = convexTest(schema, modules);
    t.registerComponent("betterAuth", componentSchema as never, componentModules);

    return t;
}
