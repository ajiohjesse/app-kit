import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "@/test-utils/fake-clock";
import {
  ANONYMOUS_DRAFT_NAMESPACE,
  asDirtyStateSource,
  createDraftAutosave,
  createLocalStorageDraftStore,
  createMemoryDraftStore,
  createSessionStorageDraftStore,
  resolveDraftNamespace,
  serializeDraftPayload,
} from "../../infra/draft-autosave";

describe("draft identity and namespace", () => {
  it("resolves AuthUser.id separately from anonymous", () => {
    expect(resolveDraftNamespace("user-1")).toBe("user-1");
    expect(resolveDraftNamespace(null)).toBe(ANONYMOUS_DRAFT_NAMESPACE);
    expect(resolveDraftNamespace("")).toBe(ANONYMOUS_DRAFT_NAMESPACE);
  });

  it("requires explicit draftId and schemaVersion", () => {
    const store = createMemoryDraftStore();
    expect(() =>
      createDraftAutosave({
        draftId: "",
        schemaVersion: "v1",
        store,
        getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toThrow(/draftId/i);

    expect(() =>
      createDraftAutosave({
        draftId: "form-1",
        schemaVersion: "",
        store,
        getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toThrow(/schemaVersion/i);
  });
});

describe("serialization", () => {
  it("rejects functions and oversized payloads", () => {
    expect(() => serializeDraftPayload({ fn: () => undefined })).toThrow(
      /json/i
    );
    expect(() => serializeDraftPayload({ body: "x".repeat(100) }, 8)).toThrow(
      /size/i
    );
  });
});

describe("debounce and flush", () => {
  it("debounces saves with the fake clock and flush persists immediately", async () => {
    const clock = new FakeClock();
    const store = createMemoryDraftStore();
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
      debounceMs: 100,
      clock,
    });

    draft.update({ title: "a" });
    draft.update({ title: "b" });
    expect(draft.getState().lifecycle).toBe("scheduled");
    expect(
      await store.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toBeNull();

    clock.advanceBy(99);
    expect(
      await store.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toBeNull();

    clock.advanceBy(1);
    await Promise.resolve();
    await Promise.resolve();

    const saved = await store.get({
      draftId: "form-1",
      schemaVersion: "v1",
      namespace: ANONYMOUS_DRAFT_NAMESPACE,
    });
    expect(saved?.payload).toEqual({ title: "b" });
    expect(saved?.revision).toBe(1);

    draft.update({ title: "c" });
    const flushed = await draft.flush();
    expect(flushed.status).toBe("saved");
    const afterFlush = await store.get({
      draftId: "form-1",
      schemaVersion: "v1",
      namespace: ANONYMOUS_DRAFT_NAMESPACE,
    });
    expect(afterFlush?.payload).toEqual({ title: "c" });
    expect(afterFlush?.revision).toBe(2);
  });

  it("suppresses writes when the serialized payload is unchanged after save", async () => {
    const clock = new FakeClock();
    const store = createMemoryDraftStore();
    const set = vi.spyOn(store, "set");
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
      debounceMs: 10,
      clock,
    });

    draft.update({ title: "same" });
    clock.advanceBy(10);
    await Promise.resolve();
    await Promise.resolve();
    expect(set).toHaveBeenCalledTimes(1);

    const result = await draft.save({ title: "same" });
    expect(result.status).toBe("unchanged");
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe("revision conflicts on shared stores", () => {
  it("returns conflict when base revision is behind stored revision", async () => {
    const storage = createMemoryLocalStorage();
    const store = createLocalStorageDraftStore({ storage });
    const clock = new FakeClock();

    const tabA = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => "user-1",
      clock,
      debounceMs: 0,
    });
    const tabB = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => "user-1",
      clock,
      debounceMs: 0,
    });

    const first = await tabA.save({ title: "a" });
    expect(first.status).toBe("saved");

    await tabB.restore();
    expect(tabB.getState().revision).toBe(1);

    const second = await tabA.save({ title: "a2" });
    expect(second.status).toBe("saved");
    expect(second.status === "saved" && second.record.revision).toBe(2);

    const stale = await tabB.save({ title: "b-stale" });
    expect(stale.status).toBe("conflict");
    if (stale.status === "conflict") {
      expect(stale.stored.revision).toBe(2);
      expect(stale.stored.payload).toEqual({ title: "a2" });
    }
  });
});

describe("auth transitions", () => {
  it("never silently merges anonymous drafts into an authenticated namespace", async () => {
    const clock = new FakeClock();
    const store = createMemoryDraftStore();
    let userId: string | null = null;

    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => resolveDraftNamespace(userId),
      clock,
      debounceMs: 10,
    });

    draft.update({ title: "anon" });
    clock.advanceBy(10);
    await Promise.resolve();
    await Promise.resolve();

    const anonRecord = await store.get({
      draftId: "form-1",
      schemaVersion: "v1",
      namespace: ANONYMOUS_DRAFT_NAMESPACE,
    });
    expect(anonRecord?.payload).toEqual({ title: "anon" });

    userId = "user-1";
    draft.syncNamespace();
    expect(draft.getState().namespace).toBe("user-1");
    expect(draft.getState().payload).toBeNull();
    expect(draft.getState().lifecycle).toBe("clean");

    expect(
      await store.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: "user-1",
      })
    ).toBeNull();
    expect(
      await store.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toEqual(anonRecord);

    const adopted = await draft.adoptFromNamespace(ANONYMOUS_DRAFT_NAMESPACE);
    expect(adopted.status).toBe("adopted");
    clock.advanceBy(10);
    await Promise.resolve();
    await Promise.resolve();

    expect(
      await store.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: "user-1",
      })
    ).toMatchObject({ payload: { title: "anon" } });
  });
});

describe("restore discard and sessionStorage default", () => {
  it("restores and discards only the exact draft identity in the current namespace", async () => {
    const store = createMemoryDraftStore();
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => "user-1",
    });

    await draft.save({ title: "keep-me" });
    await store.set(
      {
        draftId: "form-2",
        schemaVersion: "v1",
        namespace: "user-1",
        revision: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        payload: { title: "other" },
      },
      { baseRevision: 0 }
    );

    const other = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => "user-1",
    });
    const restored = await other.restore();
    expect(restored.status).toBe("restored");
    expect(other.getState().payload).toEqual({ title: "keep-me" });
    expect(other.getState().dirty).toBe(true);

    await other.discard();
    expect(
      await store.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: "user-1",
      })
    ).toBeNull();
    expect(
      await store.get({
        draftId: "form-2",
        schemaVersion: "v1",
        namespace: "user-1",
      })
    ).toMatchObject({ payload: { title: "other" } });
  });

  it("uses tab-local sessionStorage and does not share records across stores", async () => {
    const tabAStorage = createMemorySessionStorage();
    const tabBStorage = createMemorySessionStorage();
    const storeA = createSessionStorageDraftStore({ storage: tabAStorage });
    const storeB = createSessionStorageDraftStore({ storage: tabBStorage });

    const draftA = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store: storeA,
      getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
    });
    await draftA.save({ title: "only-a" });

    expect(
      await storeB.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toBeNull();
    expect(
      await storeA.get({
        draftId: "form-1",
        schemaVersion: "v1",
        namespace: ANONYMOUS_DRAFT_NAMESPACE,
      })
    ).toMatchObject({ payload: { title: "only-a" } });
  });
});

describe("action-runner feedback is optional and not a pending intent", () => {
  it("emits feedback phases without requiring pending-auth-action", async () => {
    const phases: string[] = [];
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store: createMemoryDraftStore(),
      getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
      onSaveFeedback: ({ phase }) => {
        phases.push(phase);
      },
    });

    await draft.save({ title: "x" });
    expect(phases).toEqual(["start", "success"]);
  });
});

function createMemorySessionStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

function createMemoryLocalStorage(): Storage {
  return createMemorySessionStorage();
}

describe("Dirty state adapter", () => {
  it("exposes Draft dirty/flush/discard through asDirtyStateSource", async () => {
    const store = createMemoryDraftStore();
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
      debounceMs: 60_000,
    });
    const source = asDirtyStateSource(draft);
    const listener = vi.fn();
    source.subscribe(listener);

    expect(source.getIsDirty()).toBe(false);
    draft.update({ title: "draft" });
    expect(source.getIsDirty()).toBe(true);
    expect(listener).toHaveBeenCalled();

    const flushed = await source.flush?.();
    expect(flushed).toMatchObject({ status: "saved" });
    expect(source.getIsDirty()).toBe(false);

    draft.update({ title: "again" });
    await source.discard?.();
    expect(source.getIsDirty()).toBe(false);
    expect(draft.getState().lifecycle).toBe("discarded");
  });

  it("keeps failed persist dirty for the Dirty state seam", async () => {
    const store: ReturnType<typeof createMemoryDraftStore> = {
      ...createMemoryDraftStore(),
      async set() {
        return {
          status: "error",
          reason: "unavailable",
          message: "offline",
        };
      },
    };
    const draft = createDraftAutosave({
      draftId: "form-1",
      schemaVersion: "v1",
      store,
      getNamespace: () => ANONYMOUS_DRAFT_NAMESPACE,
    });
    const source = asDirtyStateSource(draft);
    draft.update({ title: "x" });
    await draft.flush();
    expect(draft.getState().lifecycle).toBe("failed");
    expect(source.getIsDirty()).toBe(true);
  });
});
