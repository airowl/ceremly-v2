import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));

it("deploys Nuxt output with required Cloudflare bindings", () => {
  expect(config.main).toBe(".output/server/index.mjs");
  expect(config.compatibility_flags).toContain("nodejs_compat");
  expect(config.assets.directory).toBe(".output/public");
  expect(config.r2_buckets[0].binding).toBe("CEREMLY_R2");
  expect(config.images.binding).toBe("IMAGES");
  expect(config.observability.enabled).toBe(true);
});
