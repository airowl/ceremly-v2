import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const app = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        include: ["server/**/*.test.ts", "shared/**/*.test.ts", "test/**/*.test.ts"],
        setupFiles: ["./test/setup.ts"],
        // I test DB-backed toccano il branch Neon dev (condiviso dev/staging):
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
