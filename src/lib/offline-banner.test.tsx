import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { type ReactNode } from "react";
import {
  ConnectivityProvider,
  OfflineBanner,
  useConnectivity,
  type ReachabilityProbe,
} from "../../infra/offline-banner";

function StateView() {
  const snapshot = useConnectivity();
  return <div data-testid="state">{snapshot.state}</div>;
}

function Host({
  children,
  ...props
}: {
  children?: ReactNode;
} & Omit<Parameters<typeof ConnectivityProvider>[0], "children">) {
  return (
    <ConnectivityProvider {...props}>
      {children ?? <StateView />}
    </ConnectivityProvider>
  );
}

function setNavigatorOnline(value: boolean | undefined) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    enumerable: true,
    get: () => value,
  });
}

function fireBrowserOnline() {
  setNavigatorOnline(true);
  window.dispatchEvent(new Event("online"));
}

function fireBrowserOffline() {
  setNavigatorOnline(false);
  window.dispatchEvent(new Event("offline"));
}

function createProbeController() {
  const pending: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }> = [];
  const probe: ReachabilityProbe = vi.fn(({ signal }) => {
    return new Promise<void>((resolve, reject) => {
      pending.push({ resolve, reject });
      const onAbort = () => {
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  });
  return {
    probe,
    succeed: () => pending.shift()?.resolve(),
    fail: (error: unknown = new Error("unreachable")) =>
      pending.shift()?.reject(error),
  };
}

const originalOnLine = navigator.onLine;

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    enumerable: true,
    value: originalOnLine,
    writable: true,
  });
});

describe("useConnectivity without a probe", () => {
  it("starts unknown then follows navigator.onLine after mount", () => {
    setNavigatorOnline(true);
    render(<Host />);
    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });

  it("never exposes checking as a public state", async () => {
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} />);
    expect(screen.getByTestId("state")).toHaveTextContent("unknown");
    await act(async () => {
      succeed();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("online");
    expect(screen.getByTestId("state").textContent).not.toBe("checking");
  });

  it("goes offline immediately on the browser offline event", () => {
    setNavigatorOnline(true);
    render(<Host />);
    act(() => {
      fireBrowserOffline();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("accepts the browser online event as online when no probe is configured", () => {
    setNavigatorOnline(false);
    render(<Host />);
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
    act(() => {
      fireBrowserOnline();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });

  it("stays unknown when browser APIs are unavailable and no seed is supplied", () => {
    setNavigatorOnline(undefined);
    render(<Host />);
    expect(screen.getByTestId("state")).toHaveTextContent("unknown");
  });

  it("uses a supplied seed on the first render and replaces it after observation", () => {
    setNavigatorOnline(true);
    const seen: string[] = [];
    function Recorder() {
      const snapshot = useConnectivity();
      seen.push(snapshot.state);
      return <div data-testid="state">{snapshot.state}</div>;
    }
    render(
      <Host initialState="offline">
        <Recorder />
      </Host>
    );
    expect(seen[0]).toBe("offline");
    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });

  it("does not read browser globals during SSR", () => {
    setNavigatorOnline(false);
    const html = renderToString(
      <ConnectivityProvider>
        <StateView />
      </ConnectivityProvider>
    );
    expect(html).toContain("unknown");
    expect(html).not.toContain("offline");
  });
});

describe("reachability probe", () => {
  it("commits online only after a successful probe", async () => {
    setNavigatorOnline(true);
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} />);
    expect(screen.getByTestId("state")).toHaveTextContent("unknown");
    expect(probe).toHaveBeenCalledTimes(1);
    await act(async () => {
      succeed();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });

  it("retries a failed initial probe until the failure threshold", async () => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    const { probe, fail } = createProbeController();
    render(<Host probe={probe} timeoutMs={5_000} />);
    expect(probe).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("unknown");

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(probe).toHaveBeenCalledTimes(2);
    await act(async () => {
      fail();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("requires the failure threshold before marking an online client offline", async () => {
    setNavigatorOnline(true);
    const { probe, succeed, fail } = createProbeController();
    render(<Host probe={probe} />);
    await act(async () => {
      succeed();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("online");

    await act(async () => {
      fireBrowserOnline();
    });
    expect(probe).toHaveBeenCalledTimes(2);
    await act(async () => {
      fail();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("online");

    await act(async () => {
      fireBrowserOnline();
    });
    await act(async () => {
      fail();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("recovers after one successful probe while offline", async () => {
    setNavigatorOnline(false);
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} />);
    expect(screen.getByTestId("state")).toHaveTextContent("offline");

    await act(async () => {
      fireBrowserOnline();
    });
    await act(async () => {
      succeed();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });

  it("treats a timeout as a failed probe and aborts the consumer signal", async () => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    const { probe } = createProbeController();
    render(<Host probe={probe} timeoutMs={5_000} failureThreshold={1} />);
    const signal = vi.mocked(probe).mock.calls[0][0].signal;
    expect(signal.aborted).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(signal.aborted).toBe(true);
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("aborts an in-flight probe on browser offline and ignores the stale result", async () => {
    setNavigatorOnline(true);
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} />);
    const signal = vi.mocked(probe).mock.calls[0][0].signal;

    act(() => {
      fireBrowserOffline();
    });
    expect(signal.aborted).toBe(true);
    expect(screen.getByTestId("state")).toHaveTextContent("offline");

    await act(async () => {
      succeed();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("offline");
  });

  it("does not commit a probe that finishes after unmount", async () => {
    setNavigatorOnline(true);
    const { probe, succeed } = createProbeController();
    const { unmount } = render(<Host probe={probe} />);
    unmount();
    await act(async () => {
      succeed();
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("uses bounded exponential backoff for recovery probes", async () => {
    vi.useFakeTimers();
    setNavigatorOnline(false);
    const { probe, fail } = createProbeController();
    render(
      <Host
        probe={probe}
        timeoutMs={5_000}
        failureThreshold={1}
        maxBackoffMs={20_000}
      />
    );
    expect(probe).not.toHaveBeenCalled();

    await act(async () => {
      fireBrowserOnline();
    });
    expect(probe).toHaveBeenCalledTimes(1);
    await act(async () => {
      fail();
    });
    expect(screen.getByTestId("state")).toHaveTextContent("offline");

    await act(async () => {
      vi.advanceTimersByTime(4_999);
    });
    expect(probe).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(probe).toHaveBeenCalledTimes(2);
    await act(async () => {
      fail();
    });

    await act(async () => {
      vi.advanceTimersByTime(9_999);
    });
    expect(probe).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("runs a steady-state interval only when explicitly enabled", async () => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} intervalMs={30_000} />);
    await act(async () => {
      succeed();
    });
    expect(probe).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(probe).toHaveBeenCalledTimes(2);
    await act(async () => {
      succeed();
    });
  });

  it("does not schedule a steady-state interval unless intervalMs is set", async () => {
    vi.useFakeTimers();
    setNavigatorOnline(true);
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} />);
    await act(async () => {
      succeed();
    });
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("does not pick an endpoint: the consumer probe is the only transport", async () => {
    setNavigatorOnline(true);
    const { probe, succeed } = createProbeController();
    render(<Host probe={probe} />);
    expect(vi.mocked(probe).mock.calls[0][0]).toEqual({
      signal: expect.any(AbortSignal),
    });
    await act(async () => {
      succeed();
    });
  });

  it("isolates nested providers", async () => {
    setNavigatorOnline(true);
    const inner = createProbeController();

    function InnerState() {
      const snapshot = useConnectivity();
      return <div data-testid="inner">{snapshot.state}</div>;
    }

    render(
      <Host>
        <div data-testid="outer">
          <StateView />
        </div>
        <ConnectivityProvider probe={inner.probe}>
          <InnerState />
        </ConnectivityProvider>
      </Host>
    );

    expect(screen.getByTestId("state")).toHaveTextContent("online");
    expect(screen.getByTestId("inner")).toHaveTextContent("unknown");
    await act(async () => {
      inner.succeed();
    });
    expect(screen.getByTestId("inner")).toHaveTextContent("online");
    expect(screen.getByTestId("state")).toHaveTextContent("online");
  });
});

describe("OfflineBanner", () => {
  it("renders an accessible status banner only while offline", () => {
    setNavigatorOnline(false);
    render(
      <Host>
        <OfflineBanner />
      </Host>
    );
    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("aria-atomic", "true");
    expect(banner).toHaveTextContent("You are offline");
    expect(banner.querySelector("button")).toBeNull();
    expect(banner).not.toHaveAttribute("aria-modal");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not steal focus and ignores escape", () => {
    setNavigatorOnline(true);
    render(
      <Host>
        <button type="button">compose</button>
        <OfflineBanner />
      </Host>
    );
    const compose = screen.getByRole("button", { name: "compose" });
    compose.focus();
    act(() => {
      fireBrowserOffline();
    });
    expect(screen.getByRole("status")).toBeVisible();
    expect(compose).toHaveFocus();
    act(() => {
      compose.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(screen.getByRole("status")).toBeVisible();
    expect(compose).toHaveFocus();
  });

  it("uses consumer messages and announces recovery then removes it", async () => {
    vi.useFakeTimers();
    setNavigatorOnline(false);
    render(
      <Host>
        <OfflineBanner
          offlineMessage="Offline now"
          recoveryMessage="Online again"
          recoveryDurationMs={2_000}
        />
      </Host>
    );
    expect(screen.getByRole("status")).toHaveTextContent("Offline now");

    act(() => {
      fireBrowserOnline();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Online again");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not emit a banner during SSR", () => {
    setNavigatorOnline(false);
    const html = renderToString(
      <ConnectivityProvider>
        <OfflineBanner />
      </ConnectivityProvider>
    );
    expect(html).not.toContain("You are offline");
    expect(html).not.toContain('role="status"');
  });
});

describe("no mutation queue", () => {
  it("exposes a snapshot only — no queue or replay API", () => {
    setNavigatorOnline(true);
    function Capture() {
      const snapshot = useConnectivity();
      return <pre data-testid="snapshot">{JSON.stringify(snapshot)}</pre>;
    }
    render(
      <Host>
        <Capture />
      </Host>
    );
    const snapshot = JSON.parse(
      screen.getByTestId("snapshot").textContent ?? "{}"
    ) as Record<string, unknown>;
    expect(snapshot).toEqual({ state: "online" });
    expect(snapshot).not.toHaveProperty("queue");
    expect(snapshot).not.toHaveProperty("replay");
    expect(snapshot).not.toHaveProperty("enqueue");
  });
});
