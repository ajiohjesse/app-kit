"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ModalSurface,
  OverlayLayerKind,
  OverlayLayerRegistration,
  OverlaySettlement,
} from "@/infra/modal-manager";
import { flushSync } from "react-dom";

const LAYER_RANK: Record<OverlayLayerKind, number> = {
  loading: 3,
  modal: 2,
  sheet: 1,
};

export type ModalContentContext = {
  id: string;
  close: (settlement?: OverlaySettlement) => void;
  confirm: () => void;
  cancel: () => void;
};

export type ModalOpenOptions = {
  surface?: ModalSurface;
  title: ReactNode;
  description?: ReactNode;
  content: ReactNode | ((context: ModalContentContext) => ReactNode);
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  onOpen?: () => void | Promise<void>;
  onClose?: (settlement: OverlaySettlement) => void | Promise<void>;
};

export type ModalHandle = {
  id: string;
  result: Promise<OverlaySettlement>;
};

export type ModalManagerApi = {
  open: (options: ModalOpenOptions) => ModalHandle;
  replace: (id: string, next: ModalOpenOptions) => ModalHandle;
  close: (id: string, settlement?: OverlaySettlement) => Promise<void>;
  closeAll: (settlement?: OverlaySettlement) => Promise<void>;
};

export type OverlayLayerApi = {
  registerLayer: (registration: OverlayLayerRegistration) => () => void;
  setForeground: (id: string) => void;
  clearForeground: (id: string) => void;
  foregroundId: string | null;
  isSuspended: (id: string) => boolean;
};

type StoredModal = {
  id: string;
  surface: ModalSurface;
  title: ReactNode;
  description?: ReactNode;
  content: ModalOpenOptions["content"];
  closeOnEscape: boolean;
  closeOnBackdrop: boolean;
  dismissible: boolean;
  onOpen?: ModalOpenOptions["onOpen"];
  onClose?: ModalOpenOptions["onClose"];
  settled: boolean;
  restoreTarget: Element | null;
  resolve: (settlement: OverlaySettlement) => void;
  result: Promise<OverlaySettlement>;
  queue: Promise<void>;
};

type ModalSnapshot = {
  entries: StoredModal[];
  suspended: boolean;
};

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function warnDev(message: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(message);
  }
}

function focusRestoreTarget(target: Element | null) {
  if (target instanceof HTMLElement && document.contains(target)) {
    target.focus();
  }
}

function unknownModalError(id: string) {
  return new Error(`Unknown modal id: ${id}`);
}

let modalSeq = 0;

function nextModalId() {
  modalSeq += 1;
  return `modal-${modalSeq}`;
}

function toStoredModal(options: ModalOpenOptions): StoredModal {
  let resolve!: (settlement: OverlaySettlement) => void;
  const result = new Promise<OverlaySettlement>((res) => {
    resolve = res;
  });
  return {
    id: nextModalId(),
    surface: options.surface ?? "dialog",
    title: options.title,
    description: options.description,
    content: options.content,
    closeOnEscape: options.closeOnEscape ?? true,
    closeOnBackdrop: options.closeOnBackdrop ?? false,
    dismissible: options.dismissible ?? true,
    onOpen: options.onOpen,
    onClose: options.onClose,
    settled: false,
    restoreTarget:
      typeof document !== "undefined" &&
      document.activeElement instanceof Element
        ? document.activeElement
        : null,
    resolve,
    result,
    queue: Promise.resolve(),
  };
}

class OverlayLayerRegistry {
  private layers = new Map<string, OverlayLayerRegistration>();
  private active = new Map<string, number>();
  private suspended = new Set<string>();
  private generation = 0;
  private listeners = new Set<() => void>();
  private _foregroundId: string | null = null;
  private snapshot: { version: number; foregroundId: string | null } = {
    version: 0,
    foregroundId: null,
  };

  get foregroundId() {
    return this._foregroundId;
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  readonly registerLayer = (registration: OverlayLayerRegistration) => {
    this.layers.set(registration.id, registration);
    this.recompute();
    return () => {
      this.layers.delete(registration.id);
      this.active.delete(registration.id);
      this.suspended.delete(registration.id);
      this.recompute();
    };
  };

  readonly setForeground = (id: string) => {
    if (!this.layers.has(id)) {
      return;
    }
    this.generation += 1;
    this.active.set(id, this.generation);
    this.recompute();
  };

  readonly clearForeground = (id: string) => {
    this.active.delete(id);
    this.recompute();
  };

  readonly isSuspended = (id: string) => {
    return this.suspended.has(id);
  };

  private pickForeground() {
    let winner: { id: string; rank: number; generation: number } | null = null;
    for (const [id, generation] of this.active) {
      const layer = this.layers.get(id);
      if (!layer) {
        continue;
      }
      const rank = LAYER_RANK[layer.kind];
      if (
        !winner ||
        rank > winner.rank ||
        (rank === winner.rank && generation > winner.generation)
      ) {
        winner = { id, rank, generation };
      }
    }
    return winner?.id ?? null;
  }

  private recompute() {
    const next = this.pickForeground();
    this._foregroundId = next;
    for (const [id, registration] of this.layers) {
      const shouldSuspend = next !== null && id !== next;
      const isSuspended = this.suspended.has(id);
      if (shouldSuspend && !isSuspended) {
        this.suspended.add(id);
        registration.onSuspend();
      } else if (!shouldSuspend && isSuspended) {
        this.suspended.delete(id);
        registration.onResume();
        const target = registration.getRestoreTarget();
        if (target instanceof HTMLElement && document.contains(target)) {
          target.focus();
        }
      }
    }
    this.emit();
  }

  private emit() {
    this.snapshot = {
      version: this.snapshot.version + 1,
      foregroundId: this._foregroundId,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class ModalStackStore {
  private entries: StoredModal[] = [];
  private listeners = new Set<() => void>();
  snapshot: ModalSnapshot = { entries: [], suspended: false };
  suspended = false;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  setSuspended(suspended: boolean) {
    if (this.suspended === suspended) {
      return;
    }
    this.suspended = suspended;
    this.emit();
  }

  open(options: ModalOpenOptions): ModalHandle {
    const entry = toStoredModal(options);
    this.entries = [...this.entries, entry];
    this.emit();
    this.enqueue(entry, async () => {
      await entry.onOpen?.();
    });
    return { id: entry.id, result: entry.result };
  }

  replace(id: string, next: ModalOpenOptions): ModalHandle {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw unknownModalError(id);
    }
    const previous = this.entries[index];
    this.settle(previous, "dismissed");
    const entry = toStoredModal(next);
    entry.id = id;
    entry.restoreTarget = previous.restoreTarget;
    this.entries = [
      ...this.entries.slice(0, index),
      entry,
      ...this.entries.slice(index + 1),
    ];
    this.emit();
    this.enqueue(entry, async () => {
      await entry.onOpen?.();
    });
    return { id: entry.id, result: entry.result };
  }

  async close(id: string, settlement: OverlaySettlement = "dismissed") {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw unknownModalError(id);
    }
    if (entry.settled) {
      return;
    }
    await this.enqueue(entry, async () => {
      if (entry.settled) {
        return;
      }
      await entry.onClose?.(settlement);
      this.remove(entry, settlement);
    });
  }

  async closeAll(settlement: OverlaySettlement = "dismissed") {
    const ids = [...this.entries].reverse().map((entry) => entry.id);
    for (const id of ids) {
      try {
        await this.close(id, settlement);
      } catch {
        // A failed lifecycle hook leaves that entry; keep going for teardown.
      }
    }
  }

  teardown() {
    const opener = this.entries[0]?.restoreTarget ?? null;
    for (const entry of [...this.entries]) {
      this.settle(entry, "dismissed");
    }
    this.entries = [];
    this.suspended = false;
    this.emit();
    focusRestoreTarget(opener);
  }

  private remove(entry: StoredModal, settlement: OverlaySettlement) {
    const wasTop = this.entries[this.entries.length - 1]?.id === entry.id;
    this.settle(entry, settlement);
    this.entries = this.entries.filter(
      (candidate) => candidate.id !== entry.id
    );
    this.emit();
    if (wasTop) {
      focusRestoreTarget(entry.restoreTarget);
    }
  }

  private settle(entry: StoredModal, settlement: OverlaySettlement) {
    if (entry.settled) {
      return;
    }
    entry.settled = true;
    entry.resolve(settlement);
  }

  private enqueue(entry: StoredModal, task: () => Promise<void>) {
    const next = entry.queue.then(task, task);
    entry.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private emit() {
    this.snapshot = { entries: this.entries, suspended: this.suspended };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

const OVERLAY_LAYER_SLOT = Symbol.for("app-kit.overlay-layer-context");

function getOverlayLayerContext() {
  const holder = globalThis as typeof globalThis & {
    [OVERLAY_LAYER_SLOT]?: ReturnType<
      typeof createContext<OverlayLayerRegistry | null>
    >;
  };
  if (!holder[OVERLAY_LAYER_SLOT]) {
    holder[OVERLAY_LAYER_SLOT] = createContext<OverlayLayerRegistry | null>(
      null
    );
  }
  return holder[OVERLAY_LAYER_SLOT];
}

const OverlayLayerContext = getOverlayLayerContext();
const ModalManagerContext = createContext<{
  api: ModalManagerApi;
  store: ModalStackStore;
} | null>(null);

export function OverlayLayerProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new OverlayLayerRegistry());
  return (
    <OverlayLayerContext.Provider value={registry}>
      {children}
    </OverlayLayerContext.Provider>
  );
}

export function useOverlayLayer(): OverlayLayerApi {
  const registry = useContext(OverlayLayerContext);
  if (!registry) {
    throw new Error(
      "useOverlayLayer() requires an OverlayLayerProvider ancestor."
    );
  }
  useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot
  );
  return registry;
}

function ModalManagerProviderInner({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const overlay = useOverlayLayer();
  const layerId = useId();
  const restoreRef = useRef<Element | null>(null);
  const [store] = useState(() => new ModalStackStore());
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  const api: ModalManagerApi = {
    open(options) {
      if (!hydrated) {
        warnDev(
          "useModalManager() operations are no-ops until ModalManagerProvider hydrates."
        );
        return { id: "", result: Promise.resolve("dismissed") };
      }
      return store.open(options);
    },
    replace(id, next) {
      if (!hydrated) {
        warnDev(
          "useModalManager() operations are no-ops until ModalManagerProvider hydrates."
        );
        return { id: "", result: Promise.resolve("dismissed") };
      }
      return store.replace(id, next);
    },
    close(id, settlement = "dismissed") {
      if (!hydrated) {
        warnDev(
          "useModalManager() operations are no-ops until ModalManagerProvider hydrates."
        );
        return Promise.resolve();
      }
      return store.close(id, settlement);
    },
    closeAll(settlement = "dismissed") {
      if (!hydrated) {
        warnDev(
          "useModalManager() operations are no-ops until ModalManagerProvider hydrates."
        );
        return Promise.resolve();
      }
      return store.closeAll(settlement);
    },
  };

  useEffect(() => {
    return overlay.registerLayer({
      id: layerId,
      kind: "modal",
      getRestoreTarget: () => restoreRef.current,
      onSuspend: () => {
        restoreRef.current =
          document.activeElement instanceof Element
            ? document.activeElement
            : null;
        flushSync(() => {
          store.setSuspended(true);
        });
      },
      onResume: () => {
        flushSync(() => {
          store.setSuspended(false);
        });
      },
    });
  }, [layerId, overlay, store]);

  useEffect(() => {
    if (snapshot.entries.length > 0) {
      overlay.setForeground(layerId);
      return;
    }
    overlay.clearForeground(layerId);
  }, [layerId, overlay, snapshot.entries.length]);

  const wasSuspended = useRef(false);
  useEffect(() => {
    if (wasSuspended.current && !snapshot.suspended) {
      const target = restoreRef.current;
      if (target instanceof HTMLElement && document.contains(target)) {
        target.focus();
      }
    }
    wasSuspended.current = snapshot.suspended;
  }, [snapshot.suspended]);

  useEffect(() => {
    return () => store.teardown();
  }, [store]);

  return (
    <ModalManagerContext.Provider value={{ api, store }}>
      {children}
    </ModalManagerContext.Provider>
  );
}

export function ModalManagerProvider({ children }: { children: ReactNode }) {
  const overlay = useContext(OverlayLayerContext);
  if (!overlay) {
    return (
      <OverlayLayerProvider>
        <ModalManagerProviderInner>{children}</ModalManagerProviderInner>
      </OverlayLayerProvider>
    );
  }
  return <ModalManagerProviderInner>{children}</ModalManagerProviderInner>;
}

export function useModalManager(): ModalManagerApi {
  const context = useContext(ModalManagerContext);
  if (!context) {
    throw new Error(
      "useModalManager() requires a ModalManagerProvider ancestor."
    );
  }
  return context.api;
}

function renderContent(
  entry: StoredModal,
  close: (id: string, settlement?: OverlaySettlement) => Promise<void>
) {
  if (typeof entry.content === "function") {
    return entry.content({
      id: entry.id,
      close: (settlement = "dismissed") => {
        void close(entry.id, settlement);
      },
      confirm: () => {
        void close(entry.id, "confirmed");
      },
      cancel: () => {
        void close(entry.id, "cancelled");
      },
    });
  }
  return entry.content;
}

function handleOpenChange(
  entry: StoredModal,
  interactive: boolean,
  open: boolean,
  details: { reason: string; cancel: () => void },
  close: (id: string, settlement?: OverlaySettlement) => Promise<void>
) {
  if (open) {
    return;
  }
  if (!interactive || !entry.dismissible) {
    details.cancel();
    return;
  }
  if (details.reason === "escape-key" && !entry.closeOnEscape) {
    details.cancel();
    return;
  }
  if (details.reason === "outside-press" && !entry.closeOnBackdrop) {
    details.cancel();
    return;
  }
  void close(entry.id, "dismissed");
}

function ModalTree({
  entries,
  index,
  suspended,
  close,
}: {
  entries: StoredModal[];
  index: number;
  suspended: boolean;
  close: (id: string, settlement?: OverlaySettlement) => Promise<void>;
}) {
  const entry = entries[index];
  if (!entry) {
    return null;
  }

  const isTop = index === entries.length - 1;
  const interactive = isTop && !suspended;
  const nested = (
    <ModalTree
      entries={entries}
      index={index + 1}
      suspended={suspended}
      close={close}
    />
  );
  const body = (
    <>
      {renderContent(entry, close)}
      {nested}
    </>
  );

  if (entry.surface === "alert-dialog") {
    return (
      <AlertDialog
        open
        onOpenChange={(open, details) =>
          handleOpenChange(entry, interactive, open, details, close)
        }
      >
        <AlertDialogContent inert={suspended ? true : undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>{entry.title}</AlertDialogTitle>
            {entry.description ? (
              <AlertDialogDescription>
                {entry.description}
              </AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          {body}
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Dialog
      open
      disablePointerDismissal={!entry.closeOnBackdrop}
      onOpenChange={(open, details) =>
        handleOpenChange(entry, interactive, open, details, close)
      }
    >
      <DialogContent
        showCloseButton={entry.dismissible && interactive}
        inert={suspended ? true : undefined}
      >
        <DialogHeader>
          <DialogTitle>{entry.title}</DialogTitle>
          {entry.description ? (
            <DialogDescription>{entry.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

export function ModalManager() {
  const context = useContext(ModalManagerContext);
  if (!context) {
    throw new Error("ModalManager requires a ModalManagerProvider ancestor.");
  }
  const snapshot = useSyncExternalStore(
    context.store.subscribe,
    context.store.getSnapshot,
    context.store.getSnapshot
  );
  return (
    <ModalTree
      entries={snapshot.entries}
      index={0}
      suspended={snapshot.suspended}
      close={(id, settlement) => context.api.close(id, settlement)}
    />
  );
}
