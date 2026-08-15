import { describe, expect, it } from "vitest";
import {
  createMemoryPendingActionStore,
  createPendingActionHandlerRegistry,
  createPendingActionIntent,
  createResumeOperation,
  type PendingActionIntent,
} from "../../infra/pending-auth-action";

function makeIntent(
  overrides: Partial<Parameters<typeof createPendingActionIntent>[0]> = {}
) {
  return createPendingActionIntent({
    kind: "open-invoice",
    version: 1,
    payload: { invoiceId: "inv-1" },
    returnTo: "/invoices/inv-1",
    idempotencyKey: "open-inv-1",
    replayPolicy: "read",
    userId: "user-1",
    expiresAt: "2030-01-01T00:00:00.000Z",
    now: () => Date.parse("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });
}

describe("pending action intent", () => {
  it("creates a serializable user-scoped intent with expiry and idempotency key", () => {
    const intent = makeIntent();

    expect(intent).toEqual({
      id: expect.any(String),
      kind: "open-invoice",
      version: 1,
      payload: { invoiceId: "inv-1" },
      returnTo: "/invoices/inv-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2030-01-01T00:00:00.000Z",
      idempotencyKey: "open-inv-1",
      replayPolicy: "read",
      userId: "user-1",
    } satisfies PendingActionIntent);
    expect(JSON.parse(JSON.stringify(intent))).toEqual(intent);
  });

  it("rejects non-JSON payloads and functions", () => {
    expect(() =>
      createPendingActionIntent({
        kind: "bad",
        version: 1,
        payload: { fn: () => undefined },
        returnTo: "/x",
        idempotencyKey: "k",
        replayPolicy: "read",
      })
    ).toThrow(/json/i);

    expect(() =>
      createPendingActionIntent({
        kind: "bad",
        version: 1,
        payload: undefined,
        returnTo: "/x",
        idempotencyKey: "k",
        replayPolicy: "read",
      })
    ).toThrow(/json/i);
  });
});

describe("pending action store", () => {
  it("saves and reads an intent", async () => {
    const store = createMemoryPendingActionStore();
    const intent = makeIntent({ id: "intent-1" });
    await store.save(intent);
    expect(await store.read("intent-1")).toEqual(intent);
  });

  it("claims exactly once and returns consumed for duplicates", async () => {
    const store = createMemoryPendingActionStore();
    const intent = makeIntent({ id: "intent-1" });
    await store.save(intent);

    const first = await store.claim("intent-1");
    const second = await store.claim("intent-1");

    expect(first).toEqual({ status: "claimed", intent });
    expect(second).toEqual({ status: "consumed" });
    expect(await store.read("intent-1")).toBeNull();
  });

  it("treats expired intents as expired and removes them", async () => {
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const store = createMemoryPendingActionStore({ now: () => now });
    const intent = makeIntent({
      id: "intent-1",
      expiresAt: "2026-01-01T00:00:01.000Z",
    });
    await store.save(intent);

    now = Date.parse("2026-01-01T00:00:02.000Z");
    expect(await store.claim("intent-1")).toEqual({ status: "expired" });
    expect(await store.read("intent-1")).toBeNull();
  });
});

describe("pending action handlers and resume", () => {
  it("fails closed when no handler is registered for the intent kind", async () => {
    const store = createMemoryPendingActionStore();
    const intent = makeIntent({ id: "intent-1", userId: null });
    await store.save(intent);

    const resume = createResumeOperation({
      store,
      getSession: async () => ({
        user: { id: "user-1" },
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
      navigate: async () => undefined,
      handlers: createPendingActionHandlerRegistry(),
    });

    await expect(resume({ intentId: "intent-1" })).resolves.toEqual({
      status: "missing-handler",
    });
    expect(await store.read("intent-1")).toEqual(intent);
  });

  it("rejects a user mismatch without claiming the intent", async () => {
    const store = createMemoryPendingActionStore();
    const intent = makeIntent({ id: "intent-1", userId: "user-a" });
    await store.save(intent);
    const handlers = createPendingActionHandlerRegistry();
    handlers.register("open-invoice", async () => ({ status: "succeeded" }));

    const resume = createResumeOperation({
      store,
      getSession: async () => ({
        user: { id: "user-b" },
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
      navigate: async () => undefined,
      handlers,
    });

    await expect(resume({ intentId: "intent-1" })).resolves.toEqual({
      status: "user-mismatch",
    });
    expect(await store.read("intent-1")).toEqual(intent);
  });

  it("resumes a read intent after binding an anonymous user and navigating", async () => {
    const store = createMemoryPendingActionStore();
    const intent = makeIntent({ id: "intent-1", userId: null });
    await store.save(intent);
    const handlers = createPendingActionHandlerRegistry();
    const calls: string[] = [];
    handlers.register("open-invoice", async ({ intent: claimed, session }) => {
      calls.push(`${claimed.id}:${session.user.id}`);
      return { status: "succeeded" };
    });
    const navigated: string[] = [];

    const resume = createResumeOperation({
      store,
      getSession: async () => ({
        user: { id: "user-1" },
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
      navigate: async (to) => {
        navigated.push(to);
      },
      handlers,
    });

    await expect(resume({ intentId: "intent-1" })).resolves.toEqual({
      status: "succeeded",
      intentId: "intent-1",
    });
    expect(navigated).toEqual(["/invoices/inv-1"]);
    expect(calls).toEqual(["intent-1:user-1"]);
    expect(await store.read("intent-1")).toBeNull();
  });

  it("does not replay mutations unless mutation replay is explicitly enabled", async () => {
    const store = createMemoryPendingActionStore();
    const intent = makeIntent({
      id: "intent-1",
      replayPolicy: "mutation",
      userId: "user-1",
    });
    await store.save(intent);
    const handlers = createPendingActionHandlerRegistry();
    let ran = 0;
    handlers.register("open-invoice", async () => {
      ran += 1;
      return { status: "succeeded" };
    });

    const resume = createResumeOperation({
      store,
      getSession: async () => ({
        user: { id: "user-1" },
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
      navigate: async () => undefined,
      handlers,
      allowMutationReplay: false,
    });

    await expect(resume({ intentId: "intent-1" })).resolves.toEqual({
      status: "mutation-replay-disabled",
    });
    expect(ran).toBe(0);
    expect(await store.read("intent-1")).toEqual(intent);
  });
});
