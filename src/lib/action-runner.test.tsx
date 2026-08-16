import { act, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { FakeClock } from "@/test-utils/fake-clock";
import {
  ActionRunnerProvider,
  useActionRunner,
  type ActionLoadingOverlayAdapter,
  type ActionConfirmAdapter,
} from "../../infra/action-runner";

function StateView() {
  const { state } = useActionRunner();
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="error-category">{state.error?.category ?? ""}</span>
      <span data-testid="error-message">{state.error?.message ?? ""}</span>
    </div>
  );
}

function Host({
  children,
  ...props
}: {
  children?: ReactNode;
} & Omit<Parameters<typeof ActionRunnerProvider>[0], "children">) {
  return (
    <ActionRunnerProvider {...props}>
      {children ?? <StateView />}
    </ActionRunnerProvider>
  );
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("action-runner run lifecycle", () => {
  it("starts idle and reaches succeeded after a successful run", async () => {
    const done = deferred<string>();

    function Controls() {
      const { run, state } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(async () => {
                return done.promise;
              });
            }}
          >
            run
          </button>
          <span data-testid="live-status">{state.status}</span>
        </>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    expect(screen.getByTestId("status")).toHaveTextContent("idle");

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("pending");
    });

    await act(async () => {
      done.resolve("ok");
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("succeeded");
    });
  });

  it("stores ErrorClassification on failure and never raw exception text", async () => {
    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(async () => {
                throw new Error("secret database stack trace");
              }).catch(() => undefined);
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("failed");
    });

    expect(screen.getByTestId("error-message").textContent).not.toContain(
      "secret database stack trace"
    );
    expect(screen.getByTestId("error-category")).not.toHaveTextContent("");
  });

  it("rethrows the original error to the caller after lifecycle handling", async () => {
    const original = new Error("boom");
    let caught: unknown;

    function Controls() {
      const { run } = useActionRunner();
      useEffect(() => {
        void run(async () => {
          throw original;
        }).catch((error) => {
          caught = error;
        });
      }, [run]);
      return <StateView />;
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    await waitFor(() => {
      expect(caught).toBe(original);
      expect(screen.getByTestId("status")).toHaveTextContent("failed");
    });
  });
});

describe("loading-overlay adapter token lifecycle", () => {
  function createOverlaySpy(): ActionLoadingOverlayAdapter & {
    calls: string[];
  } {
    const calls: string[] = [];
    let seq = 0;
    return {
      calls,
      begin: (options) => {
        calls.push(
          options?.label
            ? `begin:${options.label}:${options.progress ?? ""}`
            : "begin"
        );
        seq += 1;
        return `token-${seq}`;
      },
      succeed: (token) => {
        calls.push(`succeed:${token}`);
      },
      fail: (token) => {
        calls.push(`fail:${token}`);
      },
      release: (token) => {
        calls.push(`release:${token}`);
      },
    };
  }

  it("does not begin an overlay token when blocking is omitted", async () => {
    const overlay = createOverlaySpy();

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(async () => "done");
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(overlay.calls).toEqual([]);
    });
  });

  it("begins before invoke, succeeds then releases on success", async () => {
    const overlay = createOverlaySpy();
    const gate = deferred();
    let invoked = false;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(
              async () => {
                invoked = true;
                await gate.promise;
                return "done";
              },
              { blocking: true }
            );
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(overlay.calls[0]).toBe("begin");
      expect(invoked).toBe(true);
    });

    await act(async () => {
      gate.resolve();
    });

    await waitFor(() => {
      expect(overlay.calls).toEqual([
        "begin",
        "succeed:token-1",
        "release:token-1",
      ]);
    });
  });

  it("maps blocking label and progress to begin", async () => {
    const overlay = createOverlaySpy();

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(async () => "done", {
              blocking: { label: "Saving", progress: 40 },
            });
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(overlay.calls[0]).toBe("begin:Saving:40");
    });
  });

  it("fails the token then releases on failure", async () => {
    const overlay = createOverlaySpy();

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(
              async () => {
                throw new Error("nope");
              },
              { blocking: true }
            ).catch(() => undefined);
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(overlay.calls).toEqual([
        "begin",
        "fail:token-1",
        "release:token-1",
      ]);
    });
  });

  it("releases without succeeding when cancelled", async () => {
    const overlay = createOverlaySpy();
    const gate = deferred();

    function Controls() {
      const { run, cancel } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(
                async ({ signal }) => {
                  await gate.promise;
                  if (signal.aborted) {
                    throw Object.assign(new Error("Aborted"), {
                      name: "AbortError",
                    });
                  }
                  return "late";
                },
                { blocking: true }
              ).catch(() => undefined);
            }}
          >
            run
          </button>
          <button type="button" onClick={() => cancel()}>
            cancel
          </button>
        </>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(overlay.calls).toEqual(["begin"]);
    });

    act(() => {
      screen.getByRole("button", { name: "cancel" }).click();
    });

    await act(async () => {
      gate.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("cancelled");
      expect(overlay.calls).toEqual(["begin", "release:token-1"]);
    });
  });

  it("fails closed when blocking is set without a loading adapter", async () => {
    let caught: unknown;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(async () => "x", { blocking: true }).catch((error) => {
              caught = error;
            });
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(caught).toEqual(
        expect.objectContaining({
          message: expect.stringMatching(/blocking.*loading/i),
        })
      );
    });
  });
});

describe("confirm adapter", () => {
  it("fails closed when confirm is set without a confirm adapter", async () => {
    let caught: unknown;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(async () => "x", {
              confirm: { title: "Sure?" },
            }).catch((error) => {
              caught = error;
            });
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(caught).toEqual(
        expect.objectContaining({
          message: expect.stringMatching(/confirm.*adapter/i),
        })
      );
    });
  });
  it("skips invocation when confirm is dismissed", async () => {
    let invoked = false;
    const confirm: ActionConfirmAdapter = {
      confirm: async () => "dismissed",
    };

    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(
                async () => {
                  invoked = true;
                  return "x";
                },
                {
                  confirm: {
                    title: "Sure?",
                  },
                }
              ).catch(() => undefined);
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host confirm={confirm}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("cancelled");
    });
    expect(invoked).toBe(false);
  });

  it("invokes after confirm settlement", async () => {
    let invoked = false;
    const confirm: ActionConfirmAdapter = {
      confirm: async () => "confirmed",
    };

    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(
                async () => {
                  invoked = true;
                  return "x";
                },
                { confirm: { title: "Sure?" } }
              );
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host confirm={confirm}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(invoked).toBe(true);
      expect(screen.getByTestId("status")).toHaveTextContent("succeeded");
    });
  });

  it("starts blocking overlay only after confirm", async () => {
    const overlayCalls: string[] = [];
    let resolveConfirm!: (value: "confirmed") => void;
    const confirmGate = new Promise<"confirmed">((resolve) => {
      resolveConfirm = resolve;
    });
    const confirm: ActionConfirmAdapter = {
      confirm: async () => confirmGate,
    };
    const overlay: ActionLoadingOverlayAdapter = {
      begin: () => {
        overlayCalls.push("begin");
        return "token-1";
      },
      succeed: () => {
        overlayCalls.push("succeed");
      },
      fail: () => {
        overlayCalls.push("fail");
      },
      release: () => {
        overlayCalls.push("release");
      },
    };

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(async () => "ok", {
              confirm: { title: "Sure?" },
              blocking: true,
            });
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host confirm={confirm} loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(overlayCalls).toEqual([]);
    });

    await act(async () => {
      resolveConfirm("confirmed");
    });

    await waitFor(() => {
      expect(overlayCalls).toEqual(["begin", "succeed", "release"]);
    });
  });
});

describe("replace releases blocking token", () => {
  it("releases the in-flight token when onDuplicate is replace", async () => {
    const overlay = {
      calls: [] as string[],
      begin: () => {
        overlay.calls.push("begin");
        return `token-${overlay.calls.filter((c) => c === "begin").length}`;
      },
      succeed: (token: string) => {
        overlay.calls.push(`succeed:${token}`);
      },
      fail: (token: string) => {
        overlay.calls.push(`fail:${token}`);
      },
      release: (token: string) => {
        overlay.calls.push(`release:${token}`);
      },
    };
    const first = deferred();
    let secondRan = false;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void run(
                async ({ signal }) => {
                  await first.promise;
                  if (signal.aborted) {
                    throw Object.assign(new Error("Aborted"), {
                      name: "AbortError",
                    });
                  }
                  return "first";
                },
                {
                  blocking: true,
                  onDuplicate: "replace",
                  concurrency: "parallel",
                }
              ).catch(() => undefined);
            }}
          >
            first
          </button>
          <button
            type="button"
            onClick={() => {
              void run(
                async () => {
                  secondRan = true;
                  return "second";
                },
                {
                  blocking: true,
                  onDuplicate: "replace",
                  concurrency: "parallel",
                }
              );
            }}
          >
            second
          </button>
        </>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "first" }).click();
    });

    await waitFor(() => {
      expect(overlay.calls).toEqual(["begin"]);
    });

    await act(async () => {
      screen.getByRole("button", { name: "second" }).click();
      first.resolve();
    });

    await waitFor(() => {
      expect(secondRan).toBe(true);
      expect(overlay.calls).toContain("release:token-1");
      expect(overlay.calls).toContain("succeed:token-2");
      expect(overlay.calls).toContain("release:token-2");
    });
  });
});

describe("concurrency and abort", () => {
  it("runs serially by default", async () => {
    const order: string[] = [];
    const first = deferred();
    const secondStarted = deferred();

    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void run(async () => {
                order.push("a-start");
                await first.promise;
                order.push("a-end");
                return "a";
              });
            }}
          >
            first
          </button>
          <button
            type="button"
            onClick={() => {
              void run(async () => {
                order.push("b-start");
                secondStarted.resolve();
                return "b";
              });
            }}
          >
            second
          </button>
        </>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "first" }).click();
    });

    await waitFor(() => {
      expect(order).toEqual(["a-start"]);
    });

    act(() => {
      screen.getByRole("button", { name: "second" }).click();
    });

    expect(order).toEqual(["a-start"]);

    await act(async () => {
      first.resolve();
    });

    await secondStarted.promise;
    expect(order).toEqual(["a-start", "a-end", "b-start"]);
  });

  it("passes AbortSignal and marks cancelled when aborted", async () => {
    const gate = deferred();
    let sawAbort = false;

    function Controls() {
      const { run, cancel } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(async ({ signal }) => {
                await gate.promise;
                sawAbort = signal.aborted;
                if (signal.aborted) {
                  throw Object.assign(new Error("Aborted"), {
                    name: "AbortError",
                  });
                }
                return "ok";
              }).catch(() => undefined);
            }}
          >
            run
          </button>
          <button type="button" onClick={() => cancel()}>
            cancel
          </button>
        </>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("pending");
    });

    act(() => {
      screen.getByRole("button", { name: "cancel" }).click();
    });

    await act(async () => {
      gate.resolve();
    });

    await waitFor(() => {
      expect(sawAbort).toBe(true);
      expect(screen.getByTestId("status")).toHaveTextContent("cancelled");
    });
  });

  it("classifies timeout as timeout and fails the overlay token", async () => {
    const clock = new FakeClock();
    const overlay = {
      calls: [] as string[],
      begin: () => {
        overlay.calls.push("begin");
        return "token-1";
      },
      succeed: () => {
        overlay.calls.push("succeed");
      },
      fail: () => {
        overlay.calls.push("fail");
      },
      release: () => {
        overlay.calls.push("release");
      },
    };

    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(
                async ({ signal }) => {
                  await new Promise<never>((_, reject) => {
                    signal.addEventListener("abort", () => {
                      reject(
                        Object.assign(new Error("Aborted"), {
                          name: "AbortError",
                        })
                      );
                    });
                  });
                },
                { timeoutMs: 10, blocking: true }
              ).catch(() => undefined);
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host clock={clock} loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("pending");
    });

    await act(async () => {
      clock.advanceBy(10);
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("failed");
      expect(screen.getByTestId("error-category")).toHaveTextContent("timeout");
      expect(overlay.calls).toEqual(["begin", "fail", "release"]);
    });
  });

  it("allows parallel runs when configured", async () => {
    const started = deferred();
    let concurrent = 0;
    let maxConcurrent = 0;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(
              async () => {
                concurrent += 1;
                maxConcurrent = Math.max(maxConcurrent, concurrent);
                await started.promise;
                concurrent -= 1;
                return "ok";
              },
              { concurrency: "parallel" }
            );
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host concurrency="serial">
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(maxConcurrent).toBe(2);
    });

    await act(async () => {
      started.resolve();
    });
  });

  it("ignores duplicate runs when onDuplicate is ignore", async () => {
    const gate = deferred();
    let invocations = 0;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <button
          type="button"
          onClick={() => {
            void run(
              async () => {
                invocations += 1;
                await gate.promise;
                return "ok";
              },
              { onDuplicate: "ignore", concurrency: "parallel" }
            ).catch(() => undefined);
          }}
        >
          run
        </button>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(invocations).toBe(1);
    });

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    expect(invocations).toBe(1);

    await act(async () => {
      gate.resolve();
    });
  });

  it("retry replays the last attempt in the same scope", async () => {
    let attempts = 0;

    function Controls() {
      const { run, retry, state } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(async () => {
                attempts += 1;
                if (attempts === 1) {
                  throw new Error("first");
                }
                return "ok";
              }).catch(() => undefined);
            }}
          >
            run
          </button>
          <button
            type="button"
            onClick={() => {
              void retry().catch(() => undefined);
            }}
          >
            retry
          </button>
          <span data-testid="attempts">{attempts}</span>
          <span data-testid="live">{state.status}</span>
        </>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("failed");
    });

    await act(async () => {
      screen.getByRole("button", { name: "retry" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("attempts")).toHaveTextContent("2");
      expect(screen.getByTestId("status")).toHaveTextContent("succeeded");
    });
  });

  it("isolates nested provider scopes", async () => {
    function Outer() {
      const { state } = useActionRunner({ scope: "outer" });
      return <span data-testid="outer">{state.status}</span>;
    }

    function Inner() {
      const { run, state } = useActionRunner({ scope: "inner" });
      return (
        <>
          <span data-testid="inner">{state.status}</span>
          <button
            type="button"
            onClick={() => {
              void run(async () => "ok");
            }}
          >
            run-inner
          </button>
        </>
      );
    }

    render(
      <ActionRunnerProvider scope="outer">
        <Outer />
        <ActionRunnerProvider scope="inner">
          <Inner />
        </ActionRunnerProvider>
      </ActionRunnerProvider>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run-inner" }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("inner")).toHaveTextContent("succeeded");
      expect(screen.getByTestId("outer")).toHaveTextContent("idle");
    });
  });
});

describe("adapter failure isolation", () => {
  it("still succeeds the run when succeed adapter throws", async () => {
    const overlay: ActionLoadingOverlayAdapter = {
      begin: () => "t1",
      succeed: () => {
        throw new Error("adapter blew up");
      },
      fail: () => undefined,
      release: () => undefined,
    };

    let result: string | undefined;

    function Controls() {
      const { run } = useActionRunner();
      return (
        <>
          <StateView />
          <button
            type="button"
            onClick={() => {
              void run(async () => "ok", { blocking: true }).then((value) => {
                result = value;
              });
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host loadingOverlay={overlay}>
        <Controls />
      </Host>
    );

    await act(async () => {
      screen.getByRole("button", { name: "run" }).click();
    });

    await waitFor(() => {
      expect(result).toBe("ok");
      expect(screen.getByTestId("status")).toHaveTextContent("succeeded");
    });
  });
});

describe("default adapter wiring", () => {
  it("binds confirm-dialog and loading-overlay providers without manual props", async () => {
    const { ConfirmDialogProvider } =
      await import("../../infra/confirm-dialog");
    const { LoadingOverlay, LoadingOverlayProvider } =
      await import("../../infra/loading-overlay");
    const { ModalManager, ModalManagerProvider } =
      await import("../../infra/modal-manager-provider");

    let result: string | undefined;

    function Controls() {
      const { run, state } = useActionRunner();
      return (
        <>
          <span data-testid="status">{state.status}</span>
          <button
            type="button"
            onClick={() => {
              void run(
                async () => {
                  result = "deleted";
                  return result;
                },
                {
                  confirm: {
                    title: "Delete?",
                    confirmLabel: "Delete",
                    destructive: true,
                  },
                  blocking: { label: "Deleting" },
                }
              );
            }}
          >
            delete
          </button>
        </>
      );
    }

    render(
      <ModalManagerProvider>
        <ModalManager />
        <ConfirmDialogProvider>
          <LoadingOverlayProvider successDurationMs={0} errorDurationMs={0}>
            <ActionRunnerProvider>
              <LoadingOverlay />
              <Controls />
            </ActionRunnerProvider>
          </LoadingOverlayProvider>
        </ConfirmDialogProvider>
      </ModalManagerProvider>
    );

    await act(async () => {
      screen.getByRole("button", { name: "delete" }).click();
    });
    expect(screen.getByRole("alertdialog", { name: "Delete?" })).toBeVisible();

    await act(async () => {
      screen.getByRole("button", { name: "Delete" }).click();
    });

    await waitFor(() => {
      expect(result).toBe("deleted");
      expect(screen.getByTestId("status")).toHaveTextContent("succeeded");
    });
  });
});
