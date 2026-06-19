import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDB } from "~~/server/utils/db";
import * as schema from "~~/server/database/schema";
import { countActiveEventsByOrg } from "~~/server/repositories/eventRepository";

const db = getDB();
let orgId = "";

async function makeOrg(): Promise<string> {
    const id = `org_test_${randomUUID()}`;
    await db.insert(schema.organization).values({ id, name: "test-count", slug: `test-count-${randomUUID()}`, createdAt: new Date() });
    return id;
}

function eventValues(orgId: string, status: string, tier: string) {
    return { organizationId: orgId, type: "compleanno", templateKey: "compleanno-default", title: "t", slug: `slug-${randomUUID()}`, status, tier };
}

afterEach(async () => {
    if (!orgId) return;
    await db.delete(schema.events).where(eq(schema.events.organizationId, orgId));
    await db.delete(schema.organization).where(eq(schema.organization.id, orgId));
    orgId = "";
});

describe("countActiveEventsByOrg", () => {
    it("conta solo eventi tier='free' non chiusi; celebration non consuma slot", async () => {
        orgId = await makeOrg();
        await db.insert(schema.events).values(eventValues(orgId, "draft", "free"));
        await db.insert(schema.events).values(eventValues(orgId, "draft", "celebration"));
        await db.insert(schema.events).values(eventValues(orgId, "closed", "free"));
        expect(await countActiveEventsByOrg(orgId)).toBe(1);
    });
});
