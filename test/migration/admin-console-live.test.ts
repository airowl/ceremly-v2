/// <reference types="vitest/globals" />
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright";

/**
 * Admin console, live browser check (plan Task 15, Step 4).
 *
 * Drives a real deployment with Playwright (the `playwright` library already in
 * devDependencies — there is no `@playwright/test` runner in this repo, so the
 * spec runs under Vitest like the other live gates). It proves, end to end:
 *
 * 1. a signed-in non-admin who opens `/admin` is redirected away;
 * 2. a superAdmin reaches the console;
 * 3. changing an organization limit requires a reason and succeeds with one;
 * 4. a dead job is re-queued (with a reason);
 * 5. the audit log shows both writes with actor, target, timestamp, reason and
 *    details.
 *
 * NOT RUN by default: it needs a deployment and two real accounts. Arm it with
 *
 *   ADMIN_E2E=live \
 *   ADMIN_E2E_BASE_URL=https://staging.example \
 *   ADMIN_E2E_ADMIN_EMAIL=... ADMIN_E2E_ADMIN_PASSWORD=... \
 *   ADMIN_E2E_USER_EMAIL=...  ADMIN_E2E_USER_PASSWORD=... \
 *   ADMIN_E2E_ORG_SLUG=<slug of an organization to change> \
 *   pnpm test:e2e:admin
 *
 * Preconditions (see docs/migration/admin-console.md): the admin account was
 * promoted with `internal.admin.bootstrapSuperAdmin`, the user account is a
 * plain user, and at least one `jobExecutions` row is `dead` (step 4 fails with
 * an explicit message otherwise — it never fabricates one). Chromium must be
 * installed (`pnpm exec playwright install chromium`).
 */

const armed = process.env.ADMIN_E2E === "live";
const env = {
    baseUrl: (process.env.ADMIN_E2E_BASE_URL ?? "").replace(/\/$/, ""),
    adminEmail: process.env.ADMIN_E2E_ADMIN_EMAIL ?? "",
    adminPassword: process.env.ADMIN_E2E_ADMIN_PASSWORD ?? "",
    userEmail: process.env.ADMIN_E2E_USER_EMAIL ?? "",
    userPassword: process.env.ADMIN_E2E_USER_PASSWORD ?? "",
    orgSlug: process.env.ADMIN_E2E_ORG_SLUG ?? "",
};

const RUN_ID = `e2e-${Date.now()}`;

async function signIn(page: Page, email: string, password: string): Promise<void> {
    await page.goto(`${env.baseUrl}/login`);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
}

/**
 * The text input behind a Nuxt UI `UInput` with a `data-testid`, whether the
 * attribute lands on the wrapper or on the `<input>` itself.
 */
function field(page: Page, testId: string) {
    return page.locator(`[data-testid="${testId}"] input, input[data-testid="${testId}"]`).first();
}

describe.skipIf(!armed)("admin console · live (Playwright)", () => {
    let browser: Browser;

    beforeAll(async () => {
        for (const [key, value] of Object.entries(env)) {
            if (!value) throw new Error(`ADMIN_E2E: missing ${key}`);
        }
        const { chromium } = await import("playwright");
        browser = await chromium.launch();
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("redirects a signed-in non-admin away from /admin", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await signIn(page, env.userEmail, env.userPassword);

        await page.goto(`${env.baseUrl}/admin`);
        await page.waitForURL((url) => !url.pathname.startsWith("/admin"), { timeout: 30_000 });
        expect(new URL(page.url()).pathname).not.toMatch(/^\/(en\/)?admin/);
        await context.close();
    }, 90_000);

    it("lets a superAdmin in, changes a limit with a reason, retries a dead job, and audits both", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await signIn(page, env.adminEmail, env.adminPassword);

        // 2. Access.
        await page.goto(`${env.baseUrl}/admin`);
        await expect(page.getByTestId("admin-identity").textContent({ timeout: 30_000 })).resolves.toContain(
            env.adminEmail.toLowerCase(),
        );
        await page.getByTestId("admin-metrics").waitFor();

        // 3. Limit change: the save button stays disabled without a reason.
        await page.goto(`${env.baseUrl}/admin/organizations`);
        await field(page, "admin-org-search").fill(env.orgSlug);
        await field(page, "admin-org-search").press("Enter");
        // The exact configured organization, never "the first result": a prefix
        // search can match several slugs, and this test writes to the one it clicks.
        const orgRow = page
            .getByTestId("admin-org-row")
            .filter({ has: page.getByTestId("admin-org-slug").getByText(env.orgSlug, { exact: true }) });
        await orgRow.first().waitFor({ timeout: 30_000 });
        expect(await orgRow.count()).toBe(1);
        await orgRow.click();
        await page.getByTestId("admin-limits-form").waitFor();

        const guestLimit = String(100 + (Date.now() % 50));
        await field(page, "admin-limit-maxGuestsPerEvent").fill(guestLimit);
        expect(await page.getByTestId("admin-limits-save").isDisabled()).toBe(true);

        const limitReason = `${RUN_ID} limit`;
        await field(page, "admin-limits-reason").fill(limitReason);
        await page.getByTestId("admin-limits-save").click();
        await page.getByText(limitReason).first().waitFor({ timeout: 30_000 });

        // 4. Dead job retry.
        await page.goto(`${env.baseUrl}/admin/jobs`);
        const retryButtons = page.getByTestId("admin-job-retry");
        await page.waitForTimeout(2_000);
        if ((await retryButtons.count()) === 0) {
            throw new Error("no dead job on this deployment: seed one before running (docs/migration/admin-console.md)");
        }
        const retryReason = `${RUN_ID} retry`;
        await field(page, "admin-retry-reason").fill(retryReason);
        await retryButtons.first().click();

        // 5. Audit: both writes, with actor/target/timestamp/reason/details.
        for (const [action, reason] of [
            ["admin.limits_updated", limitReason],
            ["admin.job_retried", retryReason],
        ] as const) {
            await page.goto(`${env.baseUrl}/admin/audit?action=${action}`);
            const row = page.getByTestId("admin-audit-row").filter({ hasText: reason }).first();
            await row.waitFor({ timeout: 30_000 });

            expect(await row.getByTestId("admin-audit-action-name").textContent()).toBe(action);
            expect(await row.getByTestId("admin-audit-actor").textContent()).toContain(env.adminEmail.toLowerCase());
            expect((await row.getByTestId("admin-audit-target").textContent())?.trim()).not.toBe("-");
            expect((await row.getByTestId("admin-audit-time").textContent())?.trim()).not.toBe("-");
            expect(await row.getByTestId("admin-audit-reason").textContent()).toBe(reason);

            await row.click();
            const details = await page.getByTestId("admin-audit-details").first().textContent();
            expect(details).toContain(reason);
            if (action === "admin.limits_updated") expect(details).toContain(guestLimit);
        }

        await context.close();
    }, 180_000);
});
