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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  OverlayLayerProvider,
  useOverlayLayer,
} from "@/infra/modal-manager-provider";

export type SheetSettlement = "submitted" | "cancelled" | "dismissed";

export type SheetSide = "top" | "right" | "bottom" | "left";

export type SheetContentContext = {
  id: string;
  close: (settlement?: SheetSettlement) => void;
  submit: () => void;
  cancel: () => void;
  setPending: (pending: boolean) => void;
};

export type SheetOpenOptions = {
  title: ReactNode;
  description?: ReactNode;
  content: ReactNode | ((context: SheetContentContext) => ReactNode);
  side?: SheetSide | (() => SheetSide);
  liveSide?: boolean;
  nested?: boolean;
  modal?: boolean;
  pending?: boolean;
  destructive?: boolean;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  onOpen?: () => void | Promise<void>;
  onClose?: (settlement: SheetSettlement) => void | Promise<void>;
};

export type SheetHandle = {
  id: string;
  result: Promise<SheetSettlement>;
};

export type SheetManagerApi = {
  open: (options: SheetOpenOptions) => SheetHandle;
  replace: (id: string, next: SheetOpenOptions) => SheetHandle;
  close: (id: string, settlement?: SheetSettlement) => Promise<void>;
  closeAll: (settlement?: SheetSettlement) => Promise<void>;
  setPending: (id: string, pending: boolean) => void;
};

type StoredSheet = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  content: SheetOpenOptions["content"];
  side: SheetSide;
  sidePolicy?: () => SheetSide;
  liveSide: boolean;
  sideChanged: boolean;
  modal: boolean;
  pending: boolean;
  closeOnEscape: boolean;
  closeOnBackdrop: boolean;
  dismissible: boolean;
  onOpen?: SheetOpenOptions["onOpen"];
  onClose?: SheetOpenOptions["onClose"];
  settled: boolean;
  restoreTarget: Element | null;
  resolve: (settlement: SheetSettlement) => void;
  result: Promise<SheetSettlement>;
  queue: Promise<void>;
};

type SheetSnapshot = {
  entries: StoredSheet[];
  suspended: boolean;
};

const OVERLAY_LAYER_SLOT = Symbol.for("app-kit.overlay-layer-context");

function getOverlayLayerContext() {
  const holder = globalThis as typeof globalThis & {
    [OVERLAY_LAYER_SLOT]?: ReturnType<typeof createContext<unknown>>;
  };
  if (!holder[OVERLAY_LAYER_SLOT]) {
    holder[OVERLAY_LAYER_SLOT] = createContext<unknown>(null);
  }
  return holder[OVERLAY_LAYER_SLOT];
}

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

function unknownSheetError(id: string) {
  return new Error(`Unknown sheet id: ${id}`);
}

let sheetSeq = 0;

function nextSheetId() {
  sheetSeq += 1;
  return `sheet-${sheetSeq}`;
}

function resolveSide(side?: SheetSide | (() => SheetSide)): SheetSide {
  if (typeof side === "function") {
    return side();
  }
  return side ?? "right";
}

function toStoredSheet(options: SheetOpenOptions): StoredSheet {
  let resolve!: (settlement: SheetSettlement) => void;
  const result = new Promise<SheetSettlement>((res) => {
    resolve = res;
  });
  const sidePolicy =
    typeof options.side === "function" ? options.side : undefined;
  return {
    id: nextSheetId(),
    title: options.title,
    description: options.description,
    content: options.content,
    side: resolveSide(options.side),
    sidePolicy,
    liveSide: options.liveSide ?? false,
    sideChanged: false,
    modal: options.modal ?? true,
    pending: options.pending ?? false,
    closeOnEscape: options.closeOnEscape ?? true,
    closeOnBackdrop: options.closeOnBackdrop ?? !(options.destructive ?? false),
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

class SheetStackStore {
  private entries: StoredSheet[] = [];
  private listeners = new Set<() => void>();
  snapshot: SheetSnapshot = { entries: [], suspended: false };
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

  open(options: SheetOpenOptions): SheetHandle {
    const opener =
      this.entries[0]?.restoreTarget ??
      (typeof document !== "undefined" &&
      document.activeElement instanceof Element
        ? document.activeElement
        : null);
    if (!options.nested && this.entries.length > 0) {
      for (const previous of [...this.entries]) {
        this.settle(previous, "dismissed");
        void previous.onClose?.("dismissed");
      }
      this.entries = [];
    }
    const entry = toStoredSheet(options);
    if (!options.nested) {
      entry.restoreTarget = opener;
    }
    this.entries = [...this.entries, entry];
    this.emit();
    this.enqueue(entry, async () => {
      await entry.onOpen?.();
    });
    return { id: entry.id, result: entry.result };
  }

  replace(id: string, next: SheetOpenOptions): SheetHandle {
    const index = this.entries.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw unknownSheetError(id);
    }
    const previous = this.entries[index];
    this.settle(previous, "dismissed");
    const entry = toStoredSheet(next);
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

  async close(id: string, settlement: SheetSettlement = "dismissed") {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw unknownSheetError(id);
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

  async closeAll(settlement: SheetSettlement = "dismissed") {
    const ids = [...this.entries].reverse().map((entry) => entry.id);
    for (const id of ids) {
      try {
        await this.close(id, settlement);
      } catch {
        // A failed lifecycle hook leaves that entry; keep going for teardown.
      }
    }
  }

  setPending(id: string, pending: boolean) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw unknownSheetError(id);
    }
    if (entry.pending === pending) {
      return;
    }
    entry.pending = pending;
    this.emit();
  }

  updateSide(id: string, side: SheetSide) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (!entry || entry.side === side) {
      return;
    }
    entry.side = side;
    entry.sideChanged = true;
    this.emit();
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

  private remove(entry: StoredSheet, settlement: SheetSettlement) {
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

  private settle(entry: StoredSheet, settlement: SheetSettlement) {
    if (entry.settled) {
      return;
    }
    entry.settled = true;
    entry.resolve(settlement);
  }

  private enqueue(entry: StoredSheet, task: () => Promise<void>) {
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

const SheetManagerContext = createContext<{
  api: SheetManagerApi;
  store: SheetStackStore;
} | null>(null);

function SheetManagerProviderInner({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const overlay = useOverlayLayer();
  const layerId = useId();
  const restoreRef = useRef<Element | null>(null);
  const [store] = useState(() => new SheetStackStore());
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  const api: SheetManagerApi = {
    open(options) {
      if (!hydrated) {
        warnDev(
          "useSheetManager() operations are no-ops until SheetManagerProvider hydrates."
        );
        return { id: "", result: Promise.resolve("dismissed") };
      }
      const handle = store.open(options);
      overlay.setForeground(layerId);
      return handle;
    },
    replace(id, next) {
      if (!hydrated) {
        warnDev(
          "useSheetManager() operations are no-ops until SheetManagerProvider hydrates."
        );
        return { id: "", result: Promise.resolve("dismissed") };
      }
      const handle = store.replace(id, next);
      overlay.setForeground(layerId);
      return handle;
    },
    close(id, settlement = "dismissed") {
      if (!hydrated) {
        warnDev(
          "useSheetManager() operations are no-ops until SheetManagerProvider hydrates."
        );
        return Promise.resolve();
      }
      return store.close(id, settlement);
    },
    closeAll(settlement = "dismissed") {
      if (!hydrated) {
        warnDev(
          "useSheetManager() operations are no-ops until SheetManagerProvider hydrates."
        );
        return Promise.resolve();
      }
      return store.closeAll(settlement);
    },
    setPending(id, pending) {
      if (!hydrated) {
        warnDev(
          "useSheetManager() operations are no-ops until SheetManagerProvider hydrates."
        );
        return;
      }
      store.setPending(id, pending);
    },
  };

  useEffect(() => {
    return overlay.registerLayer({
      id: layerId,
      kind: "sheet",
      getRestoreTarget: () => restoreRef.current,
      onSuspend: () => {
        restoreRef.current =
          document.activeElement instanceof Element
            ? document.activeElement
            : null;
        store.setSuspended(true);
      },
      onResume: () => {
        store.setSuspended(false);
      },
    });
  }, [layerId, overlay, store]);

  useEffect(() => {
    if (snapshot.entries.length === 0) {
      overlay.clearForeground(layerId);
    }
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
    <SheetManagerContext.Provider value={{ api, store }}>
      {children}
    </SheetManagerContext.Provider>
  );
}

export function SheetManagerProvider({ children }: { children: ReactNode }) {
  const overlay = useContext(getOverlayLayerContext());
  if (!overlay) {
    return (
      <OverlayLayerProvider>
        <SheetManagerProviderInner>{children}</SheetManagerProviderInner>
      </OverlayLayerProvider>
    );
  }
  return <SheetManagerProviderInner>{children}</SheetManagerProviderInner>;
}

export function useSheetManager(): SheetManagerApi {
  const context = useContext(SheetManagerContext);
  if (!context) {
    throw new Error(
      "useSheetManager() requires a SheetManagerProvider ancestor."
    );
  }
  return context.api;
}

function renderContent(entry: StoredSheet, api: SheetManagerApi) {
  if (typeof entry.content === "function") {
    return entry.content({
      id: entry.id,
      close: (settlement = "dismissed") => {
        void api.close(entry.id, settlement);
      },
      submit: () => {
        void api.close(entry.id, "submitted");
      },
      cancel: () => {
        void api.close(entry.id, "cancelled");
      },
      setPending: (pending) => {
        api.setPending(entry.id, pending);
      },
    });
  }
  return entry.content;
}

function handleOpenChange(
  entry: StoredSheet,
  interactive: boolean,
  open: boolean,
  details: { reason: string; cancel: () => void },
  close: (id: string, settlement?: SheetSettlement) => Promise<void>
) {
  if (open) {
    return;
  }
  const canDismiss = interactive && entry.dismissible && !entry.pending;
  if (!canDismiss) {
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

function LiveSide({
  entry,
  store,
}: {
  entry: StoredSheet;
  store: SheetStackStore;
}) {
  useEffect(() => {
    if (!entry.liveSide || !entry.sidePolicy) {
      return;
    }
    const onResize = () => {
      store.updateSide(entry.id, entry.sidePolicy!());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [entry.id, entry.liveSide, entry.sidePolicy, store]);
  return null;
}

function SheetTree({
  entries,
  index,
  suspended,
  api,
  store,
}: {
  entries: StoredSheet[];
  index: number;
  suspended: boolean;
  api: SheetManagerApi;
  store: SheetStackStore;
}) {
  const entry = entries[index];
  if (!entry) {
    return null;
  }

  const isTop = index === entries.length - 1;
  const interactive = isTop && !suspended;
  const nested = (
    <SheetTree
      entries={entries}
      index={index + 1}
      suspended={suspended}
      api={api}
      store={store}
    />
  );
  const body = (
    <>
      {renderContent(entry, api)}
      {nested}
    </>
  );

  return (
    <Sheet
      open
      modal={entry.modal}
      disablePointerDismissal={!entry.closeOnBackdrop}
      onOpenChange={(open, details) =>
        handleOpenChange(entry, interactive, open, details, api.close)
      }
    >
      <SheetContent
        side={entry.side}
        showCloseButton={entry.dismissible && interactive && !entry.pending}
        inert={suspended ? true : undefined}
        aria-busy={entry.pending || undefined}
      >
        <LiveSide entry={entry} store={store} />
        {entry.sideChanged ? (
          <div className="sr-only" aria-live="polite">
            {entry.side} sheet
          </div>
        ) : null}
        <SheetHeader>
          <SheetTitle>{entry.title}</SheetTitle>
          {entry.description ? (
            <SheetDescription>{entry.description}</SheetDescription>
          ) : null}
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}

export function SheetManager() {
  const context = useContext(SheetManagerContext);
  if (!context) {
    throw new Error("SheetManager requires a SheetManagerProvider ancestor.");
  }
  const snapshot = useSyncExternalStore(
    context.store.subscribe,
    context.store.getSnapshot,
    context.store.getSnapshot
  );
  return (
    <SheetTree
      entries={snapshot.entries}
      index={0}
      suspended={snapshot.suspended}
      api={context.api}
      store={context.store}
    />
  );
}
