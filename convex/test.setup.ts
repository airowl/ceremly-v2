import { convexTest } from "convex-test";
import schema from "./schema";

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
