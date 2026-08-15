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
import type { Session } from "@/infra/authentication-core";
import {
  createRefreshCoordinator,
  type InterceptMeta,
  type InterceptResult,
  type RefreshCallOptions,
  type RefreshCoordinator,
  type RefreshCoordinatorOptions,
  type RefreshOutcome,
  type RequestOperation,
} from "@/infra/session-refresh";

export type SessionRefreshContextValue = {
  coordinator: RefreshCoordinator;
  refresh: (options?: RefreshCallOptions) => Promise<RefreshOutcome>;
  intercept: <T>(
    operation: RequestOperation<T>,
    meta: InterceptMeta
  ) => Promise<InterceptResult<T>>;
  invalidate: (reason?: "sign-out" | "identity-change") => void;
};

const SessionRefreshContext = createContext<SessionRefreshContextValue | null>(
  null
);

export type SessionRefreshProviderProps = {
  children: ReactNode;
  refresh?: RefreshCoordinatorOptions["refresh"];
  getSession?: () => Session | null;
  session?: Session | null;
  now?: () => number;
  proactiveLeewayMs?: number;
  onSession?: RefreshCoordinatorOptions["onSession"];
  runAction?: RefreshCoordinatorOptions["runAction"];
  scope?: string;
  /** Opt-in: refresh when the document becomes visible again. */
  refreshOnVisible?: boolean;
  /** Opt-in: refresh when the window gains focus. */
  refreshOnFocus?: boolean;
};

function identityFromSession(session: Session | null): string | null {
  if (!session) {
    return null;
  }
  return `${session.user.id}:${session.sessionId ?? ""}`;
}

export function SessionRefreshProvider({
  children,
  refresh: refreshFn,
  getSession,
  session,
  now,
  proactiveLeewayMs,
  onSession,
  runAction,
  scope,
  refreshOnVisible = false,
  refreshOnFocus = false,
}: SessionRefreshProviderProps) {
  const [coordinator] = useState(() =>
    createRefreshCoordinator({
      scope,
      proactiveLeewayMs,
      refresh: refreshFn,
      getSession: () => getSession?.() ?? session ?? null,
      now,
      onSession,
      runAction,
    })
  );
  const previousIdentity = useRef<string | null>(null);

  useEffect(() => {
    coordinator.configure({
      refresh: refreshFn,
      getSession: () => getSession?.() ?? session ?? null,
      now,
      onSession: (next, reason) => {
        if (reason === "refreshed" && next) {
          previousIdentity.current = identityFromSession(next);
        } else if (reason === "expired") {
          previousIdentity.current = null;
        }
        onSession?.(next, reason);
      },
      runAction,
    });
  }, [coordinator, getSession, now, onSession, refreshFn, runAction, session]);

  useEffect(() => {
    return () => {
      coordinator.invalidate("sign-out");
    };
  }, [coordinator]);

  useEffect(() => {
    if (!refreshOnVisible || typeof document === "undefined") {
      return;
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void coordinator.refresh({ proactive: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [coordinator, refreshOnVisible]);

  useEffect(() => {
    if (!refreshOnFocus || typeof window === "undefined") {
      return;
    }
    const onFocus = () => {
      void coordinator.refresh({ proactive: true });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [coordinator, refreshOnFocus]);

  useEffect(() => {
    const active = session ?? getSession?.() ?? null;
    const next = identityFromSession(active);
    if (
      previousIdentity.current !== null &&
      next !== previousIdentity.current
    ) {
      coordinator.invalidate(next === null ? "sign-out" : "identity-change");
    }
    previousIdentity.current = next;
  }, [coordinator, getSession, session]);

  const refresh = useCallback(
    (options?: RefreshCallOptions) => coordinator.refresh(options),
    [coordinator]
  );

  const intercept = useCallback(
    <T,>(operation: RequestOperation<T>, meta: InterceptMeta) =>
      coordinator.intercept(operation, meta),
    [coordinator]
  );

  const invalidate = useCallback(
    (reason?: "sign-out" | "identity-change") => coordinator.invalidate(reason),
    [coordinator]
  );

  const value = useMemo<SessionRefreshContextValue>(
    () => ({
      coordinator,
      refresh,
      intercept,
      invalidate,
    }),
    [coordinator, intercept, invalidate, refresh]
  );

  return (
    <SessionRefreshContext.Provider value={value}>
      {children}
    </SessionRefreshContext.Provider>
  );
}

export function useSessionRefresh(): SessionRefreshContextValue {
  const context = useContext(SessionRefreshContext);
  if (!context) {
    throw new Error(
      "useSessionRefresh must be used within SessionRefreshProvider"
    );
  }
  return context;
}
