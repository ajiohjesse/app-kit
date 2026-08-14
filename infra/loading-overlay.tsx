"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export const DEFAULT_LOADING_OVERLAY_SCOPE = "default";
const DEFAULT_LOADING_LABEL = "Loading";
const DEFAULT_SUCCESS_LABEL = "Done";
const DEFAULT_ERROR_LABEL = "Something went wrong";
const DEFAULT_SUCCESS_DURATION_MS = 0;
const DEFAULT_ERROR_DURATION_MS = 800;

export type LoadingOverlayToken = string;

export type LoadingOverlayStatus = "idle" | "loading" | "success" | "error";

export type LoadingOverlayTokenState =
  "pending" | "succeeded" | "failed" | "released";

export type LoadingOverlayMetadata = {
  message?: string;
};

export type LoadingOverlayClock = {
  setTimeout: (callback: () => void, delay?: number) => number;
  clearTimeout: (id: number) => void;
};

export type LoadingOverlayBeginOptions = {
  label?: string;
  progress?: number;
  scope?: string;
};

export type LoadingOverlayUpdateOptions = {
  label?: string;
  progress?: number;
};

export type LoadingOverlayApi = {
  begin: (options?: LoadingOverlayBeginOptions) => LoadingOverlayToken;
  update: (
    token: LoadingOverlayToken,
    patch: LoadingOverlayUpdateOptions
  ) => void;
  succeed: (
    token: LoadingOverlayToken,
    metadata?: LoadingOverlayMetadata
  ) => void;
  fail: (token: LoadingOverlayToken, metadata?: LoadingOverlayMetadata) => void;
  release: (token: LoadingOverlayToken) => void;
  status: LoadingOverlayStatus;
  label: string;
  progress?: number;
};

export type LoadingOverlayProviderProps = {
  children: ReactNode;
  scope?: string;
  blocking?: boolean;
  successDurationMs?: number;
  errorDurationMs?: number;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  clock?: LoadingOverlayClock;
};

type TokenRecord = {
  id: LoadingOverlayToken;
  state: LoadingOverlayTokenState;
  label?: string;
  progress?: number;
  metadata?: LoadingOverlayMetadata;
  order: number;
};

export type LoadingOverlaySnapshot = {
  status: LoadingOverlayStatus;
  label: string;
  progress?: number;
};

type OverlayLayerHandle = {
  registerLayer: (registration: {
    id: string;
    kind: "loading";
    scope?: string;
    getRestoreTarget: () => Element | null;
    onSuspend: () => void;
    onResume: () => void;
  }) => () => void;
  setForeground: (id: string) => void;
  clearForeground: (id: string) => void;
};

const OVERLAY_LAYER_SLOT = Symbol.for("app-kit.overlay-layer-context");

function getOverlayLayerContext() {
  const holder = globalThis as typeof globalThis & {
    [OVERLAY_LAYER_SLOT]?: ReturnType<
      typeof createContext<OverlayLayerHandle | null>
    >;
  };
  if (!holder[OVERLAY_LAYER_SLOT]) {
    holder[OVERLAY_LAYER_SLOT] = createContext<OverlayLayerHandle | null>(null);
  }
  return holder[OVERLAY_LAYER_SLOT];
}

const defaultClock: LoadingOverlayClock = {
  setTimeout: (callback, delay = 0) =>
    globalThis.setTimeout(callback, delay) as unknown as number,
  clearTimeout: (id) => {
    globalThis.clearTimeout(id);
  },
};

function unknownScopeError(scope: string, actual: string) {
  return new Error(
    `Unknown loading overlay scope "${scope}". Active scope is "${actual}".`
  );
}

function reduceTokens(
  tokens: Iterable<TokenRecord>,
  labels: { loading: string; success: string; error: string }
): LoadingOverlaySnapshot {
  const records = [...tokens].filter((token) => token.state !== "released");
  const pending = records.filter((token) => token.state === "pending");
  if (pending.length > 0) {
    const latest = pending.reduce((a, b) => (a.order >= b.order ? a : b));
    const determinate = pending.every((token) => token.progress != null);
    return {
      status: "loading",
      label: latest.label ?? labels.loading,
      progress: determinate
        ? Math.min(...pending.map((token) => token.progress!))
        : undefined,
    };
  }

  const failed = records.filter((token) => token.state === "failed");
  if (failed.length > 0) {
    const latest = failed.reduce((a, b) => (a.order >= b.order ? a : b));
    return {
      status: "error",
      label: latest.metadata?.message ?? latest.label ?? labels.error,
    };
  }

  const succeeded = records.filter((token) => token.state === "succeeded");
  if (succeeded.length > 0) {
    const latest = succeeded.reduce((a, b) => (a.order >= b.order ? a : b));
    return {
      status: "success",
      label: latest.metadata?.message ?? latest.label ?? labels.success,
    };
  }

  return { status: "idle", label: "" };
}

class LoadingOverlayStore {
  private tokens = new Map<LoadingOverlayToken, TokenRecord>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private resetTimer: number | undefined;
  snapshot: LoadingOverlaySnapshot = { status: "idle", label: "" };

  constructor(
    private readonly scope: string,
    private readonly labels: {
      loading: string;
      success: string;
      error: string;
    },
    private readonly durations: {
      success: number;
      error: number;
    },
    private readonly clock: LoadingOverlayClock
  ) {}

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  begin = (options?: LoadingOverlayBeginOptions): LoadingOverlayToken => {
    if (options?.scope != null && options.scope !== this.scope) {
      throw unknownScopeError(options.scope, this.scope);
    }
    this.clearResetTimer();
    this.seq += 1;
    const id = `${this.scope}-${this.seq}`;
    this.tokens.set(id, {
      id,
      state: "pending",
      label: options?.label,
      progress: options?.progress,
      order: this.seq,
    });
    this.recompute();
    return id;
  };

  update = (token: LoadingOverlayToken, patch: LoadingOverlayUpdateOptions) => {
    const record = this.tokens.get(token);
    if (!record || record.state !== "pending") {
      return;
    }
    if (patch.label !== undefined) {
      record.label = patch.label;
    }
    if (patch.progress !== undefined) {
      record.progress = patch.progress;
    }
    this.recompute();
  };

  succeed = (token: LoadingOverlayToken, metadata?: LoadingOverlayMetadata) => {
    const record = this.tokens.get(token);
    if (!record || record.state !== "pending") {
      return;
    }
    this.seq += 1;
    record.state = "succeeded";
    record.metadata = metadata;
    record.order = this.seq;
    this.recompute();
  };

  fail = (token: LoadingOverlayToken, metadata?: LoadingOverlayMetadata) => {
    const record = this.tokens.get(token);
    if (!record || record.state !== "pending") {
      return;
    }
    this.seq += 1;
    record.state = "failed";
    record.metadata = metadata;
    record.order = this.seq;
    this.recompute();
  };

  release = (token: LoadingOverlayToken) => {
    const record = this.tokens.get(token);
    if (!record || record.state !== "pending") {
      return;
    }
    record.state = "released";
    this.recompute();
  };

  teardown = () => {
    this.clearResetTimer();
    for (const record of this.tokens.values()) {
      record.state = "released";
    }
    this.recompute();
  };

  private recompute() {
    this.snapshot = reduceTokens(this.tokens.values(), this.labels);
    this.syncResetTimer();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private syncResetTimer() {
    if (
      this.snapshot.status === "success" ||
      this.snapshot.status === "error"
    ) {
      const delay =
        this.snapshot.status === "success"
          ? this.durations.success
          : this.durations.error;
      if (delay <= 0) {
        this.releaseTerminals();
        return;
      }
      if (this.resetTimer != null) {
        return;
      }
      this.resetTimer = this.clock.setTimeout(() => {
        this.resetTimer = undefined;
        this.releaseTerminals();
      }, delay);
      return;
    }
    this.clearResetTimer();
  }

  private releaseTerminals() {
    for (const record of this.tokens.values()) {
      if (record.state === "succeeded" || record.state === "failed") {
        record.state = "released";
      }
    }
    this.snapshot = reduceTokens(this.tokens.values(), this.labels);
    for (const listener of this.listeners) {
      listener();
    }
  }

  private clearResetTimer() {
    if (this.resetTimer == null) {
      return;
    }
    this.clock.clearTimeout(this.resetTimer);
    this.resetTimer = undefined;
  }
}

const LoadingOverlayContext = createContext<{
  store: LoadingOverlayStore;
  scope: string;
  blocking: boolean;
  host: HTMLElement | null;
} | null>(null);

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function warnDev(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(message);
  }
}

export function LoadingOverlayProvider({
  children,
  scope = DEFAULT_LOADING_OVERLAY_SCOPE,
  blocking = true,
  successDurationMs = DEFAULT_SUCCESS_DURATION_MS,
  errorDurationMs = DEFAULT_ERROR_DURATION_MS,
  loadingLabel = DEFAULT_LOADING_LABEL,
  successLabel = DEFAULT_SUCCESS_LABEL,
  errorLabel = DEFAULT_ERROR_LABEL,
  clock = defaultClock,
}: LoadingOverlayProviderProps) {
  const layerId = useId();
  const overlay = useContext(getOverlayLayerContext());
  const restoreRef = useRef<Element | null>(null);
  const [store] = useState(
    () =>
      new LoadingOverlayStore(
        scope,
        {
          loading: loadingLabel,
          success: successLabel,
          error: errorLabel,
        },
        { success: successDurationMs, error: errorDurationMs },
        clock
      )
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
  const visible = snapshot.status !== "idle";
  const registerLayer =
    blocking && overlay != null && scope === DEFAULT_LOADING_OVERLAY_SCOPE;

  useEffect(() => {
    return () => store.teardown();
  }, [store]);

  useEffect(() => {
    if (!registerLayer || !overlay) {
      return;
    }
    return overlay.registerLayer({
      id: layerId,
      kind: "loading",
      scope,
      getRestoreTarget: () => restoreRef.current,
      onSuspend: () => {},
      onResume: () => {},
    });
  }, [layerId, overlay, registerLayer, scope]);

  useEffect(() => {
    if (!registerLayer || !overlay) {
      return;
    }
    if (visible) {
      restoreRef.current =
        typeof document !== "undefined" &&
        document.activeElement instanceof Element
          ? document.activeElement
          : null;
      overlay.setForeground(layerId);
      return;
    }
    overlay.clearForeground(layerId);
  }, [layerId, overlay, registerLayer, visible]);

  const inertChildren = blocking && visible;
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  return (
    <LoadingOverlayContext.Provider value={{ store, scope, blocking, host }}>
      <div
        ref={setHost}
        data-loading-overlay-scope={scope}
        className={
          scope === DEFAULT_LOADING_OVERLAY_SCOPE ? undefined : "relative"
        }
        aria-busy={snapshot.status === "loading" ? true : undefined}
      >
        <div inert={inertChildren ? true : undefined}>{children}</div>
      </div>
    </LoadingOverlayContext.Provider>
  );
}

export function useLoadingOverlay(options?: {
  scope?: string;
}): LoadingOverlayApi {
  const context = useContext(LoadingOverlayContext);
  if (!context) {
    throw new Error(
      "useLoadingOverlay() requires a LoadingOverlayProvider ancestor."
    );
  }
  if (options?.scope != null && options.scope !== context.scope) {
    throw unknownScopeError(options.scope, context.scope);
  }

  const hydrated = useHydrated();
  const snapshot = useSyncExternalStore(
    context.store.subscribe,
    context.store.getSnapshot,
    context.store.getSnapshot
  );

  const begin: LoadingOverlayApi["begin"] = (beginOptions) => {
    if (!hydrated) {
      warnDev(
        "useLoadingOverlay() operations are no-ops until LoadingOverlayProvider hydrates."
      );
      return "";
    }
    return context.store.begin(beginOptions);
  };

  return {
    begin,
    update: (token, patch) => {
      if (!hydrated) {
        return;
      }
      context.store.update(token, patch);
    },
    succeed: (token, metadata) => {
      if (!hydrated) {
        return;
      }
      context.store.succeed(token, metadata);
    },
    fail: (token, metadata) => {
      if (!hydrated) {
        return;
      }
      context.store.fail(token, metadata);
    },
    release: (token) => {
      if (!hydrated) {
        return;
      }
      context.store.release(token);
    },
    status: snapshot.status,
    label: snapshot.label,
    progress: snapshot.progress,
  };
}

export function LoadingOverlay() {
  const context = useContext(LoadingOverlayContext);
  if (!context) {
    throw new Error(
      "LoadingOverlay requires a LoadingOverlayProvider ancestor."
    );
  }
  const snapshot = useSyncExternalStore(
    context.store.subscribe,
    context.store.getSnapshot,
    context.store.getSnapshot
  );

  if (snapshot.status === "idle" || !context.host) {
    return null;
  }

  const page = context.scope === DEFAULT_LOADING_OVERLAY_SCOPE;
  const determinate =
    snapshot.status === "loading" && snapshot.progress != null;

  return createPortal(
    <div
      data-slot="loading-overlay"
      data-status={snapshot.status}
      data-blocking={context.blocking ? "true" : "false"}
      className={cn(
        "flex items-center justify-center bg-background/80 text-foreground",
        page ? "fixed inset-0" : "absolute inset-0",
        page && context.blocking ? "z-[60]" : "z-10",
        context.blocking ? "pointer-events-auto" : "pointer-events-none"
      )}
      tabIndex={context.blocking ? -1 : undefined}
    >
      <div
        role="status"
        aria-live={snapshot.status === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        aria-busy={snapshot.status === "loading" ? true : undefined}
      >
        {snapshot.status === "loading" ? (
          <span
            data-slot="loading-overlay-spinner"
            className="mx-auto mb-2 block size-8 rounded-full border-2 border-muted border-t-foreground motion-safe:animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : null}
        <span>{snapshot.label}</span>
        {determinate ? (
          <progress
            aria-label={snapshot.label}
            max={100}
            value={Math.round(snapshot.progress! * 100)}
          />
        ) : null}
      </div>
    </div>,
    context.host
  );
}
