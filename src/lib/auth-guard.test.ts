import { describe, expect, it, vi } from "vitest";
import type { AuthSnapshot, Session } from "../../infra/authentication-core";
import {
  createInlineContinuation,
  isSafeRedirectTarget,
  normalizeRedirectTarget,
  requireSession,
  withAuthGuard,
  type UnauthenticatedPolicy,
} from "../../infra/auth-guard";

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

  it("redirect-without-resume navigates and never registers a pending intent", async () => {
    const navigate = vi.fn();
    const registerPendingIntent = vi.fn();
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-without-resume",
      signInTo: "/sign-in",
      navigate,
      getCurrentPath: () => "/billing",
      registerPendingIntent,
    });

    const result = await guarded({});
    expect(result).toEqual({
      status: "authentication-required",
      policy: "redirect-without-resume",
      redirectTo: "/sign-in",
    });
    expect(navigate).toHaveBeenCalledWith("/sign-in");
    expect(registerPendingIntent).not.toHaveBeenCalled();
  });

  it("redirect-and-resume fails closed when pending registration is missing", async () => {
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

  it("redirect-and-resume registers then navigates", async () => {
    const navigate = vi.fn();
    const registerPendingIntent = vi.fn(async () => ({ id: "intent-1" }));
    const guarded = withAuthGuard(async () => "ok", {
      readSession: async () => unauthenticated,
      policy: "redirect-and-resume",
      signInTo: "/sign-in",
      navigate,
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

    await expect(guarded({})).resolves.toEqual({
      status: "authentication-required",
      policy: "redirect-and-resume",
      redirectTo: "/sign-in",
      intentId: "intent-1",
    });
    expect(registerPendingIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "save-draft",
        returnTo: "/drafts/d1",
      })
    );
    expect(navigate).toHaveBeenCalledWith("/sign-in");
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
      })
    ).resolves.toEqual({
      status: "authentication-required",
      policy: "redirect-without-resume",
      redirectTo: "/sign-in",
    });
    expect(navigate).toHaveBeenCalledWith("/sign-in");
  });

  it("fails closed for redirect-and-resume without pending registration", async () => {
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
