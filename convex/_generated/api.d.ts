/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as email from "../email.js";
import type * as files from "../files.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as lib_bridgeHmac from "../lib/bridgeHmac.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_magicBytes from "../lib/magicBytes.js";
import type * as lib_media from "../lib/media.js";
import type * as lib_migrationKey from "../lib/migrationKey.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as media from "../media.js";
import type * as migrations_authImport from "../migrations/authImport.js";
import type * as organizations from "../organizations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  billing: typeof billing;
  email: typeof email;
  files: typeof files;
  health: typeof health;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/authorization": typeof lib_authorization;
  "lib/bridgeHmac": typeof lib_bridgeHmac;
  "lib/env": typeof lib_env;
  "lib/identity": typeof lib_identity;
  "lib/magicBytes": typeof lib_magicBytes;
  "lib/media": typeof lib_media;
  "lib/migrationKey": typeof lib_migrationKey;
  "lib/pricing": typeof lib_pricing;
  media: typeof media;
  "migrations/authImport": typeof migrations_authImport;
  organizations: typeof organizations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  creem: import("@creem_io/convex/_generated/component.js").ComponentApi<"creem">;
};
