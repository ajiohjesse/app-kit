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
  classifySignInFailure,
  isAbortError,
  normalizeSignInError,
  sessionIsExpired,
  toSession,
  type AuthenticationAdapter,
  type AuthSnapshot,
  type Session,
  type SessionSeed,
  type SignInResult,
} from "@/infra/authentication-core";

export class MisconfiguredAuthAdapterError extends Error {
  readonly name = "MisconfiguredAuthAdapterError";

  constructor(message = "Authentication adapter is missing required methods") {
    super(message);
  }
}

export class UnsupportedAuthCapabilityError extends Error {
  readonly name = "UnsupportedAuthCapabilityError";
  readonly capability: "refresh" | "exchangeToken";

  constructor(capability: "refresh" | "exchangeToken") {
    super(`Authentication adapter does not support ${capability}`);
    this.capability = capability;
  }
}

type AuthContextValue = AuthSnapshot & {
  signIn: (
    credentials?: unknown,
    options?: { signal?: AbortSignal }
  ) => Promise<SignInResult>;
  signOut: (options?: { signal?: AbortSignal }) => Promise<void>;
  refresh: (options?: { signal?: AbortSignal }) => Promise<Session | null>;
  exchangeToken: (
    payload?: unknown,
    options?: { signal?: AbortSignal }
  ) => Promise<Session>;
};

export type AuthProviderProps = {
  adapter: AuthenticationAdapter;
  sessionSeed?: SessionSeed | null;
  children: ReactNode;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function assertAdapter(adapter: AuthenticationAdapter) {
  if (
    typeof adapter?.getSession !== "function" ||
    typeof adapter.signIn !== "function" ||
    typeof adapter.signOut !== "function"
  ) {
    throw new MisconfiguredAuthAdapterError();
  }
}

function snapshotFromSession(session: Session | null): AuthSnapshot {
  if (!session) {
    return {
      status: "unauthenticated",
      session: null,
      user: null,
      reason: "missing",
    };
  }
  if (sessionIsExpired(session)) {
    return {
      status: "unauthenticated",
      session: null,
      user: null,
      reason: "expired",
    };
  }
  return {
    status: "authenticated",
    session,
    user: session.user,
  };
}

function snapshotFromSeed(seed: unknown): AuthSnapshot {
  const session = toSession(seed);
  if (!session) {
    return { status: "loading", session: null, user: null };
  }
  return snapshotFromSession(session);
}

function cancelledResult(): SignInResult {
  return {
    status: "failed",
    error: classifySignInFailure(undefined, { aborted: true }),
  };
}

function hasValidSeed(seed: unknown): boolean {
  return toSession(seed) !== null;
}

export function AuthProvider({
  adapter,
  sessionSeed,
  children,
}: AuthProviderProps) {
  assertAdapter(adapter);

  const [snapshot, setSnapshot] = useState<AuthSnapshot>(() =>
    sessionSeed == null
      ? { status: "loading", session: null, user: null }
      : snapshotFromSeed(sessionSeed)
  );
  const opSeqRef = useRef(0);
  const committedSeqRef = useRef(0);
  const adapterRef = useRef(adapter);
  const seedUsedRef = useRef(sessionSeed);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const nextOp = useCallback(() => ++opSeqRef.current, []);

  const commit = useCallback((next: AuthSnapshot, seq: number) => {
    if (seq < committedSeqRef.current) {
      return false;
    }
    committedSeqRef.current = seq;
    setSnapshot(next);
    return true;
  }, []);

  const invalidateInFlight = useCallback(() => {
    committedSeqRef.current = nextOp();
  }, [nextOp]);

  useEffect(() => {
    if (hasValidSeed(seedUsedRef.current)) {
      return;
    }
    const seq = nextOp();
    const controller = new AbortController();
    adapterRef.current
      .getSession({ signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) {
          return;
        }
        commit(snapshotFromSession(toSession(value)), seq);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        commit(
          {
            status: "error",
            session: null,
            user: null,
            error: classifySignInFailure(error),
          },
          seq
        );
      });
    return () => {
      controller.abort();
    };
  }, [commit, nextOp]);

  useEffect(() => {
    if (snapshot.status !== "authenticated") {
      return;
    }
    const expiresAt = snapshot.session.expiresAt;
    let timer: number | undefined;
    const expire = () => {
      invalidateInFlight();
      setSnapshot({
        status: "unauthenticated",
        session: null,
        user: null,
        reason: "expired",
      });
    };
    const schedule = () => {
      const remaining = Date.parse(expiresAt) - Date.now();
      if (remaining <= 0) {
        expire();
        return;
      }
      timer = window.setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    };
    schedule();
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [invalidateInFlight, snapshot]);

  const signIn = useCallback(
    async (
      credentials?: unknown,
      options?: { signal?: AbortSignal }
    ): Promise<SignInResult> => {
      const seq = nextOp();
      const signal = options?.signal;
      try {
        const result = await adapterRef.current.signIn({
          credentials,
          signal,
        });
        if (isAbortError(undefined, signal)) {
          return cancelledResult();
        }
        if (result.status === "failed") {
          return {
            status: "failed",
            error: normalizeSignInError(result.error),
          };
        }
        const session = toSession(result.session);
        if (!session) {
          throw new MisconfiguredAuthAdapterError(
            "signIn authenticated result did not include a session"
          );
        }
        commit(snapshotFromSession(session), seq);
        return { status: "authenticated", session };
      } catch (error) {
        if (isAbortError(error, signal)) {
          return cancelledResult();
        }
        throw error;
      }
    },
    [commit, nextOp]
  );

  const signOut = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      invalidateInFlight();
      setSnapshot({
        status: "unauthenticated",
        session: null,
        user: null,
        reason: "signed-out",
      });
      try {
        await adapterRef.current.signOut({ signal: options?.signal });
      } catch {
        // Local sign-out already committed; adapter faults stay off the session.
      }
    },
    [invalidateInFlight]
  );

  const refresh = useCallback(
    async (options?: { signal?: AbortSignal }) => {
      const capability = adapterRef.current.refresh;
      if (!capability) {
        throw new UnsupportedAuthCapabilityError("refresh");
      }
      const seq = nextOp();
      const session = toSession(await capability({ signal: options?.signal }));
      if (isAbortError(undefined, options?.signal)) {
        return snapshot.status === "authenticated" ? snapshot.session : null;
      }
      commit(snapshotFromSession(session), seq);
      return session;
    },
    [commit, nextOp, snapshot]
  );

  const exchangeToken = useCallback(
    async (payload?: unknown, options?: { signal?: AbortSignal }) => {
      const capability = adapterRef.current.exchangeToken;
      if (!capability) {
        throw new UnsupportedAuthCapabilityError("exchangeToken");
      }
      const seq = nextOp();
      const session = toSession(
        await capability({ payload, signal: options?.signal })
      );
      if (!session) {
        throw new MisconfiguredAuthAdapterError(
          "exchangeToken did not return a session"
        );
      }
      if (isAbortError(undefined, options?.signal)) {
        return session;
      }
      commit(snapshotFromSession(session), seq);
      return session;
    },
    [commit, nextOp]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...snapshot,
      signIn,
      signOut,
      refresh,
      exchangeToken,
    }),
    [exchangeToken, refresh, signIn, signOut, snapshot]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function useAuth() {
  return useAuthContext();
}

export function useSession(): AuthSnapshot {
  const value = useAuthContext();
  switch (value.status) {
    case "loading":
      return { status: "loading", session: null, user: null };
    case "authenticated":
      return {
        status: "authenticated",
        session: value.session,
        user: value.user,
      };
    case "unauthenticated":
      return {
        status: "unauthenticated",
        session: null,
        user: null,
        reason: value.reason,
      };
    case "error":
      return {
        status: "error",
        session: null,
        user: null,
        error: value.error,
      };
  }
}
