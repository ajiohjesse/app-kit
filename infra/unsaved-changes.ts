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

export type CreateUnsavedChangesGuardOptions = {
  /** When provided, controlled dirty stays authoritative. */
  getIsDirty?: () => boolean;
  policy?: DirtyNavigationPolicy;
  confirm?: UnsavedConfirmAdapter;
  confirmOptions?: UnsavedConfirmOptions;
  onCustomFlow?: (intent: NavigationIntent) => Promise<ConfirmSettlement>;
  navigate: UnsavedChangesNavigate;
  cancelNavigation?: (intent: NavigationIntent) => void;
  createBypassToken?: () => BypassToken;
  window?: UnsavedChangesWindow | null;
};

export type UnsavedChangesGuard = {
  getIsDirty: () => boolean;
  markDirty: () => void;
  markClean: () => void;
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

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const getIsDirty = () => {
    if (options.getIsDirty) {
      return options.getIsDirty();
    }
    return internalDirty;
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

  const markDirty = () => {
    if (!options.getIsDirty) {
      internalDirty = true;
    }
    syncBeforeUnload();
    notify();
  };

  const markClean = () => {
    if (!options.getIsDirty) {
      internalDirty = false;
    }
    syncBeforeUnload();
    notify();
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
        const settlement = await options.onCustomFlow(intent);
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
    attemptNavigation,
    cancelNavigation,
    retryNavigation,
    mount,
    subscribe,
  };
}
