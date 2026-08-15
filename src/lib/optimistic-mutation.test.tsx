import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createOptimisticMutation } from "../../infra/optimistic-mutation";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function clientWithTodo(title: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(["todo", 1], { id: 1, title });
  return queryClient;
}

describe("createOptimisticMutation snapshots and rollback", () => {
  it("applies optimistic data then restores owned snapshots on failure", async () => {
    const queryClient = clientWithTodo("before");
    const gate = deferred<never>();

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      mutationFn: async () => gate.promise,
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], (old) => ({
          ...(old as { id: number; title: string }),
          title: variables.title,
        }));
      },
    });

    const pending = mutation.mutate({ title: "optimistic" });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "optimistic",
    });

    gate.reject(new Error("save failed"));
    await expect(pending).rejects.toThrow("save failed");
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "before",
    });
  });

  it("changes no cache when setup fails before optimistic writes", async () => {
    const queryClient = clientWithTodo("before");
    const mutationFn = vi.fn(async () => ({ id: 1, title: "after" }));

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [
        ["todo", 1],
        ["todo", 2],
      ],
      onMissing: "reject",
      mutationFn,
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: variables.title });
      },
    });

    await expect(mutation.mutate({ title: "optimistic" })).rejects.toThrow(
      /missing cache/i
    );
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "before",
    });
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("rolls back only owned keys when a newer attempt overwrote the entry", async () => {
    const queryClient = clientWithTodo("before");
    const firstGate = deferred<never>();
    const secondGate = deferred<{ id: number; title: string }>();

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      conflictPolicy: "parallel",
      mutationFn: async (variables) => {
        if (variables.title === "first") return firstGate.promise;
        return secondGate.promise;
      },
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], (old) => ({
          ...(old as { id: number; title: string }),
          title: variables.title,
        }));
      },
    });

    const first = mutation.mutate({ title: "first" });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "first",
    });

    const second = mutation.mutate({ title: "second" });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "second",
    });

    firstGate.reject(new Error("first failed"));
    await expect(first).rejects.toThrow("first failed");
    // Newer attempt still owns the cache — do not clobber.
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "second",
    });

    secondGate.resolve({ id: 1, title: "second-server" });
    await expect(second).resolves.toEqual({ id: 1, title: "second-server" });
  });
});

describe("createOptimisticMutation conflict policies", () => {
  it("serial waits for the prior attempt to settle", async () => {
    const queryClient = clientWithTodo("before");
    const firstGate = deferred<{ id: number; title: string }>();
    const order: string[] = [];

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      conflictPolicy: "serial",
      mutationFn: async (variables) => {
        order.push(`start:${variables.title}`);
        if (variables.title === "a") return firstGate.promise;
        order.push(`end:${variables.title}`);
        return { id: 1, title: variables.title };
      },
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: variables.title });
      },
    });

    const first = mutation.mutate({ title: "a" });
    const secondPromise = mutation.mutate({ title: "b" });

    await vi.waitFor(() => expect(order).toEqual(["start:a"]));
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "a",
    });

    firstGate.resolve({ id: 1, title: "a-server" });
    await first;
    await secondPromise;
    expect(order).toEqual(["start:a", "start:b", "end:b"]);
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "b",
    });
  });

  it("replace aborts the prior attempt and keeps the newer optimistic write", async () => {
    const queryClient = clientWithTodo("before");
    const firstGate = deferred<{ id: number; title: string }>();

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      conflictPolicy: "replace",
      mutationFn: async (variables, { signal }) => {
        if (variables.title === "old") {
          return new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(signal.reason);
            });
            void firstGate.promise.then(resolve, reject);
          });
        }
        return { id: 1, title: variables.title };
      },
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: variables.title });
      },
    });

    const first = mutation.mutate({ title: "old" });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "old",
    });

    await expect(mutation.mutate({ title: "new" })).resolves.toEqual({
      id: 1,
      title: "new",
    });
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "new",
    });
  });
});

describe("createOptimisticMutation optional action-runner", () => {
  it("invokes the mutation exactly once through runAction", async () => {
    const queryClient = clientWithTodo("before");
    let runActionCalls = 0;
    const mutationFn = vi.fn(async (_variables: { title: string }) => ({
      id: 1,
      title: "saved",
    }));
    const runAction = async <T,>(
      operation: (context: { signal: AbortSignal }) => Promise<T>,
      _options?: { signal?: AbortSignal }
    ): Promise<T> => {
      runActionCalls += 1;
      return operation({ signal: new AbortController().signal });
    };

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      mutationFn,
      runAction,
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: variables.title });
      },
      onSuccess: {
        reconcile: (data, _variables, { setQueryData }) => {
          setQueryData(["todo", 1], data);
        },
      },
    });

    await expect(mutation.mutate({ title: "optimistic" })).resolves.toEqual({
      id: 1,
      title: "saved",
    });
    expect(runActionCalls).toBe(1);
    expect(mutationFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "saved",
    });
  });

  it("does not write optimistically when runAction fails before invocation", async () => {
    const queryClient = clientWithTodo("before");
    const mutationFn = vi.fn(async (_variables: { title: string }) => ({
      id: 1,
      title: "saved",
    }));

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      mutationFn,
      runAction: async () => {
        throw new Error("confirm cancelled");
      },
      optimisticUpdate: (_variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: "should-not-write" });
      },
    });

    await expect(mutation.mutate({ title: "x" })).rejects.toThrow(
      "confirm cancelled"
    );
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "before",
    });
    expect(mutationFn).not.toHaveBeenCalled();
  });
});

describe("createOptimisticMutation cancellation and success policies", () => {
  it("rolls back owned snapshots when the attempt is aborted", async () => {
    const queryClient = clientWithTodo("before");
    const gate = deferred<{ id: number; title: string }>();

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["update-todo"],
      queryKeys: [["todo", 1]],
      mutationFn: async (_variables, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(signal.reason);
          });
          void gate.promise.then(resolve, reject);
        }),
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: variables.title });
      },
    });

    const controller = new AbortController();
    const pending = mutation.mutate(
      { title: "optimistic" },
      { signal: controller.signal }
    );
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "optimistic",
    });

    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "before",
    });
  });

  it("seeds missing keys then invalidates after success when configured", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const mutation = createOptimisticMutation<
      { title: string },
      { id: number; title: string }
    >({
      queryClient,
      mutationKey: ["create-todo"],
      queryKeys: [["todo", 1]],
      onMissing: "seed",
      seed: () => ({ id: 1, title: "" }),
      mutationFn: async (variables) => ({ id: 1, title: variables.title }),
      optimisticUpdate: (variables, { setQueryData }) => {
        setQueryData(["todo", 1], { id: 1, title: variables.title });
      },
      onSuccess: {
        reconcile: (data, _variables, { setQueryData }) => {
          setQueryData(["todo", 1], data);
        },
        invalidateKeys: [["todo", 1]],
      },
    });

    await expect(mutation.mutate({ title: "created" })).resolves.toEqual({
      id: 1,
      title: "created",
    });
    expect(queryClient.getQueryData(["todo", 1])).toEqual({
      id: 1,
      title: "created",
    });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("snapshots non-cloneable cache values without throwing", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const handle = { run: vi.fn() };
    queryClient.setQueryData(["resource"], handle);

    const mutation = createOptimisticMutation<
      Record<string, never>,
      { ok: true }
    >({
      queryClient,
      mutationKey: ["touch"],
      queryKeys: [["resource"]],
      mutationFn: async () => {
        throw new Error("failed");
      },
      optimisticUpdate: (_variables, { setQueryData }) => {
        setQueryData(["resource"], { run: vi.fn() });
      },
    });

    await expect(mutation.mutate({})).rejects.toThrow("failed");
    const restored = queryClient.getQueryData(["resource"]) as typeof handle;
    // QueryClient may wrap the root object; the non-cloneable fn must survive.
    expect(restored.run).toBe(handle.run);
  });
});
