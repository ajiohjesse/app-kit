"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  createDraftAutosave,
  createSessionStorageDraftStore,
  resolveDraftNamespace,
  type CreateDraftAutosaveOptions,
  type DraftAutosave,
  type DraftAutosaveState,
  type DraftClock,
  type DraftStore,
} from "@/infra/draft-autosave";

export type UseDraftAutosaveOptions = {
  draftId: string;
  schemaVersion: string;
  /** Prefer AuthUser.id when authenticated; omit/null for anonymous. */
  userId?: string | null;
  store?: DraftStore;
  debounceMs?: number;
  maxPayloadBytes?: number;
  clock?: DraftClock;
  onLifecycle?: CreateDraftAutosaveOptions["onLifecycle"];
  onSaveFeedback?: CreateDraftAutosaveOptions["onSaveFeedback"];
  /** When true (default), restore once after mount if storage has a record. */
  restoreOnMount?: boolean;
};

export type UseDraftAutosaveResult = {
  state: DraftAutosaveState;
  update: DraftAutosave["update"];
  save: DraftAutosave["save"];
  flush: DraftAutosave["flush"];
  restore: DraftAutosave["restore"];
  discard: DraftAutosave["discard"];
  adoptFromNamespace: DraftAutosave["adoptFromNamespace"];
  controller: DraftAutosave;
};

function getDefaultStore(): DraftStore {
  if (typeof sessionStorage === "undefined") {
    return createSessionStorageDraftStore({ storage: undefined });
  }
  return createSessionStorageDraftStore({ storage: sessionStorage });
}

export function useDraftAutosave(
  options: UseDraftAutosaveOptions
): UseDraftAutosaveResult {
  const [controller] = useState(() =>
    createDraftAutosave({
      draftId: options.draftId,
      schemaVersion: options.schemaVersion,
      store: options.store ?? getDefaultStore(),
      getNamespace: () => resolveDraftNamespace(options.userId),
      debounceMs: options.debounceMs,
      maxPayloadBytes: options.maxPayloadBytes,
      clock: options.clock,
      onLifecycle: options.onLifecycle,
      onSaveFeedback: options.onSaveFeedback,
    })
  );

  useEffect(() => {
    controller.syncNamespace(resolveDraftNamespace(options.userId));
  }, [controller, options.userId]);

  useEffect(() => {
    if (options.restoreOnMount === false) {
      return;
    }
    void controller.restore();
  }, [controller, options.restoreOnMount]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  const update = useCallback(
    (payload: unknown) => controller.update(payload),
    [controller]
  );

  return {
    state,
    update,
    save: controller.save,
    flush: controller.flush,
    restore: controller.restore,
    discard: controller.discard,
    adoptFromNamespace: controller.adoptFromNamespace,
    controller,
  };
}
