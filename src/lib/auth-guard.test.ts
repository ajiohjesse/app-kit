import { describe, expect, it, vi } from "vitest";
import type { AuthSnapshot, Session } from "../../infra/authentication-core";
import {
  createInlineContinuation,
  isSafeRedirectTarget,
  normalizeRedirectTarget,
  requireSession,
  resumeAfterAuthentication,
  withAuthGuard,
  type UnauthenticatedPolicy,
} from "../../infra/auth-guard";
import {
  createMemoryPendingActionStore,
  createPendingActionHandlerRegistry,
} from "../../infra/pending-auth-action";

const session: Session = {
  user: { id: "user-1", name: "Ada" },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

const authenticated: AuthSnapshot = {
  status: "authenticated",
  session,
  user: session.user,
};

const unauthenticated: AuthSnapshot = {
  status: "unauthenticated",
  session: null,
  user: null,
  reason: "missing",
};

const loading: AuthSnapshot = {
  status: "loading",
  session: null,
  user: null,
};

describe("UnauthenticatedPolicy ownership", () => {
  it("owns the three explicit policies and no implicit default", () => {
    const policies: UnauthenticatedPolicy[] = [
      "redirect-without-resume",
      "redirect-and-resume",
      "inline",
    ];
    expect(policies).toHaveLength(3);
  });
});

describe("normalizeRedirectTarget", () => {
  it("accepts same-origin path/query and rejects absolute foreign targets", () => {
    expect(
      normalizeRedirectTarget("/sign-in?next=%2Fapp", {
        origin: "https://app.test",
        fallback: "/",
      })
    ).toBe("/sign-in?next=%2Fapp");
    expect(
      isSafeRedirectTarget("https://evil.test/phish", "https://app.test")
    ).toBe(false);
    expect(
      normalizeRedirectTarget("https://evil.test/phish", {
        origin: "https://app.test",
        fallback: "/safe",
      })
    ).toBe("/safe");
  });
});

describe("withAuthGuard", () => {
  it("requires an explicit unauthenticated policy", async () => {
    const action = vi.fn(async () => "ok");
    // @ts-expect-error policy is required
    const guarded = withAuthGuard(action, {
      readSession: async () => authenticated,
    });
    await expect(guarded({})).rejects.toThrow(/unauthenticated policy/i);
  });

  it("returns pending while session is loading", async () => {
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => loading,
      policy: "inline",
    });
    await expect(guarded({})).resolves.toEqual({ status: "pending" });
  });

  it("runs the action when authenticated", async () => {
    const guarded = withAuthGuard(
      async (input: { n: number }, ctx) => {
        expect(ctx.session.user.id).toBe("user-1");
        return input.n * 2;
      },
      {
        readSession: async () => authenticated,
        policy: "inline",
      }
    );
    await expect(guarded({ n: 21 })).resolves.toEqual({
      status: "succeeded",
      value: 42,
    });
  });

  it("redirect-without-resume navigates and never writes a pending intent", async () => {
    const navigate = vi.fn();
    const registerPendingIntent = vi.fn();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-without-resume",
      signInTo: "/sign-in",
      navigate,
      getCurrentPath: () => "/billing",
      registerPendingIntent,
      pendingIntent: {
        kind: "save-draft",
        version: 1,
        payload: { draftId: "d1" },
        idempotencyKey: "save-d1",
        replayPolicy: "mutation",
        returnTo: "/drafts/d1",
      },
    });

    const result = await guarded({});
    expect(result).toEqual({
      status: "authentication-required",
      policy: "redirect-without-resume",
      redirectTo: "/sign-in?returnTo=%2Fbilling",
    });
    expect(navigate).toHaveBeenCalledWith("/sign-in?returnTo=%2Fbilling");
    expect(registerPendingIntent).not.toHaveBeenCalled();
  });

  it("redirect-and-resume fails closed when pending store and register are missing", async () => {
    const navigate = vi.fn();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate,
      pendingIntent: {
        kind: "save-draft",
        version: 1,
        payload: { draftId: "d1" },
        idempotencyKey: "save-d1",
        replayPolicy: "mutation",
        returnTo: "/drafts/d1",
      },
    });

    await expect(guarded({})).resolves.toEqual({
      status: "resume-unavailable",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("redirect-and-resume stores a pending intent then navigates to sign-in with safe return-to", async () => {
    const navigate = vi.fn();
    const store = createMemoryPendingActionStore();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate,
      origin: "https://app.test",
      pendingActionStore: store,
      pendingIntent: {
        kind: "save-draft",
        version: 1,
        payload: { draftId: "d1" },
        idempotencyKey: "save-d1",
        replayPolicy: "mutation",
        returnTo: "/drafts/d1",
      },
    });

    const result = await guarded({});
    expect(result.status).toBe("authentication-required");
    if (result.status !== "authentication-required") {
      throw new Error("expected authentication-required");
    }
    expect(result.policy).toBe("redirect-and-resume");
    expect(result.intentId).toEqual(expect.any(String));
    expect(result.redirectTo).toBe(
      `/sign-in?returnTo=${encodeURIComponent("/drafts/d1")}&intent=${result.intentId}`
    );
    expect(navigate).toHaveBeenCalledWith(result.redirectTo);
    expect(result.redirectTo).not.toContain("draftId");
    expect(result.redirectTo).not.toMatch(/save-draft/);

    const stored = await store.read(result.intentId!);
    expect(stored).toEqual(
      expect.objectContaining({
        kind: "save-draft",
        returnTo: "/drafts/d1",
        payload: { draftId: "d1" },
        idempotencyKey: "save-d1",
      })
    );
  });

  it("redirect-and-resume rewrites unsafe return-to before storing", async () => {
    const store = createMemoryPendingActionStore();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate: vi.fn(),
      origin: "https://app.test",
      fallbackReturnTo: "/safe",
      pendingActionStore: store,
      pendingIntent: {
        kind: "open",
        version: 1,
        payload: {},
        idempotencyKey: "open-1",
        replayPolicy: "read",
        returnTo: "https://evil.test/phish",
      },
    });

    const result = await guarded({});
    expect(result.status).toBe("authentication-required");
    if (result.status !== "authentication-required" || !result.intentId) {
      throw new Error("expected intent");
    }
    const stored = await store.read(result.intentId);
    expect(stored?.returnTo).toBe("/safe");
    expect(result.redirectTo).toBe(
      `/sign-in?returnTo=${encodeURIComponent("/safe")}&intent=${result.intentId}`
    );
  });

  it("defaults return-to to the current path when omitted", async () => {
    const store = createMemoryPendingActionStore();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate: vi.fn(),
      getCurrentPath: () => "/settings/profile",
      pendingActionStore: store,
      pendingIntent: {
        kind: "open",
        version: 1,
        payload: {},
        idempotencyKey: "open-1",
        replayPolicy: "read",
      },
    });

    const result = await guarded({});
    if (result.status !== "authentication-required" || !result.intentId) {
      throw new Error("expected intent");
    }
    expect((await store.read(result.intentId))?.returnTo).toBe(
      "/settings/profile"
    );
  });

  it("inline returns a one-shot continuation handle", async () => {
    let snapshot: AuthSnapshot = unauthenticated;
    const guarded = withAuthGuard(async () => "ran", {
      readSession: async () => snapshot,
      policy: "inline",
    });

    const first = await guarded({ x: 1 });
    expect(first.status).toBe("authentication-required");
    if (first.status !== "authentication-required" || !first.continuation) {
      throw new Error("expected continuation");
    }

    snapshot = authenticated;
    await expect(first.continuation.resume()).resolves.toEqual({
      status: "succeeded",
      value: "ran",
    });
    await expect(first.continuation.resume()).resolves.toEqual({
      status: "continuation-invalid",
    });
  });

  it("returns forbidden when authorize rejects", async () => {
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => authenticated,
      policy: "inline",
      authorize: async () => false,
    });
    await expect(guarded({})).resolves.toEqual({ status: "forbidden" });
  });

  it("re-checks the live session immediately before executing", async () => {
    const reads: AuthSnapshot[] = [authenticated, unauthenticated];
    const action = vi.fn(async () => "ok");
    const guarded = withAuthGuard(action, {
      readSession: async () => reads.shift() ?? unauthenticated,
      policy: "inline",
    });

    await expect(guarded({})).resolves.toEqual({
      status: "authentication-required",
      policy: "inline",
      continuation: expect.any(Object),
    });
    expect(action).not.toHaveBeenCalled();
  });
});

describe("requireSession", () => {
  it("returns authenticated session or policy outcomes", async () => {
    await expect(
      requireSession({
        readSession: async () => authenticated,
        policy: "inline",
      })
    ).resolves.toEqual({ status: "authenticated", session });

    const navigate = vi.fn();
    await expect(
      requireSession({
        readSession: async () => unauthenticated,
        policy: "redirect-without-resume",
        signInTo: "/sign-in",
        navigate,
        getCurrentPath: () => "/billing",
      })
    ).resolves.toEqual({
      status: "authentication-required",
      policy: "redirect-without-resume",
      redirectTo: "/sign-in?returnTo=%2Fbilling",
    });
    expect(navigate).toHaveBeenCalledWith("/sign-in?returnTo=%2Fbilling");
  });

  it("fails closed for redirect-and-resume without pending store", async () => {
    await expect(
      requireSession({
        readSession: async () => unauthenticated,
        policy: "redirect-and-resume",
        signInTo: "/sign-in",
        pendingIntent: {
          kind: "open",
          version: 1,
          payload: {},
          idempotencyKey: "open-1",
          replayPolicy: "read",
          returnTo: "/app",
        },
      })
    ).resolves.toEqual({ status: "resume-unavailable" });
  });
});

describe("resumeAfterAuthentication", () => {
  it("claims once, navigates to return-to, and dispatches the pending handler", async () => {
    const store = createMemoryPendingActionStore();
    const handlers = createPendingActionHandlerRegistry();
    const navigate = vi.fn();
    let dispatched = 0;
    handlers.register("save-draft", async ({ session }) => {
      expect(session.user.id).toBe("user-1");
      dispatched += 1;
      return { status: "succeeded" };
    });

    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate: vi.fn(),
      pendingActionStore: store,
      pendingIntent: {
        kind: "save-draft",
        version: 1,
        payload: { draftId: "d1" },
        idempotencyKey: "save-d1",
        replayPolicy: "read",
        returnTo: "/drafts/d1",
        userId: "user-1",
      },
    });
    const registered = await guarded({});
    if (
      registered.status !== "authentication-required" ||
      !registered.intentId
    ) {
      throw new Error("expected intent");
    }

    const first = await resumeAfterAuthentication({
      intentId: registered.intentId,
      store,
      handlers,
      getSession: async () => session,
      navigate,
      allowMutationReplay: false,
    });
    const second = await resumeAfterAuthentication({
      intentId: registered.intentId,
      store,
      handlers,
      getSession: async () => session,
      navigate,
      allowMutationReplay: false,
    });

    expect(first).toEqual({
      status: "succeeded",
      intentId: registered.intentId,
    });
    expect(second).toEqual({ status: "consumed" });
    expect(dispatched).toBe(1);
    expect(navigate).toHaveBeenCalledWith("/drafts/d1");
  });

  it("rejects user mismatch without claiming", async () => {
    const store = createMemoryPendingActionStore();
    const handlers = createPendingActionHandlerRegistry();
    handlers.register("save-draft", async () => ({ status: "succeeded" }));

    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      navigate: vi.fn(),
      pendingActionStore: store,
      pendingIntent: {
        kind: "save-draft",
        version: 1,
        payload: {},
        idempotencyKey: "k",
        replayPolicy: "read",
        returnTo: "/app",
        userId: "user-1",
      },
    });
    const registered = await guarded({});
    if (
      registered.status !== "authentication-required" ||
      !registered.intentId
    ) {
      throw new Error("expected intent");
    }

    await expect(
      resumeAfterAuthentication({
        intentId: registered.intentId,
        store,
        handlers,
        getSession: async () => ({
          user: { id: "user-2", name: "Other" },
          expiresAt: "2030-01-01T00:00:00.000Z",
        }),
        navigate: vi.fn(),
      })
    ).resolves.toEqual({ status: "user-mismatch" });
    expect(await store.read(registered.intentId)).not.toBeNull();
  });

  it("fails closed for unknown handler kinds", async () => {
    const store = createMemoryPendingActionStore();
    const handlers = createPendingActionHandlerRegistry();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      navigate: vi.fn(),
      pendingActionStore: store,
      pendingIntent: {
        kind: "missing-kind",
        version: 1,
        payload: {},
        idempotencyKey: "k",
        replayPolicy: "read",
        returnTo: "/app",
      },
    });
    const registered = await guarded({});
    if (
      registered.status !== "authentication-required" ||
      !registered.intentId
    ) {
      throw new Error("expected intent");
    }

    await expect(
      resumeAfterAuthentication({
        intentId: registered.intentId,
        store,
        handlers,
        getSession: async () => session,
        navigate: vi.fn(),
      })
    ).resolves.toEqual({ status: "missing-handler" });
  });
});

describe("createInlineContinuation", () => {
  it("expires and invalidates on identity change", async () => {
    let now = 1_000;
    let current: AuthSnapshot = authenticated;
    const continuation = createInlineContinuation({
      input: { n: 1 },
      boundUserId: "user-1",
      createdAt: now,
      ttlMs: 100,
      now: () => now,
      readSession: async () => current,
      authorize: async () => true,
      action: async () => "ok",
    });

    now = 1_200;
    await expect(continuation.resume()).resolves.toEqual({
      status: "continuation-expired",
    });

    const fresh = createInlineContinuation({
      input: {},
      boundUserId: "user-1",
      createdAt: 1_000,
      ttlMs: 10_000,
      now: () => 1_000,
      readSession: async () => current,
      authorize: async () => true,
      action: async () => "ok",
    });
    current = {
      status: "authenticated",
      session: {
        user: { id: "user-2", name: "Other" },
        expiresAt: "2030-01-01T00:00:00.000Z",
      },
      user: { id: "user-2", name: "Other" },
    };
    await expect(fresh.resume()).resolves.toEqual({
      status: "continuation-invalid",
    });
  });
});
