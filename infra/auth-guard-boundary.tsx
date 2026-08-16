"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useSession } from "@/infra/authentication-core-provider";
import type { Session } from "@/infra/authentication-core";
import {
  createInlineContinuation,
  isSafeRedirectTarget,
  normalizeRedirectTarget,
  requireSession,
  withAuthGuard,
  type AuthGuardNavigate,
  type GuardedActionResult,
  type InlineContinuation,
  type PendingActionIntentDescriptor,
  type RegisterPendingIntent,
  type RequireSessionResult,
  type UnauthenticatedPolicy,
  type WithAuthGuardOptions,
} from "@/infra/auth-guard";

export type {
  AuthGuardNavigate,
  GuardedActionResult,
  InlineContinuation,
  PendingActionIntentDescriptor,
  RegisterPendingIntent,
  RequireSessionResult,
  UnauthenticatedPolicy,
};

export {
  createInlineContinuation,
  isSafeRedirectTarget,
  normalizeRedirectTarget,
  requireSession,
  withAuthGuard,
};

export type AuthGuardProps = {
  policy: UnauthenticatedPolicy;
  children: ReactNode;
  /** Shown while session status is loading. */
  loading?: ReactNode;
  /** Shown for inline policy when unauthenticated. */
  fallback?: ReactNode;
  signInTo?: string;
  navigate?: AuthGuardNavigate;
  getCurrentPath?: () => string;
  fallbackReturnTo?: string;
  origin?: string;
  registerPendingIntent?: RegisterPendingIntent;
  pendingIntent?: PendingActionIntentDescriptor;
};

export function AuthGuard({
  policy,
  children,
  loading = null,
  fallback = null,
  signInTo,
  navigate,
  getCurrentPath,
  fallbackReturnTo,
  origin,
  registerPendingIntent,
  pendingIntent,
}: AuthGuardProps) {
  const auth = useSession();
  const redirectKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (auth.status === "loading" || auth.status === "authenticated") {
      redirectKeyRef.current = null;
      return;
    }
    if (policy === "inline") {
      return;
    }

    const key = `${policy}:${auth.status}:${signInTo ?? ""}`;
    if (redirectKeyRef.current === key) {
      return;
    }
    redirectKeyRef.current = key;

    void requireSession({
      readSession: async () => auth,
      policy,
      signInTo,
      navigate:
        navigate ??
        ((to) => {
          if (typeof window !== "undefined") {
            window.location.assign(to);
          }
        }),
      getCurrentPath:
        getCurrentPath ??
        (() =>
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/"),
      fallbackReturnTo,
      origin,
      registerPendingIntent,
      pendingIntent,
    });
  }, [
    auth,
    policy,
    signInTo,
    navigate,
    getCurrentPath,
    fallbackReturnTo,
    origin,
    registerPendingIntent,
    pendingIntent,
  ]);

  if (auth.status === "loading") {
    return <>{loading}</>;
  }

  if (auth.status === "authenticated") {
    return <>{children}</>;
  }

  if (policy === "inline") {
    return <>{fallback}</>;
  }

  return <>{loading ?? fallback}</>;
}

export type UseGuardedActionOptions<TInput> = WithAuthGuardOptions<TInput>;

/**
 * Binds withAuthGuard to React. Pass a live `readSession` (e.g. adapter.getSession
 * mapped to AuthSnapshot) — do not authorize mutations from a session seed alone.
 */
export function useGuardedAction<TInput, TResult>(
  action: (
    input: TInput,
    context: { session: Session; signal?: AbortSignal }
  ) => Promise<TResult>,
  options: UseGuardedActionOptions<TInput>
): (
  input: TInput,
  callOptions?: { signal?: AbortSignal }
) => Promise<GuardedActionResult<TResult>> {
  return useCallback(
    (input, callOptions) => withAuthGuard(action, options)(input, callOptions),
    [action, options]
  );
}
