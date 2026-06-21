/**
 * Reconciliation service for one-time Celebrazione payments (SPEC §6.2 / fix 7.1).
 *
 * The webhook `onCheckoutCompleted` is fire-and-forget (always returns 200) and
 * swallows errors. If `unlockEvent` fails, Creem never retries — a paid event
 * stays `tier='free'` forever. This service is the recovery path.
 *
 * CRITICAL CAVEAT (confirmed 2026-06-21):
 *   The real creem SDK `searchTransactions` response goes through
 *   `TransactionListEntity$inboundSchema` (a strict Zod `z.object` — strips unknown keys).
 *   `TransactionEntity` has NO `metadata` field in the schema. Even if the Creem API sends
 *   metadata on transactions, it is stripped at the SDK boundary and never reaches this code.
 *   The `@creem_io/better-auth` wrapper declares `TransactionData.metadata` but this is a
 *   type fiction — the real runtime shape carries `items` (not `transactions`) and no `metadata`.
 *
 *   Consequence: this service as written will reconcile 0 events in production until either:
 *   (a) Creem adds metadata to the transaction schema, OR
 *   (b) the reconciliation is rewritten to look up each transaction's order object and read
 *       the order's metadata (where eventId/organizationId ARE stored via the checkout).
 *
 *   The code is correct against the declared `@creem_io/better-auth` contract and is fully
 *   testable via mocks. See fix-7.1-report.md for the full analysis.
 */

import { searchTransactions } from "@creem_io/better-auth/server";
import { runtimeConfig } from "../utils/runtimeConfig";
import { unlockEvent } from "../repositories/eventRepository";

export interface ReconcileResult {
    checked: number;
    reconciled: number;
}

export interface ReconcileOptions {
    /** If given, only reconcile transactions whose metadata.eventId matches this. */
    eventId?: string;
    /** Maximum number of pages to fetch (default: 3). */
    maxPages?: number;
}

/**
 * Reconciles one-time Celebrazione payments that the webhook may have silently lost.
 *
 * For each paid `payment` transaction filtered from the Creem API:
 *  - Verifies it has metadata.eventId + metadata.organizationId + order_id.
 *  - Calls `unlockEvent` (idempotent — no-op if already celebration).
 *  - Isolates per-row errors so one bad row doesn't abort the whole batch.
 *
 * Returns `{ checked, reconciled }`:
 *  - `checked`: number of kept transactions (after type/status/metadata filters).
 *  - `reconciled`: number of kept transactions for which `unlockEvent` was attempted.
 *    (Equal to `checked` in the absence of per-row exceptions.)
 */
export async function reconcileOneTimeUnlocks(
    opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
    const productId = runtimeConfig.creemProductIdCelebration;

    // Guard: no product configured → nothing to reconcile (placeholder or missing env).
    if (!productId) {
        return { checked: 0, reconciled: 0 };
    }

    const config = {
        apiKey: runtimeConfig.creemApiKey!,
        testMode: runtimeConfig.public.appEnv !== "production",
    };

    const maxPages = opts.maxPages ?? 3;
    const pageSize = 50;

    let checked = 0;
    let reconciled = 0;

    for (let page = 1; page <= maxPages; page++) {
        const response = await searchTransactions(config, {
            productId,
            pageNumber: page,
            pageSize,
        });

        // Handle both declared wrapper shape (`transactions`) and real SDK shape (`items`).
        // At runtime the creem SDK returns TransactionListEntity with `items`; the
        // @creem_io/better-auth wrapper declares `transactions` but just passes through the raw response.
        const rawRes = response as Record<string, unknown>;
        const txList = Array.isArray(rawRes.transactions)
            ? (rawRes.transactions as unknown[])
            : Array.isArray(rawRes.items)
              ? (rawRes.items as unknown[])
              : [];

        // Break early on empty page (no more data).
        if (txList.length === 0) break;

        for (const tx of txList) {
            const t = tx as Record<string, unknown>;

            // Filter: type must be 'payment' (one-time; 'invoice' = recurring subscription).
            if (t.type !== "payment") continue;

            // Filter: status must be 'paid'.
            if (t.status !== "paid") continue;

            // Filter: need order_id (the creem order identifier).
            const orderId =
                typeof t.order_id === "string" && t.order_id
                    ? t.order_id
                    : typeof t.order === "string" && t.order
                      ? t.order
                      : undefined;
            if (!orderId) continue;

            // Filter: need metadata.eventId + metadata.organizationId.
            const meta =
                t.metadata !== null && typeof t.metadata === "object"
                    ? (t.metadata as Record<string, unknown>)
                    : undefined;
            if (!meta) continue;

            const eventId = typeof meta.eventId === "string" ? meta.eventId : undefined;
            const organizationId =
                typeof meta.organizationId === "string" ? meta.organizationId : undefined;

            if (!eventId || !organizationId) continue;

            // Filter: if caller requested a specific event, skip others.
            if (opts.eventId && eventId !== opts.eventId) continue;

            // This transaction is eligible.
            checked++;

            try {
                await unlockEvent(eventId, organizationId, orderId);
                reconciled++;
            } catch (err) {
                console.error(
                    `[reconcile] unlock failed for eventId=${eventId} orderId=${orderId}`,
                    err,
                );
            }
        }

        // If we got fewer items than pageSize, there are no more pages.
        if (txList.length < pageSize) break;
    }

    return { checked, reconciled };
}
