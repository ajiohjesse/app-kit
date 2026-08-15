"use client";

import {
  useQueryClient,
  type MutationKey,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

export type MissingDataPolicy = "seed" | "skip" | "reject";

export type ConflictPolicy = "parallel" | "serial" | "replace";

export type OptimisticCacheHelpers = {
  getQueryData: <T>(queryKey: QueryKey) => T | undefined;
  setQueryData: <T>(
    queryKey: QueryKey,
    updater: T | ((old: T | undefined) => T)
  ) => void;
};

export type OptimisticSuccessPolicy<TVariables, TData> = {
  reconcile?: (
    data: TData,
    variables: TVariables,
    helpers: OptimisticCacheHelpers
  ) => void;
  invalidateKeys?:
    QueryKey[] | ((variables: TVariables, data: TData) => QueryKey[]);
};

export type OptimisticMutationConfig<TVariables, TData> = {
  queryClient: QueryClient;
  mutationKey: MutationKey;
  queryKeys: QueryKey[] | ((variables: TVariables) => QueryKey[]);
  mutationFn: (
    variables: TVariables,
    context: { signal: AbortSignal }
  ) => Promise<TData>;
  optimisticUpdate: (
    variables: TVariables,
    helpers: OptimisticCacheHelpers
  ) => void;
  /** How to handle declared keys with no cached data. Default: `reject`. */
  onMissing?: MissingDataPolicy;
  /** Used when `onMissing` is `seed`. */
  seed?: (queryKey: QueryKey, variables: TVariables) => unknown;
  /** Default: `parallel`. */
  conflictPolicy?: ConflictPolicy;
  onSuccess?: OptimisticSuccessPolicy<TVariables, TData>;
  /** Cancel in-flight reads for affected keys before writing. Default: false. */
  cancelQueries?: boolean;
  /**
   * Optional action-runner seam. Must invoke the operation exactly once.
   * Failures before invocation prevent optimistic writes.
   */
  runAction?: <T>(
    operation: (context: { signal: AbortSignal }) => Promise<T>,
    options?: { signal?: AbortSignal }
  ) => Promise<T>;
};

export type OptimisticMutateOptions = {
  signal?: AbortSignal;
};

export type OptimisticMutation<TVariables, TData> = {
  mutationKey: MutationKey;
  mutate: (
    variables: TVariables,
    options?: OptimisticMutateOptions
  ) => Promise<TData>;
};

type CacheSnapshot = {
  queryKey: QueryKey;
  data: unknown;
  existed: boolean;
};

type AttemptRecord = {
  id: string;
  controller: AbortController;
  promise: Promise<unknown>;
  ownedKeys: Set<string>;
};

type ScopeState = {
  attempts: Map<string, AttemptRecord>;
  serialTail: Promise<unknown>;
  owners: Map<string, string>;
};

const scopes = new WeakMap<QueryClient, Map<string, ScopeState>>();

function scopeKey(mutationKey: MutationKey): string {
  return JSON.stringify(mutationKey);
}

function queryKeyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

function getScope(
  queryClient: QueryClient,
  mutationKey: MutationKey
): ScopeState {
  let byKey = scopes.get(queryClient);
  if (!byKey) {
    byKey = new Map();
    scopes.set(queryClient, byKey);
  }
  const key = scopeKey(mutationKey);
  let scope = byKey.get(key);
  if (!scope) {
    scope = {
      attempts: new Map(),
      serialTail: Promise.resolve(),
      owners: new Map(),
    };
    byKey.set(key, scope);
  }
  return scope;
}

function createHelpers(queryClient: QueryClient): OptimisticCacheHelpers {
  return {
    getQueryData: <T,>(queryKey: QueryKey) =>
      queryClient.getQueryData<T>(queryKey),
    setQueryData: <T,>(
      queryKey: QueryKey,
      updater: T | ((old: T | undefined) => T)
    ) => {
      queryClient.setQueryData(queryKey, updater as never);
    },
  };
}

function resolveQueryKeys<TVariables>(
  queryKeys: OptimisticMutationConfig<TVariables, unknown>["queryKeys"],
  variables: TVariables
): QueryKey[] {
  return typeof queryKeys === "function" ? queryKeys(variables) : queryKeys;
}

function captureSnapshots(
  queryClient: QueryClient,
  keys: QueryKey[],
  onMissing: MissingDataPolicy,
  seed: OptimisticMutationConfig<unknown, unknown>["seed"],
  _variables: unknown
): CacheSnapshot[] {
  const snapshots: CacheSnapshot[] = [];

  for (const queryKey of keys) {
    const state = queryClient.getQueryState(queryKey);
    const data = queryClient.getQueryData(queryKey);
    const hasData = data !== undefined;

    // Missing and loading (state without data) both go through onMissing.
    if (!hasData) {
      if (onMissing === "reject") {
        throw new Error(
          `optimistic-mutation: missing cache for key ${queryKeyId(queryKey)}`
        );
      }
      if (onMissing === "seed" && !seed) {
        throw new Error(
          "optimistic-mutation: onMissing is seed but no seed() was provided"
        );
      }
      snapshots.push({
        queryKey,
        data: undefined,
        existed: state !== undefined,
      });
      continue;
    }

    // Prefer an immutable clone; fall back to the cache reference when
    // the value is not structured-cloneable (contract allows that).
    snapshots.push({
      queryKey,
      data: cloneCacheValue(data),
      existed: true,
    });
  }

  return snapshots;
}

function cloneCacheValue(data: unknown): unknown {
  try {
    return structuredClone(data);
  } catch {
    return data;
  }
}

function applySeeds(
  queryClient: QueryClient,
  snapshots: CacheSnapshot[],
  onMissing: MissingDataPolicy,
  seed: OptimisticMutationConfig<unknown, unknown>["seed"],
  variables: unknown
) {
  if (onMissing !== "seed" || !seed) return;
  for (const snapshot of snapshots) {
    if (snapshot.data === undefined) {
      queryClient.setQueryData(
        snapshot.queryKey,
        seed(snapshot.queryKey, variables)
      );
    }
  }
}

function writeSnapshot(queryClient: QueryClient, snapshot: CacheSnapshot) {
  if (snapshot.existed || snapshot.data !== undefined) {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data);
    return;
  }
  queryClient.removeQueries({ queryKey: snapshot.queryKey, exact: true });
}

function restoreSnapshots(
  queryClient: QueryClient,
  snapshots: CacheSnapshot[],
  attemptId: string | null,
  scope: ScopeState
) {
  for (const snapshot of snapshots) {
    const id = queryKeyId(snapshot.queryKey);
    if (attemptId !== null && scope.owners.get(id) !== attemptId) {
      continue;
    }
    writeSnapshot(queryClient, snapshot);
    if (attemptId !== null) {
      scope.owners.delete(id);
    }
  }
}

function claimOwnership(
  scope: ScopeState,
  attemptId: string,
  keys: QueryKey[]
) {
  const owned = new Set<string>();
  for (const queryKey of keys) {
    const id = queryKeyId(queryKey);
    scope.owners.set(id, attemptId);
    owned.add(id);
  }
  return owned;
}

let attemptCounter = 0;

export function createOptimisticMutation<TVariables, TData>(
  config: OptimisticMutationConfig<TVariables, TData>
): OptimisticMutation<TVariables, TData> {
  const {
    queryClient,
    mutationKey,
    queryKeys,
    mutationFn,
    optimisticUpdate,
    onMissing = "reject",
    seed,
    conflictPolicy = "parallel",
    onSuccess,
    cancelQueries = false,
    runAction,
  } = config;

  if (!queryClient) {
    throw new Error(
      "optimistic-mutation: queryClient is required; inject the consumer QueryClient"
    );
  }

  const scope = getScope(queryClient, mutationKey);
  const helpers = createHelpers(queryClient);

  async function runAttempt(
    variables: TVariables,
    options?: OptimisticMutateOptions
  ): Promise<TData> {
    const attemptId = `attempt-${++attemptCounter}`;
    const controller = new AbortController();
    const external = options?.signal;

    const onAbort = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) {
        controller.abort(external.reason);
      } else {
        external.addEventListener("abort", onAbort, { once: true });
      }
    }

    let snapshots: CacheSnapshot[] = [];
    let ownedKeys = new Set<string>();
    let wroteOptimistic = false;

    const operation = async (context: {
      signal: AbortSignal;
    }): Promise<TData> => {
      const keys = resolveQueryKeys(queryKeys, variables);

      // Validate + snapshot before any cache mutation.
      snapshots = captureSnapshots(
        queryClient,
        keys,
        onMissing,
        seed as OptimisticMutationConfig<unknown, unknown>["seed"],
        variables
      );

      if (cancelQueries) {
        await Promise.all(
          keys.map((queryKey) =>
            queryClient.cancelQueries({ queryKey, exact: true })
          )
        );
      }

      try {
        applySeeds(
          queryClient,
          snapshots,
          onMissing,
          seed as OptimisticMutationConfig<unknown, unknown>["seed"],
          variables
        );
        optimisticUpdate(variables, helpers);
        ownedKeys = claimOwnership(scope, attemptId, keys);
        wroteOptimistic = true;
        const record = scope.attempts.get(attemptId);
        if (record) record.ownedKeys = ownedKeys;
      } catch (error) {
        // Setup failed before ownership — force-restore the validated snapshots.
        restoreSnapshots(queryClient, snapshots, null, scope);
        throw error;
      }

      if (controller.signal.aborted) {
        restoreSnapshots(queryClient, snapshots, attemptId, scope);
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new DOMException("Aborted", "AbortError");
      }

      const onInnerAbort = () => {
        if (!controller.signal.aborted) {
          controller.abort(context.signal.reason);
        }
      };
      if (context.signal !== controller.signal) {
        if (context.signal.aborted) {
          controller.abort(context.signal.reason);
        } else {
          context.signal.addEventListener("abort", onInnerAbort, {
            once: true,
          });
        }
      }

      try {
        const data = await mutationFn(variables, {
          signal: controller.signal,
        });

        if (onSuccess?.reconcile) {
          onSuccess.reconcile(data, variables, helpers);
        }

        if (onSuccess?.invalidateKeys) {
          const invalidate =
            typeof onSuccess.invalidateKeys === "function"
              ? onSuccess.invalidateKeys(variables, data)
              : onSuccess.invalidateKeys;
          await Promise.all(
            invalidate.map((queryKey) =>
              queryClient.invalidateQueries({ queryKey })
            )
          );
        }

        for (const id of ownedKeys) {
          if (scope.owners.get(id) === attemptId) {
            scope.owners.delete(id);
          }
        }

        return data;
      } catch (error) {
        if (wroteOptimistic) {
          restoreSnapshots(queryClient, snapshots, attemptId, scope);
        }
        throw error;
      } finally {
        if (context.signal !== controller.signal) {
          context.signal.removeEventListener("abort", onInnerAbort);
        }
      }
    };

    const promise = (
      runAction
        ? runAction(operation, { signal: controller.signal })
        : operation({ signal: controller.signal })
    ).finally(() => {
      if (external) {
        external.removeEventListener("abort", onAbort);
      }
      scope.attempts.delete(attemptId);
    });

    scope.attempts.set(attemptId, {
      id: attemptId,
      controller,
      promise,
      ownedKeys,
    });

    return promise;
  }

  async function mutate(
    variables: TVariables,
    options?: OptimisticMutateOptions
  ): Promise<TData> {
    if (conflictPolicy === "replace") {
      for (const attempt of scope.attempts.values()) {
        attempt.controller.abort(
          new DOMException("Replaced by newer mutation", "AbortError")
        );
      }
    }

    if (conflictPolicy === "serial") {
      const previous = scope.serialTail;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      scope.serialTail = previous.then(
        () => gate,
        () => gate
      );

      await previous.catch(() => undefined);
      try {
        return await runAttempt(variables, options);
      } finally {
        release();
      }
    }

    return runAttempt(variables, options);
  }

  return { mutationKey, mutate };
}

export function useOptimisticMutation<TVariables, TData>(
  config: Omit<OptimisticMutationConfig<TVariables, TData>, "queryClient"> & {
    queryClient?: QueryClient;
  }
): OptimisticMutation<TVariables, TData> {
  const contextClient = useQueryClient();
  const queryClient = config.queryClient ?? contextClient;
  return createOptimisticMutation({
    ...config,
    queryClient,
  });
}
