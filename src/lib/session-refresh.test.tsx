import {
  describe,
  expect,
  it,
  vi,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  AuthExpiredError,
  createFetchInterceptor,
  createRefreshCoordinator,
  type RefreshOutcome,
} from "../../infra/session-refresh";
import type { Session } from "../../infra/authentication-core";

function session(id: string, expiresAt = "2030-01-01T00:00:00.000Z"): Session {
  return {
    user: { id },
    expiresAt,
    sessionId: `sess-${id}`,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createRefreshCoordinator refresh", () => {
  it("reports unsupported when refresh is omitted", async () => {
    const coordinator = createRefreshCoordinator({});

    await expect(coordinator.refresh()).resolves.toEqual({
      status: "unsupported",
    } satisfies RefreshOutcome);
  });

  it("shares one in-flight refresh across waiters", async () => {
    const gate = deferred<Session>();
    const refresh = vi.fn(async () => gate.promise);
    const coordinator = createRefreshCoordinator({ refresh });

    const first = coordinator.refresh();
    const second = coordinator.refresh();

    expect(refresh).toHaveBeenCalledTimes(1);

    gate.resolve(session("user-1"));
    await expect(first).resolves.toEqual({
      status: "refreshed",
      session: session("user-1"),
    });
    await expect(second).resolves.toEqual({
      status: "refreshed",
      session: session("user-1"),
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("createRefreshCoordinator intercept replay policy", () => {
  it("queues read requests and replays once after refresh", async () => {
    const refreshGate = deferred<Session>();
    const refresh = vi.fn(async () => refreshGate.promise);
    const coordinator = createRefreshCoordinator({ refresh });

    let attempts = 0;
    const attemptsLog: Array<"initial" | "replay"> = [];
    const operation = vi.fn(
      async (context: { attempt: "initial" | "replay" }) => {
        attemptsLog.push(context.attempt);
        attempts += 1;
        if (attempts === 1) {
          throw new AuthExpiredError();
        }
        return "ok";
      }
    );

    const resultPromise = coordinator.intercept(operation, {
      replayPolicy: "read",
    });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    refreshGate.resolve(session("user-1"));

    await expect(resultPromise).resolves.toEqual({
      status: "ok",
      value: "ok",
    });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(attemptsLog).toEqual(["initial", "replay"]);
  });

  it("does not auto-replay mutations without opt-in and idempotency key", async () => {
    const refresh = vi.fn(async () => session("user-1"));
    const coordinator = createRefreshCoordinator({ refresh });

    const operation = vi.fn(async () => {
      throw new AuthExpiredError();
    });

    await expect(
      coordinator.intercept(operation, { replayPolicy: "mutation" })
    ).resolves.toEqual({ status: "mutation-replay-denied" });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("replays mutations only with acknowledgement and idempotency key", async () => {
    const refresh = vi.fn(async () => session("user-1"));
    const coordinator = createRefreshCoordinator({ refresh });

    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new AuthExpiredError();
      }
      return "saved";
    });

    await expect(
      coordinator.intercept(operation, {
        replayPolicy: "mutation",
        acknowledgeMutationReplay: true,
        idempotencyKey: "save-1",
      })
    ).resolves.toEqual({ status: "ok", value: "saved" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("returns refresh-in-progress for non-queueable callers during flight", async () => {
    const gate = deferred<Session>();
    const refresh = vi.fn(async () => gate.promise);
    const coordinator = createRefreshCoordinator({ refresh });

    const pending = coordinator.refresh();
    await expect(
      coordinator.intercept(async () => "x", {
        replayPolicy: "read",
        queueable: false,
      })
    ).resolves.toEqual({ status: "refresh-in-progress" });

    gate.resolve(session("user-1"));
    await pending;
  });

  it("cancels queued waiters when generation is invalidated", async () => {
    const gate = deferred<Session>();
    const refresh = vi.fn(async () => gate.promise);
    const coordinator = createRefreshCoordinator({ refresh });

    const first = coordinator.refresh();
    const second = coordinator.refresh();
    coordinator.invalidate("sign-out");

    await expect(first).resolves.toEqual({ status: "cancelled" });
    await expect(second).resolves.toEqual({ status: "cancelled" });
    gate.resolve(session("user-1"));
  });

  it("returns already-current for proactive refresh within leeway", async () => {
    const current = session("user-1", "2030-01-01T00:00:10.000Z");
    const refresh = vi.fn(async () => session("user-1"));
    const coordinator = createRefreshCoordinator({
      refresh,
      getSession: () => current,
      now: () => Date.parse("2030-01-01T00:00:00.000Z"),
      proactiveLeewayMs: 5_000,
    });

    await expect(coordinator.refresh({ proactive: true })).resolves.toEqual({
      status: "already-current",
      session: current,
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops after one replay when auth expires again", async () => {
    const refresh = vi.fn(async () => session("user-1"));
    const coordinator = createRefreshCoordinator({ refresh });
    const operation = vi.fn(async () => {
      throw new AuthExpiredError();
    });

    await expect(
      coordinator.intercept(operation, { replayPolicy: "read" })
    ).resolves.toEqual({ status: "replay-exhausted" });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("invokes runAction exactly once per attempt", async () => {
    const refresh = vi.fn(async () => session("user-1"));
    const runs: string[] = [];
    const coordinator = createRefreshCoordinator({
      refresh,
      runAction: async (operation) => {
        runs.push("run");
        return operation({ signal: new AbortController().signal });
      },
    });

    let attempts = 0;
    await expect(
      coordinator.intercept(
        async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new AuthExpiredError();
          }
          return "ok";
        },
        { replayPolicy: "read" }
      )
    ).resolves.toEqual({ status: "ok", value: "ok" });

    expect(runs).toEqual(["run", "run"]);
  });

  it("cancels one waiter abort without cancelling shared refresh", async () => {
    const gate = deferred<Session>();
    const refresh = vi.fn(async () => gate.promise);
    const coordinator = createRefreshCoordinator({ refresh });

    const controller = new AbortController();
    const first = coordinator.refresh({ signal: controller.signal });
    const second = coordinator.refresh();

    controller.abort();
    await expect(first).resolves.toEqual({ status: "cancelled" });

    gate.resolve(session("user-1"));
    await expect(second).resolves.toEqual({
      status: "refreshed",
      session: session("user-1"),
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

const server = setupServer();

describe("createFetchInterceptor", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("refreshes once and replays a read fetch after 401", async () => {
    let hits = 0;
    server.use(
      http.get("https://api.test/resource", () => {
        hits += 1;
        if (hits === 1) {
          return HttpResponse.json({ error: "expired" }, { status: 401 });
        }
        return HttpResponse.json({ ok: true });
      })
    );

    const refresh = vi.fn(async () => session("user-1"));
    const coordinator = createRefreshCoordinator({ refresh });
    const fetchWithRefresh = createFetchInterceptor({
      coordinator,
      replayPolicy: "read",
    });

    const response = await fetchWithRefresh("https://api.test/resource");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(hits).toBe(2);
  });
});
