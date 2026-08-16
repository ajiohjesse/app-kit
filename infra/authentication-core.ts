import {
  classifyError,
  type ClassifyErrorContext,
  type ErrorClassification,
} from "./error-classification";

export type ReplayPolicy = "none" | "read" | "mutation";

export type JsonPrimitive = string | number | boolean | null;

export type AuthUser = {
  id: string;
  name?: string;
  email?: string;
  image?: string;
  metadata?: Record<string, JsonPrimitive>;
};

export type Session = {
  user: AuthUser;
  expiresAt: string;
  sessionId?: string;
};

export type SessionSeed = Session;

export type SignInResult =
  | { status: "authenticated"; session: Session }
  | { status: "failed"; error: ErrorClassification };

export type UnauthenticatedReason = "missing" | "expired" | "signed-out";

export type AuthSnapshot =
  | {
      status: "loading";
      session: null;
      user: null;
      reason?: undefined;
      error?: undefined;
    }
  | {
      status: "authenticated";
      session: Session;
      user: AuthUser;
      reason?: undefined;
      error?: undefined;
    }
  | {
      status: "unauthenticated";
      session: null;
      user: null;
      reason: UnauthenticatedReason;
      error?: undefined;
    }
  | {
      status: "error";
      session: null;
      user: null;
      error: ErrorClassification;
      reason?: undefined;
    };

export type AuthenticationAdapter<
  TCredentials = unknown,
  TExchange = unknown,
> = {
  getSession: (input?: { signal?: AbortSignal }) => Promise<Session | null>;
  signIn: (input: {
    credentials?: TCredentials;
    signal?: AbortSignal;
  }) => Promise<SignInResult>;
  signOut: (input?: { signal?: AbortSignal }) => Promise<void>;
  refresh?: (input?: { signal?: AbortSignal }) => Promise<Session | null>;
  exchangeToken?: (input: {
    payload?: TExchange;
    signal?: AbortSignal;
  }) => Promise<Session>;
};

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_METADATA_KEYS = 16;
const MAX_METADATA_STRING = 200;
const SENSITIVE_KEY_PARTS = [
  "token",
  "secret",
  "password",
  "passwd",
  "credential",
  "authorization",
  "cookie",
  "api_key",
  "apikey",
  "bearer",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll("-", "_");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_PARTS.some(
    (part) => normalized === part || normalized.includes(part)
  );
}

function toMetadata(value: unknown): Record<string, JsonPrimitive> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const metadata: Record<string, JsonPrimitive> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(metadata).length >= MAX_METADATA_KEYS) {
      break;
    }
    if (isSensitiveKey(key)) {
      continue;
    }
    if (raw === null || typeof raw === "boolean") {
      metadata[key] = raw;
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      metadata[key] = raw;
      continue;
    }
    if (typeof raw === "string" && raw.length <= MAX_METADATA_STRING) {
      metadata[key] = raw;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function toUser(value: unknown): AuthUser | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "") {
    return null;
  }
  const user: AuthUser = { id: value.id };
  if (typeof value.name === "string") {
    user.name = value.name;
  }
  if (typeof value.email === "string") {
    user.email = value.email;
  }
  if (typeof value.image === "string") {
    user.image = value.image;
  }
  const metadata = toMetadata(value.metadata);
  if (metadata) {
    user.metadata = metadata;
  }
  return user;
}

export function toSession(value: unknown): Session | null {
  if (!isRecord(value)) {
    return null;
  }
  const user = toUser(value.user);
  if (!user || typeof value.expiresAt !== "string") {
    return null;
  }
  if (!ISO_UTC.test(value.expiresAt)) {
    return null;
  }
  const session: Session = { user, expiresAt: value.expiresAt };
  if (typeof value.sessionId === "string" && value.sessionId !== "") {
    session.sessionId = value.sessionId;
  }
  return session;
}

export function toSessionSeed(value: unknown): SessionSeed | null {
  return toSession(value);
}

export function sessionIsExpired(session: Session, now = Date.now()): boolean {
  return Date.parse(session.expiresAt) <= now;
}

export function classifySignInFailure(
  error: unknown,
  context: ClassifyErrorContext = {}
): ErrorClassification {
  return classifyError(error, {
    ...context,
    classifiers: [
      ...(context.classifiers ?? []),
      (_error, next) =>
        next.status === 401
          ? {
              category: "authentication",
              message: "Sign in to continue.",
              messageKey: "error/authentication",
              retryable: false,
              code: "invalid-credentials",
            }
          : undefined,
    ],
  });
}

export function normalizeSignInError(
  error: ErrorClassification
): ErrorClassification {
  return classifyError(error);
}
