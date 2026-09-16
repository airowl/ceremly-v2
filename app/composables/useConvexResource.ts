import { useConvexMutation, useConvexQuery } from "convex-vue";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { Ref } from "vue";

export interface ConvexQueryResult<T> {
  data: Ref<T | undefined>;
  error: Ref<Error | null>;
  isPending: Ref<boolean>;
  suspense: () => Promise<T>;
}

export interface ConvexMutationResult<TArgs, TReturn> {
  mutate: (args: TArgs) => Promise<TReturn>;
  error: Ref<Error | null>;
  isPending: Ref<boolean>;
}

// Thin typed wrapper over convex-vue's reactive bindings: the returned
// refs stay subscribed while the caller's effect scope lives and are torn
// down on scope dispose. No Nuxt CRUD endpoints.
export function useConvexResource<Query extends FunctionReference<"query", "public">>(
  query: Query,
  args?: FunctionArgs<Query>,
): ConvexQueryResult<FunctionReturnType<Query>>;

export function useConvexResource<Mutation extends FunctionReference<"mutation", "public">>(
  mutation: Mutation,
): ConvexMutationResult<FunctionArgs<Mutation>, FunctionReturnType<Mutation>>;

export function useConvexResource(query: any, args?: any) {
  if (query.__type === "query") {
    return useConvexQuery(query, args ?? {});
  }

  if (query.__type === "mutation") {
    return useConvexMutation(query);
  }

  throw new Error("Invalid query/mutation reference");
}
