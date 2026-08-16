import type { AuthSnapshot, Session } from "@/infra/authentication-core";
import {
  classifyError,
  type ErrorClassification,
} from "@/infra/error-classification";

export type UnauthenticatedPolicy =
  "redirect-without-resume" | "redirect-and-resume" | "inline";

export type PendingActionIntentDescriptor = {
  kind: string;
  version: number;
  payload: unknown;
  idempotencyKey: string;
  replayPolicy: "read" | "mutation";
  returnTo?: string;
  userId?: string | null;
};

export type RegisterPendingIntent = (
  intent: PendingActionIntentDescriptor
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
  registerPendingIntent?: RegisterPendingIntent;
  pendingIntent?:
    | PendingActionIntentDescriptor
    | ((input: TInput) => PendingActionIntentDescriptor);
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
  pendingIntent?: PendingActionIntentDescriptor;
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

export function isSafeRedirectTarget(
  target: string,
  origin = resolveOrigin()
): boolean {
  if (typeof target !== "string" || target === "") {
    return false;
  }
  if (target.startsWith("//") || target.includes("://")) {
    try {
      const url = new URL(target, origin);
      return (
        url.origin === origin &&
        (url.protocol === "http:" || url.protocol === "https:")
      );
    } catch {
      return false;
    }
  }
  if (!target.startsWith("/")) {
    return false;
  }
  if (target.startsWith("\\") || target.includes("\\")) {
    return false;
  }
  return true;
}

export function normalizeRedirectTarget(
  target: string,
  options: { origin?: string; fallback?: string } = {}
): string {
  const origin = resolveOrigin(options.origin);
  const fallback = options.fallback ?? "/";
  if (isSafeRedirectTarget(target, origin)) {
    if (target.startsWith("/") && !target.includes("://")) {
      return target;
    }
    try {
      const url = new URL(target, origin);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return isSafeRedirectTarget(fallback, origin) ? fallback : "/";
    }
  }
  return isSafeRedirectTarget(fallback, origin) ? fallback : "/";
}

function resolveSignInTo(
  signInTo: string | undefined,
  options: { origin?: string; fallbackReturnTo?: string }
): string {
  return normalizeRedirectTarget(signInTo ?? "/sign-in", {
    origin: options.origin,
    fallback: options.fallbackReturnTo ?? "/",
  });
}

function resolveReturnTo(
  pending: PendingActionIntentDescriptor | undefined,
  options: {
    getCurrentPath?: () => string;
    fallbackReturnTo?: string;
    origin?: string;
  }
): string {
  const candidate =
    pending?.returnTo ??
    options.getCurrentPath?.() ??
    options.fallbackReturnTo ??
    "/";
  return normalizeRedirectTarget(candidate, {
    origin: options.origin,
    fallback: options.fallbackReturnTo ?? "/",
  });
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

async function handleUnauthenticated<TResult>(options: {
  policy: UnauthenticatedPolicy;
  signInTo?: string;
  navigate?: AuthGuardNavigate;
  getCurrentPath?: () => string;
  fallbackReturnTo?: string;
  origin?: string;
  registerPendingIntent?: RegisterPendingIntent;
  pendingIntent?: PendingActionIntentDescriptor;
  createContinuation?: () => InlineContinuation<TResult>;
}): Promise<GuardedActionResult<TResult>> {
  if (options.policy === "inline") {
    return {
      status: "authentication-required",
      policy: "inline",
      continuation: options.createContinuation?.(),
    };
  }

  if (options.policy === "redirect-and-resume") {
    if (!options.registerPendingIntent || !options.pendingIntent) {
      return { status: "resume-unavailable" };
    }
    const returnTo = resolveReturnTo(options.pendingIntent, options);
    try {
      const registered = await options.registerPendingIntent({
        ...options.pendingIntent,
        returnTo,
      });
      const redirectTo = resolveSignInTo(options.signInTo, options);
      if (options.navigate) {
        await options.navigate(redirectTo);
      }
      return {
        status: "authentication-required",
        policy: "redirect-and-resume",
        redirectTo,
        intentId:
          registered && typeof registered === "object"
            ? registered.id
            : undefined,
      };
    } catch (error) {
      return {
        status: "registration-failed",
        error: classifyError(error, { operation: "register-pending-intent" }),
      };
    }
  }

  // redirect-without-resume — never write a pending intent
  const redirectTo = resolveSignInTo(options.signInTo, options);
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
    | PendingActionIntentDescriptor
    | ((input: TInput) => PendingActionIntentDescriptor)
    | undefined,
  input: TInput
): PendingActionIntentDescriptor | undefined {
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
        pendingIntent: resolvePendingIntent(options.pendingIntent, input),
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
        pendingIntent: resolvePendingIntent(options.pendingIntent, input),
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
