/**
 * Workaround: Nuxt's tsconfig.server.json maps 'h3' to a directory path that
 * TypeScript cannot resolve correctly in Bundler mode (no index.d.ts at root).
 * This causes 'H3Event' to resolve to nitropack's non-generic interface augmentation
 * instead of the actual generic class from h3/dist/index.d.ts.
 *
 * Relative imports bypass the paths override and correctly follow package.json exports,
 * giving us the real generic H3Event<T> class with all properties (context, node, headers).
 */
export type { H3Event, EventHandlerRequest } from "../../node_modules/h3";
