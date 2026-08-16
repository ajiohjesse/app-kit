import type { AuthSnapshot, Session } from "@/infra/authentication-core";
import {
  classifyError,
  type ErrorClassification,
} from "@/infra/error-classification";
import {
  createPendingActionIntent,
  createResumeOperation,
  isSafeReturnTo,
  resolveReturnTo as resolvePendingReturnTo,
  type CreatePendingActionIntentInput,
  type PendingActionHandlerRegistry,
  type PendingActionStore,
  type ResumeInput,
  type ResumeOperationOptions,
  type ResumeResult,
} from "@/infra/pending-auth-action";

export type UnauthenticatedPolicy =
  "redirect-without-resume" | "redirect-and-resume" | "inline";

/** Pending action create-input; returnTo optional until Auth guard resolves it. */
export type PendingActionIntentInput = Omit<
  CreatePendingActionIntentInput,
  "now" | "maxPayloadBytes" | "returnTo" | "id" | "expiresAt" | "ttlMs"
> & {
  returnTo?: string;
};

export type RegisterPendingIntent = (
  intent: PendingActionIntentInput & { returnTo: string }
) => Promise<{ id: string } | void>;

export type AuthGuardNavigate = (to: string) => Promise<void> | void;

export type InlineContinuation<TResult> = {
  resume: (options?: {
    signal?: AbortSignal;
  }) => Promise<GuardedActionResult<TResult>>;
};

export type GuardedActionResult<TResult> =
  | { status: "succeeded"; value: TResult }
  | { status: "pending" }
  | {
      status: "authentication-required";
      policy: UnauthenticatedPolicy;
      redirectTo?: string;
      intentId?: string;
      continuation?: InlineContinuation<TResult>;
    }
  | { status: "authentication-error"; error: ErrorClassification }
  | { status: "forbidden" }
  | { status: "authorization-error"; error: ErrorClassification }
  | { status: "resume-unavailable" }
  | { status: "registration-failed"; error?: ErrorClassification }
  | { status: "continuation-expired" }
  | { status: "continuation-invalid" };

export type RequireSessionResult =
  | { status: "authenticated"; session: Session }
  | { status: "pending" }
  | {
      status: "authentication-required";
      policy: UnauthenticatedPolicy;
      redirectTo?: string;
      intentId?: string;
    }
  | { status: "authentication-error"; error: ErrorClassification }
  | { status: "resume-unavailable" }
  | { status: "registration-failed"; error?: ErrorClassification };

export type AuthGuardActionContext = {
  session: Session;
  signal?: AbortSignal;
};

export type WithAuthGuardOptions<TInput> = {
  readSession: (input?: { signal?: AbortSignal }) => Promise<AuthSnapshot>;
  policy: UnauthenticatedPolicy;
  authorize?: (session: Session, input: TInput) => boolean | Promise<boolean>;
  signInTo?: string;
  navigate?: AuthGuardNavigate;
  getCurrentPath?: () => string;
  fallbackReturnTo?: string;
  origin?: string;
  /** Headless optional register adapter. Prefer pendingActionStore under AuthGuardProvider. */
  registerPendingIntent?: RegisterPendingIntent;
  /** Pending-action store used for the default redirect-and-resume path. */
  pendingActionStore?: PendingActionStore;
  pendingIntent?:
    PendingActionIntentInput | ((input: TInput) => PendingActionIntentInput);
  continuationTtlMs?: number;
  now?: () => number;
};

export type RequireSessionOptions = {
  readSession: (input?: { signal?: AbortSignal }) => Promise<AuthSnapshot>;
  policy: UnauthenticatedPolicy;
  signInTo?: string;
  navigate?: AuthGuardNavigate;
  getCurrentPath?: () => string;
  fallbackReturnTo?: string;
  origin?: string;
  registerPendingIntent?: RegisterPendingIntent;
  pendingActionStore?: PendingActionStore;
  pendingIntent?: PendingActionIntentInput;
  signal?: AbortSignal;
};

const DEFAULT_CONTINUATION_TTL_MS = 15 * 60 * 1000;

function resolveOrigin(origin?: string): string {
  if (origin) {
    return origin;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost";
}

/** Same-origin safe redirect check — delegates to pending-auth-action. */
export function isSafeRedirectTarget(
  target: string,
  origin = resolveOrigin()
): boolean {
  return isSafeReturnTo(target, origin);
}

/** Normalize a redirect target — delegates to pending-auth-action resolveReturnTo. */
export function normalizeRedirectTarget(
  target: string,
  options: { origin?: string; fallback?: string } = {}
): string {
  return resolvePendingReturnTo(target, {
    origin: resolveOrigin(options.origin),
    fallbackReturnTo: options.fallback ?? "/",
  });
}

function resolveSafeReturnTo(
  candidate: string | undefined,
  options: {
    getCurrentPath?: () => string;
    fallbackReturnTo?: string;
    origin?: string;
  }
): string {
  const value =
    candidate ?? options.getCurrentPath?.() ?? options.fallbackReturnTo ?? "/";
  return resolvePendingReturnTo(value, {
    origin: resolveOrigin(options.origin),
    fallbackReturnTo: options.fallbackReturnTo ?? "/",
  });
}

function buildSignInRedirect(
  signInTo: string | undefined,
  returnTo: string,
  options: { origin?: string; fallbackReturnTo?: string; intentId?: string }
): string {
  const signInPath = normalizeRedirectTarget(signInTo ?? "/sign-in", {
    origin: options.origin,
    fallback: options.fallbackReturnTo ?? "/",
  });
  const url = new URL(signInPath, resolveOrigin(options.origin));
  url.searchParams.set("returnTo", returnTo);
  if (options.intentId) {
    url.searchParams.set("intent", options.intentId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

async function runAuthorize<TInput>(
  authorize:
    | ((session: Session, input: TInput) => boolean | Promise<boolean>)
    | undefined,
  session: Session,
  input: TInput
): Promise<
  | { status: "ok" }
  | { status: "forbidden" }
  | { status: "authorization-error"; error: ErrorClassification }
> {
  if (!authorize) {
    return { status: "ok" };
  }
  try {
    const allowed = await authorize(session, input);
    return allowed ? { status: "ok" } : { status: "forbidden" };
  } catch (error) {
    return {
      status: "authorization-error",
      error: classifyError(error, { operation: "authorize" }),
    };
  }
}

export type CreateInlineContinuationOptions<TInput, TResult> = {
  input: TInput;
  /** When null, the first successful resume binds to that session's user. */
  boundUserId: string | null;
  createdAt: number;
  ttlMs: number;
  now: () => number;
  readSession: (input?: { signal?: AbortSignal }) => Promise<AuthSnapshot>;
  authorize?: (session: Session, input: TInput) => boolean | Promise<boolean>;
  action: (input: TInput, context: AuthGuardActionContext) => Promise<TResult>;
};

export function createInlineContinuation<TInput, TResult>(
  options: CreateInlineContinuationOptions<TInput, TResult>
): InlineContinuation<TResult> {
  let settled = false;
  let boundUserId = options.boundUserId;

  return {
    async resume(callOptions) {
      if (settled) {
        return { status: "continuation-invalid" };
      }

      if (options.now() - options.createdAt > options.ttlMs) {
        settled = true;
        return { status: "continuation-expired" };
      }

      const snapshot = await options.readSession({
        signal: callOptions?.signal,
      });
      if (snapshot.status === "loading") {
        return { status: "pending" };
      }
      if (snapshot.status === "error") {
        settled = true;
        return {
          status: "authentication-error",
          error: snapshot.error,
        };
      }
      if (snapshot.status !== "authenticated") {
        settled = true;
        return {
          status: "authentication-required",
          policy: "inline",
        };
      }
      if (boundUserId && snapshot.session.user.id !== boundUserId) {
        settled = true;
        return { status: "continuation-invalid" };
      }
      boundUserId = snapshot.session.user.id;

      const authz = await runAuthorize(
        options.authorize,
        snapshot.session,
        options.input
      );
      if (authz.status === "forbidden") {
        settled = true;
        return { status: "forbidden" };
      }
      if (authz.status === "authorization-error") {
        settled = true;
        return { status: "authorization-error", error: authz.error };
      }

      settled = true;
      const value = await options.action(options.input, {
        session: snapshot.session,
        signal: callOptions?.signal,
      });
      return { status: "succeeded", value };
    },
  };
}

async function registerPendingActionIntent(options: {
  pendingIntent: PendingActionIntentInput;
  returnTo: string;
  registerPendingIntent?: RegisterPendingIntent;
  pendingActionStore?: PendingActionStore;
  now?: () => number;
}): Promise<{ id?: string }> {
  if (options.pendingActionStore) {
    const registered = await createStoreRegisterPendingIntent(
      options.pendingActionStore,
      { now: options.now }
    )({
      ...options.pendingIntent,
      returnTo: options.returnTo,
    });
    return registered ?? {};
  }

  if (!options.registerPendingIntent) {
    throw new Error("resume-unavailable");
  }

  const registered = await options.registerPendingIntent({
    ...options.pendingIntent,
    returnTo: options.returnTo,
  });
  if (registered && typeof registered === "object" && registered.id) {
    return { id: registered.id };
  }
  return {};
}

async function handleUnauthenticated<TResult>(options: {
  policy: UnauthenticatedPolicy;
  signInTo?: string;
  navigate?: AuthGuardNavigate;
  getCurrentPath?: () => string;
  fallbackReturnTo?: string;
  origin?: string;
  registerPendingIntent?: RegisterPendingIntent;
  pendingActionStore?: PendingActionStore;
  pendingIntent?: PendingActionIntentInput;
  now?: () => number;
  createContinuation?: () => InlineContinuation<TResult>;
}): Promise<GuardedActionResult<TResult>> {
  if (options.policy === "inline") {
    return {
      status: "authentication-required",
      policy: "inline",
      continuation: options.createContinuation?.(),
    };
  }

  const returnTo = resolveSafeReturnTo(
    options.policy === "redirect-and-resume"
      ? options.pendingIntent?.returnTo
      : undefined,
    options
  );

  if (options.policy === "redirect-and-resume") {
    if (
      !options.pendingIntent ||
      (!options.registerPendingIntent && !options.pendingActionStore)
    ) {
      return { status: "resume-unavailable" };
    }
    try {
      const registered = await registerPendingActionIntent({
        pendingIntent: options.pendingIntent,
        returnTo,
        registerPendingIntent: options.registerPendingIntent,
        pendingActionStore: options.pendingActionStore,
        now: options.now,
      });
      const redirectTo = buildSignInRedirect(options.signInTo, returnTo, {
        ...options,
        intentId: registered.id,
      });
      if (options.navigate) {
        await options.navigate(redirectTo);
      }
      return {
        status: "authentication-required",
        policy: "redirect-and-resume",
        redirectTo,
        intentId: registered.id,
      } satisfies GuardedActionResult<TResult>;
    } catch (error) {
      if (error instanceof Error && error.message === "resume-unavailable") {
        return { status: "resume-unavailable" };
      }
      return {
        status: "registration-failed",
        error: classifyError(error, { operation: "register-pending-intent" }),
      };
    }
  }

  // redirect-without-resume — never write a pending intent
  const redirectTo = buildSignInRedirect(options.signInTo, returnTo, options);
  if (options.navigate) {
    await options.navigate(redirectTo);
  }
  return {
    status: "authentication-required",
    policy: "redirect-without-resume",
    redirectTo,
  };
}

function resolvePendingIntent<TInput>(
  pendingIntent:
    | PendingActionIntentInput
    | ((input: TInput) => PendingActionIntentInput)
    | undefined,
  input: TInput
): PendingActionIntentInput | undefined {
  if (!pendingIntent) {
    return undefined;
  }
  return typeof pendingIntent === "function"
    ? pendingIntent(input)
    : pendingIntent;
}

export function withAuthGuard<TInput, TResult>(
  action: (input: TInput, context: AuthGuardActionContext) => Promise<TResult>,
  options: WithAuthGuardOptions<TInput>
): (
  input: TInput,
  callOptions?: { signal?: AbortSignal }
) => Promise<GuardedActionResult<TResult>> {
  if (
    options.policy !== "redirect-without-resume" &&
    options.policy !== "redirect-and-resume" &&
    options.policy !== "inline"
  ) {
    return async () => {
      throw new Error("Unauthenticated policy is required");
    };
  }

  const now = options.now ?? (() => Date.now());
  const continuationTtlMs =
    options.continuationTtlMs ?? DEFAULT_CONTINUATION_TTL_MS;

  return async (input, callOptions) => {
    const first = await options.readSession({ signal: callOptions?.signal });

    if (first.status === "loading") {
      return { status: "pending" };
    }
    if (first.status === "error") {
      return { status: "authentication-error", error: first.error };
    }

    if (first.status !== "authenticated") {
      return handleUnauthenticated({
        policy: options.policy,
        signInTo: options.signInTo,
        navigate: options.navigate,
        getCurrentPath: options.getCurrentPath,
        fallbackReturnTo: options.fallbackReturnTo,
        origin: options.origin,
        registerPendingIntent: options.registerPendingIntent,
        pendingActionStore: options.pendingActionStore,
        pendingIntent: resolvePendingIntent(options.pendingIntent, input),
        now,
        createContinuation: () =>
          createInlineContinuation({
            input,
            boundUserId: null,
            createdAt: now(),
            ttlMs: continuationTtlMs,
            now,
            readSession: options.readSession,
            authorize: options.authorize,
            action,
          }),
      });
    }

    const initialAuthz = await runAuthorize(
      options.authorize,
      first.session,
      input
    );
    if (initialAuthz.status === "forbidden") {
      return { status: "forbidden" };
    }
    if (initialAuthz.status === "authorization-error") {
      return { status: "authorization-error", error: initialAuthz.error };
    }

    // Final live session check — seed/snapshot must not authorize execution.
    const live = await options.readSession({ signal: callOptions?.signal });
    if (live.status === "loading") {
      return { status: "pending" };
    }
    if (live.status === "error") {
      return { status: "authentication-error", error: live.error };
    }
    if (live.status !== "authenticated") {
      return handleUnauthenticated({
        policy: options.policy,
        signInTo: options.signInTo,
        navigate: options.navigate,
        getCurrentPath: options.getCurrentPath,
        fallbackReturnTo: options.fallbackReturnTo,
        origin: options.origin,
        registerPendingIntent: options.registerPendingIntent,
        pendingActionStore: options.pendingActionStore,
        pendingIntent: resolvePendingIntent(options.pendingIntent, input),
        now,
        createContinuation: () =>
          createInlineContinuation({
            input,
            boundUserId: first.session.user.id,
            createdAt: now(),
            ttlMs: continuationTtlMs,
            now,
            readSession: options.readSession,
            authorize: options.authorize,
            action,
          }),
      });
    }

    const finalAuthz = await runAuthorize(
      options.authorize,
      live.session,
      input
    );
    if (finalAuthz.status === "forbidden") {
      return { status: "forbidden" };
    }
    if (finalAuthz.status === "authorization-error") {
      return { status: "authorization-error", error: finalAuthz.error };
    }

    const value = await action(input, {
      session: live.session,
      signal: callOptions?.signal,
    });
    return { status: "succeeded", value };
  };
}

export async function requireSession(
  options: RequireSessionOptions
): Promise<RequireSessionResult> {
  if (
    options.policy !== "redirect-without-resume" &&
    options.policy !== "redirect-and-resume" &&
    options.policy !== "inline"
  ) {
    throw new Error("Unauthenticated policy is required");
  }

  const snapshot = await options.readSession({ signal: options.signal });
  if (snapshot.status === "loading") {
    return { status: "pending" };
  }
  if (snapshot.status === "error") {
    return { status: "authentication-error", error: snapshot.error };
  }
  if (snapshot.status === "authenticated") {
    return { status: "authenticated", session: snapshot.session };
  }

  const unauth = await handleUnauthenticated({
    policy: options.policy,
    signInTo: options.signInTo,
    navigate: options.navigate,
    getCurrentPath: options.getCurrentPath,
    fallbackReturnTo: options.fallbackReturnTo,
    origin: options.origin,
    registerPendingIntent: options.registerPendingIntent,
    pendingActionStore: options.pendingActionStore,
    pendingIntent: options.pendingIntent,
  });

  if (unauth.status === "authentication-required") {
    return {
      status: "authentication-required",
      policy: unauth.policy,
      redirectTo: unauth.redirectTo,
      intentId: unauth.intentId,
    };
  }
  if (
    unauth.status === "resume-unavailable" ||
    unauth.status === "registration-failed"
  ) {
    return unauth;
  }
  return { status: "pending" };
}

export type ResumeAfterAuthenticationOptions = ResumeOperationOptions &
  ResumeInput;

/**
 * Auth guard seam for Resume operation. Delegates claim/navigate/dispatch to
 * pending-auth-action; does not reimplement store claim.
 */
export function resumeAfterAuthentication(
  options: ResumeAfterAuthenticationOptions
): Promise<ResumeResult> {
  const { intentId, signal, ...operationOptions } = options;
  return createResumeOperation(operationOptions)({ intentId, signal });
}

/**
 * Read a Pending action intent id from the sign-in redirect query (`intent`).
 * Safe for AuthGuardProvider resumeIntentId after authentication.
 */
export function readResumeIntentIdFromLocation(
  search: string = typeof window !== "undefined" ? window.location.search : ""
): string | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
  const intent = params.get("intent");
  return intent && intent.length > 0 ? intent : null;
}

/** Build a headless register adapter over a Pending-action store. */
export function createStoreRegisterPendingIntent(
  store: PendingActionStore,
  options: { now?: () => number } = {}
): RegisterPendingIntent {
  return async (intent) => {
    const saved = createPendingActionIntent({
      ...intent,
      now: options.now,
    });
    await store.save(saved);
    return { id: saved.id };
  };
}

export type { ResumeResult, PendingActionStore, PendingActionHandlerRegistry };
