import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Task 17 fix round 1 — the login the read-only mode allows must not write
 * domain rows after the watermark. On the legacy stack a password login ran the
 * Better Auth `after` hook (`logAudit` → `audit_log`, an exported table) and the
 * `session.create.before` self-heal (can create an organization + member). In
 * `maintenance-readonly` both are skipped: the audit becomes a structured log
 * line (action, status, user id — no email, no IP, no user agent), and the
 * self-heal does not run.
 */

const logAudit = vi.fn(async () => undefined);
vi.mock("../../server/utils/audit", () => ({ logAudit }));

const g = globalThis as Record<string, unknown>;
g.useRuntimeConfig = () => ({ public: { siteMode: "active" } });

let auditAuthEvent: typeof import("../../server/utils/authAudit").auditAuthEvent;
let shouldSelfHealOrg: typeof import("../../server/utils/authAudit").shouldSelfHealOrg;
let setServerSiteMode: typeof import("../../server/utils/siteMode").setServerSiteMode;

beforeAll(async () => {
    const { runtimeConfig } = await import("../../server/utils/runtimeConfig");
    const config = runtimeConfig as unknown as Record<string, unknown>;
    config.upstashRedisRestUrl = undefined;
    config.upstashRedisRestToken = undefined;
    config.siteModeBackend = "legacy";
    ({ auditAuthEvent, shouldSelfHealOrg } = await import("../../server/utils/authAudit"));
    ({ setServerSiteMode } = await import("../../server/utils/siteMode"));
});

beforeEach(() => {
    logAudit.mockClear();
});

describe("legacy auth writes in maintenance-readonly", () => {
    it("active: the audit row is written and the self-heal runs", async () => {
        await setServerSiteMode("active");
        await auditAuthEvent("auth.signed_in", { userId: "u1", targetId: "a@b.c", ipAddress: "1.2.3.4", status: "success" });
        expect(logAudit).toHaveBeenCalledTimes(1);
        expect(await shouldSelfHealOrg()).toBe(true);
    });

    it("maintenance-readonly: no audit row, a structured log line without PII, no self-heal", async () => {
        await setServerSiteMode("maintenance-readonly");
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        await auditAuthEvent("auth.signed_in", {
            userId: "u1",
            targetType: "email",
            targetId: "someone@example.com",
            ipAddress: "1.2.3.4",
            userAgent: "UA/1",
            status: "success",
        });
        expect(logAudit).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledTimes(1);
        const line = String(info.mock.calls[0]![0]);
        expect(JSON.parse(line)).toEqual({
            event: "audit.suppressed_readonly",
            action: "auth.signed_in",
            status: "success",
            userId: "u1",
        });
        expect(line).not.toMatch(/example\.com|1\.2\.3\.4|UA\/1/);
        expect(await shouldSelfHealOrg()).toBe(false);
        info.mockRestore();
        await setServerSiteMode("active");
    });

    it("final review I2: maintenance (the blue stack after step 10) suppresses them too", async () => {
        await setServerSiteMode("maintenance");
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        await auditAuthEvent("auth.signed_in", { userId: "u1", targetId: "a@b.c", ipAddress: "1.2.3.4", status: "success" });
        expect(logAudit).not.toHaveBeenCalled();
        expect(info).toHaveBeenCalledTimes(1);
        expect(await shouldSelfHealOrg()).toBe(false);
        info.mockRestore();

        // waitinglist is a normal legacy operating mode: audit and self-heal stay.
        await setServerSiteMode("waitinglist");
        await auditAuthEvent("auth.signed_in", { userId: "u1", status: "success" });
        expect(logAudit).toHaveBeenCalledTimes(1);
        expect(await shouldSelfHealOrg()).toBe(true);
        await setServerSiteMode("active");
    });

    it("server/utils/auth.ts routes every audit through auditAuthEvent and gates the self-heal", () => {
        const source = readFileSync("server/utils/auth.ts", "utf8");
        expect(source).not.toMatch(/\blogAudit\(/);
        expect(source).toMatch(/if \(!rows\[0\] && \(await shouldSelfHealOrg\(\)\)\)/);
    });
});
