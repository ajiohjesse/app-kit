import {
  sessionIsExpired,
  type ReplayPolicy,
  type Session,
} from "./authentication-core";
import {
  classifyError,
  type ErrorClassification,
} from "./error-classification";

export type RefreshOutcome =
  | { status: "refreshed"; session: Session }
  | { status: "already-current"; session: Session }
  | { status: "unsupported" }
  | { status: "cancelled" }
  | { status: "expired" }
  | { status: "failed"; error: ErrorClassification };

export type InterceptResult<T> =
  | { status: "ok"; value: T }
  | { status: "refresh-in-progress" }
  | { status: "authentication-required" }
  | { status: "refresh-failed"; error?: ErrorClassification }
  | { status: "reauthentication-required" }
  | { status: "replay-exhausted" }
  | { status: "cancelled" }
  | { status: "mutation-replay-denied" };

export type RequestAttempt = "initial" | "replay";

export type RequestOperationContext = {
  signal: AbortController["signal"];
  attempt: RequestAttempt;
};

export type RequestOperation<T> = (
  context: RequestOperationContext
) => Promise<T>;

export type InterceptMeta = {
  replayPolicy: ReplayPolicy;
  queueable?: boolean;
  idempotencyKey?: string;
  acknowledgeMutationReplay?: boolean;
  signal?: AbortSignal;
  isAuthExpired?: (error: unknown) => boolean;
};

export type RefreshCoordinatorOptions = {
  refresh?: (input?: { signal?: AbortSignal }) => Promise<Session | null>;
  getSession?: () => Session | null;
  now?: () => number;
  /** Refresh when expiresAt - now <= leeway. Default: no proactive refresh. */
  proactiveLeewayMs?: number;
  onSession?: (
    session: Session | null,
    reason: "refreshed" | "expired"
  ) => void;
  /** Optional action-runner seam; must invoke the operation exactly once. */
  runAction?: <T>(
    operation: (context: { signal: AbortSignal }) => Promise<T>,
    options?: { signal?: AbortSignal }
  ) => Promise<T>;
  scope?: string;
};

export type RefreshCallOptions = {
  signal?: AbortSignal;
  /** When true, skip provider work if session is still within leeway. */
  proactive?: boolean;
};

export type RefreshCoordinator = {
  scope: string;
  configure: (next: RefreshCoordinatorOptions) => void;
  refresh: (options?: RefreshCallOptions) => Promise<RefreshOutcome>;
  intercept: <T>(
    operation: RequestOperation<T>,
    meta: InterceptMeta
  ) => Promise<InterceptResult<T>>;
  invalidate: (reason?: "sign-out" | "identity-change") => void;
  dispose: () => void;
};

export class AuthExpiredError extends Error {
  readonly name = "AuthExpiredError";

  constructor(message = "Session authentication expired") {
    super(message);
  }
}

function defaultIsAuthExpired(error: unknown): boolean {
  return (
    error instanceof AuthExpiredError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AuthExpiredError")
  );
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

type Waiter = {
  signal?: AbortSignal;
  resolve: (outcome: RefreshOutcome) => void;
  onAbort: () => void;
};

export function createRefreshCoordinator(
  initial: RefreshCoordinatorOptions = {}
): RefreshCoordinator {
  let options: RefreshCoordinatorOptions = { ...initial };
  const scope = initial.scope ?? "default";
  let generation = 0;
  let disposed = false;
  let inFlight: {
    generation: number;
    promise: Promise<RefreshOutcome>;
    controller: AbortController;
    waiters: Set<Waiter>;
  } | null = null;

  const now = () => options.now?.() ?? Date.now();

  function configure(next: RefreshCoordinatorOptions) {
    options = { ...options, ...next };
  }

  function cancelInFlight(outcome: RefreshOutcome) {
    const flight = inFlight;
    if (!flight) {
      return;
    }
    inFlight = null;
    for (const waiter of flight.waiters) {
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.resolve(outcome);
    }
    flight.waiters.clear();
    flight.controller.abort();
  }

  function invalidate(reason: "sign-out" | "identity-change" = "sign-out") {
    void reason;
    generation += 1;
    cancelInFlight({ status: "cancelled" });
  }

  function dispose() {
    disposed = true;
    invalidate("sign-out");
  }

  async function runRefresh(
    callOptions: RefreshCallOptions | undefined,
    sharedController: AbortController,
    expectedGeneration: number
  ): Promise<RefreshOutcome> {
    const refreshFn = options.refresh;
    if (!refreshFn) {
      return { status: "unsupported" };
    }

    if (callOptions?.proactive) {
      const session = options.getSession?.() ?? null;
      const leeway = options.proactiveLeewayMs ?? 0;
      if (session && leeway >= 0) {
        const expiresAt = Date.parse(session.expiresAt);
        if (
          Number.isFinite(expiresAt) &&
          expiresAt - now() > leeway &&
          !sessionIsExpired(session, now())
        ) {
          return { status: "already-current", session };
        }
      }
    }

    try {
      const signal = sharedController.signal;
      const session = await refreshFn({ signal });

      if (disposed || expectedGeneration !== generation) {
        return { status: "cancelled" };
      }
      if (signal.aborted) {
        return { status: "cancelled" };
      }

      if (!session || sessionIsExpired(session, now())) {
        options.onSession?.(null, "expired");
        return { status: "expired" };
      }

      options.onSession?.(session, "refreshed");
      return { status: "refreshed", session };
    } catch (error) {
      if (isAbortError(error, sharedController.signal) || disposed) {
        return { status: "cancelled" };
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: unknown }).name === "UnsupportedAuthCapabilityError"
      ) {
        return { status: "unsupported" };
      }
      return { status: "failed", error: classifyError(error) };
    }
  }

  async function refresh(
    callOptions?: RefreshCallOptions
  ): Promise<RefreshOutcome> {
    if (disposed) {
      return { status: "cancelled" };
    }
    if (!options.refresh) {
      return { status: "unsupported" };
    }

    if (inFlight) {
      return await new Promise<RefreshOutcome>((resolve) => {
        const waiter: Waiter = {
          signal: callOptions?.signal,
          resolve,
          onAbort: () => {
            inFlight?.waiters.delete(waiter);
            callOptions?.signal?.removeEventListener("abort", waiter.onAbort);
            resolve({ status: "cancelled" });
            if (inFlight && inFlight.waiters.size === 0) {
              const flight = inFlight;
              inFlight = null;
              flight.controller.abort();
            }
          },
        };
        if (callOptions?.signal?.aborted) {
          resolve({ status: "cancelled" });
          return;
        }
        callOptions?.signal?.addEventListener("abort", waiter.onAbort, {
          once: true,
        });
        inFlight!.waiters.add(waiter);
      });
    }

    const expectedGeneration = generation;
    const controller = new AbortController();
    if (callOptions?.signal?.aborted) {
      return { status: "cancelled" };
    }

    const waiters = new Set<Waiter>();
    const promise = runRefresh(callOptions, controller, expectedGeneration);

    inFlight = {
      generation: expectedGeneration,
      promise,
      controller,
      waiters,
    };

    return await new Promise<RefreshOutcome>((resolve) => {
      const waiter: Waiter = {
        signal: callOptions?.signal,
        resolve,
        onAbort: () => {
          inFlight?.waiters.delete(waiter);
          callOptions?.signal?.removeEventListener("abort", waiter.onAbort);
          resolve({ status: "cancelled" });
          if (inFlight && inFlight.waiters.size === 0) {
            const flight = inFlight;
            inFlight = null;
            flight.controller.abort();
          }
        },
      };
      if (callOptions?.signal?.aborted) {
        resolve({ status: "cancelled" });
        return;
      }
      callOptions?.signal?.addEventListener("abort", waiter.onAbort, {
        once: true,
      });
      waiters.add(waiter);

      void promise.then((outcome) => {
        if (inFlight?.promise !== promise) {
          return;
        }
        const flight = inFlight;
        inFlight = null;
        for (const pending of flight.waiters) {
          pending.signal?.removeEventListener("abort", pending.onAbort);
          pending.resolve(outcome);
        }
        flight.waiters.clear();
      });
    });
  }

  async function executeOperation<T>(
    operation: RequestOperation<T>,
    attempt: RequestAttempt,
    signal?: AbortSignal
  ): Promise<T> {
    if (options.runAction) {
      return options.runAction(
        async ({ signal: actionSignal }) => {
          return operation({ signal: actionSignal, attempt });
        },
        { signal }
      );
    }
    return operation({
      signal: signal ?? new AbortController().signal,
      attempt,
    });
  }

  async function settleAfterRefresh<T>(
    outcome: RefreshOutcome,
    operation: RequestOperation<T>,
    meta: InterceptMeta,
    isAuthExpired: (error: unknown) => boolean,
    attempt: RequestAttempt
  ): Promise<InterceptResult<T>> {
    if (meta.signal?.aborted) {
      return { status: "cancelled" };
    }

    switch (outcome.status) {
      case "cancelled":
        return { status: "cancelled" };
      case "unsupported":
        return { status: "authentication-required" };
      case "expired":
        return { status: "reauthentication-required" };
      case "failed":
        return { status: "refresh-failed", error: outcome.error };
      case "already-current":
      case "refreshed":
        break;
      default:
        return { status: "refresh-failed" };
    }

    if (meta.replayPolicy === "none") {
      return { status: "authentication-required" };
    }

    if (
      meta.replayPolicy === "mutation" &&
      !(
        meta.acknowledgeMutationReplay === true &&
        typeof meta.idempotencyKey === "string" &&
        meta.idempotencyKey !== ""
      )
    ) {
      return { status: "mutation-replay-denied" };
    }

    try {
      const value = await executeOperation(operation, attempt, meta.signal);
      return { status: "ok", value };
    } catch (error) {
      if (meta.signal?.aborted || isAbortError(error, meta.signal)) {
        return { status: "cancelled" };
      }
      if (isAuthExpired(error)) {
        return { status: "replay-exhausted" };
      }
      throw error;
    }
  }

  async function intercept<T>(
    operation: RequestOperation<T>,
    meta: InterceptMeta
  ): Promise<InterceptResult<T>> {
    if (disposed) {
      return { status: "cancelled" };
    }
    if (meta.signal?.aborted) {
      return { status: "cancelled" };
    }

    const queueable = meta.queueable ?? true;
    const isAuthExpired = meta.isAuthExpired ?? defaultIsAuthExpired;

    if (inFlight && !queueable) {
      return { status: "refresh-in-progress" };
    }

    const canReplayMutation =
      meta.replayPolicy === "mutation" &&
      meta.acknowledgeMutationReplay === true &&
      typeof meta.idempotencyKey === "string" &&
      meta.idempotencyKey !== "";

    if (meta.replayPolicy === "mutation" && !canReplayMutation) {
      try {
        const value = await executeOperation(operation, "initial", meta.signal);
        return { status: "ok", value };
      } catch (error) {
        if (meta.signal?.aborted || isAbortError(error, meta.signal)) {
          return { status: "cancelled" };
        }
        if (isAuthExpired(error)) {
          return { status: "mutation-replay-denied" };
        }
        throw error;
      }
    }

    if (inFlight) {
      if (!queueable) {
        return { status: "refresh-in-progress" };
      }
      const outcome = await refresh({ signal: meta.signal });
      // Never ran an attempt — first execution after shared refresh.
      return settleAfterRefresh(
        outcome,
        operation,
        meta,
        isAuthExpired,
        "initial"
      );
    }

    try {
      const value = await executeOperation(operation, "initial", meta.signal);
      return { status: "ok", value };
    } catch (error) {
      if (meta.signal?.aborted || isAbortError(error, meta.signal)) {
        return { status: "cancelled" };
      }
      if (!isAuthExpired(error)) {
        throw error;
      }
    }

    if (meta.replayPolicy === "none") {
      return { status: "authentication-required" };
    }

    if (!queueable) {
      return { status: "authentication-required" };
    }

    if (!options.refresh) {
      return { status: "authentication-required" };
    }

    const outcome = await refresh({ signal: meta.signal });
    return settleAfterRefresh(
      outcome,
      operation,
      meta,
      isAuthExpired,
      "replay"
    );
  }

  return {
    scope,
    configure,
    refresh,
    intercept,
    invalidate,
    dispose,
  };
}

export type FetchInterceptorOptions = {
  coordinator: RefreshCoordinator;
  replayPolicy?: ReplayPolicy;
  queueable?: boolean;
  idempotencyKey?: string;
  acknowledgeMutationReplay?: boolean;
  /** Default: response.status === 401 */
  isAuthExpiredResponse?: (response: Response) => boolean;
  fetch?: typeof globalThis.fetch;
};

/**
 * Transport helper: wraps `fetch` so a 401 can refresh once and replay per policy.
 * Replay safety is never inferred from HTTP method — callers pass ReplayPolicy.
 */
export function createFetchInterceptor(
  options: FetchInterceptorOptions
): typeof globalThis.fetch {
  const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const isAuthExpiredResponse =
    options.isAuthExpiredResponse ??
    ((response: Response) => response.status === 401);

  return async (input, init) => {
    const result = await options.coordinator.intercept(
      async ({ signal }) => {
        const response = await baseFetch(input, {
          ...init,
          signal: init?.signal ?? signal,
        });
        if (isAuthExpiredResponse(response)) {
          // Consume body on auth-expired so the socket can close cleanly before replay.
          try {
            await response.arrayBuffer();
          } catch {
            // ignore body read failures
          }
          throw new AuthExpiredError(`HTTP ${response.status}`);
        }
        return response;
      },
      {
        replayPolicy: options.replayPolicy ?? "read",
        queueable: options.queueable,
        idempotencyKey: options.idempotencyKey,
        acknowledgeMutationReplay: options.acknowledgeMutationReplay,
        signal: init?.signal ?? undefined,
      }
    );

    if (result.status === "ok") {
      return result.value;
    }

    const error = new Error(`session-refresh intercept: ${result.status}`);
    error.name = "SessionRefreshInterceptError";
    (error as Error & { result: typeof result }).result = result;
    throw error;
  };
}

export type { ReplayPolicy, Session, ErrorClassification };
