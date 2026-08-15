import type { ReplayPolicy, Session } from "@/infra/authentication-core";
import type { ErrorClassification } from "@/infra/error-classification";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PendingIntentReplayPolicy = Extract<
  ReplayPolicy,
  "read" | "mutation"
>;

export type PendingActionIntent = {
  id: string;
  kind: string;
  version: number;
  payload: JsonValue;
  returnTo: string;
  createdAt: string;
  expiresAt: string;
  idempotencyKey: string;
  replayPolicy: PendingIntentReplayPolicy;
  userId?: string | null;
};

export type CreatePendingActionIntentInput = {
  kind: string;
  version: number;
  payload: unknown;
  returnTo: string;
  idempotencyKey: string;
  replayPolicy: PendingIntentReplayPolicy;
  userId?: string | null;
  id?: string;
  expiresAt?: string;
  ttlMs?: number;
  now?: () => number;
  maxPayloadBytes?: number;
};

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export const DEFAULT_PENDING_INTENT_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_PAYLOAD_BYTES = 8_192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonValue(
  value: unknown,
  path: string
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
      throw new Error(
        `Pending action payload at ${path} is not JSON-compatible`
      );
    }
    return;
  }
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "undefined"
  ) {
    throw new Error(`Pending action payload at ${path} is not JSON-compatible`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertJsonValue(entry, `${path}[${index}]`)
    );
    return;
  }
  if (!isRecord(value)) {
    throw new Error(`Pending action payload at ${path} is not JSON-compatible`);
  }
  for (const [key, entry] of Object.entries(value)) {
    assertJsonValue(entry, `${path}.${key}`);
  }
}

function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

export function createPendingActionIntent(
  input: CreatePendingActionIntentInput
): PendingActionIntent {
  const nowMs = input.now?.() ?? Date.now();
  const maxPayloadBytes = input.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;

  if (typeof input.kind !== "string" || input.kind === "") {
    throw new Error("Pending action kind is required");
  }
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error("Pending action version must be a positive integer");
  }
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey === "") {
    throw new Error("Pending action idempotencyKey is required");
  }
  if (input.replayPolicy !== "read" && input.replayPolicy !== "mutation") {
    throw new Error('Pending action replayPolicy must be "read" or "mutation"');
  }
  if (typeof input.returnTo !== "string" || input.returnTo === "") {
    throw new Error("Pending action returnTo is required");
  }

  assertJsonValue(input.payload, "payload");

  let serialized: string;
  try {
    serialized = JSON.stringify(input.payload);
  } catch {
    throw new Error("Pending action payload is not JSON-compatible");
  }
  if (serialized === undefined) {
    throw new Error("Pending action payload is not JSON-compatible");
  }
  if (new TextEncoder().encode(serialized).length > maxPayloadBytes) {
    throw new Error("Pending action payload exceeds size limit");
  }

  const expiresAt =
    input.expiresAt ??
    toIsoUtc(nowMs + (input.ttlMs ?? DEFAULT_PENDING_INTENT_TTL_MS));
  if (!ISO_UTC.test(expiresAt)) {
    throw new Error("Pending action expiresAt must be ISO-8601 UTC");
  }

  const payload = JSON.parse(serialized) as JsonValue;

  return {
    id: input.id ?? crypto.randomUUID(),
    kind: input.kind,
    version: input.version,
    payload,
    returnTo: input.returnTo,
    createdAt: toIsoUtc(nowMs),
    expiresAt,
    idempotencyKey: input.idempotencyKey,
    replayPolicy: input.replayPolicy,
    userId: input.userId ?? null,
  };
}

export function parsePendingActionIntent(
  value: unknown
): PendingActionIntent | null {
  if (!isRecord(value)) {
    return null;
  }
  try {
    return createPendingActionIntent({
      id: typeof value.id === "string" ? value.id : undefined,
      kind: String(value.kind ?? ""),
      version: Number(value.version),
      payload: value.payload as JsonValue,
      returnTo: String(value.returnTo ?? ""),
      idempotencyKey: String(value.idempotencyKey ?? ""),
      replayPolicy: value.replayPolicy as PendingIntentReplayPolicy,
      userId:
        typeof value.userId === "string" || value.userId === null
          ? value.userId
          : null,
      expiresAt:
        typeof value.expiresAt === "string" ? value.expiresAt : undefined,
      now: () =>
        typeof value.createdAt === "string" && ISO_UTC.test(value.createdAt)
          ? Date.parse(value.createdAt)
          : Date.now(),
    });
  } catch {
    return null;
  }
}

export type PendingActionClaimResult =
  | { status: "claimed"; intent: PendingActionIntent }
  | { status: "consumed" }
  | { status: "expired" }
  | { status: "missing" }
  | { status: "invalid" };

export type PendingActionStore = {
  save: (intent: PendingActionIntent) => Promise<void>;
  read: (id: string) => Promise<PendingActionIntent | null>;
  claim: (id: string) => Promise<PendingActionClaimResult>;
  remove: (id: string) => Promise<void>;
};

export type PendingActionStoreOptions = {
  now?: () => number;
};

function isExpired(intent: PendingActionIntent, nowMs: number): boolean {
  return Date.parse(intent.expiresAt) <= nowMs;
}

export function createMemoryPendingActionStore(
  options: PendingActionStoreOptions = {}
): PendingActionStore {
  const records = new Map<string, PendingActionIntent>();
  const claimed = new Set<string>();
  const now = options.now ?? (() => Date.now());

  return {
    async save(intent) {
      records.set(intent.id, intent);
      claimed.delete(intent.id);
    },
    async read(id) {
      if (claimed.has(id)) {
        return null;
      }
      const intent = records.get(id);
      if (!intent) {
        return null;
      }
      if (isExpired(intent, now())) {
        return null;
      }
      return intent;
    },
    async claim(id) {
      if (claimed.has(id)) {
        return { status: "consumed" };
      }
      const intent = records.get(id);
      if (!intent) {
        return { status: "missing" };
      }
      if (isExpired(intent, now())) {
        records.delete(id);
        return { status: "expired" };
      }
      claimed.add(id);
      records.delete(id);
      return { status: "claimed", intent };
    },
    async remove(id) {
      records.delete(id);
      claimed.add(id);
    },
  };
}

export const DEFAULT_PENDING_ACTION_STORAGE_KEY = "app-kit:pending-auth-action";

type StoredPendingActionState = {
  intents: Record<string, PendingActionIntent>;
  claimed: string[];
};

export function createSessionStoragePendingActionStore(
  options: PendingActionStoreOptions & {
    storage?: Storage;
    key?: string;
  } = {}
): PendingActionStore {
  const storage = options.storage ?? sessionStorage;
  const key = options.key ?? DEFAULT_PENDING_ACTION_STORAGE_KEY;
  const now = options.now ?? (() => Date.now());

  function load(): StoredPendingActionState {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      return { intents: {}, claimed: [] };
    }
    if (!raw) {
      return { intents: {}, claimed: [] };
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed) || !isRecord(parsed.intents)) {
        return { intents: {}, claimed: [] };
      }
      const intents: Record<string, PendingActionIntent> = {};
      for (const [id, value] of Object.entries(parsed.intents)) {
        const intent = parsePendingActionIntent(value);
        if (intent && !isExpired(intent, now())) {
          intents[id] = intent;
        }
      }
      const claimed = Array.isArray(parsed.claimed)
        ? parsed.claimed.filter(
            (entry): entry is string => typeof entry === "string"
          )
        : [];
      return { intents, claimed };
    } catch {
      return { intents: {}, claimed: [] };
    }
  }

  function saveState(state: StoredPendingActionState) {
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch {
      // best-effort persistence
    }
  }

  return {
    async save(intent) {
      const state = load();
      state.intents[intent.id] = intent;
      state.claimed = state.claimed.filter((id) => id !== intent.id);
      saveState(state);
    },
    async read(id) {
      const state = load();
      if (state.claimed.includes(id)) {
        return null;
      }
      const intent = state.intents[id];
      if (!intent) {
        return null;
      }
      if (isExpired(intent, now())) {
        return null;
      }
      return intent;
    },
    async claim(id) {
      const state = load();
      if (state.claimed.includes(id)) {
        return { status: "consumed" };
      }
      const intent = state.intents[id];
      if (!intent) {
        return { status: "missing" };
      }
      if (isExpired(intent, now())) {
        delete state.intents[id];
        saveState(state);
        return { status: "expired" };
      }
      delete state.intents[id];
      state.claimed = [...state.claimed, id];
      saveState(state);
      return { status: "claimed", intent };
    },
    async remove(id) {
      const state = load();
      delete state.intents[id];
      if (!state.claimed.includes(id)) {
        state.claimed = [...state.claimed, id];
      }
      saveState(state);
    },
  };
}

export type PendingActionHandlerResult =
  | { status: "succeeded" }
  | { status: "failed"; error?: ErrorClassification }
  | { status: "cancelled" };

export type PendingActionHandlerContext = {
  intent: PendingActionIntent;
  session: Session;
  signal: AbortSignal;
  idempotencyKey: string;
};

export type PendingActionHandler = (
  context: PendingActionHandlerContext
) => Promise<PendingActionHandlerResult>;

export type PendingActionHandlerRegistry = {
  register: (kind: string, handler: PendingActionHandler) => () => void;
  get: (kind: string) => PendingActionHandler | undefined;
  clear: () => void;
};

export function createPendingActionHandlerRegistry(): PendingActionHandlerRegistry {
  const handlers = new Map<string, PendingActionHandler>();
  return {
    register(kind, handler) {
      handlers.set(kind, handler);
      return () => {
        if (handlers.get(kind) === handler) {
          handlers.delete(kind);
        }
      };
    },
    get(kind) {
      return handlers.get(kind);
    },
    clear() {
      handlers.clear();
    },
  };
}

export type ResumeResult =
  | { status: "succeeded"; intentId: string }
  | { status: "failed"; intentId: string; error?: ErrorClassification }
  | { status: "expired" }
  | { status: "invalid" }
  | { status: "consumed" }
  | { status: "missing" }
  | { status: "missing-handler" }
  | { status: "user-mismatch" }
  | { status: "navigation-failed" }
  | { status: "mutation-replay-disabled" }
  | { status: "cancelled" };

export type ResumeOperationOptions = {
  store: PendingActionStore;
  handlers: PendingActionHandlerRegistry;
  getSession: (input?: { signal?: AbortSignal }) => Promise<Session | null>;
  navigate: (to: string) => Promise<void> | void;
  allowMutationReplay?: boolean;
  fallbackReturnTo?: string;
  origin?: string;
  waitForReady?: (intent: PendingActionIntent) => Promise<void>;
  now?: () => number;
};

export type ResumeInput = {
  intentId: string;
  signal?: AbortSignal;
};

export function isSafeReturnTo(
  returnTo: string,
  origin = typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost"
): boolean {
  if (typeof returnTo !== "string" || returnTo === "") {
    return false;
  }
  if (returnTo.startsWith("//") || returnTo.includes("://")) {
    try {
      const url = new URL(returnTo, origin);
      return (
        url.origin === origin &&
        (url.protocol === "http:" || url.protocol === "https:")
      );
    } catch {
      return false;
    }
  }
  if (!returnTo.startsWith("/")) {
    return false;
  }
  if (returnTo.startsWith("\\") || returnTo.includes("\\")) {
    return false;
  }
  return true;
}

export function resolveReturnTo(
  returnTo: string,
  options: { origin?: string; fallbackReturnTo?: string } = {}
): string {
  const origin =
    options.origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost");
  const fallback = options.fallbackReturnTo ?? "/";
  if (isSafeReturnTo(returnTo, origin)) {
    if (returnTo.startsWith("/") && !returnTo.includes("://")) {
      return returnTo;
    }
    try {
      const url = new URL(returnTo, origin);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return fallback;
    }
  }
  return isSafeReturnTo(fallback, origin) ? fallback : "/";
}

export function createResumeOperation(options: ResumeOperationOptions) {
  const settled = new Map<string, Promise<ResumeResult>>();
  const allowMutationReplay = options.allowMutationReplay ?? false;
  const now = options.now ?? (() => Date.now());

  return function resume(input: ResumeInput): Promise<ResumeResult> {
    const existing = settled.get(input.intentId);
    if (existing) {
      return existing;
    }

    const run = (async (): Promise<ResumeResult> => {
      if (input.signal?.aborted) {
        return { status: "cancelled" };
      }

      const session = await options.getSession({ signal: input.signal });
      if (input.signal?.aborted) {
        return { status: "cancelled" };
      }
      if (!session) {
        return { status: "cancelled" };
      }

      const intent = await options.store.read(input.intentId);
      if (!intent) {
        const claimProbe = await options.store.claim(input.intentId);
        if (claimProbe.status === "consumed") {
          return { status: "consumed" };
        }
        if (claimProbe.status === "expired") {
          return { status: "expired" };
        }
        return { status: "missing" };
      }

      if (isExpired(intent, now())) {
        await options.store.remove(intent.id);
        return { status: "expired" };
      }

      if (intent.userId && intent.userId !== session.user.id) {
        return { status: "user-mismatch" };
      }

      const handler = options.handlers.get(intent.kind);
      if (!handler) {
        return { status: "missing-handler" };
      }

      if (intent.replayPolicy === "mutation" && !allowMutationReplay) {
        return { status: "mutation-replay-disabled" };
      }

      const returnTo = resolveReturnTo(intent.returnTo, {
        origin: options.origin,
        fallbackReturnTo: options.fallbackReturnTo,
      });

      const claim = await options.store.claim(intent.id);
      if (claim.status !== "claimed") {
        return { status: claim.status };
      }

      const claimedIntent: PendingActionIntent = {
        ...claim.intent,
        userId: claim.intent.userId ?? session.user.id,
      };

      try {
        await options.navigate(returnTo);
      } catch {
        return { status: "navigation-failed" };
      }

      if (options.waitForReady) {
        await options.waitForReady(claimedIntent);
      }

      if (input.signal?.aborted) {
        return { status: "cancelled" };
      }

      try {
        const result = await handler({
          intent: claimedIntent,
          session,
          signal: input.signal ?? new AbortController().signal,
          idempotencyKey: claimedIntent.idempotencyKey,
        });
        if (result.status === "succeeded") {
          return { status: "succeeded", intentId: claimedIntent.id };
        }
        if (result.status === "cancelled") {
          return { status: "cancelled" };
        }
        return {
          status: "failed",
          intentId: claimedIntent.id,
          error: result.error,
        };
      } catch {
        return { status: "failed", intentId: claimedIntent.id };
      }
    })();

    settled.set(input.intentId, run);
    return run;
  };
}
