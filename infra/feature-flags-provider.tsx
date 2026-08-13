"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createFlagSnapshot,
  identityKeyFromContext,
  readFlagValue,
  resolveSnapshot,
  type FlagAdapter,
  type FlagDiagnostic,
  type FlagEvaluationContext,
  type FlagRefreshResult,
  type FlagSchema,
  type FlagSnapshot,
} from "@/infra/feature-flags";

export class ServerOnlyFlagError extends Error {
  readonly name = "ServerOnlyFlagError";
  readonly key: string;

  constructor(key: string) {
    super(
      `Feature flag ${key} is server-only and cannot be read on the client`
    );
    this.key = key;
  }
}

export type FeatureFlagProviderProps = {
  schema: FlagSchema;
  schemaVersion: string;
  snapshot?: FlagSnapshot | null;
  adapter?: FlagAdapter;
  evaluationContext?: FlagEvaluationContext;
  refresh?: {
    intervalMs?: number;
    onWindowFocus?: boolean;
  };
  overrides?: Record<string, boolean | string>;
  sync?: {
    subscribe: (listener: (snapshot: FlagSnapshot) => void) => () => void;
    publish?: (snapshot: FlagSnapshot) => void;
  };
  onDiagnostic?: (diagnostic: FlagDiagnostic) => void;
  children: ReactNode;
};

type FlagContextValue = {
  schema: FlagSchema;
  schemaVersion: string;
  snapshot: FlagSnapshot | undefined;
  overrides?: Record<string, boolean | string>;
  refreshing: boolean;
  refresh: () => Promise<FlagRefreshResult>;
  onDiagnostic?: (diagnostic: FlagDiagnostic) => void;
};

const FlagContext = createContext<FlagContextValue | null>(null);

function emitDiagnostics(
  diagnostics: FlagDiagnostic[],
  onDiagnostic?: (diagnostic: FlagDiagnostic) => void
) {
  if (!onDiagnostic) {
    return;
  }
  for (const diagnostic of diagnostics) {
    onDiagnostic(diagnostic);
  }
}

export function FeatureFlagProvider({
  schema,
  schemaVersion,
  snapshot,
  adapter,
  evaluationContext,
  refresh: refreshConfig,
  overrides,
  sync,
  onDiagnostic,
  children,
}: FeatureFlagProviderProps) {
  const identityKey = identityKeyFromContext(evaluationContext);
  const baseline = useMemo(() => {
    const resolved = resolveSnapshot(schema, schemaVersion, snapshot, {
      identityKey,
    });
    return resolved;
  }, [schema, schemaVersion, snapshot, identityKey]);

  const [refreshed, setRefreshed] = useState<FlagSnapshot | undefined>(
    undefined
  );
  const [refreshing, setRefreshing] = useState(false);
  const [trackedIdentity, setTrackedIdentity] = useState(identityKey);
  const [trackedSnapshot, setTrackedSnapshot] = useState(snapshot);
  let nextRefreshed = refreshed;

  if (trackedIdentity !== identityKey || trackedSnapshot !== snapshot) {
    setTrackedIdentity(identityKey);
    setTrackedSnapshot(snapshot);
    nextRefreshed = undefined;
    setRefreshed(undefined);
  }

  const active = nextRefreshed ?? baseline.snapshot;
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onDiagnosticRef = useRef(onDiagnostic);

  useEffect(() => {
    onDiagnosticRef.current = onDiagnostic;
  }, [onDiagnostic]);

  useEffect(() => {
    emitDiagnostics(baseline.diagnostics, onDiagnosticRef.current);
  }, [baseline]);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(async (): Promise<FlagRefreshResult> => {
    if (!adapter) {
      return { status: "failed", reason: "adapter-error" };
    }
    const controller = abortRef.current;
    const signal = controller?.signal;
    setRefreshing(true);
    try {
      const values = await adapter.evaluate({
        context: evaluationContext,
        signal,
      });
      if (signal?.aborted || !mountedRef.current) {
        return { status: "failed", reason: "aborted" };
      }
      if (
        typeof values !== "object" ||
        values === null ||
        Array.isArray(values)
      ) {
        return { status: "failed", reason: "invalid-snapshot" };
      }
      const next = createFlagSnapshot(schema, {
        schemaVersion,
        values,
        identityKey,
        evaluatedAt: new Date().toISOString(),
      });
      emitDiagnostics(next.diagnostics, onDiagnosticRef.current);
      setRefreshed(next.snapshot);
      sync?.publish?.(next.snapshot);
      return { status: "updated", snapshot: next.snapshot };
    } catch {
      if (signal?.aborted || !mountedRef.current) {
        return { status: "failed", reason: "aborted" };
      }
      return { status: "failed", reason: "adapter-error" };
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [adapter, evaluationContext, identityKey, schema, schemaVersion, sync]);

  useEffect(() => {
    if (!sync) {
      return;
    }
    return sync.subscribe((incoming) => {
      if (!mountedRef.current) {
        return;
      }
      const resolved = resolveSnapshot(schema, schemaVersion, incoming, {
        identityKey,
      });
      emitDiagnostics(resolved.diagnostics, onDiagnosticRef.current);
      if (resolved.snapshot) {
        setRefreshed(resolved.snapshot);
      }
    });
  }, [identityKey, schema, schemaVersion, sync]);

  useEffect(() => {
    if (!refreshConfig?.intervalMs || refreshConfig.intervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, refreshConfig.intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, refreshConfig?.intervalMs]);

  useEffect(() => {
    if (!refreshConfig?.onWindowFocus) {
      return;
    }
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, refreshConfig?.onWindowFocus]);

  const value = useMemo<FlagContextValue>(
    () => ({
      schema,
      schemaVersion,
      snapshot: active,
      overrides,
      refreshing,
      refresh,
      onDiagnostic,
    }),
    [
      active,
      onDiagnostic,
      overrides,
      refresh,
      refreshing,
      schema,
      schemaVersion,
    ]
  );

  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>;
}

function useFlagContext() {
  const context = useContext(FlagContext);
  if (!context) {
    throw new Error("useFlag must be used within FeatureFlagProvider");
  }
  return context;
}

function readPublicFlag(
  schema: FlagSchema,
  snapshot: FlagSnapshot | undefined,
  overrides: Record<string, boolean | string> | undefined,
  key: string
) {
  const definition = schema[key];
  if (definition?.exposure === "server-only") {
    throw new ServerOnlyFlagError(key);
  }
  if (overrides && Object.hasOwn(overrides, key)) {
    return readFlagValue(
      schema,
      {
        schemaVersion: snapshot?.schemaVersion ?? "",
        values: { [key]: overrides[key]! },
      },
      key
    );
  }
  return readFlagValue(schema, snapshot, key);
}

export function useFlag(key: string): boolean | string {
  const context = useFlagContext();
  const result = readPublicFlag(
    context.schema,
    context.snapshot,
    context.overrides,
    key
  );
  if (result.diagnostic) {
    context.onDiagnostic?.(result.diagnostic);
  }
  return result.value;
}

export function useFlags() {
  const context = useFlagContext();
  const flags: Record<string, boolean | string> = {};
  for (const [key, definition] of Object.entries(context.schema)) {
    if (definition.exposure === "server-only") {
      continue;
    }
    flags[key] = readPublicFlag(
      context.schema,
      context.snapshot,
      context.overrides,
      key
    ).value;
  }
  return {
    flags,
    snapshot: context.snapshot,
    refresh: context.refresh,
    refreshing: context.refreshing,
  };
}
