import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { useEffect, useState, type ReactNode } from "react";
import { FakeClock } from "@/test-utils/fake-clock";
import {
  LoadingOverlay,
  LoadingOverlayProvider,
  useLoadingOverlay,
  type LoadingOverlayToken,
} from "../../infra/loading-overlay";
import {
  OverlayLayerProvider,
  useOverlayLayer,
} from "../../infra/modal-manager-provider";

function StatusView() {
  const overlay = useLoadingOverlay();
  return (
    <div>
      <span data-testid="status">{overlay.status}</span>
      <span data-testid="label">{overlay.label}</span>
    </div>
  );
}

function Host({
  children,
  ...props
}: {
  children?: ReactNode;
} & Omit<Parameters<typeof LoadingOverlayProvider>[0], "children">) {
  return (
    <LoadingOverlayProvider {...props}>
      <LoadingOverlay />
      {children ?? <StatusView />}
    </LoadingOverlayProvider>
  );
}

describe("aggregate reduction", () => {
  it("keeps loading when A succeeds while B is still pending", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => {
              const a = overlay.begin({ label: "save A" });
              overlay.begin({ label: "save B" });
              overlay.succeed(a);
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

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });

  it("shows error when A succeeded and B fails", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => {
              const a = overlay.begin();
              const b = overlay.begin();
              overlay.succeed(a);
              overlay.fail(b, { message: "save failed" });
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host errorDurationMs={10_000}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("error");
    expect(screen.getByRole("status")).toHaveTextContent("save failed");
  });

  it("ignores duplicate and stale releases", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      const [token, setToken] = useState<LoadingOverlayToken>("");
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => setToken(overlay.begin({ label: "work" }))}
          >
            begin
          </button>
          <button type="button" onClick={() => overlay.release(token)}>
            release
          </button>
          <button type="button" onClick={() => overlay.release("missing")}>
            release missing
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
      screen.getByRole("button", { name: "begin" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    act(() => {
      screen.getByRole("button", { name: "release" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("idle");

    act(() => {
      screen.getByRole("button", { name: "release" }).click();
      screen.getByRole("button", { name: "release missing" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("release has no presentation while other owners stay loading", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => {
              const cancelled = overlay.begin({ label: "cancelled" });
              overlay.begin({ label: "still going" });
              overlay.release(cancelled);
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

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    expect(screen.getByRole("status")).toHaveTextContent("still going");
  });

  it("ignores succeed and fail on already-terminal tokens", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => {
              const token = overlay.begin();
              overlay.succeed(token);
              overlay.fail(token, { message: "late fail" });
              overlay.succeed(token);
            }}
          >
            run
          </button>
        </>
      );
    }

    render(
      <Host successDurationMs={10_000}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });

    expect(screen.getByTestId("status")).toHaveTextContent("success");
    expect(screen.queryByText("late fail")).not.toBeInTheDocument();
  });

  it("sets aggregate idle on provider teardown", () => {
    function Open() {
      const overlay = useLoadingOverlay();
      return (
        <button type="button" onClick={() => overlay.begin({ label: "work" })}>
          begin
        </button>
      );
    }

    function App() {
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setMounted(false)}>
            unmount
          </button>
          {mounted ? (
            <Host>
              <Open />
            </Host>
          ) : (
            <span data-testid="unmounted">gone</span>
          )}
        </>
      );
    }

    render(<App />);
    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });
    expect(screen.getByRole("status")).toHaveTextContent("work");

    act(() => {
      screen.getByRole("button", { name: "unmount", hidden: true }).click();
    });
    expect(screen.getByTestId("unmounted")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("terminal reset", () => {
  it("auto-resets error to idle after the configured delay", () => {
    const clock = new FakeClock();

    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => {
              overlay.fail(overlay.begin(), { message: "nope" });
            }}
          >
            fail
          </button>
        </>
      );
    }

    render(
      <Host clock={clock} errorDurationMs={400}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "fail" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("error");

    act(() => {
      clock.advanceBy(399);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("error");

    act(() => {
      clock.advanceBy(1);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("cancels the terminal timer and returns to loading on a new begin", () => {
    const clock = new FakeClock();

    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button
            type="button"
            onClick={() => overlay.fail(overlay.begin(), { message: "nope" })}
          >
            fail
          </button>
          <button
            type="button"
            onClick={() => overlay.begin({ label: "retry" })}
          >
            retry
          </button>
        </>
      );
    }

    render(
      <Host clock={clock} errorDurationMs={400}>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "fail" }).click();
    });
    act(() => {
      screen.getByRole("button", { name: "retry", hidden: true }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    act(() => {
      clock.advanceBy(400);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });
});

describe("named scopes", () => {
  it("isolates nested providers", () => {
    function Inner() {
      const overlay = useLoadingOverlay();
      return <span data-testid="inner">{overlay.status}</span>;
    }

    function Outer() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <span data-testid="outer">{overlay.status}</span>
          <button type="button" onClick={() => overlay.begin()}>
            begin outer
          </button>
          <LoadingOverlayProvider scope="form">
            <Inner />
          </LoadingOverlayProvider>
        </>
      );
    }

    render(
      <LoadingOverlayProvider>
        <Outer />
      </LoadingOverlayProvider>
    );

    act(() => {
      screen.getByRole("button", { name: "begin outer" }).click();
    });
    expect(screen.getByTestId("outer")).toHaveTextContent("loading");
    expect(screen.getByTestId("inner")).toHaveTextContent("idle");
  });

  it("fails clearly for an unknown scope instead of falling back", () => {
    function WrongScope() {
      useLoadingOverlay({ scope: "checkout" });
      return null;
    }

    expect(() =>
      render(
        <Host>
          <WrongScope />
        </Host>
      )
    ).toThrow(/Unknown loading overlay scope "checkout"/);
  });
});

describe("progress", () => {
  it("stays indeterminate unless every pending token supplied progress", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <span data-testid="progress">
            {overlay.progress == null ? "indeterminate" : overlay.progress}
          </span>
          <button
            type="button"
            onClick={() => {
              overlay.begin({ progress: 0.5 });
              overlay.begin();
            }}
          >
            mix
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
      screen.getByRole("button", { name: "mix" }).click();
    });
    expect(screen.getByTestId("progress")).toHaveTextContent("indeterminate");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("is determinate from pending tokens only and uses the lowest progress", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <span data-testid="progress">{overlay.progress}</span>
          <button
            type="button"
            onClick={() => {
              const done = overlay.begin({ progress: 0.9 });
              overlay.begin({ progress: 0.4 });
              overlay.succeed(done);
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

    act(() => {
      screen.getByRole("button", { name: "run" }).click();
    });
    expect(screen.getByTestId("progress")).toHaveTextContent("0.4");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "40");
  });
});

describe("accessibility and hydration", () => {
  it("exposes a busy live region while loading", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <button
          type="button"
          onClick={() => overlay.begin({ label: "Saving" })}
        >
          begin
        </button>
      );
    }

    render(
      <Host>
        <Controls />
      </Host>
    );

    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Saving");
    expect(
      document.querySelector("[data-loading-overlay-scope]")
    ).toHaveAttribute("aria-busy", "true");
  });

  it("does not open on the server and warns for pre-hydration operations", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    function Opener() {
      const overlay = useLoadingOverlay();
      overlay.begin({ label: "ssr" });
      return <span>booting</span>;
    }

    const html = renderToString(
      <Host>
        <Opener />
      </Host>
    );
    expect(html).not.toContain("ssr");
    expect(html).not.toContain('role="status"');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("overlay layer registration", () => {
  it("works standalone without an overlay registry", () => {
    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <>
          <StatusView />
          <button type="button" onClick={() => overlay.begin()}>
            begin
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
      screen.getByRole("button", { name: "begin" }).click();
    });
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    expect(screen.getByRole("status")).toBeVisible();
  });

  it("blocking overlays register and suspend a lower layer", () => {
    function SheetProbe() {
      const overlay = useOverlayLayer();
      const [status, setStatus] = useState("active");

      useEffect(() => {
        return overlay.registerLayer({
          id: "sheet-1",
          kind: "sheet",
          getRestoreTarget: () => document.getElementById("sheet-restore"),
          onSuspend: () => setStatus("suspended"),
          onResume: () => setStatus("active"),
        });
      }, [overlay]);

      useEffect(() => {
        overlay.setForeground("sheet-1");
      }, [overlay]);

      return (
        <div>
          <button type="button" id="sheet-restore">
            sheet restore
          </button>
          <span data-testid="sheet-status">{status}</span>
        </div>
      );
    }

    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <button type="button" onClick={() => overlay.begin()}>
          begin
        </button>
      );
    }

    render(
      <OverlayLayerProvider>
        <SheetProbe />
        <Host>
          <Controls />
        </Host>
      </OverlayLayerProvider>
    );

    expect(screen.getByTestId("sheet-status")).toHaveTextContent("active");

    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });
    expect(screen.getByTestId("sheet-status")).toHaveTextContent("suspended");
  });

  it("non-blocking overlays do not register or suspend layers", () => {
    function SheetProbe() {
      const overlay = useOverlayLayer();
      const [status, setStatus] = useState("active");

      useEffect(() => {
        return overlay.registerLayer({
          id: "sheet-2",
          kind: "sheet",
          getRestoreTarget: () => null,
          onSuspend: () => setStatus("suspended"),
          onResume: () => setStatus("active"),
        });
      }, [overlay]);

      useEffect(() => {
        overlay.setForeground("sheet-2");
      }, [overlay]);

      return <span data-testid="sheet-status">{status}</span>;
    }

    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <button type="button" onClick={() => overlay.begin()}>
          begin
        </button>
      );
    }

    render(
      <OverlayLayerProvider>
        <SheetProbe />
        <Host blocking={false}>
          <Controls />
        </Host>
      </OverlayLayerProvider>
    );

    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });
    expect(screen.getByTestId("sheet-status")).toHaveTextContent("active");
    expect(
      document.querySelector("[data-slot=loading-overlay]")
    ).toHaveAttribute("data-blocking", "false");
  });

  it("named-scope blocking overlays do not take global foreground", () => {
    function SheetProbe() {
      const overlay = useOverlayLayer();
      const [status, setStatus] = useState("active");

      useEffect(() => {
        return overlay.registerLayer({
          id: "sheet-3",
          kind: "sheet",
          getRestoreTarget: () => null,
          onSuspend: () => setStatus("suspended"),
          onResume: () => setStatus("active"),
        });
      }, [overlay]);

      useEffect(() => {
        overlay.setForeground("sheet-3");
      }, [overlay]);

      return <span data-testid="sheet-status">{status}</span>;
    }

    function Controls() {
      const overlay = useLoadingOverlay();
      return (
        <button type="button" onClick={() => overlay.begin()}>
          begin
        </button>
      );
    }

    render(
      <OverlayLayerProvider>
        <SheetProbe />
        <Host scope="form">
          <Controls />
        </Host>
      </OverlayLayerProvider>
    );

    act(() => {
      screen.getByRole("button", { name: "begin" }).click();
    });
    expect(screen.getByTestId("sheet-status")).toHaveTextContent("active");
  });
});
