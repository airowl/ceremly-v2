import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

describe("Cloudflare + Convex version contract", () => {
  it("pins every pre-1.0 or runtime-sensitive dependency", () => {
    expect(pkg.dependencies).toMatchObject({
      convex: "1.45.0",
      "convex-vue": "0.1.5",
      "better-auth": "1.6.15",
      "@convex-dev/better-auth": "0.12.5",
      "@creem_io/convex": "0.4.1",
      creem: "1.9.0",
    });
    expect(pkg.devDependencies).toMatchObject({
      "convex-test": "0.0.58",
      wrangler: "4.131.2",
    });
  });
});