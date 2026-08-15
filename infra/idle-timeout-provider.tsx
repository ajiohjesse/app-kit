"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createIdleTimeout,
  createBroadcastIdleChannel,
  DEFAULT_IDLE_MS,
  DEFAULT_WARNING_MS,
  DEFAULT_ACTIVITY_THROTTLE_MS,
  DEFAULT_ACTIVITY_EVENTS,
  type CreateIdleTimeoutOptions,
  type IdleAuthAdapter,
  type IdleChannel,
  type IdleClock,
  type IdleConfirmAdapter,
  type IdleState,
  type IdleTimeout,
  type IdleTimeoutReason,
  type IdleTimeoutSnapshot,
} from "@/infra/idle-timeout";

export {
  createIdleTimeout,
  createBroadcastIdleChannel,
  DEFAULT_IDLE_MS,
  DEFAULT_WARNING_MS,
  DEFAULT_ACTIVITY_THROTTLE_MS,
  DEFAULT_ACTIVITY_EVENTS,
};

export type {
  IdleAuthAdapter,
  IdleChannel,
  IdleClock,
  IdleConfirmAdapter,
  IdleState,
  IdleTimeoutReason,
  IdleTimeoutSnapshot,
  IdleTimeout,
  CreateIdleTimeoutOptions,
};

export type IdleTimeoutProviderProps = {
  children: ReactNode;
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
  crossTabSignOut?: boolean;
  paused?: boolean;
  warningCopy?: CreateIdleTimeoutOptions["warningCopy"];
};

type IdleTimeoutContextValue = {
  snapshot: IdleTimeoutSnapshot;
  reset: () => void;
  extend: () => void;
  signOut: () => Promise<void>;
  noteActivity: () => void;
  controller: IdleTimeout;
};

const IdleTimeoutContext = createContext<IdleTimeoutContextValue | null>(null);

export function IdleTimeoutProvider({
  children,
  idleMs,
  warningMs,
  activityThrottleMs,
  activityEvents,
  clock,
  confirm,
  auth,
  sessionExpiresAt = null,
  sessionId,
  scopeKey,
  channel,
  crossTabSignOut,
  paused = false,
  warningCopy,
}: IdleTimeoutProviderProps) {
  const bagRef = useRef<CreateIdleTimeoutOptions>({
    idleMs,
    warningMs,
    activityThrottleMs,
    activityEvents,
    clock,
    confirm,
    auth,
    sessionExpiresAt,
    sessionId,
    scopeKey,
    channel,
    crossTabSignOut,
    paused,
    warningCopy,
  });

  useEffect(() => {
    bagRef.current.confirm = confirm;
    bagRef.current.auth = auth;
    bagRef.current.warningCopy = warningCopy;
  });

  // Stable controller closes over the bag object; live fields update in the effect above.
  // eslint-disable-next-line react-hooks/refs -- init only reads the ref object once
  const [controller] = useState(() => createIdleTimeout(bagRef.current));

  useEffect(() => {
    return controller.mount();
  }, [controller]);

  useEffect(() => {
    controller.setSessionExpiresAt(sessionExpiresAt ?? null);
  }, [controller, sessionExpiresAt]);

  useEffect(() => {
    controller.setPaused(paused);
  }, [controller, paused]);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  const value = useMemo<IdleTimeoutContextValue>(
    () => ({
      snapshot,
      reset: controller.reset,
      extend: controller.extend,
      signOut: controller.signOut,
      noteActivity: controller.noteActivity,
      controller,
    }),
    [controller, snapshot]
  );

  return (
    <IdleTimeoutContext.Provider value={value}>
      {children}
    </IdleTimeoutContext.Provider>
  );
}

export function useIdleTimeout(): IdleTimeoutContextValue {
  const value = useContext(IdleTimeoutContext);
  if (!value) {
    throw new Error("useIdleTimeout must be used within IdleTimeoutProvider");
  }
  return value;
}
