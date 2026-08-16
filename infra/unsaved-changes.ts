export type DirtyNavigationPolicy =
  "allow" | "block-and-confirm" | "block-with-custom-flow";

export type ConfirmSettlement = "confirmed" | "cancelled" | "dismissed";

export type UnsavedConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type UnsavedConfirmAdapter = {
  confirm: (options: UnsavedConfirmOptions) => Promise<ConfirmSettlement>;
};

export type NavigationIntent = {
  readonly href: string;
  readonly replace?: boolean;
};

export type BypassToken = string;

export type NavigationOutcome =
  | "allowed"
  | "blocked"
  | "cancelled"
  | "dismissed"
  | "navigated"
  | "navigation-failed"
  | "ignored";

export type UnsavedChangesNavigate = (
  intent: NavigationIntent,
  options: { bypassToken?: BypassToken }
) => Promise<void> | void;

export type UnsavedChangesWindow = {
  addEventListener: (
    type: "beforeunload",
    listener: (event: BeforeUnloadEvent) => void
  ) => void;
  removeEventListener: (
    type: "beforeunload",
    listener: (event: BeforeUnloadEvent) => void
  ) => void;
};

/** Consumer-owned Dirty state seam: observe, optionally flush/discard. */
export type DirtyStateSource = {
  getIsDirty: () => boolean;
  subscribe: (listener: () => void) => () => void;
  flush?: () => Promise<unknown>;
  discard?: () => Promise<void> | void;
};

export type DirtyStateFlushResult = {
  ok: boolean;
};

export type DirtyStateContext = {
  isDirty: boolean;
  /** Flush every Dirty state source that exposes flush. Failures → ok:false. */
  flush: () => Promise<DirtyStateFlushResult>;
  /** Discard every Dirty state source that exposes discard. */
  discard: () => Promise<void>;
};

export type CreateDirtyStateSourceOptions = {
  getIsDirty?: () => boolean;
  flush?: () => Promise<unknown>;
  discard?: () => Promise<void> | void;
};

export type MemoryDirtyStateSource = DirtyStateSource & {
  setDirty: (dirty: boolean) => void;
};

/** In-memory Dirty state source for tests and form adapters. */
export function createDirtyStateSource(
  initialDirty = false,
  options?: CreateDirtyStateSourceOptions
): MemoryDirtyStateSource {
  let dirty = initialDirty;
  const listeners = new Set<() => void>();

  return {
    getIsDirty: () => (options?.getIsDirty ? options.getIsDirty() : dirty),
    setDirty(next) {
      dirty = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush: options?.flush,
    discard: options?.discard,
  };
}

export type CreateUnsavedChangesGuardOptions = {
  /**
   * Controlled dirty — when set, stays authoritative over markDirty/markClean.
   * Still ORs with registered Dirty state sources.
   */
  getIsDirty?: () => boolean;
  /** Additional Dirty state sources (Draft adapters, fakes, form fields). */
  dirtySources?: DirtyStateSource[];
  policy?: DirtyNavigationPolicy;
  confirm?: UnsavedConfirmAdapter;
  confirmOptions?: UnsavedConfirmOptions;
  onCustomFlow?: (
    intent: NavigationIntent,
    dirty: DirtyStateContext
  ) => Promise<ConfirmSettlement>;
  navigate: UnsavedChangesNavigate;
  cancelNavigation?: (intent: NavigationIntent) => void;
  createBypassToken?: () => BypassToken;
  window?: UnsavedChangesWindow | null;
};

export type UnsavedChangesGuard = {
  getIsDirty: () => boolean;
  markDirty: () => void;
  markClean: () => void;
  /** Re-read Dirty state sources and refresh beforeunload / subscribers. */
  resync: () => void;
  attemptNavigation: (
    intent: NavigationIntent,
    options?: { bypassToken?: BypassToken }
  ) => Promise<NavigationOutcome>;
  cancelNavigation: (intent?: NavigationIntent) => void;
  retryNavigation: (bypassToken: BypassToken) => Promise<NavigationOutcome>;
  mount: () => () => void;
  subscribe: (listener: () => void) => () => void;
};

const DEFAULT_CONFIRM_OPTIONS: UnsavedConfirmOptions = {
  title: "Leave without saving?",
  description: "You have unsaved changes. If you leave, they will be lost.",
  confirmLabel: "Leave",
  cancelLabel: "Stay",
  destructive: true,
};

let tokenCounter = 0;

function defaultBypassToken(): BypassToken {
  tokenCounter += 1;
  return `unsaved-bypass-${tokenCounter}`;
}

function resolveWindow(
  explicit: CreateUnsavedChangesGuardOptions["window"]
): UnsavedChangesWindow | null {
  if (explicit === null) {
    return null;
  }
  if (explicit) {
    return explicit;
  }
  if (typeof globalThis.window === "undefined") {
    return null;
  }
  return globalThis.window;
}

/** Draft-style flush results use status; throws also count as failure. */
function isDirtyStateFlushFailure(result: unknown): boolean {
  if (result === null || typeof result !== "object") {
    return false;
  }
  if (!("status" in result)) {
    return false;
  }
  const status = (result as { status: unknown }).status;
  return status === "error" || status === "conflict" || status === "blocked";
}

export function createUnsavedChangesGuard(
  options: CreateUnsavedChangesGuardOptions
): UnsavedChangesGuard {
  const policy = options.policy ?? "block-and-confirm";
  const createBypassToken = options.createBypassToken ?? defaultBypassToken;
  const win = resolveWindow(options.window);
  const confirmOptions = {
    ...DEFAULT_CONFIRM_OPTIONS,
    ...options.confirmOptions,
  };

  let internalDirty = false;
  let mounted = false;
  let beforeUnloadAttached = false;
  let pendingIntent: NavigationIntent | null = null;
  let pendingBypassToken: BypassToken | null = null;
  let confirming = false;
  const listeners = new Set<() => void>();
  const dirtySources = options.dirtySources ?? [];

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const getOwnedDirty = () => {
    if (options.getIsDirty) {
      return options.getIsDirty();
    }
    return internalDirty;
  };

  const getIsDirty = () => {
    if (getOwnedDirty()) {
      return true;
    }
    return dirtySources.some((source) => source.getIsDirty());
  };

  const beforeUnloadListener = (event: BeforeUnloadEvent) => {
    if (!getIsDirty()) {
      return;
    }
    event.preventDefault();
    // Chromium still requires returnValue to be set for the prompt.
    event.returnValue = "";
  };

  const syncBeforeUnload = () => {
    if (!win) {
      return;
    }
    const shouldAttach = mounted && getIsDirty();
    if (shouldAttach && !beforeUnloadAttached) {
      win.addEventListener("beforeunload", beforeUnloadListener);
      beforeUnloadAttached = true;
      return;
    }
    if (!shouldAttach && beforeUnloadAttached) {
      win.removeEventListener("beforeunload", beforeUnloadListener);
      beforeUnloadAttached = false;
    }
  };

  const resync = () => {
    syncBeforeUnload();
    notify();
  };

  for (const source of dirtySources) {
    source.subscribe(() => {
      resync();
    });
  }

  const dirtyContext = (): DirtyStateContext => ({
    isDirty: getIsDirty(),
    async flush() {
      try {
        for (const source of dirtySources) {
          if (!source.flush) {
            continue;
          }
          const result = await source.flush();
          if (isDirtyStateFlushFailure(result)) {
            resync();
            return { ok: false };
          }
        }
        resync();
        return { ok: true };
      } catch {
        resync();
        return { ok: false };
      }
    },
    async discard() {
      for (const source of dirtySources) {
        if (!source.discard) {
          continue;
        }
        await source.discard();
      }
      resync();
    },
  });

  const markDirty = () => {
    if (!options.getIsDirty) {
      internalDirty = true;
    }
    resync();
  };

  const markClean = () => {
    if (!options.getIsDirty) {
      internalDirty = false;
    }
    resync();
  };

  const runNavigate = async (
    intent: NavigationIntent,
    bypassToken?: BypassToken
  ): Promise<NavigationOutcome> => {
    try {
      await options.navigate(intent, { bypassToken });
      return "navigated";
    } catch {
      return "navigation-failed";
    }
  };

  const isPendingIntent = (intent: NavigationIntent) =>
    pendingIntent === intent;

  const settleLeave = async (
    intent: NavigationIntent,
    settlement: ConfirmSettlement
  ): Promise<NavigationOutcome> => {
    if (!isPendingIntent(intent)) {
      return "ignored";
    }

    // Clean won while confirmation was open — proceed once, no second prompt.
    if (!getIsDirty()) {
      pendingIntent = null;
      pendingBypassToken = null;
      const outcome = await runNavigate(intent);
      return outcome === "navigated" ? "allowed" : "navigation-failed";
    }

    if (settlement !== "confirmed") {
      options.cancelNavigation?.(intent);
      pendingIntent = null;
      pendingBypassToken = null;
      return settlement;
    }

    const bypassToken = createBypassToken();
    pendingBypassToken = bypassToken;
    const outcome = await runNavigate(intent, bypassToken);
    pendingIntent = null;
    pendingBypassToken = null;
    return outcome === "navigated" ? "navigated" : "navigation-failed";
  };

  const attemptNavigation = async (
    intent: NavigationIntent,
    optionsOverride?: { bypassToken?: BypassToken }
  ): Promise<NavigationOutcome> => {
    const bypassToken = optionsOverride?.bypassToken;
    if (
      bypassToken &&
      pendingBypassToken === bypassToken &&
      pendingIntent &&
      pendingIntent.href === intent.href
    ) {
      const pending = pendingIntent;
      pendingIntent = null;
      pendingBypassToken = null;
      return runNavigate(pending, bypassToken);
    }

    if (confirming) {
      return "ignored";
    }

    if (!getIsDirty() || policy === "allow") {
      const outcome = await runNavigate(intent);
      return outcome === "navigated" ? "allowed" : "navigation-failed";
    }

    if (policy === "block-with-custom-flow") {
      if (!options.onCustomFlow) {
        return "blocked";
      }
      confirming = true;
      pendingIntent = intent;
      try {
        const settlement = await options.onCustomFlow(intent, dirtyContext());
        return await settleLeave(intent, settlement);
      } finally {
        confirming = false;
      }
    }

    if (!options.confirm) {
      return "blocked";
    }

    confirming = true;
    pendingIntent = intent;
    try {
      const settlement = await options.confirm.confirm(confirmOptions);
      return await settleLeave(intent, settlement);
    } catch {
      if (isPendingIntent(intent)) {
        options.cancelNavigation?.(intent);
        pendingIntent = null;
        pendingBypassToken = null;
        return "blocked";
      }
      return "ignored";
    } finally {
      confirming = false;
    }
  };

  const cancelNavigation = (intent?: NavigationIntent) => {
    const target = intent ?? pendingIntent;
    if (target) {
      options.cancelNavigation?.(target);
    }
    pendingIntent = null;
    pendingBypassToken = null;
    confirming = false;
  };

  const retryNavigation = async (
    bypassToken: BypassToken
  ): Promise<NavigationOutcome> => {
    if (!pendingIntent || pendingBypassToken !== bypassToken) {
      return "ignored";
    }
    const intent = pendingIntent;
    pendingIntent = null;
    pendingBypassToken = null;
    return runNavigate(intent, bypassToken);
  };

  const mount = () => {
    mounted = true;
    syncBeforeUnload();
    return () => {
      const pending = pendingIntent;
      mounted = false;
      if (pending) {
        options.cancelNavigation?.(pending);
      }
      pendingIntent = null;
      pendingBypassToken = null;
      confirming = false;
      syncBeforeUnload();
    };
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    getIsDirty,
    markDirty,
    markClean,
    resync,
    attemptNavigation,
    cancelNavigation,
    retryNavigation,
    mount,
    subscribe,
  };
}
