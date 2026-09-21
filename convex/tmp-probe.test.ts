import { expect, it } from "vitest";
import { api } from "./_generated/api";
import { initConvexTest } from "./test.setup";

it("probe identity propagation into nested mutation from an action", async () => {
    const t = initConvexTest();
    const s = t.withIdentity({ subject: "probe", email: "probe@example.com", name: "Probe" });

    let nested: unknown = null;
    try {
        nested = await s.action(async (ctx) => {
            return await ctx.runMutation(api.organizations.ensureProvisioned, {});
        });
    } catch (error) {
        nested = { error: (error as Error).message, data: (error as { data?: unknown }).data };
    }

    // eslint-disable-next-line no-console
    console.log("nested result", JSON.stringify(nested));

    const rows = await t.run(async (c) => c.db.query("appUsers").collect());
    // eslint-disable-next-line no-console
    console.log("appUsers", rows.length);

    expect(true).toBe(true);
});
