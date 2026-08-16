"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  classifyError,
  type ErrorClassification,
  type ErrorClassifier,
} from "@/infra/error-classification";

export const DEFAULT_ACTION_RUNNER_SCOPE = "default";

export type ActionRunnerStatus =
  "idle" | "pending" | "succeeded" | "failed" | "cancelled";

export type ActionRunnerState = {
  status: ActionRunnerStatus;
  attemptId?: string;
  startedAt?: number;
  finishedAt?: number;
  error?: ErrorClassification;
  metadata?: Record<string, unknown>;
};

export type ActionRunContext = {
  signal: AbortSignal;
  scope: string;
  attemptId: string;
  metadata?: Record<string, unknown>;
};

export type ActionConfirmOptions = {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type ActionConfirmSettlement = "confirmed" | "cancelled" | "dismissed";

export type ActionConfirmAdapter = {
  confirm: (options: ActionConfirmOptions) => Promise<ActionConfirmSettlement>;
};

export type ActionLoadingOverlayAdapter = {
  begin: (options?: { label?: string; progress?: number }) => string;
  update?: (
    token: string,
    patch: { label?: string; progress?: number }
  ) => void;
  succeed: (token: string, metadata?: { message?: string }) => void;
  fail: (token: string, metadata?: { message?: string }) => void;
  release: (token: string) => void;
};

export type ActionConcurrency = "serial" | "parallel";

export type ActionDuplicatePolicy = "allow" | "ignore" | "replace";

export type ActionRunnerClock = {
  setTimeout: (callback: () => void, delay?: number) => number;
  clearTimeout: (id: number) => void;
};

export type ActionBlockingOptions = {
  label?: string;
  progress?: number;
};

export type ActionRunOptions = {
  confirm?: ActionConfirmOptions;
  /** Opt into loading-overlay chrome. `true` or `{ label, progress }`. */
  blocking?: boolean | ActionBlockingOptions;
  metadata?: Record<string, unknown>;
  timeoutMs?: number;
  classifiers?: readonly ErrorClassifier[];
  concurrency?: ActionConcurrency;
  onDuplicate?: ActionDuplicatePolicy;
  onSuccess?: (data: unknown) => void;
  onError?: (error: ErrorClassification) => void;
  onCancelled?: () => void;
  onLogError?: (error: unknown) => void;
};

export type ActionRunnerApi = {
  run: <T>(
    action: (context: ActionRunContext) => Promise<T>,
    options?: ActionRunOptions
  ) => Promise<T>;
  cancel: () => void;
  retry: <T>() => Promise<T>;
  state: ActionRunnerState;
  scope: string;
};

export type ActionRunnerProviderProps = {
  children: ReactNode;
  scope?: string;
  concurrency?: ActionConcurrency;
  loadingOverlay?: ActionLoadingOverlayAdapter;
  confirm?: ActionConfirmAdapter;
  classifiers?: readonly ErrorClassifier[];
  clock?: ActionRunnerClock;
};

type AttemptRecord = {
  id: string;
  action: (context: ActionRunContext) => Promise<unknown>;
  options: ActionRunOptions;
  controller: AbortController;
};

const IDLE_STATE: ActionRunnerState = { status: "idle" };

const ACTION_LOADING_ADAPTER_SLOT = Symbol.for(
  "app-kit.action-loading-adapter"
);
const ACTION_CONFIRM_ADAPTER_SLOT = Symbol.for(
  "app-kit.action-confirm-adapter"
);

function getActionLoadingAdapterContext() {
  const holder = globalThis as typeof globalThis & {
    [ACTION_LOADING_ADAPTER_SLOT]?: ReturnType<
      typeof createContext<ActionLoadingOverlayAdapter | null>
    >;
  };
  if (!holder[ACTION_LOADING_ADAPTER_SLOT]) {
    holder[ACTION_LOADING_ADAPTER_SLOT] =
      createContext<ActionLoadingOverlayAdapter | null>(null);
  }
  return holder[ACTION_LOADING_ADAPTER_SLOT];
}

function getActionConfirmAdapterContext() {
  const holder = globalThis as typeof globalThis & {
    [ACTION_CONFIRM_ADAPTER_SLOT]?: ReturnType<
      typeof createContext<ActionConfirmAdapter | null>
    >;
  };
  if (!holder[ACTION_CONFIRM_ADAPTER_SLOT]) {
    holder[ACTION_CONFIRM_ADAPTER_SLOT] =
      createContext<ActionConfirmAdapter | null>(null);
  }
  return holder[ACTION_CONFIRM_ADAPTER_SLOT];
}

const defaultClock: ActionRunnerClock = {
  setTimeout: (callback, delay = 0) =>
    globalThis.setTimeout(callback, delay) as unknown as number,
  clearTimeout: (id) => {
    globalThis.clearTimeout(id);
  },
};

const ActionRunnerContext = createContext<{
  api: ActionRunnerApi;
  scope: string;
} | null>(null);

function isAbortError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function safeAdapterCall(fn: () => void) {
  try {
    fn();
  } catch {
    // Adapter failures must not hide the action outcome.
  }
}

function createAbortError() {
  return Object.assign(new Error("Aborted"), { name: "AbortError" });
}

function blockingBeginOptions(
  blocking: boolean | ActionBlockingOptions | undefined
): ActionBlockingOptions | undefined {
  if (blocking == null || blocking === false) {
    return undefined;
  }
  if (blocking === true) {
    return {};
  }
  return blocking;
}

function settleCancelled(
  setState: (state: ActionRunnerState) => void,
  options: ActionRunOptions,
  extras: Partial<ActionRunnerState> = {}
) {
  setState({
    status: "cancelled",
    finishedAt: Date.now(),
    metadata: options.metadata,
    ...extras,
  });
  options.onCancelled?.();
}

export function ActionRunnerProvider({
  children,
  scope = DEFAULT_ACTION_RUNNER_SCOPE,
  concurrency = "serial",
  loadingOverlay,
  confirm,
  classifiers,
  clock = defaultClock,
}: ActionRunnerProviderProps) {
  const defaultLoading = useContext(getActionLoadingAdapterContext());
  const defaultConfirm = useContext(getActionConfirmAdapterContext());
  const resolvedLoading = loadingOverlay ?? defaultLoading ?? undefined;
  const resolvedConfirm = confirm ?? defaultConfirm ?? undefined;

  const [state, setState] = useState<ActionRunnerState>(IDLE_STATE);

  const attemptSeq = useRef(0);
  const activeControllers = useRef(new Set<AbortController>());
  const serialQueue = useRef(Promise.resolve());
  const inFlightCount = useRef(0);
  const lastAttempt = useRef<AttemptRecord | null>(null);
  const overlayRef = useRef(resolvedLoading);
  const confirmRef = useRef(resolvedConfirm);
  const classifiersRef = useRef(classifiers);
  const clockRef = useRef(clock);

  useEffect(() => {
    overlayRef.current = resolvedLoading;
  }, [resolvedLoading]);

  useEffect(() => {
    confirmRef.current = resolvedConfirm;
  }, [resolvedConfirm]);

  useEffect(() => {
    classifiersRef.current = classifiers;
  }, [classifiers]);

  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const cancel = useCallback(() => {
    for (const controller of activeControllers.current) {
      controller.abort();
    }
  }, []);

  const executeAttempt = useCallback(
    async <T,>(
      action: (context: ActionRunContext) => Promise<T>,
      options: ActionRunOptions,
      controller: AbortController
    ): Promise<T> => {
      const overlay = overlayRef.current;
      const confirmAdapter = confirmRef.current;
      let counted = false;
      let timeoutId: number | undefined;

      try {
        // Count before confirm so ignore/replace apply while a prompt is open.
        inFlightCount.current += 1;
        counted = true;

        if (options.confirm) {
          if (!confirmAdapter) {
            throw new Error(
              "run({ confirm }) requires an ActionRunnerProvider confirm adapter."
            );
          }
          const settlement = await confirmAdapter.confirm(options.confirm);
          if (settlement !== "confirmed") {
            settleCancelled(setState, options);
            throw createAbortError();
          }
        }

        if (controller.signal.aborted) {
          settleCancelled(setState, options);
          throw createAbortError();
        }

        attemptSeq.current += 1;
        const attemptId = `${scope}-${attemptSeq.current}`;

        let timedOut = false;
        if (options.timeoutMs != null && options.timeoutMs > 0) {
          timeoutId = clockRef.current.setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, options.timeoutMs);
        }

        lastAttempt.current = {
          id: attemptId,
          action: action as (context: ActionRunContext) => Promise<unknown>,
          options,
          controller,
        };

        const startedAt = Date.now();
        setState({
          status: "pending",
          attemptId,
          startedAt,
          metadata: options.metadata,
        });

        const beginOptions = blockingBeginOptions(options.blocking);
        let token: string | undefined;
        if (beginOptions) {
          if (!overlay) {
            throw new Error(
              "run({ blocking }) requires an ActionRunnerProvider loadingOverlay adapter."
            );
          }
          token = overlay.begin(beginOptions);
        }

        let terminalHandled = false;
        const markTerminalHandled = () => {
          terminalHandled = true;
        };
        const succeedThenRelease = () => {
          if (token == null || !overlay || terminalHandled) {
            return;
          }
          safeAdapterCall(() => {
            overlay.succeed(token!);
          });
          safeAdapterCall(() => {
            overlay.release(token!);
          });
          markTerminalHandled();
        };
        const failThenRelease = (message: string) => {
          if (token == null || !overlay || terminalHandled) {
            return;
          }
          safeAdapterCall(() => {
            overlay.fail(token!, { message });
          });
          safeAdapterCall(() => {
            overlay.release(token!);
          });
          markTerminalHandled();
        };
        const releaseOnly = () => {
          if (token == null || !overlay || terminalHandled) {
            return;
          }
          safeAdapterCall(() => {
            overlay.release(token!);
          });
          markTerminalHandled();
        };

        try {
          const data = await action({
            signal: controller.signal,
            scope,
            attemptId,
            metadata: options.metadata,
          });

          // Action already completed: prefer success over a late abort.
          succeedThenRelease();

          const finishedAt = Date.now();
          setState({
            status: "succeeded",
            attemptId,
            startedAt,
            finishedAt,
            metadata: options.metadata,
          });

          try {
            options.onSuccess?.(data);
          } catch (raw) {
            options.onLogError?.(raw);
          }

          return data;
        } catch (raw) {
          const aborted = isAbortError(raw, controller.signal);
          if (aborted) {
            const finishedAt = Date.now();
            if (timedOut) {
              const classified = classifyError(raw, {
                timeout: true,
                aborted: true,
                classifiers: options.classifiers ?? classifiersRef.current,
              });
              failThenRelease(classified.message);
              setState({
                status: "failed",
                attemptId,
                startedAt,
                finishedAt,
                error: classified,
                metadata: options.metadata,
              });
              options.onError?.(classified);
              options.onLogError?.(raw);
              throw raw;
            }

            releaseOnly();

            settleCancelled(setState, options, {
              attemptId,
              startedAt,
              finishedAt,
            });
            throw raw instanceof Error ? raw : createAbortError();
          }

          options.onLogError?.(raw);
          const classified = classifyError(raw, {
            classifiers: options.classifiers ?? classifiersRef.current,
          });

          failThenRelease(classified.message);

          const finishedAt = Date.now();
          setState({
            status: "failed",
            attemptId,
            startedAt,
            finishedAt,
            error: classified,
            metadata: options.metadata,
          });
          options.onError?.(classified);
          throw raw;
        }
      } finally {
        if (timeoutId != null) {
          clockRef.current.clearTimeout(timeoutId);
        }
        activeControllers.current.delete(controller);
        if (counted) {
          inFlightCount.current = Math.max(0, inFlightCount.current - 1);
        }
        // finally must not call succeed/fail/release again
      }
    },
    [scope]
  );

  const run = useCallback(
    async <T,>(
      action: (context: ActionRunContext) => Promise<T>,
      options: ActionRunOptions = {}
    ): Promise<T> => {
      const policy = options.onDuplicate ?? "allow";
      const mode = options.concurrency ?? concurrency;
      const controller = new AbortController();
      activeControllers.current.add(controller);

      if (policy === "ignore" && inFlightCount.current > 0) {
        activeControllers.current.delete(controller);
        throw createAbortError();
      }

      if (policy === "replace" && inFlightCount.current > 0) {
        for (const active of activeControllers.current) {
          if (active !== controller) {
            active.abort();
          }
        }
      }

      const start = () => executeAttempt(action, options, controller);

      if (mode === "parallel") {
        return start();
      }

      const runSerial = serialQueue.current.then(start);
      serialQueue.current = runSerial.then(
        () => undefined,
        () => undefined
      );
      return runSerial;
    },
    [concurrency, executeAttempt]
  );

  const retry = useCallback(async <T,>(): Promise<T> => {
    const previous = lastAttempt.current;
    if (!previous) {
      throw new Error("retry() requires a previous run attempt in this scope.");
    }
    return run(previous.action as (context: ActionRunContext) => Promise<T>, {
      ...previous.options,
    });
  }, [run]);

  const api = useMemo<ActionRunnerApi>(
    () => ({
      run,
      cancel,
      retry,
      state,
      scope,
    }),
    [run, cancel, retry, state, scope]
  );

  return (
    <ActionRunnerContext.Provider value={{ api, scope }}>
      {children}
    </ActionRunnerContext.Provider>
  );
}

export function useActionRunner(options?: { scope?: string }): ActionRunnerApi {
  const context = useContext(ActionRunnerContext);
  if (!context) {
    throw new Error(
      "useActionRunner() requires an ActionRunnerProvider ancestor."
    );
  }
  if (options?.scope != null && options.scope !== context.scope) {
    throw new Error(
      `Unknown action runner scope "${options.scope}". Active scope is "${context.scope}".`
    );
  }
  return context.api;
}

/** Soft lookup for hosts that work with or without Action runner. */
export function useOptionalActionRunner(): ActionRunnerApi | null {
  return useContext(ActionRunnerContext)?.api ?? null;
}
