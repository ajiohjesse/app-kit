"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createUnsavedChangesGuard,
  type BypassToken,
  type ConfirmSettlement,
  type CreateUnsavedChangesGuardOptions,
  type DirtyNavigationPolicy,
  type DirtyStateContext,
  type DirtyStateSource,
  type NavigationIntent,
  type NavigationOutcome,
  type UnsavedChangesGuard,
  type UnsavedChangesNavigate,
  type UnsavedConfirmAdapter,
  type UnsavedConfirmOptions,
} from "@/infra/unsaved-changes";

export type {
  BypassToken,
  ConfirmSettlement,
  DirtyNavigationPolicy,
  DirtyStateContext,
  DirtyStateSource,
  NavigationIntent,
  NavigationOutcome,
  UnsavedChangesNavigate,
  UnsavedConfirmAdapter,
  UnsavedConfirmOptions,
};

export type UseUnsavedChangesOptions = {
  /**
   * Controlled dirty — when set, stays authoritative over markDirty/markClean.
   * Still ORs with dirtySources.
   */
  isDirty?: boolean;
  /** Draft adapters and other Dirty state sources. */
  dirtySources?: DirtyStateSource[];
  policy?: DirtyNavigationPolicy;
  confirm?: UnsavedConfirmAdapter;
  confirmOptions?: UnsavedConfirmOptions;
  onCustomFlow?: (
    intent: NavigationIntent,
    dirty: DirtyStateContext
  ) => Promise<ConfirmSettlement>;
  navigate: UnsavedChangesNavigate;
  cancelNavigation?: (intent: NavigationIntent) => void;
  createBypassToken?: () => BypassToken;
};

export type UseUnsavedChangesResult = {
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;
  attemptNavigation: (
    intent: NavigationIntent,
    options?: { bypassToken?: BypassToken }
  ) => Promise<NavigationOutcome>;
  cancelNavigation: (intent?: NavigationIntent) => void;
  retryNavigation: (bypassToken: BypassToken) => Promise<NavigationOutcome>;
  guard: UnsavedChangesGuard;
};

export function useUnsavedChanges(
  options: UseUnsavedChangesOptions
): UseUnsavedChangesResult {
  const controlled = options.isDirty !== undefined;
  const hasConfirm = options.confirm !== undefined;
  const hasCustomFlow = options.onCustomFlow !== undefined;
  const hasDirtySources = options.dirtySources !== undefined;

  const latestRef = useRef(options);
  useEffect(() => {
    latestRef.current = options;
  });

  // Guard callbacks only read latestRef from async/event paths, never during render.
  // eslint-disable-next-line react-hooks/refs -- stable guard closes over the ref object
  const [guard] = useState(() => {
    const createOptions: CreateUnsavedChangesGuardOptions = {
      policy: options.policy,
      confirmOptions: options.confirmOptions,
      createBypassToken: options.createBypassToken,
      navigate: (intent, navOptions) =>
        latestRef.current.navigate(intent, navOptions),
      cancelNavigation: (intent) =>
        latestRef.current.cancelNavigation?.(intent),
    };

    if (hasConfirm) {
      createOptions.confirm = {
        confirm: (confirmOptions) => {
          const adapter = latestRef.current.confirm;
          if (!adapter) {
            return Promise.reject(new Error("confirm adapter unavailable"));
          }
          return adapter.confirm(confirmOptions);
        },
      };
    }

    if (hasCustomFlow) {
      createOptions.onCustomFlow = (intent, dirty) => {
        const custom = latestRef.current.onCustomFlow;
        if (!custom) {
          return Promise.reject(new Error("custom flow unavailable"));
        }
        return custom(intent, dirty);
      };
    }

    if (controlled) {
      createOptions.getIsDirty = () => Boolean(latestRef.current.isDirty);
    }

    if (hasDirtySources) {
      // Stable proxy so the guard can OR live dirtySources from latestRef.
      // Source subscribe bridging happens in the effect via guard.resync().
      createOptions.dirtySources = [
        {
          getIsDirty: () =>
            (latestRef.current.dirtySources ?? []).some((source) =>
              source.getIsDirty()
            ),
          subscribe: (listener) => {
            // Guard subscribes once at create; live updates use guard.resync().
            void listener;
            return () => undefined;
          },
          flush: async () => {
            for (const source of latestRef.current.dirtySources ?? []) {
              if (!source.flush) {
                continue;
              }
              const result = await source.flush();
              if (
                result &&
                typeof result === "object" &&
                "status" in result &&
                (result.status === "error" ||
                  result.status === "conflict" ||
                  result.status === "blocked")
              ) {
                return result;
              }
            }
            return { status: "saved" };
          },
          discard: async () => {
            for (const source of latestRef.current.dirtySources ?? []) {
              if (!source.discard) {
                continue;
              }
              await source.discard();
            }
          },
        },
      ];
    }

    return createUnsavedChangesGuard(createOptions);
  });

  useEffect(() => {
    return guard.mount();
  }, [guard]);

  // Controlled dirty changes must refresh beforeunload registration.
  useEffect(() => {
    if (!controlled) {
      return;
    }
    if (options.isDirty) {
      guard.markDirty();
    } else {
      guard.markClean();
    }
  }, [controlled, guard, options.isDirty]);

  // Bridge Dirty state source subscriptions into the stable guard.
  useEffect(() => {
    if (!hasDirtySources) {
      return;
    }
    const sources = options.dirtySources ?? [];
    const unsubs = sources.map((source) =>
      source.subscribe(() => guard.resync())
    );
    guard.resync();
    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [guard, hasDirtySources, options.dirtySources]);

  const isDirty = useSyncExternalStore(
    guard.subscribe,
    () => guard.getIsDirty(),
    () => guard.getIsDirty()
  );

  return {
    isDirty,
    markDirty: guard.markDirty,
    markClean: guard.markClean,
    attemptNavigation: guard.attemptNavigation,
    cancelNavigation: guard.cancelNavigation,
    retryNavigation: guard.retryNavigation,
    guard,
  };
}
