import { useNuxtApp } from "#app";
import type { ConvexClient } from "convex-vue";
import type { FunctionReference, QueryCtx } from "convex/server";

export interface ConvexQueryResult<T> {
  data: T | undefined;
  error: Error | undefined;
  isPending: boolean;
  suspense: () => Promise<T>;
}

export interface ConvexMutationResult<T> {
  mutate: (args: T) => Promise<void>;
  error: Error | undefined;
  isPending: boolean;
}

export function useConvexResource<TArgs, TReturn>(
  query: FunctionReference<"query", "public", TArgs, TReturn>,
  args?: TArgs
): ConvexQueryResult<TReturn>;

export function useConvexResource<TArgs, TReturn>(
  query: FunctionReference<"mutation", "public", TArgs, TReturn>,
  args?: TArgs
): ConvexMutationResult<TArgs>;

export function useConvexResource(query: any, args?: any) {
  const nuxtApp = useNuxtApp();
  const client = nuxtApp.$convexClient as ConvexClient;

  if (query.__type === "query") {
    return {
      get data() {
        return client.query(query, args ?? {});
      },
      error: undefined,
      isPending: false,
      suspense: () => client.query(query, args ?? {}),
    };
  }

  if (query.__type === "mutation") {
    return {
      mutate: (mutationArgs: any) => client.mutation(query, mutationArgs),
      error: undefined,
      isPending: false,
    };
  }

  throw new Error("Invalid query/mutation reference");
}