export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const ANONYMOUS_DRAFT_NAMESPACE = "anonymous";
export const DEFAULT_DRAFT_DEBOUNCE_MS = 500;
export const DEFAULT_DRAFT_MAX_PAYLOAD_BYTES = 64_000;
export const DEFAULT_DRAFT_STORAGE_KEY_PREFIX = "app-kit:draft-autosave";

export type DraftClock = {
  now: () => number;
  setTimeout: (callback: () => void, delay?: number) => number;
  clearTimeout: (id: number) => void;
};

export type DraftIdentity = {
  draftId: string;
  schemaVersion: string;
};

export type DraftRecord = {
  draftId: string;
  schemaVersion: string;
  namespace: string;
  revision: number;
  updatedAt: string;
  payload: JsonValue;
};

export type DraftStorageKey = DraftIdentity & {
  namespace: string;
};

export type DraftStoreWriteResult =
  | { status: "ok"; record: DraftRecord }
  | { status: "conflict"; stored: DraftRecord }
  | {
      status: "error";
      reason: "quota" | "unavailable" | "invalid";
      message?: string;
    };

export type DraftStore = {
  get: (key: DraftStorageKey) => Promise<DraftRecord | null>;
  set: (
    record: DraftRecord,
    options: { baseRevision: number }
  ) => Promise<DraftStoreWriteResult>;
  remove: (key: DraftStorageKey) => Promise<void>;
};

export type DraftLifecycle =
  | "clean"
  | "dirty"
  | "scheduled"
  | "saving"
  | "saved"
  | "failed"
  | "conflict"
  | "discarded";

export type DraftAutosaveState = {
  draftId: string;
  schemaVersion: string;
  namespace: string;
  lifecycle: DraftLifecycle;
  revision: number;
  payload: JsonValue | null;
  dirty: boolean;
  lastError: string | null;
  conflict: DraftRecord | null;
};

export type DraftConflictResolution =
  | "useStored"
  | "keepCurrent"
  | {
      merge: (stored: JsonValue, current: JsonValue) => JsonValue;
    };

export type DraftSaveResult =
  | { status: "saved"; record: DraftRecord }
  | { status: "unchanged" }
  | { status: "conflict"; stored: DraftRecord }
  | { status: "error"; reason: string; message?: string }
  | { status: "blocked"; reason: "namespace-changed" | "empty" };

export type DraftRestoreResult =
  | { status: "restored"; record: DraftRecord }
  | { status: "empty" }
  | { status: "conflict"; stored: DraftRecord; current: JsonValue }
  | { status: "schema-mismatch"; stored: DraftRecord }
  | { status: "error"; reason: string; message?: string };

export type DraftAdoptResult =
  | { status: "adopted"; record: DraftRecord }
  | { status: "empty" }
  | { status: "conflict"; stored: DraftRecord; current: JsonValue }
  | { status: "error"; reason: string; message?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertJsonValue(
  value: unknown,
  path = "payload"
): asserts value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Draft payload at ${path} is not JSON-compatible`);
    }
    return;
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "undefined"
  ) {
    throw new Error(`Draft payload at ${path} is not JSON-compatible`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertJsonValue(entry, `${path}[${index}]`)
    );
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`Draft payload at ${path} is not JSON-compatible`);
  }
  for (const [key, entry] of Object.entries(value)) {
    assertJsonValue(entry, `${path}.${key}`);
  }
}

export function serializeDraftPayload(
  payload: unknown,
  maxPayloadBytes = DEFAULT_DRAFT_MAX_PAYLOAD_BYTES
): { json: string; value: JsonValue } {
  assertJsonValue(payload);
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    throw new Error("Draft payload is not JSON-compatible");
  }
  if (json === undefined) {
    throw new Error("Draft payload is not JSON-compatible");
  }
  if (new TextEncoder().encode(json).length > maxPayloadBytes) {
    throw new Error("Draft payload exceeds size limit");
  }
  return { json, value: JSON.parse(json) as JsonValue };
}

/** Resolve storage namespace from AuthUser.id or keep anonymous separate. */
export function resolveDraftNamespace(userId?: string | null): string {
  if (typeof userId === "string" && userId.length > 0) {
    return userId;
  }
  return ANONYMOUS_DRAFT_NAMESPACE;
}

export function draftStorageKey(key: DraftStorageKey): string {
  return `${key.namespace}:${key.draftId}:${key.schemaVersion}`;
}

function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

function parseDraftRecord(value: unknown): DraftRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.draftId !== "string" ||
    typeof value.schemaVersion !== "string" ||
    typeof value.namespace !== "string" ||
    typeof value.revision !== "number" ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }
  try {
    assertJsonValue(value.payload);
  } catch {
    return null;
  }
  return {
    draftId: value.draftId,
    schemaVersion: value.schemaVersion,
    namespace: value.namespace,
    revision: value.revision,
    updatedAt: value.updatedAt,
    payload: value.payload,
  };
}

export function createMemoryDraftStore(): DraftStore {
  const records = new Map<string, DraftRecord>();

  return {
    async get(key) {
      return records.get(draftStorageKey(key)) ?? null;
    },
    async set(record, options) {
      const key = draftStorageKey(record);
      const existing = records.get(key) ?? null;
      if (existing && options.baseRevision < existing.revision) {
        return { status: "conflict", stored: existing };
      }
      records.set(key, record);
      return { status: "ok", record };
    },
    async remove(key) {
      records.delete(draftStorageKey(key));
    },
  };
}

type SessionDraftBucket = Record<string, DraftRecord>;

export function createSessionStorageDraftStore(options?: {
  storage?: Storage;
  keyPrefix?: string;
}): DraftStore {
  const storage = options?.storage;
  const keyPrefix = options?.keyPrefix ?? DEFAULT_DRAFT_STORAGE_KEY_PREFIX;

  function storageKey(key: DraftStorageKey): string {
    return `${keyPrefix}:${draftStorageKey(key)}`;
  }

  function readRaw(key: DraftStorageKey): DraftRecord | null {
    if (!storage) {
      return null;
    }
    let raw: string | null = null;
    try {
      raw = storage.getItem(storageKey(key));
    } catch {
      return null;
    }
    if (!raw) {
      return null;
    }
    try {
      return parseDraftRecord(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  function writeRaw(record: DraftRecord): DraftStoreWriteResult {
    if (!storage) {
      return {
        status: "error",
        reason: "unavailable",
        message: "sessionStorage is unavailable",
      };
    }
    try {
      storage.setItem(storageKey(record), JSON.stringify(record));
      return { status: "ok", record };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/quota/i.test(message)) {
        return { status: "error", reason: "quota", message };
      }
      return { status: "error", reason: "unavailable", message };
    }
  }

  return {
    async get(key) {
      return readRaw(key);
    },
    async set(record, options) {
      const existing = readRaw(record);
      if (existing && options.baseRevision < existing.revision) {
        return { status: "conflict", stored: existing };
      }
      return writeRaw(record);
    },
    async remove(key) {
      if (!storage) {
        return;
      }
      try {
        storage.removeItem(storageKey(key));
      } catch {
        // best-effort
      }
    },
  };
}

/** Shared-store helper that keeps a single bucket object (e.g. localStorage). */
export function createSharedDraftStore(options: {
  load: () => SessionDraftBucket;
  save: (bucket: SessionDraftBucket) => void;
}): DraftStore {
  return {
    async get(key) {
      const bucket = options.load();
      return bucket[draftStorageKey(key)] ?? null;
    },
    async set(record, optionsSet) {
      const bucket = options.load();
      const key = draftStorageKey(record);
      const existing = bucket[key] ?? null;
      if (existing && optionsSet.baseRevision < existing.revision) {
        return { status: "conflict", stored: existing };
      }
      bucket[key] = record;
      try {
        options.save(bucket);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/quota/i.test(message)) {
          return { status: "error", reason: "quota", message };
        }
        return { status: "error", reason: "unavailable", message };
      }
      return { status: "ok", record };
    },
    async remove(key) {
      const bucket = options.load();
      delete bucket[draftStorageKey(key)];
      options.save(bucket);
    },
  };
}

export function createLocalStorageDraftStore(options?: {
  storage?: Storage;
  key?: string;
}): DraftStore {
  const storage = options?.storage;
  const rootKey = options?.key ?? `${DEFAULT_DRAFT_STORAGE_KEY_PREFIX}:shared`;

  return createSharedDraftStore({
    load() {
      if (!storage) {
        return {};
      }
      try {
        const raw = storage.getItem(rootKey);
        if (!raw) {
          return {};
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!isRecord(parsed)) {
          return {};
        }
        const bucket: SessionDraftBucket = {};
        for (const [key, value] of Object.entries(parsed)) {
          const record = parseDraftRecord(value);
          if (record) {
            bucket[key] = record;
          }
        }
        return bucket;
      } catch {
        return {};
      }
    },
    save(bucket) {
      if (!storage) {
        throw new Error("localStorage is unavailable");
      }
      storage.setItem(rootKey, JSON.stringify(bucket));
    },
  });
}

const wallClock: DraftClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay = 0) =>
    globalThis.setTimeout(callback, delay) as unknown as number,
  clearTimeout: (id) => {
    globalThis.clearTimeout(id);
  },
};

export type CreateDraftAutosaveOptions = {
  draftId: string;
  schemaVersion: string;
  store: DraftStore;
  /** Current namespace; typically AuthUser.id or anonymous. */
  getNamespace: () => string;
  debounceMs?: number;
  maxPayloadBytes?: number;
  clock?: DraftClock;
  onLifecycle?: (state: DraftAutosaveState) => void;
  /**
   * Optional feedback-only hook (e.g. action-runner). Autosave keeps ownership
   * of identity, revision, and persistence — this is never a mutation intent.
   */
  onSaveFeedback?: (event: {
    phase: "start" | "success" | "failure" | "conflict";
    state: DraftAutosaveState;
  }) => void;
};

export type DraftAutosave = {
  getState: () => DraftAutosaveState;
  subscribe: (listener: () => void) => () => void;
  /** Mark dirty and schedule a debounced save. */
  update: (payload: unknown) => void;
  /** Persist immediately (also used by flush). */
  save: (payload?: unknown) => Promise<DraftSaveResult>;
  flush: () => Promise<DraftSaveResult>;
  restore: (options?: {
    onConflict?: DraftConflictResolution;
  }) => Promise<DraftRestoreResult>;
  discard: () => Promise<void>;
  /**
   * Apply a new namespace (or re-read getNamespace()). On change: cancel pending
   * writes, clear in-memory payload, never silently merge. Use
   * adoptFromNamespace to bring data across.
   */
  syncNamespace: (nextNamespace?: string) => void;
  adoptFromNamespace: (
    sourceNamespace: string,
    options?: { onConflict?: DraftConflictResolution }
  ) => Promise<DraftAdoptResult>;
};

/** Adapt Draft lifecycle to the Unsaved-changes Dirty state seam. */
export function asDirtyStateSource(draft: DraftAutosave): {
  getIsDirty: () => boolean;
  subscribe: (listener: () => void) => () => void;
  flush: () => Promise<DraftSaveResult>;
  discard: () => Promise<void>;
} {
  return {
    getIsDirty: () => draft.getState().dirty,
    subscribe: (listener) => draft.subscribe(listener),
    flush: () => draft.flush(),
    discard: () => draft.discard(),
  };
}

export function createDraftAutosave(
  options: CreateDraftAutosaveOptions
): DraftAutosave {
  if (typeof options.draftId !== "string" || options.draftId.length === 0) {
    throw new Error("draftId is required");
  }
  if (
    typeof options.schemaVersion !== "string" ||
    options.schemaVersion.length === 0
  ) {
    throw new Error("schemaVersion is required");
  }

  const clock = options.clock ?? wallClock;
  const debounceMs = options.debounceMs ?? DEFAULT_DRAFT_DEBOUNCE_MS;
  const maxPayloadBytes =
    options.maxPayloadBytes ?? DEFAULT_DRAFT_MAX_PAYLOAD_BYTES;

  let namespace = resolveDraftNamespace(options.getNamespace());
  let lifecycle: DraftLifecycle = "clean";
  let revision = 0;
  let payload: JsonValue | null = null;
  let serializedSnapshot: string | null = null;
  let dirty = false;
  let lastError: string | null = null;
  let conflict: DraftRecord | null = null;
  let debounceTimer: number | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let generation = 0;
  const listeners = new Set<() => void>();
  let cachedState: DraftAutosaveState = {
    draftId: options.draftId,
    schemaVersion: options.schemaVersion,
    namespace,
    lifecycle,
    revision,
    payload,
    dirty,
    lastError,
    conflict,
  };

  function snapshot(): DraftAutosaveState {
    return cachedState;
  }

  function emit() {
    cachedState = {
      draftId: options.draftId,
      schemaVersion: options.schemaVersion,
      namespace,
      lifecycle,
      revision,
      payload,
      dirty,
      lastError,
      conflict,
    };
    options.onLifecycle?.(cachedState);
    for (const listener of listeners) {
      listener();
    }
  }

  function clearDebounce() {
    if (debounceTimer !== null) {
      clock.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function scheduleSave() {
    clearDebounce();
    lifecycle = "scheduled";
    emit();
    debounceTimer = clock.setTimeout(() => {
      debounceTimer = null;
      void persist("debounce");
    }, debounceMs);
  }

  function clearMemory(nextLifecycle: DraftLifecycle) {
    clearDebounce();
    generation += 1;
    payload = null;
    serializedSnapshot = null;
    dirty = false;
    revision = 0;
    lastError = null;
    conflict = null;
    lifecycle = nextLifecycle;
    emit();
  }

  async function persist(
    reason: "debounce" | "save" | "flush"
  ): Promise<DraftSaveResult> {
    void reason;
    const runGeneration = generation;
    const activeNamespace = namespace;

    if (payload === null) {
      return { status: "blocked", reason: "empty" };
    }

    let serialized: { json: string; value: JsonValue };
    try {
      serialized = serializeDraftPayload(payload, maxPayloadBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lifecycle = "failed";
      lastError = message;
      emit();
      options.onSaveFeedback?.({ phase: "failure", state: snapshot() });
      return { status: "error", reason: "serialize", message };
    }

    if (serialized.json === serializedSnapshot) {
      dirty = false;
      lifecycle = "saved";
      emit();
      return { status: "unchanged" };
    }

    const nextRevision = revision + 1;
    const baseRevision = revision;
    const record: DraftRecord = {
      draftId: options.draftId,
      schemaVersion: options.schemaVersion,
      namespace: activeNamespace,
      revision: nextRevision,
      updatedAt: toIsoUtc(clock.now()),
      payload: serialized.value,
    };

    lifecycle = "saving";
    lastError = null;
    conflict = null;
    emit();
    options.onSaveFeedback?.({ phase: "start", state: snapshot() });

    const result = await new Promise<DraftSaveResult>((resolve) => {
      writeChain = writeChain.then(async () => {
        if (runGeneration !== generation || activeNamespace !== namespace) {
          resolve({ status: "blocked", reason: "namespace-changed" });
          return;
        }

        const write = await options.store.set(record, { baseRevision });
        if (runGeneration !== generation || activeNamespace !== namespace) {
          resolve({ status: "blocked", reason: "namespace-changed" });
          return;
        }

        if (write.status === "conflict") {
          lifecycle = "conflict";
          conflict = write.stored;
          lastError = "revision conflict";
          emit();
          options.onSaveFeedback?.({ phase: "conflict", state: snapshot() });
          resolve({ status: "conflict", stored: write.stored });
          return;
        }

        if (write.status === "error") {
          lifecycle = "failed";
          lastError = write.message ?? write.reason;
          dirty = true;
          emit();
          options.onSaveFeedback?.({ phase: "failure", state: snapshot() });
          resolve({
            status: "error",
            reason: write.reason,
            message: write.message,
          });
          return;
        }

        revision = write.record.revision;
        payload = write.record.payload;
        serializedSnapshot = serialized.json;
        dirty = false;
        conflict = null;
        lastError = null;
        lifecycle = reason === "flush" ? "saved" : "saved";
        emit();
        options.onSaveFeedback?.({ phase: "success", state: snapshot() });
        resolve({ status: "saved", record: write.record });
      });
    });

    return result;
  }

  function applyConflictResolution(
    stored: DraftRecord,
    current: JsonValue,
    resolution: DraftConflictResolution
  ): JsonValue {
    if (resolution === "useStored") {
      return stored.payload;
    }
    if (resolution === "keepCurrent") {
      return current;
    }
    return serializeDraftPayload(
      resolution.merge(stored.payload, current),
      maxPayloadBytes
    ).value;
  }

  return {
    getState: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(nextPayload) {
      const serialized = serializeDraftPayload(nextPayload, maxPayloadBytes);
      payload = serialized.value;
      dirty = true;
      conflict = null;
      lastError = null;
      lifecycle = "dirty";
      emit();
      scheduleSave();
    },
    async save(nextPayload) {
      clearDebounce();
      if (nextPayload !== undefined) {
        const serialized = serializeDraftPayload(nextPayload, maxPayloadBytes);
        payload = serialized.value;
        dirty = true;
      }
      return persist("save");
    },
    async flush() {
      clearDebounce();
      return persist("flush");
    },
    async restore(restoreOptions) {
      const stored = await options.store.get({
        draftId: options.draftId,
        schemaVersion: options.schemaVersion,
        namespace,
      });
      if (!stored) {
        return { status: "empty" };
      }
      if (stored.schemaVersion !== options.schemaVersion) {
        return { status: "schema-mismatch", stored };
      }

      if (
        payload !== null &&
        dirty &&
        JSON.stringify(payload) !== JSON.stringify(stored.payload)
      ) {
        if (!restoreOptions?.onConflict) {
          lifecycle = "conflict";
          conflict = stored;
          emit();
          return { status: "conflict", stored, current: payload };
        }
        const resolved = applyConflictResolution(
          stored,
          payload,
          restoreOptions.onConflict
        );
        payload = resolved;
        revision = stored.revision;
        serializedSnapshot = JSON.stringify(resolved);
        dirty = true;
        conflict = null;
        lifecycle = "dirty";
        emit();
        return { status: "restored", record: { ...stored, payload: resolved } };
      }

      payload = stored.payload;
      revision = stored.revision;
      serializedSnapshot = JSON.stringify(stored.payload);
      // Fail-closed: restored Draft stays dirty until flush, discard, or submit clears it.
      dirty = true;
      conflict = null;
      lastError = null;
      lifecycle = "dirty";
      emit();
      return { status: "restored", record: stored };
    },
    async discard() {
      clearDebounce();
      generation += 1;
      await options.store.remove({
        draftId: options.draftId,
        schemaVersion: options.schemaVersion,
        namespace,
      });
      clearMemory("discarded");
    },
    syncNamespace(nextNamespace) {
      const next =
        typeof nextNamespace === "string"
          ? resolveDraftNamespace(nextNamespace)
          : resolveDraftNamespace(options.getNamespace());
      if (next === namespace) {
        return;
      }
      clearDebounce();
      generation += 1;
      namespace = next;
      payload = null;
      serializedSnapshot = null;
      dirty = false;
      revision = 0;
      lastError = null;
      conflict = null;
      lifecycle = "clean";
      emit();
    },
    async adoptFromNamespace(sourceNamespace, adoptOptions) {
      if (sourceNamespace === namespace) {
        const restored = await this.restore(adoptOptions);
        if (restored.status === "restored") {
          return { status: "adopted", record: restored.record };
        }
        if (restored.status === "empty") {
          return { status: "empty" };
        }
        if (restored.status === "conflict") {
          return restored;
        }
        return {
          status: "error",
          reason: restored.status,
          message:
            restored.status === "error" ? restored.message : restored.status,
        };
      }
      const stored = await options.store.get({
        draftId: options.draftId,
        schemaVersion: options.schemaVersion,
        namespace: sourceNamespace,
      });
      if (!stored) {
        return { status: "empty" };
      }

      if (
        payload !== null &&
        dirty &&
        JSON.stringify(payload) !== JSON.stringify(stored.payload)
      ) {
        if (!adoptOptions?.onConflict) {
          lifecycle = "conflict";
          conflict = stored;
          emit();
          return { status: "conflict", stored, current: payload };
        }
        const resolved = applyConflictResolution(
          stored,
          payload,
          adoptOptions.onConflict
        );
        payload = resolved;
        dirty = true;
        conflict = null;
        lifecycle = "dirty";
        emit();
        scheduleSave();
        return {
          status: "adopted",
          record: {
            ...stored,
            namespace,
            payload: resolved,
          },
        };
      }

      payload = stored.payload;
      dirty = true;
      revision = 0;
      serializedSnapshot = null;
      conflict = null;
      lifecycle = "dirty";
      emit();
      scheduleSave();
      return {
        status: "adopted",
        record: {
          ...stored,
          namespace,
          revision: 0,
        },
      };
    },
  };
}
