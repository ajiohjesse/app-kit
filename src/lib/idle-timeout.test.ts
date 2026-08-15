import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "@/test-utils/fake-clock";
import {
  createIdleTimeout,
  DEFAULT_IDLE_MS,
  type IdleAuthAdapter,
  type IdleChannel,
  type IdleChannelMessage,
  type IdleConfirmAdapter,
} from "../../infra/idle-timeout";

function createMemoryChannel(): IdleChannel & {
  messages: IdleChannelMessage[];
} {
  const listeners = new Set<(message: IdleChannelMessage) => void>();
  const messages: IdleChannelMessage[] = [];
  return {
    messages,
    post(message) {
      messages.push(message);
      for (const listener of listeners) {
        listener(message);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe("idle state machine", () => {
  it("starts active and enters warning then timed-out on the fake clock", () => {
    const clock = new FakeClock();
    const idle = createIdleTimeout({
      clock,
      idleMs: 1000,
      warningMs: 200,
    });
    idle.mount();

    expect(idle.getState().state).toBe("active");
    expect(idle.getState().reason).toBeNull();

    clock.advanceBy(999);
    expect(idle.getState().state).toBe("active");

    clock.advanceBy(1);
    expect(idle.getState().state).toBe("warning");
    expect(idle.getState().reason).toBe("idle");
    expect(idle.getState().remainingWarningMs).toBe(200);

    clock.advanceBy(200);
    expect(idle.getState().state).toBe("timed-out");
    expect(idle.getState().reason).toBe("idle");
  });

  it("extend from warning returns to active without calling refresh", async () => {
    const clock = new FakeClock();
    const refresh = vi.fn(async () => null);
    const confirm: IdleConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"confirmed"> => "confirmed"),
    };
    const auth: IdleAuthAdapter = {
      signOut: vi.fn(async () => undefined),
      refresh,
    };

    const idle = createIdleTimeout({
      clock,
      idleMs: 1000,
      warningMs: 500,
      confirm,
      auth,
    });

    idle.mount();
    clock.advanceBy(1000);
    expect(idle.getState().state).toBe("warning");

    await vi.waitFor(() => {
      expect(confirm.confirm).toHaveBeenCalled();
    });

    expect(idle.getState().state).toBe("active");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("session-expiry warning", () => {
  it("offers refresh only when injected and calls it once", async () => {
    const clock = new FakeClock();
    clock.advanceBy(1_000);
    const refresh = vi.fn(async () => null);
    const confirm = vi.fn(async (options: { confirmLabel?: string }) => {
      expect(options.confirmLabel).toBe("Refresh session");
      return "confirmed" as const;
    });
    const warningMs = 1_000;
    const expiresIn = 5_000;

    const idle = createIdleTimeout({
      clock,
      idleMs: DEFAULT_IDLE_MS,
      warningMs,
      sessionExpiresAt: new Date(clock.now() + expiresIn).toISOString(),
      confirm: { confirm },
      auth: {
        signOut: vi.fn(async () => undefined),
        refresh,
      },
    });

    idle.mount();
    clock.advanceBy(expiresIn - warningMs);
    expect(idle.getState().state).toBe("warning");
    expect(idle.getState().reason).toBe("session-expired");

    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalled();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("uses Dismiss warning when refresh is absent and does not extend", async () => {
    const clock = new FakeClock();
    clock.advanceBy(1_000);
    const confirm = vi.fn(async (options: { confirmLabel?: string }) => {
      expect(options.confirmLabel).toBe("Dismiss warning");
      return "confirmed" as const;
    });
    const warningMs = 1_000;
    const expiresIn = 5_000;

    const idle = createIdleTimeout({
      clock,
      idleMs: DEFAULT_IDLE_MS,
      warningMs,
      sessionExpiresAt: new Date(clock.now() + expiresIn).toISOString(),
      confirm: { confirm },
      auth: {
        signOut: vi.fn(async () => undefined),
      },
    });

    idle.mount();
    clock.advanceBy(expiresIn - warningMs);
    expect(idle.getState().state).toBe("warning");

    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalled();
    });

    expect(idle.getState().state).toBe("warning");
    clock.advanceBy(warningMs);
    expect(idle.getState().state).toBe("timed-out");
    expect(idle.getState().reason).toBe("session-expired");
  });
});

describe("cross-tab sign-out", () => {
  it("broadcasts one terminal event and a peer settles without looping", async () => {
    const clock = new FakeClock();
    const channel = createMemoryChannel();
    const signOutA = vi.fn(async () => undefined);
    const signOutB = vi.fn(async () => undefined);

    const tabA = createIdleTimeout({
      clock,
      idleMs: 1000,
      warningMs: 100,
      scopeKey: "app",
      channel,
      auth: { signOut: signOutA },
    });
    const tabB = createIdleTimeout({
      clock,
      idleMs: 1000,
      warningMs: 100,
      scopeKey: "app",
      channel,
      auth: { signOut: signOutB },
    });

    tabA.mount();
    tabB.mount();

    await tabA.signOut();

    expect(signOutA).toHaveBeenCalledTimes(1);
    expect(channel.messages).toHaveLength(1);
    expect(channel.messages[0]?.type).toBe("signed-out");
    expect(tabB.getState().state).toBe("timed-out");
    expect(signOutB).toHaveBeenCalledTimes(1);
    expect(channel.messages).toHaveLength(1);
  });
});

describe("session refresh reinit", () => {
  it("leaves session warning after expiresAt is pushed out", async () => {
    const clock = new FakeClock();
    clock.advanceBy(1_000);
    const warningMs = 1_000;
    let expiresAt = new Date(clock.now() + 5_000).toISOString();
    const box: { current: ReturnType<typeof createIdleTimeout> | null } = {
      current: null,
    };
    const refresh = vi.fn(async () => {
      expiresAt = new Date(clock.now() + 60_000).toISOString();
      box.current?.setSessionExpiresAt(expiresAt);
      return null;
    });
    const confirm = vi.fn(async () => "confirmed" as const);

    const idle = createIdleTimeout({
      clock,
      idleMs: DEFAULT_IDLE_MS,
      warningMs,
      sessionExpiresAt: expiresAt,
      confirm: { confirm },
      auth: {
        signOut: vi.fn(async () => undefined),
        refresh,
      },
    });
    box.current = idle;

    idle.mount();
    clock.advanceBy(4_000);
    expect(idle.getState().state).toBe("warning");

    await vi.waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    expect(idle.getState().state).toBe("active");
    expect(idle.getState().reason).toBeNull();
  });
});

describe("fail-safe warning dismiss", () => {
  it("keeps warning and countdown when the confirm is dismissed", async () => {
    const clock = new FakeClock();
    const confirm = vi.fn(async () => "dismissed" as const);
    const idle = createIdleTimeout({
      clock,
      idleMs: 1000,
      warningMs: 400,
      confirm: { confirm },
      auth: { signOut: vi.fn(async () => undefined) },
    });

    idle.mount();
    clock.advanceBy(1000);
    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalled();
    });

    expect(idle.getState().state).toBe("warning");
    clock.advanceBy(400);
    expect(idle.getState().state).toBe("timed-out");
  });
});

describe("visibility", () => {
  it("times out on return when the deadline passed while hidden", () => {
    const clock = new FakeClock();
    let hidden = false;
    const listeners = new Map<string, Set<() => void>>();
    const doc = {
      get hidden() {
        return hidden;
      },
      get visibilityState() {
        return hidden ? ("hidden" as const) : ("visible" as const);
      },
      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ) {
        const set = listeners.get(type) ?? new Set<() => void>();
        set.add(listener as () => void);
        listeners.set(type, set);
      },
      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject
      ) {
        listeners.get(type)?.delete(listener as () => void);
      },
      dispatch(type: string) {
        for (const listener of listeners.get(type) ?? []) {
          listener();
        }
      },
    };

    const idle = createIdleTimeout({
      clock,
      idleMs: 1000,
      warningMs: 100,
      document: doc,
    });
    idle.mount();

    hidden = true;
    clock.advanceBy(1200);
    // Timer may already have fired; force visibility return path.
    hidden = false;
    doc.dispatch("visibilitychange");

    expect(idle.getState().state).toBe("timed-out");
  });
});
