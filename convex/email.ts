import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { requireEnv } from "./lib/env";

// Minimal transactional-email action used by the auth callbacks in `auth.ts`.
//
// Task 13 replaces this file with the React Email templates, the durable job
// queue, Resend suppression/events and the audit trail. What matters here is
// that the auth callbacks have a *real* delivery path instead of a silent
// no-op: with `RESEND_API_KEY` missing the action throws and the failure is
// visible in the Convex logs, never swallowed.
export const sendAuthEmail = internalAction({
    args: {
        to: v.string(),
        subject: v.string(),
        url: v.string(),
        body: v.string(),
    },
    handler: async (_ctx, args) => {
        const apiKey = requireEnv("RESEND_API_KEY");
        const from = requireEnv("EMAIL_FROM");

        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from,
                to: [args.to],
                subject: args.subject,
                text: `${args.body}\n\n${args.url}`,
            }),
        });

        if (!response.ok) {
            const detail = await response.text();
            throw new Error(`Resend rejected the auth email (${response.status}): ${detail}`);
        }

        const result = (await response.json()) as { id?: string };
        return { emailId: result.id ?? null };
    },
});
