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
import { useSession } from "@/infra/authentication-core-provider";
import type { Session } from "@/infra/authentication-core";
import {
  createInlineContinuation,
  isSafeRedirectTarget,
  normalizeRedirectTarget,
  requireSession,
  resumeAfterAuthentication,
  readResumeIntentIdFromLocation,
  withAuthGuard,
  type AuthGuardNavigate,
  type GuardedActionResult,
  type InlineContinuation,
  type PendingActionIntentInput,
  type RegisterPendingIntent,
  type RequireSessionResult,
  type ResumeResult,
  type UnauthenticatedPolicy,
  type WithAuthGuardOptions,
} from "@/infra/auth-guard";
import {
  PendingAuthActionProvider,
  usePendingAuthAction,
  type PendingAuthActionProviderProps,
} from "@/infra/pending-auth-action-provider";
import type { PendingActionStore } from "@/infra/pending-auth-action";

export type {
  AuthGuardNavigate,
  GuardedActionResult,
  InlineContinuation,
  PendingActionIntentInput,
  RegisterPendingIntent,
  RequireSessionResult,
  ResumeResult,
  UnauthenticatedPolicy,
};

export {
  createInlineContinuation,
  isSafeRedirectTarget,
  normalizeRedirectTarget,
  requireSession,
  resumeAfterAuthentication,
  readResumeIntentIdFromLocation,
  withAuthGuard,
};

export type AuthGuardContextValue = {
  registerPendingIntent: RegisterPendingIntent;
  pendingActionStore: PendingActionStore;
  resume: (input: {
    intentId: string;
    signal?: AbortSignal;
  }) => Promise<ResumeResult>;
};

const AuthGuardContext = createContext<AuthGuardContextValue | null>(null);

export type AuthGuardProviderProps = {
  children: ReactNode;
  /** Override Pending-action store (default: tab-local sessionStorage via pending-auth-action). */
  store?: PendingActionStore;
  navigate: AuthGuardNavigate;
  allowMutationReplay?: boolean;
  fallbackReturnTo?: string;
  origin?: string;
  waitForReady?: PendingAuthActionProviderProps["waitForReady"];
  now?: () => number;
  /**
   * When set, Resume operation runs once after Session is authenticated.
   * Typically the intent id from redirect-and-resume registration.
   */
  resumeIntentId?: string | null;
  onResumeResult?: (result: ResumeResult) => void;
};

function AuthGuardResumeBridge({
  resumeIntentId,
  navigate,
  allowMutationReplay,
  fallbackReturnTo,
  origin,
  waitForReady,
  now,
  onResumeResult,
  children,
}: {
  resumeIntentId?: string | null;
  navigate: AuthGuardNavigate;
  allowMutationReplay: boolean;
  fallbackReturnTo: string;
  origin?: string;
  waitForReady?: PendingAuthActionProviderProps["waitForReady"];
  now?: () => number;
  onResumeResult?: (result: ResumeResult) => void;
  children: ReactNode;
}) {
  const auth = useSession();
  const pending = usePendingAuthAction();
  const settledRef = useRef<string | null>(null);
  const [lastRegisteredIntentId, setLastRegisteredIntentId] = useState<
    string | null
  >(null);

  const registerPendingIntent = useCallback<RegisterPendingIntent>(
    async (intent) => {
      const saved = await pending.registerIntent(intent);
      setLastRegisteredIntentId(saved.id);
      return { id: saved.id };
    },
    [pending]
  );

  const value = useMemo<AuthGuardContextValue>(
    () => ({
      registerPendingIntent,
      pendingActionStore: pending.store,
      resume: pending.resume,
    }),
    [pending.resume, pending.store, registerPendingIntent]
  );

  const intentToResume = resumeIntentId ?? lastRegisteredIntentId;

  useEffect(() => {
    if (auth.status !== "authenticated" || !intentToResume) {
      return;
    }
    if (settledRef.current === intentToResume) {
      return;
    }
    settledRef.current = intentToResume;
    // Call Resume with the live Session from this render — do not race
    // PendingAuthActionProvider's getSession ref update.
    void resumeAfterAuthentication({
      intentId: intentToResume,
      store: pending.store,
      handlers: pending.handlers,
      getSession: async () =>
        auth.status === "authenticated" ? auth.session : null,
      navigate,
      allowMutationReplay,
      fallbackReturnTo,
      origin,
      waitForReady,
      now,
    }).then((result) => {
      onResumeResult?.(result);
    });
  }, [
    allowMutationReplay,
    auth,
    fallbackReturnTo,
    intentToResume,
    navigate,
    now,
    onResumeResult,
    origin,
    pending.handlers,
    pending.store,
    waitForReady,
  ]);

  return (
    <AuthGuardContext.Provider value={value}>
      {children}
    </AuthGuardContext.Provider>
  );
}

/**
 * Wires Pending-action store for Auth guard. Place under AuthProvider.
 * Consumers do not pass registerPendingIntent for the default path.
 */
export function AuthGuardProvider({
  children,
  store,
  navigate,
  allowMutationReplay = false,
  fallbackReturnTo = "/",
  origin,
  waitForReady,
  now,
  resumeIntentId: resumeIntentIdProp,
  onResumeResult,
}: AuthGuardProviderProps) {
  const auth = useSession();
  const authRef = useRef(auth);

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  const getSession = useCallback(async () => {
    return authRef.current.status === "authenticated"
      ? authRef.current.session
      : null;
  }, []);

  const resumeIntentId =
    resumeIntentIdProp !== undefined
      ? resumeIntentIdProp
      : typeof window !== "undefined"
        ? readResumeIntentIdFromLocation()
        : null;

  return (
    <PendingAuthActionProvider
      store={store}
      getSession={getSession}
      navigate={navigate}
      allowMutationReplay={allowMutationReplay}
      fallbackReturnTo={fallbackReturnTo}
      origin={origin}
      waitForReady={waitForReady}
      now={now}
    >
      <AuthGuardResumeBridge
        resumeIntentId={resumeIntentId}
        navigate={navigate}
        allowMutationReplay={allowMutationReplay}
        fallbackReturnTo={fallbackReturnTo}
        origin={origin}
        waitForReady={waitForReady}
        now={now}
        onResumeResult={onResumeResult}
      >
        {children}
      </AuthGuardResumeBridge>
    </PendingAuthActionProvider>
  );
}

export function useAuthGuard(): AuthGuardContextValue {
  const context = useContext(AuthGuardContext);
  if (!context) {
    throw new Error("useAuthGuard must be used within AuthGuardProvider");
  }
  return context;
}

export function useOptionalAuthGuard(): AuthGuardContextValue | null {
  return useContext(AuthGuardContext);
}

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
  /** Optional headless override; default comes from AuthGuardProvider. */
  registerPendingIntent?: RegisterPendingIntent;
  pendingActionStore?: PendingActionStore;
  pendingIntent?: PendingActionIntentInput;
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
  pendingActionStore,
  pendingIntent,
}: AuthGuardProps) {
  const auth = useSession();
  const authGuard = useOptionalAuthGuard();
  const redirectKeyRef = useRef<string | null>(null);

  const resolvedRegister =
    registerPendingIntent ?? authGuard?.registerPendingIntent;
  const resolvedStore = pendingActionStore ?? authGuard?.pendingActionStore;

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
      registerPendingIntent: resolvedRegister,
      pendingActionStore: resolvedStore,
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
    resolvedRegister,
    resolvedStore,
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

export type UseGuardedActionOptions<TInput> = Omit<
  WithAuthGuardOptions<TInput>,
  "registerPendingIntent" | "pendingActionStore"
> & {
  registerPendingIntent?: RegisterPendingIntent;
  pendingActionStore?: PendingActionStore;
};

/**
 * Binds withAuthGuard to React. Under AuthGuardProvider, pending store wiring
 * is automatic — pass pendingIntent for redirect-and-resume without a register adapter.
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
  const authGuard = useOptionalAuthGuard();
  return useCallback(
    (input, callOptions) =>
      withAuthGuard(action, {
        ...options,
        registerPendingIntent:
          options.registerPendingIntent ?? authGuard?.registerPendingIntent,
        pendingActionStore:
          options.pendingActionStore ?? authGuard?.pendingActionStore,
      })(input, callOptions),
    [action, options, authGuard]
  );
}
