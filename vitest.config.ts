import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        include: [
            "server/**/*.test.ts",
            "shared/**/*.test.ts",
            "test/**/*.test.ts",
            // Convex backend tests (convex-test) — `pnpm test:migration` and the
            // migration plan's gate commands target `convex/**/*.test.ts`.
            "convex/**/*.test.ts",
        ],
        setupFiles: ["./test/setup.ts"],
        // I test DB-backed toccano il branch Neon dev (condiviso con i deploy Preview):
        // niente parallelismo aggressivo per evitare contese sulle righe-fixture.
        fileParallelism: false,
        testTimeout: 20000,
        passWithNoTests: true,
    },
    resolve: {
        alias: {
            "~~": root,
            "@@": root,
            "~": app,
            "@": app,
        },
    },
});
