import { describe, expect, it, vi } from "vitest";
import {
  asDirtyStateSource,
  createDraftAutosave,
  createMemoryDraftStore,
} from "../../infra/draft-autosave";
import {
  createDirtyStateSource,
  createUnsavedChangesGuard,
  type NavigationIntent,
  type UnsavedConfirmAdapter,
} from "../../infra/unsaved-changes";

function createWindowStub() {
  type Listener = (event: Event) => void;
  const listeners = new Map<string, Set<Listener>>();

  const win = {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type: string, event: Event) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
  return win;
}

describe("dirty state ownership", () => {
  it("starts clean and only becomes dirty when the consumer marks it", () => {
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
    });

    expect(guard.getIsDirty()).toBe(false);
    guard.markDirty();
    expect(guard.getIsDirty()).toBe(true);
    guard.markClean();
    expect(guard.getIsDirty()).toBe(false);
  });

  it("keeps controlled isDirty authoritative over markDirty/markClean", () => {
    let controlled = true;
    const guard = createUnsavedChangesGuard({
      getIsDirty: () => controlled,
      navigate: vi.fn(),
    });

    expect(guard.getIsDirty()).toBe(true);
    guard.markClean();
    expect(guard.getIsDirty()).toBe(true);
    controlled = false;
    expect(guard.getIsDirty()).toBe(false);
    guard.markDirty();
    expect(guard.getIsDirty()).toBe(false);
  });

  it("ORs Dirty state sources with markDirty/markClean", () => {
    const source = createDirtyStateSource();
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
      dirtySources: [source],
    });

    expect(guard.getIsDirty()).toBe(false);
    source.setDirty(true);
    expect(guard.getIsDirty()).toBe(true);
    source.setDirty(false);
    expect(guard.getIsDirty()).toBe(false);

    guard.markDirty();
    expect(guard.getIsDirty()).toBe(true);
    source.setDirty(true);
    guard.markClean();
    expect(guard.getIsDirty()).toBe(true);
  });

  it("ORs multiple Dirty state sources so no dirty bit is lost", () => {
    const a = createDirtyStateSource();
    const b = createDirtyStateSource();
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
      dirtySources: [a, b],
    });

    a.setDirty(true);
    expect(guard.getIsDirty()).toBe(true);
    a.setDirty(false);
    b.setDirty(true);
    expect(guard.getIsDirty()).toBe(true);
    b.setDirty(false);
    expect(guard.getIsDirty()).toBe(false);
  });

  it("ORs Dirty state sources with controlled getIsDirty", () => {
    let controlled = false;
    const source = createDirtyStateSource(true);
    const guard = createUnsavedChangesGuard({
      getIsDirty: () => controlled,
      dirtySources: [source],
      navigate: vi.fn(),
    });

    expect(guard.getIsDirty()).toBe(true);
    source.setDirty(false);
    expect(guard.getIsDirty()).toBe(false);
    controlled = true;
    expect(guard.getIsDirty()).toBe(true);
  });

  it("notifies subscribers when a Dirty state source flips", () => {
    const source = createDirtyStateSource();
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
      dirtySources: [source],
    });
    const listener = vi.fn();
    guard.subscribe(listener);

    source.setDirty(true);
    expect(listener).toHaveBeenCalled();
  });
});

describe("beforeunload listener lifecycle", () => {
  it("registers beforeunload only while mounted and dirty", () => {
    const win = createWindowStub();
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
      window: win,
    });

    const unmount = guard.mount();
    expect(win.listenerCount("beforeunload")).toBe(0);

    guard.markDirty();
    expect(win.listenerCount("beforeunload")).toBe(1);

    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined as unknown,
    } as unknown as BeforeUnloadEvent;
    win.dispatch("beforeunload", event);
    expect(event.preventDefault).toHaveBeenCalled();

    guard.markClean();
    expect(win.listenerCount("beforeunload")).toBe(0);

    guard.markDirty();
    expect(win.listenerCount("beforeunload")).toBe(1);
    unmount();
    expect(win.listenerCount("beforeunload")).toBe(0);
  });
});

describe("block-and-confirm navigation", () => {
  const intent: NavigationIntent = { href: "/next" };

  it("allows navigation when clean without confirming", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm = vi.fn(async (): Promise<"confirmed"> => "confirmed");
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm: { confirm },
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("allowed");
    expect(navigate).toHaveBeenCalledWith(intent, { bypassToken: undefined });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("dismisses leave when confirm settles dismissed and keeps dirty", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"dismissed"> => "dismissed"),
    };
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
    });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe("dismissed");
    expect(navigate).not.toHaveBeenCalled();
    expect(guard.getIsDirty()).toBe(true);
  });

  it("cancels leave when confirm settles cancelled and keeps dirty", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"cancelled"> => "cancelled"),
    };
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
      policy: "block-and-confirm",
    });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe("cancelled");
    expect(navigate).not.toHaveBeenCalled();
    expect(guard.getIsDirty()).toBe(true);
  });

  it("blocks when confirm adapter is missing while dirty", async () => {
    const navigate = vi.fn(async () => undefined);
    const guard = createUnsavedChangesGuard({ navigate });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe("blocked");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("retries navigation once after confirmed leave", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"confirmed"> => "confirmed"),
    };
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
      policy: "block-and-confirm",
      createBypassToken: () => "token-1",
    });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe("navigated");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(intent, { bypassToken: "token-1" });
    expect(guard.getIsDirty()).toBe(true);
  });

  it("returns navigation-failed without re-prompting when retry throws", async () => {
    const navigate = vi.fn().mockRejectedValueOnce(new Error("route failed"));
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"confirmed"> => "confirmed"),
    };
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
      createBypassToken: () => "token-1",
    });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe(
      "navigation-failed"
    );
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
    expect(guard.getIsDirty()).toBe(true);
  });

  it("ignores later attempts while confirmation is open", async () => {
    let resolveConfirm!: (value: "confirmed" | "cancelled") => void;
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(
        () =>
          new Promise<"confirmed" | "cancelled">((resolve) => {
            resolveConfirm = resolve;
          })
      ),
    };
    const navigate = vi.fn(async () => undefined);
    const guard = createUnsavedChangesGuard({ navigate, confirm });
    guard.markDirty();

    const first = guard.attemptNavigation(intent);
    const second = guard.attemptNavigation({ href: "/other" });
    await expect(second).resolves.toBe("ignored");

    resolveConfirm("cancelled");
    await expect(first).resolves.toBe("cancelled");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("proceeds without another prompt when markClean wins during confirm", async () => {
    let resolveConfirm!: (value: "confirmed" | "cancelled") => void;
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(
        () =>
          new Promise<"confirmed" | "cancelled">((resolve) => {
            resolveConfirm = resolve;
          })
      ),
    };
    const navigate = vi.fn(async () => undefined);
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
      createBypassToken: () => "token-clean",
    });
    guard.mount();
    guard.markDirty();

    const pending = guard.attemptNavigation(intent);
    guard.markClean();
    resolveConfirm("cancelled");

    await expect(pending).resolves.toBe("allowed");
    expect(navigate).toHaveBeenCalledWith(intent, { bypassToken: undefined });
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
  });
});

describe("policies and teardown", () => {
  const intent: NavigationIntent = { href: "/next" };

  it("allow policy navigates while dirty without confirming", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm = vi.fn(async () => "confirmed" as const);
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm: { confirm },
      policy: "allow",
    });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe("allowed");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("allow policy navigates while a Dirty state source is dirty", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm = vi.fn(async () => "confirmed" as const);
    const source = createDirtyStateSource(true);
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm: { confirm },
      policy: "allow",
      dirtySources: [source],
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("allowed");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("custom flow uses onCustomFlow instead of confirm-dialog", async () => {
    const navigate = vi.fn(async () => undefined);
    const onCustomFlow = vi.fn(async () => "confirmed" as const);
    const guard = createUnsavedChangesGuard({
      navigate,
      policy: "block-with-custom-flow",
      onCustomFlow,
      createBypassToken: () => "custom-1",
    });
    guard.markDirty();

    await expect(guard.attemptNavigation(intent)).resolves.toBe("navigated");
    expect(onCustomFlow).toHaveBeenCalledWith(
      intent,
      expect.objectContaining({ isDirty: true })
    );
    expect(navigate).toHaveBeenCalledWith(intent, { bypassToken: "custom-1" });
  });

  it("custom flow can flush Dirty state sources then leave", async () => {
    const navigate = vi.fn(async () => undefined);
    const source = createDirtyStateSource(true);
    const flush = vi.fn(async () => {
      source.setDirty(false);
      return { status: "saved" as const };
    });
    source.flush = flush;

    const guard = createUnsavedChangesGuard({
      navigate,
      policy: "block-with-custom-flow",
      dirtySources: [source],
      createBypassToken: () => "flush-1",
      onCustomFlow: async (_intent, dirty) => {
        const result = await dirty.flush();
        if (!result.ok) {
          return "cancelled";
        }
        return "confirmed";
      },
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("allowed");
    expect(flush).toHaveBeenCalled();
    expect(guard.getIsDirty()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(intent, { bypassToken: undefined });
  });

  it("custom flow flush failure aborts leave and keeps dirty", async () => {
    const navigate = vi.fn(async () => undefined);
    const source = createDirtyStateSource(true);
    source.flush = vi.fn(async () => {
      throw new Error("persist failed");
    });

    const guard = createUnsavedChangesGuard({
      navigate,
      policy: "block-with-custom-flow",
      dirtySources: [source],
      onCustomFlow: async (_intent, dirty) => {
        const result = await dirty.flush();
        return result.ok ? "confirmed" : "cancelled";
      },
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("cancelled");
    expect(navigate).not.toHaveBeenCalled();
    expect(guard.getIsDirty()).toBe(true);
  });

  it("custom flow treats soft flush failure status as not ok", async () => {
    const navigate = vi.fn(async () => undefined);
    const source = createDirtyStateSource(true);
    source.flush = vi.fn(async () => ({ status: "error", reason: "quota" }));

    const guard = createUnsavedChangesGuard({
      navigate,
      policy: "block-with-custom-flow",
      dirtySources: [source],
      onCustomFlow: async (_intent, dirty) => {
        const result = await dirty.flush();
        return result.ok ? "confirmed" : "cancelled";
      },
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("cancelled");
    expect(navigate).not.toHaveBeenCalled();
    expect(guard.getIsDirty()).toBe(true);
  });

  it("custom flow can discard Dirty state sources then leave", async () => {
    const navigate = vi.fn(async () => undefined);
    const source = createDirtyStateSource(true);
    const discard = vi.fn(async () => {
      source.setDirty(false);
    });
    source.discard = discard;

    const guard = createUnsavedChangesGuard({
      navigate,
      policy: "block-with-custom-flow",
      dirtySources: [source],
      createBypassToken: () => "discard-1",
      onCustomFlow: async (_intent, dirty) => {
        await dirty.discard();
        return "confirmed";
      },
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("allowed");
    expect(discard).toHaveBeenCalled();
    expect(guard.getIsDirty()).toBe(false);
    expect(navigate).toHaveBeenCalled();
  });

  it("blocks and confirms when only a Dirty state source is dirty", async () => {
    const navigate = vi.fn(async () => undefined);
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"confirmed"> => "confirmed"),
    };
    const source = createDirtyStateSource(true);
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
      dirtySources: [source],
      createBypassToken: () => "source-1",
    });

    await expect(guard.attemptNavigation(intent)).resolves.toBe("navigated");
    expect(confirm.confirm).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(intent, { bypassToken: "source-1" });
    expect(guard.getIsDirty()).toBe(true);
  });

  it("registers beforeunload when a Dirty state source is dirty", () => {
    const win = createWindowStub();
    const source = createDirtyStateSource();
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
      window: win,
      dirtySources: [source],
    });
    guard.mount();
    expect(win.listenerCount("beforeunload")).toBe(0);
    source.setDirty(true);
    expect(win.listenerCount("beforeunload")).toBe(1);
  });

  it("teardown cancels pending navigation and removes listeners", async () => {
    const win = createWindowStub();
    const cancelNavigation = vi.fn();
    let resolveConfirm!: (value: "cancelled") => void;
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(
        () =>
          new Promise<"cancelled">((resolve) => {
            resolveConfirm = resolve;
          })
      ),
    };
    const guard = createUnsavedChangesGuard({
      navigate: vi.fn(),
      confirm,
      cancelNavigation,
      window: win,
    });
    const unmount = guard.mount();
    guard.markDirty();
    expect(win.listenerCount("beforeunload")).toBe(1);

    const pending = guard.attemptNavigation(intent);
    unmount();
    expect(win.listenerCount("beforeunload")).toBe(0);
    expect(cancelNavigation).toHaveBeenCalledWith(intent);

    resolveConfirm("cancelled");
    await expect(pending).resolves.toBe("ignored");
  });
});

describe("Dirty state seam with Draft", () => {
  const intent: NavigationIntent = { href: "/next" };

  it("blocks navigation for a dirty Draft and navigates after confirmed leave", async () => {
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store: createMemoryDraftStore(),
      getNamespace: () => "anonymous",
      debounceMs: 60_000,
    });
    const navigate = vi.fn(async () => undefined);
    const confirm: UnsavedConfirmAdapter = {
      confirm: vi.fn(async (): Promise<"confirmed"> => "confirmed"),
    };
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm,
      dirtySources: [asDirtyStateSource(draft)],
      createBypassToken: () => "draft-leave",
    });

    draft.update({ title: "unsaved" });
    expect(guard.getIsDirty()).toBe(true);

    await expect(guard.attemptNavigation(intent)).resolves.toBe("navigated");
    expect(confirm.confirm).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(intent, {
      bypassToken: "draft-leave",
    });
    expect(draft.getState().dirty).toBe(true);
  });

  it("allows navigation after Draft flush clears dirty", async () => {
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store: createMemoryDraftStore(),
      getNamespace: () => "anonymous",
      debounceMs: 60_000,
    });
    const navigate = vi.fn(async () => undefined);
    const confirm = vi.fn(async (): Promise<"confirmed"> => "confirmed");
    const guard = createUnsavedChangesGuard({
      navigate,
      confirm: { confirm },
      dirtySources: [asDirtyStateSource(draft)],
    });

    draft.update({ title: "will-save" });
    expect(guard.getIsDirty()).toBe(true);
    await draft.flush();
    expect(guard.getIsDirty()).toBe(false);

    await expect(guard.attemptNavigation(intent)).resolves.toBe("allowed");
    expect(confirm).not.toHaveBeenCalled();
  });
});
