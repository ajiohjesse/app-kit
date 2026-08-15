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
import type { Session } from "@/infra/authentication-core";
import {
  createPendingActionHandlerRegistry,
  createPendingActionIntent,
  createResumeOperation,
  createSessionStoragePendingActionStore,
  type CreatePendingActionIntentInput,
  type PendingActionHandler,
  type PendingActionHandlerRegistry,
  type PendingActionIntent,
  type PendingActionStore,
  type ResumeInput,
  type ResumeResult,
} from "@/infra/pending-auth-action";

export type PendingAuthActionContextValue = {
  store: PendingActionStore;
  handlers: PendingActionHandlerRegistry;
  registerIntent: (
    input: Omit<CreatePendingActionIntentInput, "now" | "maxPayloadBytes">
  ) => Promise<PendingActionIntent>;
  registerHandler: (kind: string, handler: PendingActionHandler) => () => void;
  resume: (input: ResumeInput) => Promise<ResumeResult>;
};

const PendingAuthActionContext =
  createContext<PendingAuthActionContextValue | null>(null);

export type PendingAuthActionProviderProps = {
  children: ReactNode;
  store?: PendingActionStore;
  getSession: (input?: { signal?: AbortSignal }) => Promise<Session | null>;
  navigate: (to: string) => Promise<void> | void;
  allowMutationReplay?: boolean;
  fallbackReturnTo?: string;
  origin?: string;
  waitForReady?: (intent: PendingActionIntent) => Promise<void>;
  now?: () => number;
};

export function PendingAuthActionProvider({
  children,
  store: storeProp,
  getSession,
  navigate,
  allowMutationReplay = false,
  fallbackReturnTo = "/",
  origin,
  waitForReady,
  now,
}: PendingAuthActionProviderProps) {
  const [store] = useState(
    () => storeProp ?? createSessionStoragePendingActionStore({ now })
  );
  const activeStore = storeProp ?? store;

  const [handlers] = useState(() => createPendingActionHandlerRegistry());
  const settledRef = useRef(new Map<string, Promise<ResumeResult>>());

  const getSessionRef = useRef(getSession);
  const navigateRef = useRef(navigate);
  const waitForReadyRef = useRef(waitForReady);
  const nowRef = useRef(now);
  const allowMutationReplayRef = useRef(allowMutationReplay);
  const fallbackReturnToRef = useRef(fallbackReturnTo);
  const originRef = useRef(origin);
  const storeRef = useRef(activeStore);

  useEffect(() => {
    getSessionRef.current = getSession;
  }, [getSession]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    waitForReadyRef.current = waitForReady;
  }, [waitForReady]);

  useEffect(() => {
    nowRef.current = now;
  }, [now]);

  useEffect(() => {
    allowMutationReplayRef.current = allowMutationReplay;
  }, [allowMutationReplay]);

  useEffect(() => {
    fallbackReturnToRef.current = fallbackReturnTo;
  }, [fallbackReturnTo]);

  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  useEffect(() => {
    storeRef.current = activeStore;
  }, [activeStore]);

  useEffect(() => {
    return () => {
      handlers.clear();
    };
  }, [handlers]);

  const registerIntent = useCallback(
    async (
      input: Omit<CreatePendingActionIntentInput, "now" | "maxPayloadBytes">
    ) => {
      const intent = createPendingActionIntent({
        ...input,
        now: () => nowRef.current?.() ?? Date.now(),
      });
      await storeRef.current.save(intent);
      return intent;
    },
    []
  );

  const registerHandler = useCallback(
    (kind: string, handler: PendingActionHandler) =>
      handlers.register(kind, handler),
    [handlers]
  );

  const resume = useCallback(
    (input: ResumeInput) => {
      const existing = settledRef.current.get(input.intentId);
      if (existing) {
        return existing;
      }
      const promise = createResumeOperation({
        store: storeRef.current,
        handlers,
        getSession: (opts) => getSessionRef.current(opts),
        navigate: (to) => navigateRef.current(to),
        allowMutationReplay: allowMutationReplayRef.current,
        fallbackReturnTo: fallbackReturnToRef.current,
        origin: originRef.current,
        waitForReady: waitForReadyRef.current,
        now: () => nowRef.current?.() ?? Date.now(),
      })(input);
      settledRef.current.set(input.intentId, promise);
      return promise;
    },
    [handlers]
  );

  const value = useMemo<PendingAuthActionContextValue>(
    () => ({
      store: activeStore,
      handlers,
      registerIntent,
      registerHandler,
      resume,
    }),
    [activeStore, handlers, registerHandler, registerIntent, resume]
  );

  return (
    <PendingAuthActionContext.Provider value={value}>
      {children}
    </PendingAuthActionContext.Provider>
  );
}

export function usePendingAuthAction(): PendingAuthActionContextValue {
  const context = useContext(PendingAuthActionContext);
  if (!context) {
    throw new Error(
      "usePendingAuthAction must be used within PendingAuthActionProvider"
    );
  }
  return context;
}

export function PendingActionHandlerRegistration({
  kind,
  handler,
}: {
  kind: string;
  handler: PendingActionHandler;
}) {
  const { registerHandler } = usePendingAuthAction();
  useEffect(
    () => registerHandler(kind, handler),
    [handler, kind, registerHandler]
  );
  return null;
}
