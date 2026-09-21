// Cloudflare Workers types for Nuxt.
//
// Bindings are declared in `wrangler.jsonc` (`CEREMLY_R2`, `IMAGES`, `DB`) and are
// reached from a Nitro handler through the event context that nitro's
// cloudflare-module preset populates (`event.context.cloudflare.env`). The
// previous shape advertised a `NitroRuntimeConfig.cloudflare.bindings`, which
// nitro never produces — corrected in Task 7 after reading
// `nitropack/dist/presets/cloudflare/runtime/_module-handler.mjs`.
//
// `R2Bucket`/`D1Database` are imported explicitly instead of via
// `/// <reference types="@cloudflare/workers-types" />`: the triple-slash form was
// silently ignored by the server project's type resolution, so the globals were
// in fact undefined.

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import type { ImagesBinding } from "./images";

declare global {
    interface CloudflareBindings {
        /** The R2 bucket holding originals and variants — same bucket as legacy. */
        CEREMLY_R2?: R2Bucket;
        /** Cloudflare Images binding: reads pixels, writes WebP variants. */
        IMAGES?: ImagesBinding;
        /** @nuxt/content's D1 database (see nuxt.config.ts). Unrelated to media. */
        DB?: D1Database;
    }
}

declare module "h3" {
    interface H3EventContext {
        /**
         * Present only when running on Cloudflare (`wrangler dev` or a deployed
         * Worker). Code that needs a binding must treat its absence as a
         * configuration error, never as an empty default.
         */
        cloudflare?: {
            env: CloudflareBindings;
            context: {
                waitUntil(promise: Promise<unknown>): void;
                passThroughOnException(): void;
            };
        };
    }
}

export {};
