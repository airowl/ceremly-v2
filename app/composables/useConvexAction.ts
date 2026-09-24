import { useConvexClient } from "convex-vue";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * `useConvexMutation`'s missing sibling for **actions** (Task 14, part b).
 *
 * `convex-vue` 0.1.5 has no action composable, and billing is actions by nature:
 * `billing.checkoutsCreate` and `billing.customersPortalUrl` call the Creem API.
 * This is the one place outside the read-once helpers that takes the manual
 * client, and it only ever calls `client.action` — never `client.query`, which
 * would be the dead one-shot read the data-layer gate forbids (the gate lists
 * this file in `MANUAL_CLIENT_ALLOWED` and checks exactly that).
 *
 * Must be called in a setup context (it injects the client), like the other
 * convex-vue composables; the returned function can be called any time after.
 */
export function useConvexAction<Action extends FunctionReference<"action">>(
    action: Action,
): (args: FunctionArgs<Action>) => Promise<FunctionReturnType<Action>> {
    const client = useConvexClient();
    return (args) => client.action(action, args);
}
