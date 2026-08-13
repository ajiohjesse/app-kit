"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";

export type ConnectivityState = "unknown" | "online" | "offline";

export type ConnectivitySnapshot = {
  state: ConnectivityState;
};

export type ReachabilityProbe = (args: {
  signal: AbortSignal;
}) => Promise<void>;

export type ConnectivityProviderProps = {
  children: ReactNode;
  initialState?: ConnectivityState;
  probe?: ReachabilityProbe;
  timeoutMs?: number;
  intervalMs?: number;
  failureThreshold?: number;
  probeOnInitial?: boolean;
  probeOnOnline?: boolean;
  maxBackoffMs?: number;
};

export type OfflineBannerProps = {
  offlineMessage?: ReactNode;
  recoveryMessage?: ReactNode;
  recoveryDurationMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_FAILURE_THRESHOLD = 2;
const DEFAULT_MAX_BACKOFF_MS = 5 * 60 * 1_000;
const DEFAULT_RECOVERY_DURATION_MS = 4_000;

const ConnectivityContext = createContext<ConnectivitySnapshot | null>(null);

function readBrowserOnline(): boolean | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return typeof navigator.onLine === "boolean" ? navigator.onLine : undefined;
}

class ConnectivityMonitor {
  private alive = true;
  private generation = 0;
  private failureCount = 0;
  private backoffMs: number;
  private state: ConnectivityState;
  private controller: AbortController | undefined;
  private probeTimeoutId: ReturnType<typeof setTimeout> | undefined;
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private backoffId: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly options: {
      probe?: ReachabilityProbe;
      timeoutMs: number;
      intervalMs?: number;
      failureThreshold: number;
      probeOnInitial: boolean;
      probeOnOnline: boolean;
      maxBackoffMs: number;
    },
    private readonly emit: (state: ConnectivityState) => void,
    initialState: ConnectivityState
  ) {
    this.state = initialState;
    this.backoffMs = options.timeoutMs;
  }

  attach() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
      window.addEventListener("offline", this.handleOffline);
    }

    const browser = readBrowserOnline();
    if (browser === false) {
      this.commit("offline");
      return;
    }
    if (browser === true) {
      if (!this.options.probe) {
        this.commit("online");
        return;
      }
      if (this.options.probeOnInitial) {
        this.startProbe();
        return;
      }
      this.commit("online");
    }
  }

  teardown() {
    this.alive = false;
    this.abortProbe();
    this.clearBackoff();
    this.clearIntervalTimer();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
    }
  }

  private handleOffline = () => {
    this.abortProbe();
    this.clearBackoff();
    this.clearIntervalTimer();
    this.failureCount = 0;
    this.commit("offline");
  };

  private handleOnline = () => {
    this.clearBackoff();
    if (!this.options.probe) {
      this.commit("online");
      return;
    }
    if (this.options.probeOnOnline) {
      this.startProbe();
      return;
    }
    this.commit("online");
  };

  private startProbe() {
    const probe = this.options.probe;
    if (!probe || !this.alive) {
      return;
    }

    this.abortProbe();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.probeTimeoutId = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs);

    void probe({ signal: controller.signal }).then(
      () => {
        if (!this.isCurrent(generation)) {
          return;
        }
        this.clearProbeTimeout();
        this.controller = undefined;
        this.failureCount = 0;
        this.backoffMs = this.options.timeoutMs;
        this.commit("online");
      },
      () => {
        if (!this.isCurrent(generation)) {
          return;
        }
        this.clearProbeTimeout();
        this.controller = undefined;
        this.failureCount += 1;
        if (this.failureCount < this.options.failureThreshold) {
          if (this.state !== "online") {
            this.scheduleBackoff();
          }
          return;
        }
        this.commit("offline");
        this.scheduleBackoff();
      }
    );
  }

  private commit(state: ConnectivityState) {
    this.state = state;
    if (state === "online") {
      this.ensureInterval();
    } else {
      this.clearIntervalTimer();
    }
    if (this.alive) {
      this.emit(state);
    }
  }

  private ensureInterval() {
    this.clearIntervalTimer();
    if (this.options.intervalMs == null) {
      return;
    }
    this.intervalId = setInterval(() => {
      if (this.state === "online" && !this.controller) {
        this.startProbe();
      }
    }, this.options.intervalMs);
  }

  private scheduleBackoff() {
    this.clearBackoff();
    if (!this.options.probe || !this.alive) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.options.maxBackoffMs);
    this.backoffId = setTimeout(() => {
      this.backoffId = undefined;
      this.startProbe();
    }, delay);
  }

  private abortProbe() {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    this.clearProbeTimeout();
  }

  private isCurrent(generation: number) {
    return this.alive && generation === this.generation;
  }

  private clearProbeTimeout() {
    if (this.probeTimeoutId != null) {
      clearTimeout(this.probeTimeoutId);
      this.probeTimeoutId = undefined;
    }
  }

  private clearIntervalTimer() {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  private clearBackoff() {
    if (this.backoffId != null) {
      clearTimeout(this.backoffId);
      this.backoffId = undefined;
    }
  }
}

export function ConnectivityProvider({
  children,
  initialState,
  probe,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs,
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  probeOnInitial = true,
  probeOnOnline = true,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
}: ConnectivityProviderProps) {
  const [snapshot, setSnapshot] = useState<ConnectivitySnapshot>({
    state: initialState ?? "unknown",
  });

  useEffect(() => {
    const monitor = new ConnectivityMonitor(
      {
        probe,
        timeoutMs,
        intervalMs,
        failureThreshold,
        probeOnInitial,
        probeOnOnline,
        maxBackoffMs,
      },
      (state) => setSnapshot({ state }),
      initialState ?? "unknown"
    );
    monitor.attach();
    return () => monitor.teardown();
  }, [
    initialState,
    probe,
    timeoutMs,
    intervalMs,
    failureThreshold,
    probeOnInitial,
    probeOnOnline,
    maxBackoffMs,
  ]);

  return (
    <ConnectivityContext.Provider value={snapshot}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivitySnapshot {
  const snapshot = useContext(ConnectivityContext);
  if (!snapshot) {
    throw new Error(
      "useConnectivity() requires a ConnectivityProvider ancestor."
    );
  }
  return snapshot;
}

export function OfflineBanner({
  offlineMessage = "You are offline",
  recoveryMessage = "Back online",
  recoveryDurationMs = DEFAULT_RECOVERY_DURATION_MS,
}: OfflineBannerProps) {
  const { state } = useConnectivity();
  const [prevState, setPrevState] = useState(state);
  const [announceRecovery, setAnnounceRecovery] = useState(false);

  if (state !== prevState) {
    setPrevState(state);
    if (state === "offline") {
      setAnnounceRecovery(false);
    } else if (
      prevState === "offline" &&
      state === "online" &&
      recoveryDurationMs > 0
    ) {
      setAnnounceRecovery(true);
    }
  }

  useEffect(() => {
    if (!announceRecovery) {
      return;
    }
    const timeoutId = setTimeout(() => {
      setAnnounceRecovery(false);
    }, recoveryDurationMs);
    return () => clearTimeout(timeoutId);
  }, [announceRecovery, recoveryDurationMs]);

  if (state !== "offline" && !announceRecovery) {
    return null;
  }

  return (
    <Alert role="status" aria-live="polite" aria-atomic="true">
      <AlertTitle>
        {state === "offline" ? offlineMessage : recoveryMessage}
      </AlertTitle>
    </Alert>
  );
}
