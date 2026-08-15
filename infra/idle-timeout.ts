export type IdleState = "active" | "warning" | "timed-out";

export type IdleTimeoutReason = "idle" | "session-expired" | null;

export type IdleTimeoutSnapshot = {
  state: IdleState;
  reason: IdleTimeoutReason;
  lastActivityAt: number;
  idleDeadlineAt: number;
  warningDeadlineAt: number | null;
  remainingWarningMs: number | null;
  sessionExpiresAt: string | null;
};

export type IdleClock = {
  now: () => number;
  setTimeout: (callback: () => void, delay?: number) => number;
  clearTimeout: (id: number) => void;
};

export type IdleConfirmSettlement = "confirmed" | "cancelled" | "dismissed";

export type IdleConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type IdleConfirmAdapter = {
  confirm: (options: IdleConfirmOptions) => Promise<IdleConfirmSettlement>;
};

export type IdleAuthAdapter = {
  signOut: (input?: { signal?: AbortSignal }) => Promise<void>;
  refresh?: (input?: { signal?: AbortSignal }) => Promise<unknown>;
};

export type IdleChannelMessage = {
  type: "timed-out" | "signed-out";
  scopeKey: string;
  sessionId?: string;
  timestamp: number;
  id: string;
};

export type IdleChannel = {
  post: (message: IdleChannelMessage) => void;
  subscribe: (listener: (message: IdleChannelMessage) => void) => () => void;
};

export type IdleDocument = {
  hidden: boolean;
  visibilityState: DocumentVisibilityState;
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => void;
};

export const DEFAULT_IDLE_MS = 15 * 60 * 1000;
export const DEFAULT_WARNING_MS = 60 * 1000;
export const DEFAULT_ACTIVITY_THROTTLE_MS = 1_000;
export const DEFAULT_ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const;

const wallClock: IdleClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay = 0) =>
    globalThis.setTimeout(callback, delay) as unknown as number,
  clearTimeout: (id) => {
    globalThis.clearTimeout(id);
  },
};

export type CreateIdleTimeoutOptions = {
  idleMs?: number;
  warningMs?: number;
  activityThrottleMs?: number;
  activityEvents?: readonly string[];
  clock?: IdleClock;
  confirm?: IdleConfirmAdapter;
  auth?: IdleAuthAdapter;
  sessionExpiresAt?: string | null;
  sessionId?: string;
  scopeKey?: string;
  channel?: IdleChannel | null;
  /** When false, terminal events are not broadcast even if a channel exists. */
  crossTabSignOut?: boolean;
  paused?: boolean;
  document?: IdleDocument | null;
  warningCopy?: {
    idleTitle?: string;
    idleDescription?: string;
    sessionTitle?: string;
    sessionDescription?: string;
  };
};

export type IdleTimeout = {
  getState: () => IdleTimeoutSnapshot;
  subscribe: (listener: () => void) => () => void;
  mount: () => () => void;
  reset: () => void;
  extend: () => void;
  signOut: () => Promise<void>;
  noteActivity: () => void;
  setSessionExpiresAt: (expiresAt: string | null) => void;
  setPaused: (paused: boolean) => void;
};

let messageCounter = 0;

function nextMessageId() {
  messageCounter += 1;
  return `idle-msg-${messageCounter}`;
}

function resolveDocument(
  explicit: CreateIdleTimeoutOptions["document"]
): IdleDocument | null {
  if (explicit === null) {
    return null;
  }
  if (explicit) {
    return explicit;
  }
  if (typeof globalThis.document === "undefined") {
    return null;
  }
  return globalThis.document;
}

export function createBroadcastIdleChannel(scopeKey: string): IdleChannel {
  const name = `app-kit:idle-timeout:${scopeKey}`;
  const channel = new BroadcastChannel(name);
  return {
    post(message) {
      channel.postMessage(message);
    },
    subscribe(listener) {
      const onMessage = (event: MessageEvent<IdleChannelMessage>) => {
        listener(event.data);
      };
      channel.addEventListener("message", onMessage);
      return () => {
        channel.removeEventListener("message", onMessage);
      };
    },
  };
}

export function createIdleTimeout(
  options: CreateIdleTimeoutOptions = {}
): IdleTimeout {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const warningMs = options.warningMs ?? DEFAULT_WARNING_MS;
  const activityThrottleMs =
    options.activityThrottleMs ?? DEFAULT_ACTIVITY_THROTTLE_MS;
  const activityEvents = options.activityEvents ?? DEFAULT_ACTIVITY_EVENTS;
  const clock = options.clock ?? wallClock;
  const scopeKey = options.scopeKey ?? "default";
  const crossTabSignOut = options.crossTabSignOut !== false;
  const doc = resolveDocument(options.document);
  const getWarningCopy = () => options.warningCopy ?? {};
  const getConfirm = () => options.confirm;
  const getAuth = () => options.auth;

  let channel = options.channel;
  let sessionExpiresAt = options.sessionExpiresAt ?? null;
  const sessionId = options.sessionId;
  let paused = options.paused ?? false;
  let mounted = false;
  let warningOpen = false;
  let signingOut = false;
  let lastActivityAt = clock.now();
  let lastActivityNoteAt = 0;
  let state: IdleState = "active";
  let reason: IdleTimeoutReason = null;
  let idleDeadlineAt = lastActivityAt + idleMs;
  let warningDeadlineAt: number | null = null;
  let timerId: number | null = null;
  let unsubscribeChannel: (() => void) | null = null;
  const seenMessageIds = new Set<string>();
  const listeners = new Set<() => void>();
  const activityCleanups: Array<() => void> = [];

  let cachedState: IdleTimeoutSnapshot = {
    state,
    reason,
    lastActivityAt,
    idleDeadlineAt,
    warningDeadlineAt,
    remainingWarningMs: null,
    sessionExpiresAt,
  };

  const buildSnapshot = (): IdleTimeoutSnapshot => ({
    state,
    reason,
    lastActivityAt,
    idleDeadlineAt,
    warningDeadlineAt,
    remainingWarningMs:
      state === "warning" && warningDeadlineAt !== null
        ? Math.max(0, warningDeadlineAt - clock.now())
        : null,
    sessionExpiresAt,
  });

  const notify = () => {
    cachedState = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  };

  const getState = () => cachedState;

  const clearTimer = () => {
    if (timerId !== null) {
      clock.clearTimeout(timerId);
      timerId = null;
    }
  };

  const schedule = (delay: number, callback: () => void) => {
    clearTimer();
    timerId = clock.setTimeout(
      () => {
        timerId = null;
        callback();
      },
      Math.max(0, delay)
    );
  };

  const enterTimedOut = (nextReason: Exclude<IdleTimeoutReason, null>) => {
    if (state === "timed-out") {
      return;
    }
    clearTimer();
    state = "timed-out";
    reason = nextReason;
    warningDeadlineAt = null;
    warningOpen = false;
    notify();
    broadcastTerminal("timed-out");
  };

  const broadcastTerminal = (type: IdleChannelMessage["type"]) => {
    if (!mounted || !channel || !crossTabSignOut || !getAuth()?.signOut) {
      return;
    }
    const message: IdleChannelMessage = {
      type,
      scopeKey,
      sessionId,
      timestamp: clock.now(),
      id: nextMessageId(),
    };
    seenMessageIds.add(message.id);
    channel.post(message);
  };

  const openWarning = async (nextReason: Exclude<IdleTimeoutReason, null>) => {
    const confirm = getConfirm();
    if (!confirm || warningOpen || state !== "warning") {
      return;
    }
    warningOpen = true;
    const auth = getAuth();
    const warningCopy = getWarningCopy();
    const hasRefresh = typeof auth?.refresh === "function";
    const isSession = nextReason === "session-expired";
    const optionsForConfirm: IdleConfirmOptions = isSession
      ? {
          title: warningCopy.sessionTitle ?? "Session expiring",
          description:
            warningCopy.sessionDescription ??
            "Your session is about to expire.",
          confirmLabel: hasRefresh ? "Refresh session" : "Dismiss warning",
          cancelLabel: "Sign out",
          destructive: true,
        }
      : {
          title: warningCopy.idleTitle ?? "Still there?",
          description:
            warningCopy.idleDescription ??
            "Your session will end soon due to inactivity.",
          confirmLabel: "Continue",
          cancelLabel: "Sign out",
          destructive: true,
        };

    try {
      const settlement = await confirm.confirm(optionsForConfirm);
      if (!mounted || state !== "warning") {
        return;
      }
      if (settlement === "dismissed") {
        // Fail-safe: keep warning + countdown, and reopen the dialog.
        warningOpen = false;
        queueMicrotask(() => {
          if (mounted && state === "warning") {
            void openWarning(nextReason);
          }
        });
        return;
      }
      if (settlement === "cancelled") {
        await signOut();
        return;
      }
      // confirmed
      if (isSession) {
        if (hasRefresh && auth?.refresh) {
          await auth.refresh();
          // Consumer should call setSessionExpiresAt with the new expiry.
          return;
        }
        // Dismiss warning — leave state unchanged.
        return;
      }
      extend();
    } catch {
      warningOpen = false;
      queueMicrotask(() => {
        if (mounted && state === "warning") {
          void openWarning(nextReason);
        }
      });
      return;
    } finally {
      warningOpen = false;
    }
  };

  const enterWarning = (nextReason: Exclude<IdleTimeoutReason, null>) => {
    if (state === "timed-out" || state === "warning") {
      if (state === "warning" && reason === nextReason) {
        return;
      }
      if (state === "timed-out") {
        return;
      }
    }
    state = "warning";
    reason = nextReason;
    const now = clock.now();
    if (nextReason === "idle") {
      warningDeadlineAt = now + warningMs;
    } else if (sessionExpiresAt) {
      warningDeadlineAt = Date.parse(sessionExpiresAt);
    } else {
      warningDeadlineAt = now + warningMs;
    }
    notify();
    schedule(Math.max(0, (warningDeadlineAt ?? now) - now), () => {
      evaluate();
    });
    void openWarning(nextReason);
  };

  const evaluate = () => {
    if (!mounted || paused || state === "timed-out") {
      return;
    }
    const now = clock.now();

    let sessionWarningAt: number | null = null;
    let sessionExpireAt: number | null = null;
    if (sessionExpiresAt) {
      sessionExpireAt = Date.parse(sessionExpiresAt);
      if (!Number.isNaN(sessionExpireAt)) {
        sessionWarningAt = sessionExpireAt - warningMs;
      }
    }

    if (sessionExpireAt !== null && now >= sessionExpireAt) {
      enterTimedOut("session-expired");
      return;
    }

    if (now >= idleDeadlineAt + warningMs && reason !== "session-expired") {
      // Idle path: warning started at idleDeadlineAt; timeout at + warningMs
      if (state === "warning" && reason === "idle") {
        enterTimedOut("idle");
        return;
      }
      if (state === "active" && now >= idleDeadlineAt + warningMs) {
        enterTimedOut("idle");
        return;
      }
    }

    if (state === "warning") {
      if (warningDeadlineAt !== null && now >= warningDeadlineAt) {
        enterTimedOut(reason ?? "idle");
        return;
      }
      schedule(Math.max(0, (warningDeadlineAt ?? now) - now), evaluate);
      return;
    }

    // active
    const idleWarningAt = idleDeadlineAt;
    const candidates = [idleWarningAt];
    if (sessionWarningAt !== null) {
      candidates.push(sessionWarningAt);
    }
    const nextAt = Math.min(...candidates);
    if (now >= nextAt) {
      if (sessionWarningAt !== null && now >= sessionWarningAt) {
        enterWarning("session-expired");
        return;
      }
      enterWarning("idle");
      return;
    }
    schedule(nextAt - now, evaluate);
  };

  const recomputeIdleDeadline = () => {
    idleDeadlineAt = lastActivityAt + idleMs;
  };

  const resetTimersFromActivity = () => {
    if (state === "timed-out" || paused) {
      return;
    }
    lastActivityAt = clock.now();
    recomputeIdleDeadline();
    if (state === "warning" && reason === "idle") {
      state = "active";
      reason = null;
      warningDeadlineAt = null;
      warningOpen = false;
    } else if (state === "active") {
      reason = null;
    }
    notify();
    evaluate();
  };

  const extend = () => {
    if (state === "timed-out") {
      return;
    }
    resetTimersFromActivity();
  };

  const reset = () => {
    clearTimer();
    lastActivityAt = clock.now();
    recomputeIdleDeadline();
    state = "active";
    reason = null;
    warningDeadlineAt = null;
    warningOpen = false;
    notify();
    if (mounted && !paused) {
      evaluate();
    }
  };

  const signOut = async () => {
    if (signingOut) {
      return;
    }
    signingOut = true;
    try {
      clearTimer();
      state = "timed-out";
      if (!reason) {
        reason = "idle";
      }
      warningDeadlineAt = null;
      warningOpen = false;
      notify();
      broadcastTerminal("signed-out");
      const signOutFn = getAuth()?.signOut;
      if (signOutFn) {
        await signOutFn();
      }
    } finally {
      signingOut = false;
    }
  };

  const noteActivity = () => {
    if (!mounted || paused || state === "timed-out") {
      return;
    }
    if (doc?.hidden) {
      return;
    }
    const now = clock.now();
    if (now - lastActivityNoteAt < activityThrottleMs) {
      return;
    }
    lastActivityNoteAt = now;
    if (state === "warning" && reason === "session-expired") {
      // Activity does not dismiss session-expiry warnings.
      return;
    }
    resetTimersFromActivity();
  };

  const onVisibility = () => {
    if (!mounted || paused || !doc) {
      return;
    }
    if (doc.hidden) {
      return;
    }
    // Deadlines keep advancing while hidden — evaluate before treating
    // visibility as activity so a passed deadline still times out.
    evaluate();
    if (state === "active") {
      noteActivity();
    }
  };

  const onChannelMessage = (message: IdleChannelMessage) => {
    if (message.scopeKey !== scopeKey) {
      return;
    }
    if (seenMessageIds.has(message.id)) {
      return;
    }
    seenMessageIds.add(message.id);
    if (message.type !== "timed-out" && message.type !== "signed-out") {
      return;
    }
    clearTimer();
    state = "timed-out";
    reason = reason ?? "idle";
    warningDeadlineAt = null;
    warningOpen = false;
    notify();
    const peerSignOut = getAuth()?.signOut;
    if (peerSignOut) {
      void peerSignOut();
    }
  };

  const attachActivity = () => {
    if (!doc) {
      return;
    }
    for (const eventName of activityEvents) {
      const listener = () => {
        noteActivity();
      };
      doc.addEventListener(eventName, listener, { passive: true });
      activityCleanups.push(() => {
        doc.removeEventListener(eventName, listener);
      });
    }
    const visibilityListener = () => {
      onVisibility();
    };
    doc.addEventListener("visibilitychange", visibilityListener);
    activityCleanups.push(() => {
      doc.removeEventListener("visibilitychange", visibilityListener);
    });
  };

  const detachActivity = () => {
    while (activityCleanups.length > 0) {
      activityCleanups.pop()?.();
    }
  };

  const mount = () => {
    if (mounted) {
      return () => undefined;
    }
    mounted = true;
    if (
      channel === undefined &&
      crossTabSignOut &&
      getAuth()?.signOut &&
      typeof BroadcastChannel !== "undefined"
    ) {
      channel = createBroadcastIdleChannel(scopeKey);
    }
    if (channel) {
      unsubscribeChannel = channel.subscribe(onChannelMessage);
    }
    attachActivity();
    if (!paused) {
      evaluate();
    }
    return () => {
      mounted = false;
      clearTimer();
      detachActivity();
      unsubscribeChannel?.();
      unsubscribeChannel = null;
      warningOpen = false;
    };
  };

  const setSessionExpiresAt = (expiresAt: string | null) => {
    sessionExpiresAt = expiresAt;
    if (!mounted || paused || state === "timed-out") {
      notify();
      return;
    }

    // Session change cancels a stale session-expiry warning when the new
    // expiry (or cleared session) is no longer in the warning window.
    if (state === "warning" && reason === "session-expired") {
      const expireMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
      const stillDue =
        expiresAt !== null &&
        !Number.isNaN(expireMs) &&
        clock.now() >= expireMs - warningMs;
      if (!stillDue) {
        state = "active";
        reason = null;
        warningDeadlineAt = null;
        warningOpen = false;
        notify();
        evaluate();
        return;
      }
    }

    evaluate();
    notify();
  };

  const setPaused = (next: boolean) => {
    paused = next;
    if (paused) {
      clearTimer();
      return;
    }
    if (mounted && state !== "timed-out") {
      evaluate();
    }
  };

  return {
    getState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mount,
    reset,
    extend,
    signOut,
    noteActivity,
    setSessionExpiresAt,
    setPaused,
  };
}
